import { getClient, DEFAULT_CHAT_MODELS } from '../core/prompt-core.mjs'
import { chatWithTemperatures, listModels } from '../core/prompt-core.mjs'

import { createStreamRateLimit } from '../middleware/rateLimit.mjs'
import { validateQuery, validateBody } from '../middleware/validate.mjs'
import { requireApiKey } from '../middleware/auth.mjs'

import { sendError } from '../utils/http.mjs'

import { inc } from '../metrics.mjs'

/**
 * Register prompt-related API routes: /chat and /models.
 */
export function registerPromptRoutes(app) {
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
		}),
		async (req, res) => {
			try {
				const client = getClient(req.aiApiKey)
				const data = await chatWithTemperatures(client, req.body || {})
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
		}),
		async (req, res) => {
			try {
				const client = getClient(req.aiApiKey)
				const prompt = String(req.query.prompt || '')
				const model = String(req.query.model || 'gpt-4o-mini')
				const temperature =
					req.query.temperature !== undefined ? Number(req.query.temperature) : 0.2
				const maxTokens = req.query.maxTokens !== undefined ? Number(req.query.maxTokens) : 400

				if (!prompt.trim())
					return sendError(res, 400, 'INVALID_INPUT', 'prompt must be a non-empty string')

				// SSE headers
				res.setHeader('Content-Type', 'text/event-stream')
				res.setHeader('Cache-Control', 'no-cache')
				res.setHeader('Connection', 'keep-alive')
				res.flushHeaders && res.flushHeaders()

				inc('sse_starts_total')
				res.write(`event: start\n` + `data: {}\n\n`)

				// Stream chat completion
				const stream = await client.chat.completions.create({
					model,
					temperature,
					max_tokens: maxTokens,
					messages: [
						{ role: 'system', content: 'You are a helpful assistant.' },
						{ role: 'user', content: prompt },
					],
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

	// Dynamic model list with fallback
	app.get('/prompt/models', async (_req, res) => {
		try {
			const apiKey = process.env.OPENAI_API_KEY
			if (!apiKey) return res.json({ models: DEFAULT_CHAT_MODELS })

			const client = getClient(apiKey)
			const models = await listModels(client)
			res.json({ models })
		} catch {
			res.json({ models: DEFAULT_CHAT_MODELS })
		}
	})
}
