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
} from './notes-core.mjs'

// Basic exponential backoff with jitter
async function withRetries(fn, { retries = 3, baseDelayMs = 400 } = {}) {
	let attempt = 0

	while (true) {
		try {
			return await fn()
		} catch (err) {
			attempt++

			if (attempt > retries) throw err

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

export function registerNotesRoutes(app) {
	app.get('/notes/list', (_req, res) => {
		try {
			const files = listNoteFiles().map((f) => ({ name: f.name }))
			res.json({ files })
		} catch (err) {
			res.status(500).json({ error: err?.message || String(err) })
		}
	})

	app.post('/notes/process', async (req, res) => {
		try {
			const apiKey = process.env.OPENAI_API_KEY
			if (!apiKey) return res.status(500).json({ error: 'Missing OPENAI_API_KEY' })

			const client = new OpenAI({ apiKey })
			const { paths } = req.body || {}
			const CONCURRENCY = Number(process.env.NOTES_CONCURRENCY || 2)

			const targets =
				Array.isArray(paths) && paths.length > 0
					? paths.map((p) => path.join(NOTES_DIR, path.basename(p)))
					: listNoteFiles().map((f) => f.path)

			const results = await processWithConcurrency(targets, CONCURRENCY, async (p) => {
				const text = readNote(p)
				if (!text) return null

				const {
					summary,
					tags: llmTags,
					usage,
				} = await withRetries(() => summarize(client, text, {}), {
					retries: 3,
					baseDelayMs: 500,
				})

				const embedTags = await withRetries(() => rankTags(client, text), {
					retries: 3,
					baseDelayMs: 400,
				})

				const evaluation = await withRetries(() => evaluateSummary(client, text, summary, {}), {
					retries: 2,
					baseDelayMs: 400,
				})

				const tags = Array.from(new Set([...(llmTags || []), ...(embedTags || [])])).slice(0, 7)

				return { file: path.basename(p), summary, tags, usage, evaluation }
			})

			res.json({ results })
		} catch (err) {
			res.status(500).json({ error: err?.message || String(err) })
		}
	})

	app.post('/notes/summarize', async (req, res) => {
		try {
			const apiKey = process.env.OPENAI_API_KEY
			if (!apiKey) return res.status(500).json({ error: 'Missing OPENAI_API_KEY' })

			const client = new OpenAI({ apiKey })
			const { text } = req.body || {}

			if (!text || typeof text !== 'string') return res.status(400).json({ error: 'Invalid text' })

			const { summary, tags, usage } = await summarize(client, text, {})
			const embedTags = await rankTags(client, text)
			const evaluation = await evaluateSummary(client, text, summary, {})

			res.json({
				summary,
				tags: Array.from(new Set([...(tags || []), ...embedTags])),
				usage,
				evaluation,
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

			res.setHeader('Content-Type', 'text/event-stream')
			res.setHeader('Cache-Control', 'no-cache')
			res.setHeader('Connection', 'keep-alive')
			res.flushHeaders && res.flushHeaders()

			res.write(`event: start\n` + `data: {}\n\n`)

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
			})

			let buffer = ''
			for await (const part of stream) {
				const chunk = part?.choices?.[0]?.delta?.content || ''
				if (chunk) {
					buffer += chunk
					res.write(`event: summary\n` + `data: ${JSON.stringify({ chunk })}\n\n`)
				}
			}

			let final = { summary: buffer, tags: [] }
			try {
				const parsed = JSON.parse(buffer)
				final.summary = parsed?.summary || final.summary
				final.tags = Array.isArray(parsed?.tags) ? parsed.tags : final.tags
			} catch {}

			const embedTags = await rankTags(client, text)
			final.tags = Array.from(new Set([...(final.tags || []), ...embedTags])).slice(0, 7)

			res.write(`event: result\n` + `data: ${JSON.stringify(final)}\n\n`)

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
					`event: error\n` + `data: ${JSON.stringify({ error: err?.message || String(err) })}\n\n`
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
