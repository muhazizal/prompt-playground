import pinoHttp from 'pino-http'

/** Create a request ID string from header or generated fallback. */
function createRequestId(req) {
  return (
    req.headers['x-request-id'] ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  )
}

const REDACTED_HEADERS = ['req.headers.authorization', 'req.headers.x-api-key']
const IGNORED_PATHS = ['/health', '/metrics']

/**
 * Create Pino HTTP middleware with request IDs and concise logs.
 * - Redacts sensitive headers
 * - Sets log levels based on response status and error presence
 */
export function createLoggingMiddleware() {
  return pinoHttp({
    // Generate a simple request ID if not provided
    genReqId: createRequestId,
    // Customize log format for readability
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url,
          ip: req.ip,
        }
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        }
      },
      err(err) {
        return { type: err.name, message: err.message, stack: err.stack }
      },
    },
    // Customize log level based on status code and error presence
    customLogLevel(res, err) {
      if (err || res.statusCode >= 500) return 'error'
      if (res.statusCode >= 400) return 'warn'
      return 'info'
    },
    // Redact sensitive headers
    redact: REDACTED_HEADERS,
    autoLogging: { ignorePaths: IGNORED_PATHS },
  })
}
