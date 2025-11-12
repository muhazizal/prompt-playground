import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePromptApi } from '../app/composables/usePromptApi'

beforeEach(() => {
  ;(globalThis as any).useRuntimeConfig = () => ({ public: { apiBase: 'http://localhost:4000' } })
})

describe('usePromptApi requests', () => {
  it('chat sends expected payload', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ runs: [] })
    ;(globalThis as any).$fetch = fetchSpy

    const api = usePromptApi()
    await api.chat({
      prompt: 'Hi',
      model: 'gpt-4o-mini',
      maxTokens: 128,
      temperatures: [0.2, 0.7],
      n: 1,
      context: { foo: 'bar' },
      useMemory: true,
      sessionId: 's1',
      reset: false,
      memorySize: 30,
      summaryMaxTokens: 200,
      contextBudgetTokens: 1000,
      headers: { 'X-API-Key': 'k' },
    })

    expect(fetchSpy).toHaveBeenCalledWith('/prompt/chat', expect.objectContaining({
      baseURL: 'http://localhost:4000',
      method: 'POST',
      headers: { 'X-API-Key': 'k' },
    }))
    const args = fetchSpy.mock.calls[0][1]
    expect(args.body.prompt).toBe('Hi')
    expect(args.body.temperatures).toEqual([0.2, 0.7])
    expect(args.body.contextBudgetTokens).toBe(1000)
  })

  it('imageGeneration sends prompt and size defaults', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({})
    ;(globalThis as any).$fetch = fetchSpy
    const api = usePromptApi()
    await api.imageGeneration({ prompt: 'A cat', model: 'gpt-image-1', size: '512x512' })
    const args = fetchSpy.mock.calls[0][1]
    expect(args.method).toBe('POST')
    expect(args.body.prompt).toBe('A cat')
    expect(args.body.format).toBe('png')
  })

  it('speechToText posts audioBase64', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ text: 'hi' })
    ;(globalThis as any).$fetch = fetchSpy
    const api = usePromptApi()
    await api.speechToText({ audioBase64: 'AAA', model: 'whisper-1' })
    const args = fetchSpy.mock.calls[0][1]
    expect(args.method).toBe('POST')
    expect(args.body.audioBase64).toBe('AAA')
  })
})

