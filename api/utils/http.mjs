// Consistent error responses across the API
export function sendError(res, status = 400, code = 'ERROR', error = 'Error', details) {
	const payload = { error, code }
	if (details !== undefined) payload.details = details
	return res.status(status).json(payload)
}
