import { runAgent, runAgentStream } from '../core/agent.mjs'
import { getClient } from '../core/prompt.mjs'
import { buildSessionKey } from '../core/memory.mjs'
import { requireApiKey } from '../middleware/auth.mjs'
import { validateBody, validateQuery } from '../middleware/validate.mjs'
import { createStreamRateLimit } from '../middleware/rateLimit.mjs'
import { sendError } from '../utils/http.mjs'
import { toBool, toNum } from '../utils/http.mjs'

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
					chain,
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

	// Streaming route for agent
	const streamLimiter = createStreamRateLimit({ windowMs: 5 * 60_000, max: 30 })
	app.get(
		'/agent/run/stream',
		requireApiKey(),
		streamLimiter,
		...validateQuery({
			prompt: { in: ['query'], optional: false, isString: true },
			sessionId: { in: ['query'], optional: true, isString: true },
			useMemory: { in: ['query'], optional: true, isBoolean: true },
			model: { in: ['query'], optional: true, isString: true },
			temperature: { in: ['query'], optional: true, isFloat: { options: { min: 0, max: 2 } } },
			maxTokens: { in: ['query'], optional: true, isInt: { options: { min: 1, max: 4000 } } },
			chain: { in: ['query'], optional: true, isString: true },
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
				const sessionId = buildSessionKey(req, { sid, defaultScope: 'mini-agent' })
				const chain = String(req.query.chain || '').toLowerCase()
				const debug = chain === 'debug'

				if (!prompt.trim()) return sendError(res, 400, 'INVALID_INPUT', 'prompt must be non-empty')

				// SSE headers
				res.setHeader('Content-Type', 'text/event-stream')
				res.setHeader('Cache-Control', 'no-cache')
				res.setHeader('Connection', 'keep-alive')
				res.flushHeaders && res.flushHeaders()

				res.write(`event: start\n` + `data: {}\n\n`)

				await runAgentStream(
					{ prompt, sessionId, useMemory, model, temperature, maxTokens },
					{
						client,
						debug,
						onEvent(type, payload) {
							const data = JSON.stringify(payload || {})
							if (type === 'step') res.write(`event: step\n` + `data: ${data}\n\n`)
							else if (type === 'summary') res.write(`event: summary\n` + `data: ${data}\n\n`)
							else if (type === 'result') res.write(`event: result\n` + `data: ${data}\n\n`)
							else if (type === 'usage') res.write(`event: usage\n` + `data: ${data}\n\n`)
						},
					}
				)

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
}
