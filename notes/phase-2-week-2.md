## Phase 2 – Week 2: Auth, Middleware, Rate Limiting & Observability

This week we harden the API: consistent authentication, request validation, rate limiting, structured logging, and usage metrics. The goal is a predictable, secure surface for the web app and any future clients.

### Objectives

- Add authentication and user scoping via headers/environment.
- Validate inputs early and return uniform error shapes.
- Implement per-IP/user rate limiting to protect the API.
- Introduce structured logging and correlation IDs.
- Capture usage metrics (tokens, latency, model) for visibility and cost control.

### Architecture Overview

- `api/middleware/auth.mjs`: Resolves API key and optional `x-user-id`; attaches to request.
- `api/middleware/validate.mjs`: Body/query validation helpers for required fields.
- `api/middleware/rateLimit.mjs`: Simple limiter by user/IP and endpoint.
- `api/middleware/logging.mjs`: Adds `x-request-id`, logs request lifecycle and latency.
- `api/metrics.mjs`: Aggregates counters (requests, tokens, latency) per route/model.
- `api/utils/http.mjs`: Consistent response helpers (success/error JSON shapes).
- `api/server.mjs`: Assembles middlewares/routers; configures CORS.

### Minimal Middleware Examples (TypeScript)

```ts
// Logging middleware: correlation ID + latency
import type { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'

/** Adds x-request-id and logs structured request/response data */
export function loggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = String(req.headers['x-request-id'] || randomUUID())
  res.setHeader('x-request-id', requestId)
  const start = Date.now()
  res.on('finish', () => {
    const latencyMs = Date.now() - start
    // Structured log for easier parsing
    console.log(JSON.stringify({
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      latencyMs,
    }))
  })
  next()
}

// Auth middleware: header or env fallback
import type { Request as ExRequest } from 'express'

type AnyReq = ExRequest & { openaiApiKey?: string; userId?: string }

/** Resolves API key and optional user id. Rejects if no key. */
export function authMiddleware(req: AnyReq, res: Response, next: NextFunction) {
  const apiKey = req.header('x-api-key') || process.env.OPENAI_API_KEY
  if (!apiKey) {
    return res.status(401).json({ code: 'unauthorized', message: 'Missing API key' })
  }
  req.openaiApiKey = apiKey
  req.userId = req.header('x-user-id') || 'anonymous'
  next()
}

// Very simple in-memory rate limiter (token bucket)
const buckets = new Map<string, { tokens: number; last: number }>()
const LIMIT_TOKENS = 30 // requests per window
const REFILL_MS = 60_000 // 1 minute

/** Rate-limits per user+route. For production, use Redis or a robust library. */
export function rateLimitMiddleware(req: AnyReq, res: Response, next: NextFunction) {
  const key = `${req.userId || 'anon'}:${req.path}`
  const now = Date.now()
  const bucket = buckets.get(key) || { tokens: LIMIT_TOKENS, last: now }
  // Refill proportionally
  const elapsed = now - bucket.last
  const refill = Math.floor((elapsed / REFILL_MS) * LIMIT_TOKENS)
  bucket.tokens = Math.min(LIMIT_TOKENS, bucket.tokens + (refill > 0 ? refill : 0))
  bucket.last = refill > 0 ? now : bucket.last
  if (bucket.tokens <= 0) {
    return res.status(429).json({ code: 'rate_limited', message: 'Too many requests, try later.' })
  }
  bucket.tokens -= 1
  buckets.set(key, bucket)
  next()
}

// Validation helper (replace with express-validator if preferred)
export function requireBodyFields<T extends string>(fields: T[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const missing = fields.filter(f => !(req.body && f in req.body))
    if (missing.length) {
      return res.status(400).json({ code: 'invalid_request', message: 'Missing fields', details: missing })
    }
    next()
  }
}

// Error handler: uniform JSON response
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = err?.status || 500
  res.status(status).json({
    code: err?.code || 'server_error',
    message: err?.message || 'Internal Server Error',
  })
}
```

### Usage Metrics (Tokens & Latency)

```ts
// After an OpenAI call, capture usage and latency for metrics.
type Metrics = {
  counts: Record<string, number>
  tokens: Record<string, { prompt: number; completion: number }>
  latency: Record<string, number[]>
}

const metrics: Metrics = { counts: {}, tokens: {}, latency: {} }

function recordCount(key: string) {
  metrics.counts[key] = (metrics.counts[key] || 0) + 1
}

function recordTokens(key: string, prompt: number, completion: number) {
  const prev = metrics.tokens[key] || { prompt: 0, completion: 0 }
  metrics.tokens[key] = { prompt: prev.prompt + prompt, completion: prev.completion + completion }
}

function recordLatency(key: string, ms: number) {
  const list = metrics.latency[key] || []
  list.push(ms)
  metrics.latency[key] = list
}

// Example in a route handler
async function handleChat(req: AnyReq, res: Response) {
  const start = Date.now()
  // ... perform OpenAI call via req.openaiApiKey
  const usage = { prompt_tokens: 120, completion_tokens: 230 } // replace with SDK response
  const latencyMs = Date.now() - start
  const key = `chat:${req.userId || 'anon'}`
  recordCount(key)
  recordTokens(key, usage.prompt_tokens, usage.completion_tokens)
  recordLatency(key, latencyMs)
  res.json({ ok: true })
}
```

I believe the exact usage fields depend on the OpenAI SDK version; please verify with the docs and use the returned `usage` object directly.

### Testing Checklist

- Auth: missing `x-api-key` returns `401 unauthorized`; valid header or env allows requests.
- Validation: missing required fields returns `400 invalid_request` with a `details` array.
- Rate limiting: after ~30 requests/min per route, the API returns `429 rate_limited`.
- Logging: every request includes `x-request-id`; logs show method, path, status, latency.
- Metrics: counters and tokens accumulate; check averages and p95 latency if you compute them.
- SSE routes: ensure middlewares apply and that streaming still sets `x-request-id`.

### Pitfalls & Tips

- In-memory limiter resets on server restart; prefer Redis/cluster-safe approaches in production.
- Don’t leak sensitive data in logs; scrub request bodies and headers where needed.
- Keep error messages user-friendly but non-revealing; avoid stack traces in responses.
- Apply CORS carefully; restrict allowed origins and methods outside of local dev.
- Capture the model name and token usage to monitor cost across endpoints.

---

## Reflection

**Observability is a feature**
- Correlation IDs and structured logs turn debugging from guesswork into a quick filter.
- Basic metrics (counts, tokens, latency) immediately surface regressions and cost spikes.

**Rate limiting trade-offs**
- Per-IP is simple but brittle behind NATs; per-user is better when auth is available.
- Token bucket offers smoothness; fixed windows are simpler but bursty.

**Validation and error contracts**
- Uniform error shapes reduce client conditionals and simplify retry logic.
- Validation should fail fast; do not touch upstream services with invalid inputs.

**Security posture**
- Prefer environment keys; never hardcode secrets.
- Log minimally in production; scrub inputs and hide stack traces from clients.

With these guardrails, the API becomes resilient and predictable, paving the way for Week 3’s context and memory features without creating hidden reliability debt.

