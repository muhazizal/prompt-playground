import { getClient, getModelContextWindow, summarizeMessages } from '../core/prompt-core.mjs'
import {
	chatWithTemperatures,
	listModels,
	visionDescribe,
	speechToTextTranscribe,
	textToSpeechSynthesize,
	imageGenerate,
} from '../core/prompt-core.mjs'

import { createStreamRateLimit } from '../middleware/rateLimit.mjs'
import { validateQuery, validateBody } from '../middleware/validate.mjs'
import { requireApiKey } from '../middleware/auth.mjs'

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
} from '../core/memory.mjs'

/**
 * Register prompt-related API routes: /chat and /models.
 */
export function registerPromptRoutes(app) {
	// Dynamic model list with fallback
	app.get('/prompt/models', requireApiKey(), async (req, res) => {
		const models = await listModels()
		res.json({ models })
	})

	// Chat completion with temperature control
	app.post(
		'/prompt/chat',
		requireApiKey(),
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
					summarizeOverflow = true,
					summaryMaxTokens = 200,
				} = req.body || {}

				const sessionId = buildSessionKey(req, { sid, defaultScope: 'default' })
				if (useMemory && reset) clearSession(sessionId)

				// Build messages (system + trimmed memory + user)
				let baseMessages = [{ role: 'system', content: 'You are a helpful assistant.' }]
				if (context && typeof context === 'object') {
					baseMessages.push(serializeContextToSystem(context))
				}

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
							kept[0] || { role: 'system', content: 'You are a helpful assistant.' },
							...kept.slice(1),
							summaryMsg,
						]
					} else {
						baseMessages = trimMessagesToTokenBudget(combined, budget)
					}
				}
				baseMessages.push({ role: 'user', content: String(prompt || '') })

				const data = await chatWithTemperatures(client, {
					prompt,
					model,
					temperature,
					maxTokens,
					n,
					temperatures,
					baseMessages,
				})

				// Persist user + first assistant reply to memory
				if (useMemory) {
					await appendMessage(sessionId, { role: 'user', content: String(prompt || '') })
					const firstText = data?.runs?.[0]?.choices?.[0]?.text ?? ''
					if (firstText) await appendMessage(sessionId, { role: 'assistant', content: firstText })
				}
				res.json(data)
			} catch (err) {
				const msg = err?.message || String(err)
				sendError(res, 500, 'SERVER_ERROR', msg)
			}
		}
	)

	// Chat completion stream with temperature control
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
				const temperature =
					req.query.temperature !== undefined ? Number(req.query.temperature) : 0.2
				const maxTokens = req.query.maxTokens !== undefined ? Number(req.query.maxTokens) : 400
				const useMemory =
					String(req.query.useMemory || '') === 'true' || req.query.useMemory === true
				const sid = req.query.sessionId || req.headers['x-session-id']
				const sessionId = buildSessionKey(req, { sid, defaultScope: 'default' })
				const reset = String(req.query.reset || '') === 'true' || req.query.reset === true
				const memorySize = req.query.memorySize !== undefined ? Number(req.query.memorySize) : 30
				const contextBudgetTokens =
					req.query.contextBudgetTokens !== undefined
						? Number(req.query.contextBudgetTokens)
						: undefined
				const summarizeOverflow =
					String(req.query.summarizeOverflow || '') === 'true' ||
					req.query.summarizeOverflow === true
				const summaryMaxTokens =
					req.query.summaryMaxTokens !== undefined ? Number(req.query.summaryMaxTokens) : 200

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

				// Build messages (system + trimmed memory + user)
				let baseMessages = [{ role: 'system', content: 'You are a helpful assistant.' }]
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
							kept[0] || { role: 'system', content: 'You are a helpful assistant.' },
							...kept.slice(1),
							summaryMsg,
						]
					} else {
						baseMessages = trimMessagesToTokenBudget(combined, budget)
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
