import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../server.mjs'

let app

beforeAll(() => {
	process.env.NODE_ENV = 'test'
	process.env.OPENAI_API_KEY = 'envkey'
	app = createApp()
})

describe('Security middleware', () => {
	it('rejects POST without application/json', async () => {
		const res = await request(app).post('/prompt/chat').set('X-API-Key', 'test').send('plain')
		expect(res.status).toBe(415)
		expect(res.body.code).toBe('UNSUPPORTED_MEDIA_TYPE')
	})

	it('auth uses header when env disabled', async () => {
		process.env.DISABLE_ENV_API_KEY = 'true'
		const res = await request(app).get('/prompt/models')
		expect(res.status).toBe(401)
		expect(res.body.code).toBe('UNAUTHORIZED')
	})
})
