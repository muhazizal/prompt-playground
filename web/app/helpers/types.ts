export type RunResult = {
	temperature: number
	choices: Array<{ index: number; text: string }>
	usage: any
	durationMs: number
}

export type HistoryEntry = {
	prompt: string
	model: string
	temperatures: number[]
	maxTokens: number
	samples: number
	runs: RunResult[]
	at: number
}
