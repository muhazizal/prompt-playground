import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import OpenAI from 'openai'
import { registerNotesRoutes } from './notes.mjs'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 4000
const ORIGIN = process.env.WEB_ORIGIN || 'http://localhost:3000'

app.use(cors({ origin: ORIGIN }))
app.use(express.json())

registerNotesRoutes(app)

app.get('/health', (_req, res) => {
	res.json({ ok: true })
})

app.post('/chat', async (req, res) => {
	try {
		const apiKey = process.env.OPENAI_API_KEY
		if (!apiKey) {
			return res.status(500).json({ error: 'Missing OPENAI_API_KEY' })
		}
		const {
			prompt,
			model = 'gpt-4o-mini',
			temperature = 0.3,
			maxTokens = 200,
			n = 1,
			temperatures,
		} = req.body || {}
		if (!prompt || typeof prompt !== 'string') {
			return res.status(400).json({ error: 'Invalid prompt' })
		}

		const client = new OpenAI({ apiKey })

		const tempsToRun =
			Array.isArray(temperatures) && temperatures.length > 0
				? temperatures.map(Number).filter((t) => !Number.isNaN(t))
				: [Number(temperature)]

		const runs = []
		for (const t of tempsToRun) {
			const started = Date.now()
			const completion = await client.chat.completions.create({
				model,
				temperature: t,
				n: Math.max(1, Number(n) || 1),
				max_tokens: maxTokens,
				messages: [
					{ role: 'system', content: 'You are a helpful assistant.' },
					{ role: 'user', content: prompt },
				],
			})
			const durationMs = Date.now() - started
			const choices = (completion.choices || []).map((c, idx) => ({
				index: idx,
				text: c?.message?.content ?? '',
			}))
			runs.push({ temperature: t, choices, usage: completion.usage || null, durationMs })
		}

		res.json({ prompt, model, maxTokens, runs })
	} catch (err) {
		const msg = err?.message || String(err)
		res.status(500).json({ error: msg })
	}
})

// Provide dynamic model list from backend capability with fallback
app.get('/models', async (_req, res) => {
	const defaultModels = [
		{ label: 'gpt-4o-mini', value: 'gpt-4o-mini' },
		{ label: 'gpt-4o', value: 'gpt-4o' },
	]

	try {
		const apiKey = process.env.OPENAI_API_KEY
		if (!apiKey) {
			return res.json({
				models: defaultModels,
			})
		}
		const client = new OpenAI({ apiKey })
		const list = await client.models.list()
		// Filter reasonable chat-capable models
		const models = (list?.data || [])
			.map((m) => m?.id)
			.filter(Boolean)
			.filter((id) => /gpt|o|mini|turbo/i.test(id))
			.slice(0, 20)
			.map((id) => ({ label: id, value: id }))
		if (models.length === 0) {
			return res.json({
				models: defaultModels,
			})
		}
		res.json({ models })
	} catch (err) {
		// On any error, return fallback list
		res.json({
			models: defaultModels,
		})
	}
})

app.listen(PORT, () => {
	console.log(`[api] listening on http://localhost:${PORT}`)
	console.log(`[api] allowed origin: ${ORIGIN}`)
})
