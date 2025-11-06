import { sendError } from '../utils/http.mjs'

/**
 * Extract API key from request header or environment.
 * - Prefers `X-API-Key` header; falls back to `OPENAI_API_KEY` env.
 */
function getApiKey(req) {
	const headerKey = (req.headers['x-api-key'] || '').toString().trim()
	const envKey = (process.env.OPENAI_API_KEY || '').toString().trim()
	return headerKey || envKey
}

/**
 * Express middleware requiring an API key for AI routes.
 * Attaches the selected key as `req.aiApiKey` for downstream usage.
 */
export function requireApiKey() {
	return function auth(req, res, next) {
		const apiKey = getApiKey(req)

		if (!apiKey) {
			return sendError(res, 401, 'UNAUTHORIZED', 'Missing API key', {
				hint: 'Provide X-API-Key header or set OPENAI_API_KEY env',
			})
		}

		req.aiApiKey = apiKey
		next()
	}
}
