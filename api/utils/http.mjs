// Consistent error responses across the API
export function sendError(res, status = 400, code = 'ERROR', error = 'Error', details) {
	const payload = { error, code }
	if (details !== undefined) payload.details = details
	return res.status(status).json(payload)
}

/**
 * Convert a value to boolean, accepting string "true" and boolean true.
 * Returns false for any other value, including undefined.
 * @param {unknown} v
 * @returns {boolean}
 */
export function toBool(v) {
	return String(v || '') === 'true' || v === true
}

/**
 * Convert a value to number, using a provided fallback when undefined.
 * Caller should ensure the fallback is a sensible default.
 * @param {unknown} v
 * @param {number} fallback
 * @returns {number}
 */
export function toNum(v, fallback) {
	return v !== undefined ? Number(v) : fallback
}

/**
 * Safely parse a JSON-like input that may be a string or object.
 * Returns null on parse errors to keep behavior predictable.
 * @param {unknown} input
 * @returns {object|null}
 */
export function safeParseJson(input) {
	if (typeof input === 'string') {
		try {
			return JSON.parse(input)
		} catch {
			return null
		}
	}
	return typeof input === 'object' ? input : null
}
