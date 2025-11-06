// Composable: SSE streaming for mini agent
// Handles EventSource lifecycle and updates partial AgentRunResult.
import type { AgentRunRequest, AgentRunResult } from '@/helpers/types'

export interface AgentStreamParams extends Omit<AgentRunRequest, 'chain'> {
	baseURL: string
	chain?: 'debug' | null
}

export interface AgentStreamCallbacks {
	onOpen?: () => void
	onStep?: (name: string) => void
	onSummary?: (chunk: string) => void
	onResult?: (result: AgentRunResult) => void
	onUsage?: (usage: any) => void
	onError?: (message: string) => void
	onEnd?: (result: AgentRunResult) => void
}

export function useAgentStream() {
	function runAgentStream(params: AgentStreamParams, cb: AgentStreamCallbacks = {}) {
		return new Promise<AgentRunResult>((resolve) => {
			const q = new URLSearchParams()
			q.set('prompt', params.prompt)

			if (params.sessionId) q.set('sessionId', params.sessionId)
			if (params.useMemory != null) q.set('useMemory', String(params.useMemory))
			if (params.model) q.set('model', params.model)
			if (params.temperature != null) q.set('temperature', String(params.temperature))
			if (params.maxTokens != null) q.set('maxTokens', String(params.maxTokens))
			if (params.chain) q.set('chain', params.chain)

			const url = `${params.baseURL}/agent/run/stream?${q.toString()}`
			const es = new EventSource(url)

			const partial: AgentRunResult = { answer: '', sources: [], usage: undefined }
			let completed = false

			es.addEventListener('open', () => cb.onOpen?.())

			es.addEventListener('step', (ev: MessageEvent) => {
				try {
					const data = JSON.parse(ev.data)
					if (typeof data?.name === 'string') {
						partial.steps = Array.isArray(partial.steps) ? partial.steps : []
						partial.steps.push({ name: data.name })
						cb.onStep?.(data.name)
					}
				} catch {}
			})

			es.addEventListener('summary', (ev: MessageEvent) => {
				try {
					const data = JSON.parse(ev.data)
					if (typeof data?.chunk === 'string') {
						partial.answer += data.chunk
						cb.onSummary?.(data.chunk)
					}
				} catch {}
			})

			es.addEventListener('result', (ev: MessageEvent) => {
				try {
					const data = JSON.parse(ev.data)
					// Server sends normalized AgentRunResult
					Object.assign(partial, data)
					cb.onResult?.(partial)
				} catch {}
			})

			es.addEventListener('usage', (ev: MessageEvent) => {
				try {
					const data = JSON.parse(ev.data)
					partial.usage = data
					cb.onUsage?.(data)
				} catch {}
			})

			es.addEventListener('server_error', (ev: MessageEvent) => {
				try {
					const data = JSON.parse(ev.data)
					cb.onError?.(data?.error || 'Server error')
				} catch {
					cb.onError?.('Server error')
				}
				es.close()
			})

			es.addEventListener('error', () => {
				if (completed) {
					es.close()
					return
				}
				cb.onError?.('Stream connection error')
				es.close()
			})

			es.addEventListener('end', () => {
				completed = true
				cb.onEnd?.(partial)
				es.close()
				resolve(partial)
			})
		})
	}

	return { runAgentStream }
}
