import pinoHttp from 'pino-http'

// Create Pino HTTP middleware with request IDs and concise logs
export function createLoggingMiddleware() {
  return pinoHttp({
    // Generate a simple request ID if not provided
    genReqId(req) {
      return req.headers['x-request-id'] || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    },
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
    customLogLevel(res, err) {
      if (err || res.statusCode >= 500) return 'error'
      if (res.statusCode >= 400) return 'warn'
      return 'info'
    },
    autoLogging: { ignorePaths: ['/health', '/metrics'] },
  })
}

