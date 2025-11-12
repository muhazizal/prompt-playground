import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../server.mjs'

let app

beforeAll(() => {
  process.env.NODE_ENV = 'test'
  process.env.STRICT_CORS = 'true'
  process.env.WEB_ORIGIN = 'http://example.com'
  app = createApp()
})

describe('STRICT_CORS handling', () => {
  it('allows configured origin', async () => {
    const res = await request(app).get('/metrics').set('Origin', 'http://example.com')
    expect(res.status).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBe('http://example.com')
  })

  it('blocks non-configured origin (no CORS header)', async () => {
    const res = await request(app).get('/metrics').set('Origin', 'http://localhost:3000')
    expect(res.status).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})

