import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../server.mjs'

let app

beforeAll(() => {
  process.env.NODE_ENV = 'test'
  app = createApp()
})

describe('OpenAPI route', () => {
  it('GET /openapi returns spec with paths', async () => {
    const res = await request(app).get('/openapi')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('paths')
    expect(res.body.paths).toHaveProperty('/prompt/chat')
    expect(res.body.paths).toHaveProperty('/agent/run')
  })
})

