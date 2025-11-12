import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePromptStream } from '../app/composables/usePromptStream'

class MockEventSource {
  url: string
  handlers: Record<string, Array<(event: { data: string }) => void>> = {}
  constructor(url: string) {
    this.url = url
    ;(globalThis as any).__es_last = this
  }
  addEventListener(evt: string, handler: (event: { data: string }) => void) {
    this.handlers[evt] = this.handlers[evt] || []
    this.handlers[evt].push(handler)
  }
  emit(evt: string, data: string) {
    const list = this.handlers[evt] || []
    for (const h of list) h({ data })
  }
  close() {}
}

beforeEach(() => {
  ;(globalThis as any).EventSource = MockEventSource
  ;(globalThis as any).__es_last = null
})

describe('usePromptStream', () => {
  it('streams summary, usage, result, end', async () => {
    const { streamOnce } = usePromptStream()

    const p = streamOnce(
      {
        baseURL: 'http://localhost:4000',
        prompt: 'Hello',
        model: 'gpt-4o-mini',
        temperature: 0.2,
        maxTokens: 64,
      },
      {
        onSummary: vi.fn(),
        onResult: vi.fn(),
        onUsage: vi.fn(),
      },
    )

    const inst = (globalThis as any).__es_last as MockEventSource
    inst.emit('open', '{}')
    inst.emit('summary', JSON.stringify({ chunk: 'A' }))
    inst.emit('summary', JSON.stringify({ chunk: 'B' }))
    inst.emit('usage', JSON.stringify({ prompt_tokens: 1, completion_tokens: 1 }))
    inst.emit('result', JSON.stringify({ text: 'AB' }))
    inst.emit('end', '{}')

    const run = await p
    expect(run.choices[0].text).toBe('AB')
    expect(run.temperature).toBe(0.2)
    expect(run.usage).toBeTruthy()
  })
})
