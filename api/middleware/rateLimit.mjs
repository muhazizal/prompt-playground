import rateLimit from 'express-rate-limit'

/**
 * General per-IP rate limiter.
 * Defaults: 60 requests per 60 seconds.
 */
export function createRateLimitMiddleware({ windowMs = 60_000, max = 60 } = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  })
}

/**
 * Stricter limiter for streaming routes to prevent abuse.
 * Defaults: 30 streams per 5 minutes.
 */
export function createStreamRateLimit({ windowMs = 300_000, max = 30 } = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many streams, please try again later.' },
  })
}
