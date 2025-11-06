import { checkSchema, validationResult } from 'express-validator'
import { sendError } from '../utils/http.mjs'

/** Format validation errors consistently (array of issues). */
function formatErrors(result) {
  return result.array()
}

/**
 * Create a validation middleware chain for a given location.
 * Location is one of: 'body', 'query', 'params'.
 */
function createValidator(schema, location) {
  const validators = checkSchema(schema, [location])
  return [
    ...validators,
    (req, res, next) => {
      const result = validationResult(req)
      if (!result.isEmpty()) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Validation failed', formatErrors(result))
      }
      next()
    },
  ]
}

/** Validate request body against a schema. */
export function validateBody(schema) {
  return createValidator(schema, 'body')
}

/** Validate request query against a schema. */
export function validateQuery(schema) {
  return createValidator(schema, 'query')
}
