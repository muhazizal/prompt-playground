import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../server.mjs'

let app

beforeAll(() => {
	process.env.NODE_ENV = 'test'
	process.env.OPENAI_API_KEY = 'test'
	app = createApp()
})

describe('Payload caps', () => {
	it('rejects long imageBase64', async () => {
		const big = 'a'.repeat(5000001)
		const res = await request(app)
			.post('/prompt/vision')
			.set('X-API-Key', 'test')
			.set('Content-Type', 'application/json')
			.send({ imageBase64: big })
		expect(res.status).toBe(400)
		expect(res.body.code).toBe('VALIDATION_ERROR')
	})

	it('rejects long audioBase64', async () => {
		const big = 'a'.repeat(10000001)
		const res = await request(app)
			.post('/prompt/speech-to-text')
			.set('X-API-Key', 'test')
			.set('Content-Type', 'application/json')
			.send({ audioBase64: big })
		expect(res.status).toBe(413)
	})
})
