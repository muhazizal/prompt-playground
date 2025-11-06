// Composable: Notes API calls (list, tags, process)
// Single responsibility: encapsulate HTTP requests for notes feature.
import type { NoteResult } from '@/helpers/types'

export function useNotesApi() {
	const config = useRuntimeConfig()
	const baseURL = config.public.apiBase

	async function listNotes(): Promise<{ files: Array<{ name: string }> }> {
		return $fetch('/notes/list', { baseURL }) as Promise<{ files: Array<{ name: string }> }>
	}

	async function getTags(): Promise<{ tags: string[] }> {
		return $fetch('/notes/tags', { baseURL }) as Promise<{ tags: string[] }>
	}

	async function saveTags(tags: string[]): Promise<{ ok: true }> {
		return $fetch('/notes/tags', {
			baseURL,
			method: 'POST',
			body: { tags },
		}) as Promise<{ ok: true }>
	}

	async function processNotes(payload: {
		paths: string[]
		useMemory?: boolean
		sessionId?: string
		reset?: boolean
		memorySize?: number
		summarizeOverflow?: boolean
		summaryMaxTokens?: number
		context?: any
		contextBudgetTokens?: number | null
		headers?: Record<string, string>
	}): Promise<{ results: NoteResult[] }> {
		return $fetch('/notes/process', {
			baseURL,
			method: 'POST',
			body: {
				paths: payload.paths,
				useMemory: payload.useMemory,
				sessionId: payload.sessionId,
				reset: payload.reset,
				memorySize: payload.memorySize,
				summarizeOverflow: payload.summarizeOverflow,
				summaryMaxTokens: payload.summaryMaxTokens,
				...(payload.context ? { context: payload.context } : {}),
				...(payload.contextBudgetTokens != null
					? { contextBudgetTokens: payload.contextBudgetTokens }
					: {}),
			},
			headers: payload.headers,
		}) as Promise<{ results: NoteResult[] }>
	}

	return { listNotes, getTags, saveTags, processNotes }
}
