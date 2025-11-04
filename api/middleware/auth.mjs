import { sendError } from '../utils/http.mjs'

// Require an API key for AI routes. Supports per-request via X-API-Key,
// otherwise falls back to process.env.OPENAI_API_KEY.
export function requireApiKey() {
	return function auth(req, res, next) {
		const headerKey = (req.headers['x-api-key'] || '').toString().trim()
		const envKey = (process.env.OPENAI_API_KEY || '').toString().trim()
		const apiKey = headerKey || envKey

		if (!apiKey) {
			return sendError(res, 401, 'UNAUTHORIZED', 'Missing API key', {
				hint: 'Provide X-API-Key header or set OPENAI_API_KEY env',
			})
		}

		// Attach selected key to request for downstream use
		req.aiApiKey = apiKey
		next()
	}
}
