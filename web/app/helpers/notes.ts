// Notes helpers: prices and cost estimation

export const PRICE_PER_MILLION: Record<string, { input: number; output: number }> = {
	'gpt-4o-mini': { input: 0.15, output: 0.6 },
}

export function estimateCost(usage: any, model?: string | null) {
	if (!usage || !model) return null
	const price = PRICE_PER_MILLION[model]
	if (!price) return null
	const promptTokens = Number(usage?.prompt_tokens ?? usage?.promptTokens ?? 0)
	const completionTokens = Number(usage?.completion_tokens ?? usage?.completionTokens ?? 0)
	const cost =
		(promptTokens / 1_000_000) * price.input + (completionTokens / 1_000_000) * price.output
	return Math.round(cost * 10000) / 10000
}
