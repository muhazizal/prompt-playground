import rateLimit from 'express-rate-limit'

// General per-IP rate limiter
export function createRateLimitMiddleware({ windowMs = 60_000, max = 60 } = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  })
}

// Stricter limiter for streaming routes to prevent abuse
export function createStreamRateLimit({ windowMs = 300_000, max = 30 } = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many streams, please try again later.' },
  })
}

