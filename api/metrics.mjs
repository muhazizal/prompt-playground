// Simple in-memory metrics counters
export const counters = {
	requests_total: 0,
	sse_starts_total: 0,
	openai_calls_total: 0,
	cache_hits_total: 0, // e.g., summary cache hits
}

export function inc(name, delta = 1) {
	if (Object.prototype.hasOwnProperty.call(counters, name)) {
		counters[name] += delta
	}
}

// Middleware to count every request
export function createRequestCounterMiddleware() {
	return function reqCounter(_req, _res, next) {
		counters.requests_total += 1
		next()
	}
}

// Register /metrics endpoint
export function registerMetricsRoute(app) {
	app.get('/metrics', (_req, res) => {
		res.json({ counters })
	})

	app.get('/health', (_req, res) => {
		res.json({ ok: true })
	})
}
