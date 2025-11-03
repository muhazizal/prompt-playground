import path from 'path'
import OpenAI from 'openai'
import {
	NOTES_DIR,
	listNoteFiles,
	readNote,
	summarize,
	rankTags,
	loadTagCandidates,
	saveTagCandidates,
	evaluateSummary,
	DEFAULT_MODEL,
	getCachedSummary,
	setCachedSummary,
} from './notes-core.mjs'

// Basic exponential backoff with jitter
async function withRetries(fn, { retries = 3, baseDelayMs = 400 } = {}) {
	let attempt = 0

	// Retry loop with exponential backoff
	while (true) {
		try {
			return await fn()
		} catch (err) {
			attempt++

			if (attempt > retries) throw err

			// Add jitter to avoid thundering herd problem
			const isRateLimited = err && (err.status === 429 || /rate limit/i.test(err.message || ''))
			const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 200)

			// Add extra delay if it's a rate-limit error
			const waitMs = isRateLimited ? delay + 500 : delay
			await new Promise((r) => setTimeout(r, waitMs))
		}
	}
}

// Simple concurrency limiter for bulk processing
async function processWithConcurrency(items, limit, handler) {
	const queue = [...items]
	const results = []

	// Process items in parallel with concurrency limit
	const workers = new Array(Math.min(limit, queue.length)).fill(0).map(async () => {
		while (queue.length) {
			const item = queue.shift()
			try {
				const r = await handler(item)
				if (r) results.push(r)
			} catch (err) {
				results.push({ error: err?.message || String(err) })
			}
		}
	})

	await Promise.all(workers)

	return results
}

