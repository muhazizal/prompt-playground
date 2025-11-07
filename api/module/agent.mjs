import { runAgent } from '../core/agent.mjs'
import { getClient } from '../core/prompt.mjs'
import { buildSessionKey } from '../core/memory.mjs'
import { requireApiKey } from '../middleware/auth.mjs'
import { validateBody, validateQuery } from '../middleware/validate.mjs'
import { createStreamRateLimit } from '../middleware/rateLimit.mjs'
import { sendError } from '../utils/http.mjs'

/**
 * Register Agent routes.
 *
 * @param {import('express').Express} app - Express application instance
 */
export function registerAgentRoutes(app) {
	app.post(
		'/agent/run',
		requireApiKey(),
		...validateBody({
			prompt: { in: ['body'], optional: false, isString: true },
			// Optional client-tunable fields are intentionally ignored by web UI.
			sessionId: { in: ['body'], optional: true, isString: true },
			useMemory: { in: ['body'], optional: true, isBoolean: true },
			model: { in: ['body'], optional: true, isString: true },
			temperature: { in: ['body'], optional: true, isFloat: { options: { min: 0, max: 2 } } },
			maxTokens: { in: ['body'], optional: true, isInt: { options: { min: 1, max: 4000 } } },
			chain: { in: ['body'], optional: true, isString: true },
		}),
		async (req, res) => {
			try {
				const client = getClient(req.aiApiKey)
				const {
					prompt,
					sessionId = 'mini-agent',
					useMemory = true,
					model = 'gpt-4o-mini',
					temperature = 0.2,
					maxTokens = 400,
					chain = 'debug',
				} = req.body || {}

				// Scope session by user and request
				const sid = buildSessionKey(req, { sid: sessionId })

				const debug = String(chain || '').toLowerCase() === 'debug'
				const result = await runAgent(
					{
						prompt,
						sessionId: sid,
						useMemory,
						model,
						temperature,
						maxTokens,
					},
					{ client, debug }
				)

				res.json(result)
			} catch (err) {
				sendError(res, 500, 'SERVER_ERROR', err?.message || String(err))
			}
		}
	)

	// New: word-only SSE stream for typing effect
	const streamLimiter = createStreamRateLimit({ windowMs: 5 * 60_000, max: 30 })
	app.get(
		'/agent/words',
		requireApiKey(),
		streamLimiter,
		...validateQuery({
			prompt: { in: ['query'], optional: false, isString: true },
		}),
		async (req, res) => {
			try {
				const client = getClient(req.aiApiKey)
				const prompt = String(req.query.prompt || '')
				if (!prompt.trim()) return sendError(res, 400, 'INVALID_INPUT', 'prompt must be non-empty')

				// SSE headers
				res.setHeader('Content-Type', 'text/event-stream')
				res.setHeader('Cache-Control', 'no-cache')
				res.setHeader('Connection', 'keep-alive')
				res.flushHeaders && res.flushHeaders()

				res.write(`event: start\n` + `data: {}\n\n`)

				// Run agent with server defaults only
				const sessionId = buildSessionKey(req, { sid: 'mini-agent' })
				const result = await runAgent({ prompt, sessionId }, { client, debug: false })

				const answerText = String(result?.answer || '')
				const words = answerText.split(/\s+/).filter(Boolean)
				for (const w of words) {
					res.write(`event: word\n` + `data: ${JSON.stringify({ w })}\n\n`)
				}

				// Send final payload for metadata
				const finalPayload = {
					answer: result?.answer || '',
					sources: result?.sources || [],
					usage: result?.usage,
					costUsd: result?.costUsd,
					durationMs: result?.durationMs,
				}
				res.write(`event: end\n` + `data: ${JSON.stringify(finalPayload)}\n\n`)
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
}
