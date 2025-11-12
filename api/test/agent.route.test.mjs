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
                content: JSON.stringify({ intent: 'answer', answer: 'Hello', sources: [] }),
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

describe('Agent route', () => {
  it('POST /agent/run returns normalized result', async () => {
    const res = await request(app)
      .post('/agent/run')
      .set('Content-Type', 'application/json')
      .set('X-API-Key', 'test')
      .send({ prompt: 'Plan a todo list', sessionId: 'agent-test', useMemory: true })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('answer')
    expect(res.body).toHaveProperty('sources')
    expect(res.body).toHaveProperty('usage')
  })

  it('respects DISABLE_ENV_API_KEY and requires header', async () => {
    process.env.DISABLE_ENV_API_KEY = 'true'
    const res = await request(app).post('/agent/run').send({ prompt: 'Hi' })
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('UNAUTHORIZED')
  })
})
