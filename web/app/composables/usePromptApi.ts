// Composable: API calls for prompt playground
// Single responsibility: provide typed functions for non-streaming endpoints.
import type { RunResult } from '@/helpers/types'

type ChatResponse = { runs: RunResult[]; model?: string; maxTokens?: number }
type VisionResponse = { text: string; usage?: any; durationMs?: number; model?: string }
type STTResponse = { text: string; durationMs?: number; model?: string }
type TTSResponse = {
	audioBase64?: string
	contentType?: string
	durationMs?: number
	model?: string
}
type ImageGenResponse = { imageBase64?: string; model?: string }

export function usePromptApi() {
	const config = useRuntimeConfig()
	const baseURL = config.public.apiBase

	async function chat(payload: {
		prompt: string
		model: string
		maxTokens: number
		temperatures: number[]
		n?: number
		context?: any
		useMemory?: boolean
		sessionId?: string
		reset?: boolean
		memorySize?: number
		summaryMaxTokens?: number
		contextBudgetTokens?: number | null
		headers?: Record<string, string>
	}): Promise<ChatResponse> {
		const res = await $fetch<ChatResponse>('/prompt/chat', {
			baseURL,
			method: 'POST',
			body: {
				prompt: payload.prompt,
				model: payload.model,
				maxTokens: payload.maxTokens,
				n: payload.n ?? 1,
				temperatures: payload.temperatures,
				...(payload.context ? { context: payload.context } : {}),
				useMemory: payload.useMemory,
				sessionId: payload.sessionId,
				reset: payload.reset,
				memorySize: payload.memorySize,
				summaryMaxTokens: payload.summaryMaxTokens,
				...(payload.contextBudgetTokens != null
					? { contextBudgetTokens: payload.contextBudgetTokens }
					: {}),
			},
			headers: payload.headers,
		})
		return res
	}

	async function vision(payload: {
		imageUrl?: string
		imageBase64?: string
		prompt?: string
		model: string
		maxTokens: number
	}): Promise<VisionResponse> {
		return $fetch<VisionResponse>('/prompt/vision', {
			baseURL,
			method: 'POST',
			body: payload,
		})
	}

	async function speechToText(payload: {
		audioBase64: string
		model: string
	}): Promise<STTResponse> {
		return $fetch<STTResponse>('/prompt/speech-to-text', {
			baseURL,
			method: 'POST',
			body: payload,
		})
	}

	async function textToSpeech(payload: {
		text: string
		model: string
		voice: string
		format?: 'mp3' | 'wav'
	}): Promise<TTSResponse> {
		return $fetch<TTSResponse>('/prompt/text-to-speech', {
			baseURL,
			method: 'POST',
			body: { ...payload, format: payload.format ?? 'mp3' },
		})
	}

	async function imageGeneration(payload: {
		prompt: string
		model: string
		size: string
		format?: 'png'
	}): Promise<ImageGenResponse> {
		return $fetch<ImageGenResponse>('/prompt/image-generation', {
			baseURL,
			method: 'POST',
			body: { ...payload, format: payload.format ?? 'png' },
		})
	}

	async function models(): Promise<{ models: Array<{ label: string; value: string }> }> {
		return $fetch<{ models: Array<{ label: string; value: string }> }>('/prompt/models', {
			baseURL,
		})
	}

	return { chat, vision, speechToText, textToSpeech, imageGeneration, models }
}
