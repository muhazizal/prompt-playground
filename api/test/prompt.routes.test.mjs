import { describe, it, expect, beforeAll, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../server.mjs'

vi.mock('openai', () => {
  class OpenAIMock {
    constructor() {}
    chat = {
      completions: {
        create: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  intent: 'answer',
                  runs: [
                    { temperature: 0.3, choices: [{ text: 'Hello' }] },
                  ],
                  sources: [],
                  answer: 'Hello',
                }),
              },
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      },
    }
  }
  return { default: OpenAIMock }
})

let app

beforeAll(() => {
  process.env.NODE_ENV = 'test'
  process.env.OPENAI_API_KEY = 'test'
  app = createApp()
})

describe('API routes', () => {
  it('GET /metrics returns counters', async () => {
    const res = await request(app).get('/metrics')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('counters')
  })

  it('GET /prompt/models requires api key and returns list', async () => {
    const res = await request(app)
      .get('/prompt/models')
      .set('X-API-Key', 'test')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('models')
    expect(Array.isArray(res.body.models)).toBe(true)
  })

  it('POST /prompt/chat returns structured runs', async () => {
    const res = await request(app)
      .post('/prompt/chat')
      .set('Content-Type', 'application/json')
      .set('X-API-Key', 'test')
      .send({ prompt: 'Say hello', model: 'gpt-4o-mini', maxTokens: 128, temperatures: [0.3], n: 1 })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('runs')
    expect(Array.isArray(res.body.runs)).toBe(true)
    expect(res.body.runs[0].choices[0].text).toBeTypeOf('string')
  })
})

