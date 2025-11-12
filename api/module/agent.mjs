import { runAgent } from '../core/agent.mjs'
import { getClient } from '../core/prompt.mjs'
import { buildSessionKey } from '../core/memory.mjs'
import { requireApiKey } from '../middleware/auth.mjs'
import { validateBody } from '../middleware/validate.mjs'
import { sendError } from '../utils/http.mjs'
import { requireJson } from '../middleware/contentType.mjs'
import { inc } from '../metrics.mjs'

/**
 * Register Agent routes.
 *
 * @param {import('express').Express} app - Express application instance
 */
export function registerAgentRoutes(app) {
	app.post(
		'/agent/run',
		requireApiKey(),
		requireJson(),
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
			inc('agent_run_requests_total')
			try {
				const client = getClient(req.aiApiKey)
				const {
					prompt,
					sessionId = 'mini-agent',
					useMemory = true,
					model = 'gpt-4o-mini',
					temperature = 0.5,
					maxTokens = 10000,
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
				inc('openai_calls_total')

				res.json(result)
			} catch (err) {
				sendError(res, 500, 'SERVER_ERROR', err?.message || String(err))
			}
		}
	)
}
