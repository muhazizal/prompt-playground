import path from 'path'

import {
	NOTES_DIR,
	listNoteFiles,
	readNote,
	rankTags,
	loadTagCandidates,
	saveTagCandidates,
	evaluateSummary,
	DEFAULT_MODEL,
	getCachedSummary,
	setCachedSummary,
	getClient,
	withRetries,
	processWithConcurrency,
} from '../core/notes-core.mjs'

// Model window + summarization helpers reused from prompt core
import { getModelContextWindow, summarizeMessages } from '../core/prompt-core.mjs'

// Lightweight memory for prior summaries and context serialization
import {
	getRecentMessages,
	appendMessage,
	clearSession,
	countMessagesTokens,
	splitMessagesByBudget,
	trimMessagesToTokenBudget,
	serializeContextToSystem,
	buildSessionKey,
} from '../core/memory.mjs'

import { requireApiKey } from '../middleware/auth.mjs'
import { validateBody, validateQuery } from '../middleware/validate.mjs'

import { sendError, safeParseJson, toBool, toNum } from '../utils/http.mjs'

/**
 * Register API routes for notes processing.
 * Provides: /notes/list, /notes/process, /notes/summarize-stream, and tag management endpoints.
 *
 * @param {import('express').Express} app - Express application instance
 */
