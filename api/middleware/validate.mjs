import { checkSchema, validationResult } from 'express-validator'
import { sendError } from '../utils/http.mjs'

// Validate request body against a schema
export function validateBody(schema) {
	const validators = checkSchema(schema, ['body'])
	return [
		...validators,
		(req, res, next) => {
			const result = validationResult(req)
			if (!result.isEmpty()) {
				return sendError(res, 400, 'VALIDATION_ERROR', 'Validation failed', result.array())
			}
			next()
		},
	]
}

// Validate request query against a schema
export function validateQuery(schema) {
	const validators = checkSchema(schema, ['query'])
	return [
		...validators,
		(req, res, next) => {
			const result = validationResult(req)
			if (!result.isEmpty()) {
				return sendError(res, 400, 'VALIDATION_ERROR', 'Validation failed', result.array())
			}
			next()
		},
	]
}
