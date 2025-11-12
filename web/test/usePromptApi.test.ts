import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePromptApi } from '../app/composables/usePromptApi'

beforeEach(() => {
	;(globalThis as any).useRuntimeConfig = () => ({ public: { apiBase: 'http://localhost:4000' } })
})

describe('usePromptApi', () => {
	it('calls models endpoint with baseURL', async () => {
		const fetchSpy = vi.fn().mockResolvedValue({ models: [] })
		;(globalThis as any).$fetch = fetchSpy

		const api = usePromptApi()
		const res = await api.models()

		expect(res).toHaveProperty('models')
		expect(fetchSpy).toHaveBeenCalledWith('/prompt/models', { baseURL: 'http://localhost:4000' })
	})
})
