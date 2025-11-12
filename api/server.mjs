import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
dotenv.config()

import { registerMetricsRoute, createRequestCounterMiddleware } from './metrics.mjs'

import { registerPromptRoutes } from './module/prompt.mjs'
import { registerAgentRoutes } from './module/agent.mjs'
import { registerOpenApiRoute } from './openapi.mjs'

import { createLoggingMiddleware } from './middleware/logging.mjs'
import { createRateLimitMiddleware } from './middleware/rateLimit.mjs'
import { getFirestore } from './utils/firebase.mjs'

/**
 * Attach global middlewares to the provided Express app.
 * Single responsibility: logging, metrics, CORS, body parsers, and rate limiting.
 *
 * @param {import('express').Express} app
 */
function attachGlobalMiddlewares(app) {
  // Allow multiple dev origins by default and merge with WEB_ORIGIN
  const ORIGINS = Array.from(
    new Set([
      ...(process.env.WEB_ORIGIN ? process.env.WEB_ORIGIN.split(',').map((s) => s.trim()) : []),
      'http://localhost:3000',
      'http://localhost:3002',
    ]),
  )

  app.use(createLoggingMiddleware())
  app.use(createRequestCounterMiddleware())
  app.use(cors({ origin: ORIGINS }))
  // Increase body size limits to avoid 413 for base64 image/audio payloads
  const BODY_LIMIT = process.env.JSON_LIMIT || '5mb'
  app.use(express.json({ limit: BODY_LIMIT }))
  app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }))
  app.use(createRateLimitMiddleware({ windowMs: 60_000, max: 120 }))
}

/**
 * Register all API routes on the provided app.
 *
 * @param {import('express').Express} app
 */
function registerRoutes(app) {
  registerPromptRoutes(app)
  registerAgentRoutes(app)
  registerMetricsRoute(app)
  registerOpenApiRoute(app)
}

export function createApp() {
  const app = express()
  attachGlobalMiddlewares(app)
  registerRoutes(app)
  return app
}

const PORT = process.env.PORT || 4000

if (process.env.NODE_ENV !== 'test') {
  const app = createApp()
  const ORIGINS = Array.from(
    new Set([
      ...(process.env.WEB_ORIGIN ? process.env.WEB_ORIGIN.split(',').map((s) => s.trim()) : []),
      'http://localhost:3000',
      'http://localhost:3002',
    ]),
  )
  app.listen(PORT, () => {
    console.log(`[api] listening on http://localhost:${PORT}`)
    console.log(`[api] allowed origins: ${ORIGINS.join(', ')}`)
    const memStore = String(process.env.MEMORY_STORE || '').toLowerCase()
    if (memStore === 'firebase') {
      console.log('[api] chat memory store: Firestore')
      getFirestore()
        .then(() => console.log('[api] Firestore initialized'))
        .catch((err) => console.log('[api] Firestore init error:', err?.message || String(err)))
    } else {
      console.log('[api] chat memory store: in-memory (non-persistent)')
    }
  })
}
