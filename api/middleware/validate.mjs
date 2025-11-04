import { checkSchema, validationResult } from 'express-validator'

// Validate request body against a schema
export function validateBody(schema) {
  const validators = checkSchema(schema, ['body'])
  return [
    ...validators,
    (req, res, next) => {
      const result = validationResult(req)
      if (!result.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: result.array() })
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
        return res.status(400).json({ error: 'Validation failed', details: result.array() })
      }
      next()
    },
  ]
}

