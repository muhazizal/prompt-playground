import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

import { registerMetricsRoute, createRequestCounterMiddleware } from './metrics.mjs'

import { registerNotesRoutes } from './module/notes.mjs'
import { registerPromptRoutes } from './module/prompt.mjs'

import { createLoggingMiddleware } from './middleware/logging.mjs'
import { createRateLimitMiddleware } from './middleware/rateLimit.mjs'

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

// Global middlewares: logging, request counter, CORS, JSON/urlencoded parsers with higher limits, rate limit
app.use(createLoggingMiddleware())
app.use(createRequestCounterMiddleware())
app.use(cors({ origin: ORIGINS }))
// Increase body size limits to avoid 413 for base64 image/audio payloads
const BODY_LIMIT = process.env.JSON_LIMIT || '5mb'
app.use(express.json({ limit: BODY_LIMIT }))
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }))
app.use(createRateLimitMiddleware({ windowMs: 60_000, max: 120 }))

registerNotesRoutes(app)
registerPromptRoutes(app)
registerMetricsRoute(app)

// Chat and models routes are now registered via prompt.mjs

app.listen(PORT, () => {
	console.log(`[api] listening on http://localhost:${PORT}`)
	console.log(`[api] allowed origins: ${ORIGINS.join(', ')}`)
})