// Register API routes for notes processing
export function registerNotesRoutes(app) {
	// List available note files
	app.get('/notes/list', (_req, res) => {
		try {
			const files = listNoteFiles().map((f) => ({ name: f.name }))
			res.json({ files })
		} catch (err) {
			res.status(500).json({ error: err?.message || String(err) })
		}
	})

	// Process notes in bulk
	app.post('/notes/process', async (req, res) => {
		try {
			const apiKey = process.env.OPENAI_API_KEY
			if (!apiKey) return res.status(500).json({ error: 'Missing OPENAI_API_KEY' })

			const client = new OpenAI({ apiKey })
			const { paths } = req.body || {}
			const CONCURRENCY = Number(process.env.NOTES_CONCURRENCY || 2)

			// Validate and normalize input paths
			const targets =
				Array.isArray(paths) && paths.length > 0
					? paths.map((p) => path.join(NOTES_DIR, path.basename(p)))
					: listNoteFiles().map((f) => f.path)

			// Process each note file in parallel with concurrency limit
			const results = await processWithConcurrency(targets, CONCURRENCY, async (p) => {
				const text = readNote(p)
				if (!text) return null

				// Generate summary, tags, and evaluation for the note
				const {
					summary,
					tags: llmTags,
					usage,
					model,
				} = await withRetries(() => summarize(client, text, {}), {
					retries: 3,
					baseDelayMs: 500,
				})

				// Rank tags based on text content
				const embedTags = await withRetries(() => rankTags(client, text), {
					retries: 3,
					baseDelayMs: 400,
				})

				// Evaluate summary quality
				const evaluation = await withRetries(() => evaluateSummary(client, text, summary, {}), {
					retries: 2,
					baseDelayMs: 400,
				})

				// Combine LLM tags and ranked tags, limit to 7 tags
				const tags = Array.from(new Set([...(llmTags || []), ...(embedTags || [])])).slice(0, 7)
				return { file: path.basename(p), summary, tags, usage, evaluation, model }
			})

			res.json({ results })
		} catch (err) {
			res.status(500).json({ error: err?.message || String(err) })
		}
	})

	// Single note summarization endpoint
	app.post('/notes/summarize', async (req, res) => {
		try {
			const apiKey = process.env.OPENAI_API_KEY
			if (!apiKey) return res.status(500).json({ error: 'Missing OPENAI_API_KEY' })

			const client = new OpenAI({ apiKey })
			const { text } = req.body || {}

			if (!text || typeof text !== 'string') return res.status(400).json({ error: 'Invalid text' })

			// Generate summary, tags, and evaluation for the note
			const { summary, tags, usage, model } = await summarize(client, text, {})
			const embedTags = await rankTags(client, text)
			const evaluation = await evaluateSummary(client, text, summary, {})

			res.json({
				summary,
				tags: Array.from(new Set([...(tags || []), ...embedTags])),
				usage,
				evaluation,
				model,
			})
		} catch (err) {
			res.status(500).json({ error: err?.message || String(err) })
		}
	})

	// SSE streaming summary for long notes (GET with ?path=<file> or ?text=<raw>)
	app.get('/notes/summarize-stream', async (req, res) => {
		try {
			const apiKey = process.env.OPENAI_API_KEY
			if (!apiKey) return res.status(500).json({ error: 'Missing OPENAI_API_KEY' })

			const client = new OpenAI({ apiKey })
			const { path: relPath, text: rawText } = req.query || {}

			// Validate and normalize input text or path
			let text = ''
			if (rawText && typeof rawText === 'string') {
				text = rawText
			} else if (relPath && typeof relPath === 'string') {
				const p = path.join(NOTES_DIR, path.basename(relPath))
				text = readNote(p)
			} else {
				return res.status(400).json({ error: 'Provide ?text=... or ?path=filename' })
			}
			if (!text) return res.status(400).json({ error: 'No content to summarize' })

			// SSE (Server-Sent Events): one-way text stream from server to client
			res.setHeader('Content-Type', 'text/event-stream')
			res.setHeader('Cache-Control', 'no-cache')
			res.setHeader('Connection', 'keep-alive')
			res.flushHeaders && res.flushHeaders()

			res.write(`event: start\n` + `data: {}\n\n`)

			// If we have a cached summary, short-circuit streaming and return cached result
			const cached = getCachedSummary(text, DEFAULT_MODEL)
			if (cached) {
				const final = {
					summary: cached.summary,
					tags: Array.isArray(cached.tags) ? cached.tags.slice(0, 7) : [],
					model: cached.model,
				}
				res.write(`event: result\n` + `data: ${JSON.stringify(final)}\n\n`)
				if (cached.usage) res.write(`event: usage\n` + `data: ${JSON.stringify(cached.usage)}\n\n`)
				try {
					const evaluation = await evaluateSummary(client, text, final.summary, {})
					res.write(`event: evaluation\n` + `data: ${JSON.stringify(evaluation)}\n\n`)
				} catch {}
				res.write(`event: end\n` + `data: {}\n\n`)
				return res.end()
			}

			// Stream summary and tags from OpenAI
			const stream = await client.chat.completions.create({
				model: DEFAULT_MODEL,
				temperature: 0.2,
				max_tokens: 300,
				messages: [
					{ role: 'system', content: 'You summarize and tag notes concisely.' },
					{
						role: 'user',
						content: `Summarize the following note in 3-5 sentences. Then propose 5 short tags.\nReturn JSON with {"summary": string, "tags": string[]}.\nNote:\n\n${text}`,
					},
				],
				stream: true,
				stream_options: { include_usage: true },
			})

			// Accumulate summary chunks from stream
			let buffer = ''
			let usage = null
			for await (const part of stream) {
				const chunk = part?.choices?.[0]?.delta?.content || ''
				if (chunk) {
					buffer += chunk
					res.write(`event: summary\n` + `data: ${JSON.stringify({ chunk })}\n\n`)
				}
				if (part?.usage) {
					usage = part.usage
				}
			}

			// Parse final JSON response
			let final = { summary: buffer, tags: [], model: DEFAULT_MODEL }
			try {
				const parsed = JSON.parse(buffer)
				final.summary = parsed?.summary || final.summary
				final.tags = Array.isArray(parsed?.tags) ? parsed.tags : final.tags
			} catch {}

			const embedTags = await rankTags(client, text)
			final.tags = Array.from(new Set([...(final.tags || []), ...embedTags])).slice(0, 7)

			res.write(`event: result\n` + `data: ${JSON.stringify(final)}\n\n`)
			if (usage) {
				res.write(`event: usage\n` + `data: ${JSON.stringify(usage)}\n\n`)
			}

			// Cache the streamed summary to avoid repeat costs next time
			try {
				setCachedSummary(text, DEFAULT_MODEL, final.summary, final.tags, usage)
			} catch {}

			// Send evaluation after the result
			try {
				const evaluation = await evaluateSummary(client, text, final.summary, {})
				res.write(`event: evaluation\n` + `data: ${JSON.stringify(evaluation)}\n\n`)
			} catch {}

			res.write(`event: end\n` + `data: {}\n\n`)
			res.end()
		} catch (err) {
			try {
				res.write(
					`event: server_error\n` +
						`data: ${JSON.stringify({ error: err?.message || String(err) })}\n\n`
				)
				res.end()
			} catch {}
		}
	})

	// Configurable tag sets management
	app.get('/notes/tags', (_req, res) => {
		try {
			const tags = loadTagCandidates()
			res.json({ tags })
		} catch (err) {
			res.status(500).json({ error: err?.message || String(err) })
		}
	})

	// Update tag candidates
	app.post('/notes/tags', (req, res) => {
		try {
			const { tags } = req.body || {}

			if (!Array.isArray(tags))
				return res.status(400).json({ error: 'tags must be an array of strings' })

			saveTagCandidates(tags)

			res.json({ ok: true })
		} catch (err) {
			res.status(500).json({ error: err?.message || String(err) })
		}
	})
}
