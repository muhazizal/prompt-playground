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
  it('spec includes components schemas', async () => {
    const res = await request(app).get('/openapi')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('components')
    expect(res.body.components.schemas).toHaveProperty('ChatRequest')
    expect(res.body.components.schemas).toHaveProperty('ChatResponse')
    expect(res.body.components.schemas).toHaveProperty('AgentRunRequest')
    expect(res.body.components.schemas).toHaveProperty('AgentRunResult')
  })
  it('spec includes security scheme and requestBody refs', async () => {
    const res = await request(app).get('/openapi')
    expect(res.status).toBe(200)
    expect(res.body.components.securitySchemes).toHaveProperty('apiKeyHeader')
    expect(res.body.paths['/prompt/chat'].post).toHaveProperty('requestBody')
    expect(res.body.paths['/agent/run'].post).toHaveProperty('requestBody')
  })
})
