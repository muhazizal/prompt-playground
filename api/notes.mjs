import path from 'path'
import OpenAI from 'openai'
import { NOTES_DIR, listNoteFiles, readNote, summarize, rankTags } from './notes-core.mjs'

export function registerNotesRoutes(app) {
	app.get('/notes/list', (_req, res) => {
		try {
			const files = listNoteFiles().map((f) => ({ name: f.name }))
			res.json({ files })
		} catch (err) {
			res.status(500).json({ error: err?.message || String(err) })
		}
	})

	app.post('/notes/process', async (req, res) => {
		try {
			const apiKey = process.env.OPENAI_API_KEY
			if (!apiKey) return res.status(500).json({ error: 'Missing OPENAI_API_KEY' })

			const client = new OpenAI({ apiKey })
			const { paths } = req.body || {}
			const targets =
				Array.isArray(paths) && paths.length > 0
					? paths.map((p) => path.join(NOTES_DIR, path.basename(p)))
					: listNoteFiles().map((f) => f.path)

			const results = []
			for (const p of targets) {
				const text = readNote(p)

				if (!text) continue

				const { summary, tags: llmTags, usage } = await summarize(client, text, {})
				const embedTags = await rankTags(client, text)
				const tags = Array.from(new Set([...(llmTags || []), ...(embedTags || [])])).slice(0, 7)

				results.push({ file: path.basename(p), summary, tags, usage })
			}

			res.json({ results })
		} catch (err) {
			res.status(500).json({ error: err?.message || String(err) })
		}
	})

	app.post('/notes/summarize', async (req, res) => {
		try {
			const apiKey = process.env.OPENAI_API_KEY
			if (!apiKey) return res.status(500).json({ error: 'Missing OPENAI_API_KEY' })

			const client = new OpenAI({ apiKey })
			const { text } = req.body || {}

			if (!text || typeof text !== 'string') return res.status(400).json({ error: 'Invalid text' })

			const { summary, tags, usage } = await summarize(client, text, {})
			const embedTags = await rankTags(client, text)

			res.json({ summary, tags: Array.from(new Set([...(tags || []), ...embedTags])), usage })
		} catch (err) {
			res.status(500).json({ error: err?.message || String(err) })
		}
	})
}
