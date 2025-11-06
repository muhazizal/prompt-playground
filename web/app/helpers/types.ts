// RunResult is the result of a single run of a prompt with a specific temperature.
export type RunResult = {
	temperature: number
	choices: Array<{ index: number; text: string }>
	usage: any
	durationMs: number
}

// HistoryEntry is an entry in the history of a prompt run.
export type HistoryEntry = {
	id?: string
	prompt: string
	model: string
	temperatures: number[]
	maxTokens: number
	samples: number
	runs: RunResult[]
	at: number
}

// Evaluation is the result of evaluating a note.
export type Evaluation = {
	coverage: number
	concision: number
	formatting?: number
	factuality?: number
	feedback?: string
}

// NoteResult is the result of processing a note.
export type NoteResult = {
	file: string
	summary: string
	tags: string[]
	usage?: any
	evaluation?: Evaluation
	model?: string
}

// VisionHistory stores results of an image-vision task
export type VisionHistory = {
	id?: string
	prompt?: string
	imageUrl?: string
	imageBase64?: string
	text: string
	model: string
	usage?: any
	durationMs?: number
	at: number
}

// TranscriptionHistory stores results of a speech-to-text task
export type TranscriptionHistory = {
	id?: string
	text: string
	model: string
	durationMs?: number
	at: number
}

// TTSHistory stores results of a text-to-speech task
export type TTSHistory = {
	id?: string
	text: string
	voice?: string
	model: string
	audioBase64?: string
	contentType?: string
	durationMs?: number
	at: number
}

// TaskOption is an option for a task.
export type TaskOption = {
	label: string
	task:
		| 'text-generation'
		| 'image-generation'
		| 'image-vision'
		| 'speech-to-text'
		| 'text-to-speech'
	model: string
}

// ImageGenHistory stores results of an image generation task (metadata only)
export type ImageGenHistory = {
	id?: string
	prompt: string
	model: string
	size?: string
	// Avoid storing large binary in Firestore; preview kept client-side only
	at: number
}

// AgentRunRequest is the payload for running the mini agent via API.
export type AgentRunRequest = {
	prompt: string
	sessionId?: string
	useMemory?: boolean
	model?: string
	temperature?: number
	maxTokens?: number
	chain?: 'debug' | null
}

// AgentSource represents a source used to produce the answer.
export type AgentSource = {
	type: 'weather' | 'doc' | 'memory'
	title?: string
	url?: string
	file?: string
	snippet?: string
	score?: number
	meta?: any
}

// AgentUsage captures token usage returned by the API.
export type AgentUsage = {
	promptTokens?: number
	completionTokens?: number
	totalTokens?: number
	prompt_tokens?: number
	completion_tokens?: number
	total_tokens?: number
}

// AgentStep tracks an internal step executed by the agent.
export type AgentStep = {
	name: string
	type?: string
	startedAt?: number
	finishedAt?: number
	durationMs?: number
	meta?: any
}

// AgentRunResult is the structured response from the agent API.
export type AgentRunResult = {
	intent?: string
	answer: string
	sources?: AgentSource[]
	usage?: AgentUsage
	costUsd?: number
	durationMs?: number
	steps?: AgentStep[]
	debug?: any
}
