// Composable: SSE streaming for notes summarization
// Single responsibility: handle EventSource lifecycle for streaming notes.
import type { NoteResult } from '@/helpers/types'

export interface NotesStreamParams {
	baseURL: string
	path: string
	useMemory?: boolean
	sessionId?: string
	memorySize?: number
	summarizeOverflow?: boolean
	summaryMaxTokens?: number
	reset?: boolean
	contextBudgetTokens?: number | null
	contextJson?: string | null
}

export interface NotesStreamCallbacks {
	onOpen?: (file: string) => void
	onSummary?: (chunk: string) => void
	onResult?: (summary: string, tags?: string[], model?: string) => void
	onEvaluation?: (evaluation: any) => void
	onUsage?: (usage: any) => void
	onError?: (message: string) => void
	onEnd?: (result: NoteResult) => void
}

export function useNotesStream() {
	function summarizeFileStream(
		params: NotesStreamParams,
		cb: NotesStreamCallbacks = {}
	): Promise<NoteResult> {
		return new Promise<NoteResult>((resolve) => {
			const q = new URLSearchParams()
			q.set('path', params.path)

			if (params.useMemory != null) q.set('useMemory', String(params.useMemory))
			if (params.sessionId) q.set('sessionId', params.sessionId)
			if (params.memorySize != null) q.set('memorySize', String(params.memorySize))
			if (params.summarizeOverflow != null)
				q.set('summarizeOverflow', String(params.summarizeOverflow))
			if (params.summaryMaxTokens != null)
				q.set('summaryMaxTokens', String(params.summaryMaxTokens))
			if (params.reset) q.set('reset', 'true')
			if (params.contextBudgetTokens != null)
				q.set('contextBudgetTokens', String(params.contextBudgetTokens))
			if (params.contextJson) q.set('context', params.contextJson)

			const url = `${params.baseURL}/notes/summarize-stream?${q.toString()}`
			const es = new EventSource(url)

			const partial: any = { file: params.path, summary: '', tags: [] }
			let completed = false

			es.addEventListener('open', () => {
				cb.onOpen?.(partial.file)
			})

			es.addEventListener('summary', (ev: MessageEvent) => {
				try {
					const data = JSON.parse(ev.data)
					if (data?.chunk) {
						partial.summary += data.chunk
						cb.onSummary?.(data.chunk)
					}
				} catch {}
			})

			es.addEventListener('result', (ev: MessageEvent) => {
				try {
					const data = JSON.parse(ev.data)
					partial.summary = data?.summary || partial.summary
					partial.tags = Array.isArray(data?.tags) ? data.tags : partial.tags
					if (typeof data?.model === 'string') partial.model = data.model
					cb.onResult?.(partial.summary, partial.tags, partial.model)
				} catch {}
			})

			es.addEventListener('evaluation', (ev: MessageEvent) => {
				try {
					const data = JSON.parse(ev.data)
					partial.evaluation = data
					cb.onEvaluation?.(data)
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
				const result: NoteResult = {
					file: partial.file,
					summary: partial.summary,
					tags: partial.tags,
					usage: partial.usage,
					evaluation: partial.evaluation,
					model: partial.model,
				}
				cb.onEnd?.(result)
				es.close()
				resolve(result)
			})
		})
	}

	return { summarizeFileStream }
}
