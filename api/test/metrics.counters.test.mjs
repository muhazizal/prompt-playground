import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../server.mjs'

let app

beforeAll(() => {
	process.env.NODE_ENV = 'test'
	process.env.OPENAI_API_KEY = 'test'
	app = createApp()
})

describe('Metrics counters', () => {
	it('increments chat request counter', async () => {
		await request(app)
			.post('/prompt/chat')
			.set('X-API-Key', 'test')
			.set('Content-Type', 'application/json')
			.send({ prompt: 'Hello', model: 'gpt-4o-mini', maxTokens: 128, temperatures: [0.3] })

		const res = await request(app).get('/metrics')
		expect(res.status).toBe(200)
		const c = res.body.counters
		expect(c.prompt_chat_requests_total).toBeGreaterThan(0)
	})
})