export function registerNotesRoutes(app) {
	// List available note files
	app.get('/notes/list', (_req, res) => {
		try {
			const files = listNoteFiles().map((f) => ({ name: f.name }))
			res.json({ files })
		} catch (err) {
			sendError(res, 500, 'SERVER_ERROR', err?.message || String(err))
		}
	})

	// Process notes in bulk
	app.post(
		'/notes/process',
		requireApiKey(),
		...validateBody({
			paths: { in: ['body'], optional: true, isArray: true },
			'paths.*': { in: ['body'], optional: true, isString: true },
			// Model and context controls
			model: { in: ['body'], optional: true, isString: true },
			maxTokens: { in: ['body'], optional: true, isInt: { options: { min: 16, max: 4000 } } },
			context: { in: ['body'], optional: true },
			contextBudgetTokens: {
				in: ['body'],
				optional: true,
				isInt: { options: { min: 128, max: 200000 } },
			},
			// Memory controls (prior summaries only)
			useMemory: { in: ['body'], optional: true, isBoolean: true },
			sessionId: { in: ['body'], optional: true, isString: true },
			reset: { in: ['body'], optional: true, isBoolean: true },
			memorySize: { in: ['body'], optional: true, isInt: { options: { min: 1, max: 200 } } },
			// Overflow summarization controls
			summarizeOverflow: { in: ['body'], optional: true, isBoolean: true },
			summaryMaxTokens: {
				in: ['body'],
				optional: true,
				isInt: { options: { min: 32, max: 1000 } },
			},
		}),
		async (req, res) => {
			try {
				const client = getClient(req.aiApiKey)
				const {
					paths,
					model: modelRaw,
					maxTokens: maxTokensRaw,
					context: contextRaw,
					contextBudgetTokens: contextBudgetTokensRaw,
					useMemory: useMemoryRaw,
					sessionId: sid,
					reset: resetRaw,
					memorySize: memorySizeRaw,
					summarizeOverflow: summarizeOverflowRaw,
					summaryMaxTokens: summaryMaxTokensRaw,
				} = req.body || {}

				// Normalize controls (using shared helpers)
				const model = String(modelRaw || DEFAULT_MODEL)
				const maxTokens = toNum(maxTokensRaw, 300)
				const context = safeParseJson(contextRaw)
				const contextBudgetTokens = toNum(contextBudgetTokensRaw, undefined)
				const useMemory = toBool(useMemoryRaw)
				const reset = toBool(resetRaw)
				const memorySize = toNum(memorySizeRaw, 30)
				const summarizeOverflow = toBool(summarizeOverflowRaw)
				const summaryMaxTokens = toNum(summaryMaxTokensRaw, 200)

				// Per-user session key for notes memory (prior summaries only)
				const sessionId = buildSessionKey(req, { sid, defaultScope: 'notes' })

				if (useMemory && reset) await clearSession(sessionId)

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

					// Cache short-circuit
					const cached = getCachedSummary(text, model)
					if (cached) {
						// Optionally persist cached summary to memory for future context
						if (useMemory) {
							await appendMessage(sessionId, {
								role: 'assistant',
								content: `Summary: ${cached.summary}. Tags: ${(Array.isArray(cached.tags)
									? cached.tags.slice(0, 7)
									: []
								).join(', ')}`,
							})
						}
						const embedTags = await withRetries(() => rankTags(client, text), {
							retries: 3,
							baseDelayMs: 400,
						})
						const tags = Array.from(
							new Set([...(Array.isArray(cached.tags) ? cached.tags : []), ...embedTags])
						).slice(0, 7)
						const evaluation = await withRetries(
							() => evaluateSummary(client, text, cached.summary, {}),
							{ retries: 2, baseDelayMs: 400 }
						)
						return {
							file: path.basename(p),
							summary: cached.summary,
							tags,
							usage: cached.usage || null,
							model: cached.model || model,
							evaluation,
						}
					}

					// Build base messages: system + optional context + lightweight memory
					let baseMessages = [{ role: 'system', content: 'You summarize and tag notes concisely.' }]
					if (context && typeof context === 'object') {
						baseMessages.push(serializeContextToSystem(context))
					}

					const windowTokens = getModelContextWindow(model)
					const safety = 1000
					const budget = Number(
						contextBudgetTokens || Math.max(500, windowTokens - (Number(maxTokens) || 0) - safety)
					)

					if (useMemory) {
						const mem = await getRecentMessages(sessionId, { limit: memorySize })
						const combined = [...baseMessages, ...mem]
						const within = countMessagesTokens(combined)
						if (within <= budget) {
							baseMessages = combined
						} else if (summarizeOverflow) {
							const { kept, overflow } = splitMessagesByBudget(combined, budget)
							let summaryText = ''
							try {
								summaryText = await summarizeMessages(client, overflow, {
									model,
									maxTokens: summaryMaxTokens,
								})
							} catch {}
							const summaryMsg = summaryText
								? { role: 'system', content: `Conversation summary: ${summaryText}` }
								: { role: 'system', content: 'Conversation summary: (compressed)' }
							baseMessages = [
								kept[0] || { role: 'system', content: 'You summarize and tag notes concisely.' },
								...kept.slice(1),
								summaryMsg,
							]
						} else {
							baseMessages = trimMessagesToTokenBudget(combined, budget)
						}
					}

					// Build the user instruction + note content
					let noteText = text
					let userMsg = {
						role: 'user',
						content: `Summarize the following note in 3-5 sentences. Then propose 5 short tags.\nReturn JSON with {"summary": string, "tags": string[]}.\nNote:\n\n${noteText}`,
					}

					// If messages exceed available window, compress the note content
					const available = Math.max(500, windowTokens - Number(maxTokens || 0) - 500)
					let total = countMessagesTokens([...baseMessages, userMsg])
					if (total > available) {
						try {
							const condensed = await summarizeMessages(client, [{ role: 'user', content: text }], {
								model,
								maxTokens: Math.max(100, Math.min(summaryMaxTokens, 400)),
							})
							noteText = `Compressed note:\n${condensed}`
							userMsg = {
								role: 'user',
								content: `Summarize the following note in 3-5 sentences. Then propose 5 short tags.\nReturn JSON with {"summary": string, "tags": string[]}.\nNote:\n\n${noteText}`,
							}
							total = countMessagesTokens([...baseMessages, userMsg])
						} catch {}
					}

					// Run completion
					const completion = await withRetries(
						() =>
							client.chat.completions.create({
								model,
								temperature: 0.2,
								max_tokens: Number(maxTokens) || 300,
								messages: [...baseMessages, userMsg],
							}),
						{ retries: 3, baseDelayMs: 500 }
					)

					const raw = completion?.choices?.[0]?.message?.content || ''
					let summary = raw
					let llmTags = []
					try {
						const parsed = JSON.parse(raw)
						summary = parsed?.summary || summary
						llmTags = Array.isArray(parsed?.tags) ? parsed.tags : llmTags
					} catch {}

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

					// Persist prior summary only (lightweight memory)
					if (useMemory) {
						await appendMessage(sessionId, {
							role: 'assistant',
							content: `Summary: ${summary}. Tags: ${tags.join(', ')}`,
						})
					}

					// Cache the result
					try {
						setCachedSummary(text, model, summary, tags, completion?.usage || null)
					} catch {}

					return {
						file: path.basename(p),
						summary,
						tags,
						usage: completion?.usage || null,
						evaluation,
						model,
					}
				})

				res.json({ results })
			} catch (err) {
				sendError(res, 500, 'SERVER_ERROR', err?.message || String(err))
			}
		}
	)

	// SSE streaming summary for long notes (GET with ?path=<file> or ?text=<raw>)
	app.get(
		'/notes/summarize-stream',
		requireApiKey(),
		...validateQuery({
			text: { in: ['query'], optional: true, isString: true },
			path: { in: ['query'], optional: true, isString: true },
			// Model/context/memory controls
			model: { in: ['query'], optional: true, isString: true },
			maxTokens: { in: ['query'], optional: true, isInt: { options: { min: 16, max: 4000 } } },
			context: { in: ['query'], optional: true },
			contextBudgetTokens: {
				in: ['query'],
				optional: true,
				isInt: { options: { min: 128, max: 200000 } },
			},
			useMemory: { in: ['query'], optional: true, isBoolean: true },
			sessionId: { in: ['query'], optional: true, isString: true },
			reset: { in: ['query'], optional: true, isBoolean: true },
			memorySize: { in: ['query'], optional: true, isInt: { options: { min: 1, max: 200 } } },
			summarizeOverflow: { in: ['query'], optional: true, isBoolean: true },
			summaryMaxTokens: {
				in: ['query'],
				optional: true,
				isInt: { options: { min: 32, max: 1000 } },
			},
		}),
		async (req, res) => {
			try {
				const {
					path: relPath,
					text: rawText,
					model: modelRaw,
					maxTokens: maxTokensRaw,
					context: contextRaw,
					contextBudgetTokens: contextBudgetTokensRaw,
					useMemory: useMemoryRaw,
					sessionId: sid,
					reset: resetRaw,
					memorySize: memorySizeRaw,
					summarizeOverflow: summarizeOverflowRaw,
					summaryMaxTokens: summaryMaxTokensRaw,
				} = req.query || {}

				const client = getClient(req.aiApiKey)

				// Validate and normalize input text or path
				let text = ''
				if (rawText && typeof rawText === 'string') {
					text = rawText
				} else if (relPath && typeof relPath === 'string') {
					const p = path.join(NOTES_DIR, path.basename(relPath))
					text = readNote(p)
				} else {
					return sendError(res, 400, 'INVALID_INPUT', 'Provide ?text=... or ?path=filename')
				}
				if (!text) return sendError(res, 400, 'INVALID_INPUT', 'No content to summarize')

				// Normalize controls (using shared helpers)
				const model = String(modelRaw || DEFAULT_MODEL)
				const maxTokens = toNum(maxTokensRaw, 300)
				const context = safeParseJson(contextRaw)
				const contextBudgetTokens = toNum(contextBudgetTokensRaw, undefined)
				const useMemory = toBool(useMemoryRaw)
				const reset = toBool(resetRaw)
				const memorySize = toNum(memorySizeRaw, 30)
				const summarizeOverflow = toBool(summarizeOverflowRaw)
				const summaryMaxTokens = toNum(summaryMaxTokensRaw, 200)

				// SSE (Server-Sent Events): one-way text stream from server to client
				res.setHeader('Content-Type', 'text/event-stream')
				res.setHeader('Cache-Control', 'no-cache')
				res.setHeader('Connection', 'keep-alive')
				res.flushHeaders && res.flushHeaders()

				res.write(`event: start\n` + `data: {}\n\n`)

				// If we have a cached summary, short-circuit streaming and return cached result
				const cached = getCachedSummary(text, model)
				if (cached) {
					const final = {
						summary: cached.summary,
						tags: Array.isArray(cached.tags) ? cached.tags.slice(0, 7) : [],
						model: cached.model || model,
					}
					res.write(`event: result\n` + `data: ${JSON.stringify(final)}\n\n`)
					if (cached.usage)
						res.write(`event: usage\n` + `data: ${JSON.stringify(cached.usage)}\n\n`)
					try {
						const evaluation = await evaluateSummary(client, text, final.summary, {})
						res.write(`event: evaluation\n` + `data: ${JSON.stringify(evaluation)}\n\n`)
					} catch {}
					// Persist cached summary to memory too
					try {
						const userId = req.headers['x-user-id'] || null
						const sessionIdRaw = sid || req.headers['x-session-id'] || req.ip || 'notes'
						const sessionId = userId ? `${userId}:${sessionIdRaw}` : sessionIdRaw
						if (useMemory) {
							await appendMessage(sessionId, {
								role: 'assistant',
								content: `Summary: ${final.summary}. Tags: ${final.tags.join(', ')}`,
							})
						}
					} catch {}
					res.write(`event: end\n` + `data: {}\n\n`)
					return res.end()
				}

				// Build base messages (system + optional context + trimmed memory)
				let baseMessages = [{ role: 'system', content: 'You summarize and tag notes concisely.' }]
				if (context && typeof context === 'object') {
					baseMessages.push(serializeContextToSystem(context))
				}

				const sessionId = buildSessionKey(req, { sid, defaultScope: 'notes' })
				if (useMemory && reset) await clearSession(sessionId)

				const windowTokens = getModelContextWindow(model)
				const safety = 1000
				const budget = Number(
					contextBudgetTokens || Math.max(500, windowTokens - (Number(maxTokens) || 0) - safety)
				)
				if (useMemory) {
					const mem = await getRecentMessages(sessionId, { limit: memorySize })
					const combined = [...baseMessages, ...mem]
					const within = countMessagesTokens(combined)
					if (within <= budget) {
						baseMessages = combined
					} else if (summarizeOverflow) {
						const { kept, overflow } = splitMessagesByBudget(combined, budget)
						let summaryText = ''
						try {
							summaryText = await summarizeMessages(client, overflow, {
								model,
								maxTokens: summaryMaxTokens,
							})
						} catch {}
						const summaryMsg = summaryText
							? { role: 'system', content: `Conversation summary: ${summaryText}` }
							: { role: 'system', content: 'Conversation summary: (compressed)' }
						baseMessages = [
							kept[0] || { role: 'system', content: 'You summarize and tag notes concisely.' },
							...kept.slice(1),
							summaryMsg,
						]
					} else {
						baseMessages = trimMessagesToTokenBudget(combined, budget)
					}
				}

				// Build the user instruction + note content and ensure window fit
				let noteText = text
				let userMsg = {
					role: 'user',
					content: `Summarize the following note in 3-5 sentences. Then propose 5 short tags.\nReturn JSON with {"summary": string, "tags": string[]}.\nNote:\n\n${noteText}`,
				}
				const available = Math.max(500, windowTokens - Number(maxTokens || 0) - 500)
				let total = countMessagesTokens([...baseMessages, userMsg])
				if (total > available) {
					try {
						const condensed = await summarizeMessages(client, [{ role: 'user', content: text }], {
							model,
							maxTokens: Math.max(100, Math.min(summaryMaxTokens, 400)),
						})
						noteText = `Compressed note:\n${condensed}`
						userMsg = {
							role: 'user',
							content: `Summarize the following note in 3-5 sentences. Then propose 5 short tags.\nReturn JSON with {"summary": string, "tags": string[]}.\nNote:\n\n${noteText}`,
						}
						total = countMessagesTokens([...baseMessages, userMsg])
					} catch {}
				}

				// Stream summary and tags from OpenAI
				const stream = await client.chat.completions.create({
					model,
					temperature: 0.2,
					max_tokens: Number(maxTokens) || 300,
					messages: [...baseMessages, userMsg],
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
				let final = { summary: buffer, tags: [], model }
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
					setCachedSummary(text, model, final.summary, final.tags, usage)
				} catch {}

				// Send evaluation after the result
				try {
					const evaluation = await evaluateSummary(client, text, final.summary, {})
					res.write(`event: evaluation\n` + `data: ${JSON.stringify(evaluation)}\n\n`)
				} catch {}

				// Persist prior summary only (lightweight memory)
				try {
					const userId2 = req.headers['x-user-id'] || null
					const sessionIdRaw2 = sid || req.headers['x-session-id'] || req.ip || 'notes'
					const sessionId2 = userId2 ? `${userId2}:${sessionIdRaw2}` : sessionIdRaw2
					if (useMemory) {
						await appendMessage(sessionId2, {
							role: 'assistant',
							content: `Summary: ${final.summary}. Tags: ${final.tags.join(', ')}`,
						})
					}
				} catch {}

				res.write(`event: end\n` + `data: {}\n\n`)
				res.end()
			} catch (err) {
				try {
					res.write(
						`event: server_error\n` +
							`data: ${JSON.stringify({
								error: err?.message || String(err),
								code: 'SERVER_ERROR',
							})}\n\n`
					)
					res.end()
				} catch {}
			}
		}
	)

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
	app.post(
		'/notes/tags',
		...validateBody({
			// Require array of strings
			tags: { in: ['body'], optional: false, isArray: true },
			'tags.*': { in: ['body'], optional: false, isString: true },
		}),
		(req, res) => {
			try {
				const { tags } = req.body || {}

				saveTagCandidates(tags)

				res.json({ ok: true })
			} catch (err) {
				sendError(res, 500, 'SERVER_ERROR', err?.message || String(err))
			}
		}
	)
}
