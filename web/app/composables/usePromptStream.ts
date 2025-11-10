// Composable: SSE streaming for chat
// Single responsibility: handle EventSource lifecycle and produce RunResult.
import type { RunResult } from '@/helpers/types'

export interface StreamParams {
	baseURL: string
	prompt: string
	model: string
	temperature: number
	maxTokens: number
	useMemory?: boolean
	sessionId?: string
	memorySize?: number
	summaryMaxTokens?: number
	reset?: boolean
	contextBudgetTokens?: number | null
	contextJson?: string | null
	headers?: Record<string, string>
}

export interface StreamCallbacks {
	onOpen?: (temp: number) => void
	onSummary?: (chunk: string) => void
	onResult?: (text: string) => void
	onUsage?: (usage: any) => void
	onError?: (message: string) => void
}

export function usePromptStream() {
	function streamOnce(params: StreamParams, cb: StreamCallbacks = {}): Promise<RunResult> {
		return new Promise<RunResult>((resolve, reject) => {
			const q = new URLSearchParams()
			q.set('prompt', params.prompt)
			q.set('model', params.model)
			q.set('temperature', String(params.temperature))
			q.set('maxTokens', String(params.maxTokens))

			if (params.useMemory != null) q.set('useMemory', String(params.useMemory))
			if (params.sessionId) q.set('sessionId', params.sessionId)
			if (params.memorySize != null) q.set('memorySize', String(params.memorySize))
			if (params.summaryMaxTokens != null)
				q.set('summaryMaxTokens', String(params.summaryMaxTokens))
			if (params.reset) q.set('reset', 'true')
			if (params.contextBudgetTokens != null)
				q.set('contextBudgetTokens', String(params.contextBudgetTokens))
			if (params.contextJson) q.set('context', params.contextJson)

			const url = `${params.baseURL}/prompt/chat/stream?${q.toString()}`
			const es = new EventSource(url)

			let started = 0
			let buffer = ''
			let usage: any = null
			let completed = false

			es.addEventListener('open', () => {
				started = Date.now()
				cb.onOpen?.(params.temperature)
			})

			es.addEventListener('summary', (ev: MessageEvent) => {
				try {
					const data = JSON.parse(ev.data)
					if (typeof data?.chunk === 'string') {
						buffer += data.chunk
						cb.onSummary?.(data.chunk)
					}
				} catch {}
			})

			es.addEventListener('result', (ev: MessageEvent) => {
				try {
					const data = JSON.parse(ev.data)
					if (typeof data?.text === 'string') {
						buffer = data.text
						cb.onResult?.(buffer)
					}
				} catch {}
			})

			es.addEventListener('usage', (ev: MessageEvent) => {
				try {
					usage = JSON.parse(ev.data)
					cb.onUsage?.(usage)
				} catch {}
			})

			es.addEventListener('server_error', (ev: MessageEvent) => {
				try {
					const data = JSON.parse(ev.data)
					const msg = data?.error || 'Server error'
					cb.onError?.(msg)
					es.close()
					reject(new Error(msg))
				} catch {
					cb.onError?.('Server error')
					es.close()
					reject(new Error('Server error'))
				}
			})

			es.addEventListener('error', () => {
				if (completed) {
					es.close()
					return
				}
				const msg = 'Stream connection error'
				cb.onError?.(msg)
				es.close()
				reject(new Error(msg))
			})

			es.addEventListener('end', () => {
				completed = true
				const durationMs = started ? Date.now() - started : 0
				const run: RunResult = {
					temperature: params.temperature,
					choices: [{ index: 0, text: buffer }],
					usage,
					durationMs,
				}
				es.close()
				resolve(run)
			})
		})
	}

	return { streamOnce }
}
