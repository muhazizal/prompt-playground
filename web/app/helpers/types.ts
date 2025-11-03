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
export type Evaluation = { coverage: number; concision: number; feedback?: string }

// NoteResult is the result of processing a note.
export type NoteResult = {
	file: string
	summary: string
	tags: string[]
	usage?: any
	evaluation?: Evaluation
}
