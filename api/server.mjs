import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import OpenAI from 'openai'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 4000
const ORIGIN = process.env.WEB_ORIGIN || 'http://localhost:3000'

app.use(cors({ origin: ORIGIN }))
app.use(express.json())

app.get('/health', (_req, res) => {
	res.json({ ok: true })
})

app.post('/chat', async (req, res) => {
	try {
		const apiKey = process.env.OPENAI_API_KEY
		if (!apiKey) {
			return res.status(500).json({ error: 'Missing OPENAI_API_KEY' })
		}
		const { prompt, model = 'gpt-4o-mini', temperature = 0.3, maxTokens = 200 } = req.body || {}
		if (!prompt || typeof prompt !== 'string') {
			return res.status(400).json({ error: 'Invalid prompt' })
		}

		const client = new OpenAI({ apiKey })
		const completion = await client.chat.completions.create({
			model,
			temperature,
			max_tokens: maxTokens,
			messages: [
				{ role: 'system', content: 'You are a helpful assistant.' },
				{ role: 'user', content: prompt },
			],
		})
		const text = completion.choices?.[0]?.message?.content ?? ''
		res.json({ text, model, temperature, usage: completion.usage || null })
	} catch (err) {
		const msg = err?.message || String(err)
		res.status(500).json({ error: msg })
	}
})

app.listen(PORT, () => {
	console.log(`[api] listening on http://localhost:${PORT}`)
	console.log(`[api] allowed origin: ${ORIGIN}`)
})
