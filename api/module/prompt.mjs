import { getClient, getModelContextWindow, summarizeOverflowHeuristic } from '../core/prompt.mjs'
import {
	listModels,
	visionDescribe,
	speechToTextTranscribe,
	textToSpeechSynthesize,
	imageGenerate,
} from '../core/prompt.mjs'

import { createStreamRateLimit } from '../middleware/rateLimit.mjs'
import { validateQuery, validateBody } from '../middleware/validate.mjs'
import { requireApiKey } from '../middleware/auth.mjs'
import { requireJson } from '../middleware/contentType.mjs'

import { sendError } from '../utils/http.mjs'

import { inc } from '../metrics.mjs'
import {
	getRecentMessages,
	appendMessage,
	clearSession,
	trimMessagesToTokenBudget,
	splitMessagesByBudget,
	countMessagesTokens,
	serializeContextToSystem,
	buildSessionKey,
	setSessionSummary,
	getSessionSummary,
} from '../core/memory.mjs'

import { toBool, toNum } from '../utils/http.mjs'
import { DEFAULT_SYSTEM_PROMPT } from '../utils/constants.mjs'

/**
 * Register prompt-related API routes: /chat and /models.
 */
export function registerPromptRoutes(app) {
	// Dynamic model list with fallback
	app.get('/prompt/models', requireApiKey(), async (req, res) => {
		const models = await listModels()
		res.json({ models })
	})

	/**
	 * Chat completion route.
	 * Validates body, supports memory/context controls, and returns multiple runs with temperature variations.
	 */
	app.post(
		'/prompt/chat',
		requireApiKey(),
		requireJson(),
		...validateBody({
			prompt: { in: ['body'], optional: false, isString: true },
			model: { in: ['body'], optional: true, isString: true },
			temperature: { in: ['body'], optional: true, isFloat: { options: { min: 0, max: 2 } } },
			maxTokens: { in: ['body'], optional: true, isInt: { options: { min: 1, max: 4000 } } },
			n: { in: ['body'], optional: true, isInt: { options: { min: 1, max: 8 } } },
			temperatures: { in: ['body'], optional: true, isArray: true },
			'temperatures.*': { in: ['body'], optional: true, isFloat: { options: { min: 0, max: 2 } } },
			// Chat memory controls
			useMemory: { in: ['body'], optional: true, isBoolean: true },
			sessionId: { in: ['body'], optional: true, isString: true },
			reset: { in: ['body'], optional: true, isBoolean: true },
			memorySize: { in: ['body'], optional: true, isInt: { options: { min: 1, max: 200 } } },
			contextBudgetTokens: {
				in: ['body'],
				optional: true,
				isInt: { options: { min: 128, max: 200000 } },
			},
			context: { in: ['body'], optional: true },
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
					prompt,
					model = 'gpt-4o-mini',
					temperature = 0.3,
					maxTokens = 200,
					n = 1,
					temperatures,
					useMemory = false,
					sessionId: sid,
					reset = false,
					memorySize = 30,
					contextBudgetTokens,
					context,
					summaryMaxTokens = 200,
				} = req.body || {}

				const sessionId = buildSessionKey(req, { sid, defaultScope: 'default' })
				if (useMemory && reset) clearSession(sessionId)

				// Determine temperature schedule and per-temp sample count (n)
				const tempsToRun =
					Array.isArray(temperatures) && temperatures.length > 0
						? temperatures.map(Number).filter((t) => !Number.isNaN(t))
						: [Number(temperature)]
				const samples = Math.max(1, Number(n) || 1)

				// Build unified system message: default + optional summary/context + generation plan
				let sysParts = [
					DEFAULT_SYSTEM_PROMPT,
					'You will perform three tasks internally: (1) Detect user intent, (2) If the user message is very long, summarize key points before replying, (3) Reply clearly.',
					`Generation plan: produce ${samples} short choices for each temperature in ${JSON.stringify(
						tempsToRun
					)}. Return STRICT JSON only: {"intent":string,"summary"?:string,"runs":[{"temperature":number,"choices":[{"text":string}]}]}`,
				]

				try {
					if (useMemory) {
						const persistedSummary = await getSessionSummary(sessionId)
						const summaryText =
							typeof persistedSummary === 'string'
								? persistedSummary
								: persistedSummary && typeof persistedSummary.text === 'string'
								? persistedSummary.text
								: ''

						if (summaryText) sysParts.push(`Conversation summary: ${summaryText}`)
					}
				} catch {}

				if (context && typeof context === 'object') {
					const ctxMsg = serializeContextToSystem(context)
					const ctxText = String(ctxMsg?.content || '')

					if (ctxText) sysParts.push(ctxText)
				}

				let baseMessages = [{ role: 'system', content: sysParts.join('\n\n') }]

				// Model-aware budget (window - maxTokens - safety)
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
					} else {
						// Compute overflow summary heuristically instead of extra LLM call
						const { kept, overflow } = splitMessagesByBudget(combined, budget)
						const overflowSummary = summarizeOverflowHeuristic(overflow, {
							maxBullets: 5,
							maxChars: summaryMaxTokens * 4,
						})

						if (overflowSummary) {
							// Persist summary for future turns
							try {
								await setSessionSummary(sessionId, overflowSummary, {
									model,
									tokens: summaryMaxTokens,
								})
							} catch {}

							// Inject into unified system message
							kept[0] = kept[0] || { role: 'system', content: DEFAULT_SYSTEM_PROMPT }
							kept[0].content = `${kept[0].content}\n\nConversation summary: ${overflowSummary}`
						}
						// Final clamp to ensure strict budget compliance after summary injection
						baseMessages = trimMessagesToTokenBudget(kept, budget)
					}
				}
				baseMessages.push({ role: 'user', content: String(prompt || '') })

				// Single LLM call that returns structured multi-temperature runs
				const started = Date.now()
				const completion = await client.chat.completions.create({
					model,
					// Use a median temperature for internal reasoning; diversity is encoded in instructions
					temperature,
					max_tokens: Math.max(128, maxTokens),
					response_format: { type: 'json_object' },
					messages: baseMessages,
				})
				const durationMs = Date.now() - started
				const content = completion?.choices?.[0]?.message?.content || '{}'

				let parsed = null
				try {
					parsed = JSON.parse(content)
				} catch {}
				const parsedRuns = Array.isArray(parsed?.runs) ? parsed.runs : []

				const runs = parsedRuns.map((r) => ({
					temperature: Number(r?.temperature ?? temperature),
					choices: Array.isArray(r?.choices)
						? r.choices.map((c, idx) => ({ index: idx, text: String(c?.text || '') }))
						: [{ index: 0, text: String(r?.text || '') }],
					usage: completion?.usage || null,
					durationMs,
				}))

				// Fallback when model does not return runs
				if (runs.length === 0) {
					const fallbackText = typeof content === 'string' ? content : ''
					runs.push({
						temperature: Number(temperature),
						choices: [{ index: 0, text: fallbackText }],
						usage: completion?.usage || null,
						durationMs,
					})
				}

				const data = { prompt, model, maxTokens, runs }

				// Persist user + first assistant reply to memory
				if (useMemory) {
					await appendMessage(sessionId, { role: 'user', content: String(prompt || '') })
					const firstTextPersist = runs?.[0]?.choices?.[0]?.text ?? ''

					if (firstTextPersist)
						await appendMessage(sessionId, { role: 'assistant', content: firstTextPersist })
				}
				res.json(data)
			} catch (err) {
				const msg = err?.message || String(err)
				sendError(res, 500, 'SERVER_ERROR', msg)
			}
		}
	)

	/**
	 * Chat completion streaming route.
	 * Uses SSE to stream assistant text and usage; supports memory and window-aware budget handling.
	 */
	const streamLimiter = createStreamRateLimit({ windowMs: 5 * 60_000, max: 30 })
	app.get(
		'/prompt/chat/stream',
		requireApiKey(),
		streamLimiter,
		// Basic query validation
		...validateQuery({
			prompt: {
				in: ['query'],
				optional: false,
				isString: true,
				errorMessage: 'prompt is required',
			},
			model: { in: ['query'], optional: true, isString: true },
			temperature: { in: ['query'], optional: true, isFloat: { options: { min: 0, max: 2 } } },
			maxTokens: { in: ['query'], optional: true, isInt: { options: { min: 1, max: 4000 } } },
			// Memory via query for streaming too
			useMemory: { in: ['query'], optional: true, isBoolean: true },
			sessionId: { in: ['query'], optional: true, isString: true },
			reset: { in: ['query'], optional: true, isBoolean: true },
			memorySize: { in: ['query'], optional: true, isInt: { options: { min: 1, max: 200 } } },
			contextBudgetTokens: {
				in: ['query'],
				optional: true,
				isInt: { options: { min: 500, max: 100000 } },
			},
		}),
		async (req, res) => {
			try {
				const client = getClient(req.aiApiKey)
				const prompt = String(req.query.prompt || '')
				const model = String(req.query.model || 'gpt-4o-mini')
				const temperature = toNum(req.query.temperature, 0.2)
				const maxTokens = toNum(req.query.maxTokens, 400)
				const useMemory = toBool(req.query.useMemory)
				const sid = req.query.sessionId || req.headers['x-session-id']
				const sessionId = buildSessionKey(req, { sid, defaultScope: 'default' })
				const reset = toBool(req.query.reset)
				const memorySize = toNum(req.query.memorySize, 30)
				const contextBudgetTokens =
					req.query.contextBudgetTokens !== undefined
						? Number(req.query.contextBudgetTokens)
						: undefined
				const summaryMaxTokens = toNum(req.query.summaryMaxTokens, 200)

				if (!prompt.trim())
					return sendError(res, 400, 'INVALID_INPUT', 'prompt must be a non-empty string')

				// SSE headers
				res.setHeader('Content-Type', 'text/event-stream')
				res.setHeader('Cache-Control', 'no-cache')
				res.setHeader('Connection', 'keep-alive')
				res.flushHeaders && res.flushHeaders()

				inc('sse_starts_total')
				res.write(`event: start\n` + `data: {}\n\n`)

				if (useMemory && reset) clearSession(sessionId)

				// Build unified system message for stream: DEFAULT + optional summary + optional context
				let sysParts = [DEFAULT_SYSTEM_PROMPT]
				try {
					if (useMemory) {
						const persistedSummary = await getSessionSummary(sessionId)
						const summaryText =
							typeof persistedSummary === 'string'
								? persistedSummary
								: persistedSummary && typeof persistedSummary.text === 'string'
								? persistedSummary.text
								: ''
						if (summaryText) sysParts.push(`Conversation summary: ${summaryText}`)
					}
				} catch {}

				// Optional client-provided context via query (JSON string)
				let parsedContext = null
				if (typeof req.query.context === 'string') {
					try {
						parsedContext = JSON.parse(req.query.context)
					} catch {}
				}

				if (parsedContext && typeof parsedContext === 'object') {
					const ctxMsg = serializeContextToSystem(parsedContext)
					const ctxText = String(ctxMsg?.content || '')
					if (ctxText) sysParts.push(ctxText)
				}

				let baseMessages = [{ role: 'system', content: sysParts.join('\n\n') }]

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
					} else {
						const { kept, overflow } = splitMessagesByBudget(combined, budget)
						const overflowSummary = summarizeOverflowHeuristic(overflow, {
							maxBullets: 5,
							maxChars: summaryMaxTokens * 4,
						})

						if (overflowSummary) {
							kept[0] = kept[0] || { role: 'system', content: DEFAULT_SYSTEM_PROMPT }
							kept[0].content = `${kept[0].content}\n\nConversation summary: ${overflowSummary}`

							// Persist summary for future turns in streaming mode as well
							try {
								await setSessionSummary(sessionId, overflowSummary, {
									model,
									tokens: summaryMaxTokens,
								})
							} catch {}
						}
						// Final clamp to ensure strict budget compliance after summary injection
						baseMessages = trimMessagesToTokenBudget(kept, budget)
					}
				}
				baseMessages.push({ role: 'user', content: prompt })

				// Stream chat completion
				const stream = await client.chat.completions.create({
					model,
					temperature,
					max_tokens: maxTokens,
					messages: baseMessages,
					stream: true,
					stream_options: { include_usage: true },
				})
				inc('openai_calls_total')

				let fullText = ''
				let usage = null

				for await (const part of stream) {
					const chunk = part?.choices?.[0]?.delta?.content || ''
					if (chunk) {
						fullText += chunk
						res.write(`event: summary\n` + `data: ${JSON.stringify({ chunk })}\n\n`)
					}
					if (part?.usage) usage = part.usage
				}

				res.write(`event: result\n` + `data: ${JSON.stringify({ text: fullText, model })}\n\n`)
				if (usage) res.write(`event: usage\n` + `data: ${JSON.stringify(usage)}\n\n`)

				res.write(`event: end\n` + `data: {}\n\n`)
				res.end()

				// Persist to memory after stream
				if (useMemory) {
					await appendMessage(sessionId, { role: 'user', content: String(prompt || '') })
					if (fullText) await appendMessage(sessionId, { role: 'assistant', content: fullText })
				}
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

	// Image generation route
	app.post(
		'/prompt/image-generation',
		requireApiKey(),
		requireJson(),
		...validateBody({
			prompt: { in: ['body'], optional: false, isString: true },
			model: { in: ['body'], optional: true, isString: true },
			size: { in: ['body'], optional: true, isString: true },
			format: { in: ['body'], optional: true, isString: true },
		}),
		async (req, res) => {
			try {
				const client = getClient(req.aiApiKey)
				const data = await imageGenerate(client, req.body || {})
				res.json(data)
			} catch (err) {
				const msg = err?.message || String(err)
				sendError(res, 400, 'INVALID_INPUT', msg)
			}
		}
	)

	// Image vision route
	app.post(
		'/prompt/vision',
		requireApiKey(),
		requireJson(),
		...validateBody({
			imageUrl: { in: ['body'], optional: true, isString: true },
			imageBase64: { in: ['body'], optional: true, isString: true },
			prompt: { in: ['body'], optional: true, isString: true },
			model: { in: ['body'], optional: true, isString: true },
			maxTokens: { in: ['body'], optional: true, isInt: { options: { min: 16, max: 4000 } } },
			temperature: { in: ['body'], optional: true, isFloat: { options: { min: 0, max: 2 } } },
		}),
		async (req, res) => {
			try {
				const client = getClient(req.aiApiKey)
				const data = await visionDescribe(client, req.body || {})
				res.json(data)
			} catch (err) {
				const msg = err?.message || String(err)
				sendError(res, 400, 'INVALID_INPUT', msg)
			}
		}
	)

	// Speech to text route
	app.post(
		'/prompt/speech-to-text',
		requireApiKey(),
		requireJson(),
		...validateBody({
			audioBase64: { in: ['body'], optional: false, isString: true },
			model: { in: ['body'], optional: true, isString: true },
			language: { in: ['body'], optional: true, isString: true },
		}),
		async (req, res) => {
			try {
				const client = getClient(req.aiApiKey)
				const data = await speechToTextTranscribe(client, req.body || {})
				res.json(data)
			} catch (err) {
				const msg = err?.message || String(err)
				sendError(res, 400, 'INVALID_INPUT', msg)
			}
		}
	)

	// Text to speech route
	app.post(
		'/prompt/text-to-speech',
		requireApiKey(),
		requireJson(),
		...validateBody({
			text: { in: ['body'], optional: false, isString: true },
			model: { in: ['body'], optional: true, isString: true },
			voice: { in: ['body'], optional: true, isString: true },
			format: { in: ['body'], optional: true, isString: true },
		}),
		async (req, res) => {
			try {
				const client = getClient(req.aiApiKey)
				const data = await textToSpeechSynthesize(client, req.body || {})
				res.json(data)
			} catch (err) {
				const msg = err?.message || String(err)
				sendError(res, 400, 'INVALID_INPUT', msg)
			}
		}
	)
}
