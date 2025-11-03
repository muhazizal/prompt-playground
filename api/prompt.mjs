import { getClient, DEFAULT_CHAT_MODELS } from './prompt-core.mjs'
import { chatWithTemperatures, listModels } from './prompt-core.mjs'

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
