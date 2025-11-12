/**
 * Simple in-memory metrics counters.
 * Note: kept intentionally mutable for dev usage; not persisted.
 */
export const counters = {
  requests_total: 0,
  sse_starts_total: 0,
  openai_calls_total: 0,
  cache_hits_total: 0, // e.g., summary cache hits
  prompt_chat_requests_total: 0,
  prompt_vision_requests_total: 0,
  prompt_image_generation_requests_total: 0,
  prompt_speech_to_text_requests_total: 0,
  prompt_text_to_speech_requests_total: 0,
  agent_run_requests_total: 0,
}

/**
 * Increment a named counter if it exists.
 *
 * @param {keyof typeof counters} name - The counter key
 * @param {number} [delta=1] - Amount to increment by
 */
export function inc(name, delta = 1) {
  if (Object.prototype.hasOwnProperty.call(counters, name)) {
    counters[name] += delta
  }
}

/**
 * Middleware that increments `requests_total` for each request.
 *
 * @returns {(req: any, res: any, next: Function) => void}
 */
export function createRequestCounterMiddleware() {
  return function reqCounter(_req, _res, next) {
    counters.requests_total += 1
    next()
  }
}

/**
 * Register metrics and health endpoints on the provided app.
 *
 * @param {import('express').Express} app - Express application instance
 */
export function registerMetricsRoute(app) {
  app.get('/metrics', (_req, res) => {
    res.json({ counters })
  })

  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })
}
