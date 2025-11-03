import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { registerNotesRoutes } from './notes.mjs'
import { registerPromptRoutes } from './prompt.mjs'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 4000
// Allow multiple dev origins by default and merge with WEB_ORIGIN
const ORIGINS = Array.from(
	new Set([
		...(process.env.WEB_ORIGIN ? process.env.WEB_ORIGIN.split(',').map((s) => s.trim()) : []),
		'http://localhost:3000',
		'http://localhost:3002',
	])
)

app.use(cors({ origin: ORIGINS }))
app.use(express.json())

registerNotesRoutes(app)
registerPromptRoutes(app)

app.get('/health', (_req, res) => {
	res.json({ ok: true })
})

// Chat and models routes are now registered via prompt.mjs

app.listen(PORT, () => {
	console.log(`[api] listening on http://localhost:${PORT}`)
	console.log(`[api] allowed origins: ${ORIGINS.join(', ')}`)
})
