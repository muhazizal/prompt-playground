import { getClient as getNotesClient } from './notes-core.mjs'

// Default fallback models if listing fails
export const DEFAULT_CHAT_MODELS = [
	{ label: 'gpt-4o-mini', value: 'gpt-4o-mini' },
	{ label: 'gpt-4o', value: 'gpt-4o' },
]

/**
 * Create an OpenAI client from API key.
 * Reuses notes-core helper for consistency.
 */
export function getClient(apiKey) {
	return getNotesClient(apiKey)
}

/**
 * Run chat completion for one or multiple temperatures.
 * Returns array of runs with choices, usage, and duration.
 */
export async function chatWithTemperatures(
	client,
	{ prompt, model = 'gpt-4o-mini', temperature = 0.3, maxTokens = 200, n = 1, temperatures } = {}
) {
	if (!prompt || typeof prompt !== 'string') {
		throw new Error('Invalid prompt')
	}

	// Validate and normalize temperatures
	const tempsToRun =
		Array.isArray(temperatures) && temperatures.length > 0
			? temperatures.map(Number).filter((t) => !Number.isNaN(t))
			: [Number(temperature)]

	// Run completions for each temperature
	const runs = []
	for (const t of tempsToRun) {
		const started = Date.now()
		const completion = await client.chat.completions.create({
			model,
			temperature: t,
			n: Math.max(1, Number(n) || 1),
			max_tokens: maxTokens,
			messages: [
				{ role: 'system', content: 'You are a helpful assistant.' },
				{ role: 'user', content: prompt },
			],
		})
		const durationMs = Date.now() - started
		const choices = (completion.choices || []).map((c, idx) => ({
			index: idx,
			text: c?.message?.content ?? '',
		}))
		runs.push({ temperature: t, choices, usage: completion.usage || null, durationMs })
	}

	return { prompt, model, maxTokens, runs }
}

/**
 * List available chat-capable models. Falls back to defaults on error.
 */
export async function listModels(client) {
	try {
		const list = await client.models.list()
		const models = (list?.data || [])
			.map((m) => m?.id)
			.filter(Boolean)
			.filter((id) => /gpt|o|mini|turbo/i.test(id))
			.slice(0, 20)
			.map((id) => ({ label: id, value: id }))
		return models.length > 0 ? models : DEFAULT_CHAT_MODELS
	} catch {
		return DEFAULT_CHAT_MODELS
	}
}
