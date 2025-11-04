import { getClient, DEFAULT_CHAT_MODELS } from '../core/prompt-core.mjs'
import { chatWithTemperatures, listModels } from '../core/prompt-core.mjs'
import { createStreamRateLimit } from '../middleware/rateLimit.mjs'
import { validateQuery } from '../middleware/validate.mjs'
import { inc } from '../metrics.mjs'

/**
 * Register prompt-related API routes: /chat and /models.
 */
export function registerPromptRoutes(app) {
	// Chat completion with temperature control
	app.post('/prompt/chat', async (req, res) => {
		try {
			const apiKey = process.env.OPENAI_API_KEY
			if (!apiKey) return res.status(500).json({ error: 'Missing OPENAI_API_KEY' })

			const client = getClient(apiKey)
			const data = await chatWithTemperatures(client, req.body || {})
			res.json(data)
		} catch (err) {
			const msg = err?.message || String(err)
			res.status(500).json({ error: msg })
		}
	})

	// Chat completion stream with temperature control
	const streamLimiter = createStreamRateLimit({ windowMs: 5 * 60_000, max: 30 })
	app.get(
		'/api/chat/stream',
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
				const apiKey = process.env.OPENAI_API_KEY
				if (!apiKey) return res.status(500).json({ error: 'Missing OPENAI_API_KEY' })

				const client = new OpenAI({ apiKey })
				const prompt = String(req.query.prompt || '')
				const model = String(req.query.model || 'gpt-4o-mini')
				const temperature =
					req.query.temperature !== undefined ? Number(req.query.temperature) : 0.2
				const maxTokens = req.query.maxTokens !== undefined ? Number(req.query.maxTokens) : 400

				if (!prompt.trim())
					return res.status(400).json({ error: 'prompt must be a non-empty string' })

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
							`data: ${JSON.stringify({ error: err?.message || String(err) })}\n\n`
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
