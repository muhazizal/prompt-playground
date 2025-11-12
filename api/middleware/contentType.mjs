export function requireJson() {
	return function (req, res, next) {
		const ct = String(req.headers['content-type'] || '')
		if (req.method === 'POST' && !ct.startsWith('application/json')) {
			return res
				.status(415)
				.json({ error: 'Unsupported Media Type', code: 'UNSUPPORTED_MEDIA_TYPE' })
		}
		next()
	}
}
