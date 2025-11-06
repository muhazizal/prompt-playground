import {
	getClient as getOpenAIClient,
	getModelContextWindow,
	summarizeMessages,
} from './prompt-core.mjs'
import {
	appendMessage,
	getRecentMessages,
	trimMessagesToTokenBudget,
	serializeContextToSystem,
} from './memory.mjs'
import { semanticSearchNotes } from './notes-core.mjs'

/**
 * Weather tool using WeatherAPI.com
 * Docs: https://www.weatherapi.com/docs/
 */
async function weatherTool(query) {
	const key = process.env.WEATHER_API_KEY
	if (!key) {
		return { ok: false, summary: 'WeatherAPI key missing', source: null, data: null }
	}
	try {
		const url = `http://api.weatherapi.com/v1/current.json?key=${encodeURIComponent(
			key
		)}&q=${encodeURIComponent(query || 'auto:ip')}`
		const res = await fetch(url)
		if (!res.ok) {
			const text = await res.text()
			return { ok: false, summary: `Weather fetch error: ${res.status}`, source: url, data: text }
		}
		const data = await res.json()
		const loc = data?.location?.name || query
		const cur = data?.current || {}
		const summary = `Weather for ${loc}: ${cur?.condition?.text || 'n/a'}, temp ${
			cur?.temp_c ?? '?'
		}°C, feels ${cur?.feelslike_c ?? '?'}°C, humidity ${cur?.humidity ?? '?'}%, wind ${
			cur?.wind_kph ?? '?'
		} kph.`
		return { ok: true, summary, source: url, data }
	} catch (err) {
		return {
			ok: false,
			summary: `Weather error: ${err?.message || String(err)}`,
			source: null,
			data: null,
		}
	}
}

/**
 * Docs tool using embeddings-based semantic search over local notes.
 */
async function docsTool(client, query, { topK = 3 } = {}) {
	try {
		const results = await semanticSearchNotes(client, query || 'project overview', { topK })
		const summary = results
			.map((r, i) => `${i + 1}. ${r.file} (score ${r.score.toFixed(3)}): ${r.snippet}`)
			.join('\n')
		const sources = results.map((r) => r.file)
		return { ok: true, summary, sources, results }
	} catch (err) {
		return {
			ok: false,
			summary: `Docs search error: ${err?.message || String(err)}`,
			sources: [],
			results: [],
		}
	}
}

/**
 * Build system instructions for the mini agent.
 */
function buildSystemInstructions() {
	return `You are a concise AI agent. Return STRICT JSON only.
Schema: {"intent": string, "answer": string, "sources": string[]}
- intent: one of ["chat", "answer", "tool-summary"]
- answer: final short answer for user
- sources: filenames or urls you relied on
No markdown, no prose outside JSON.`
}

/**
 * Estimate cost (USD) given usage tokens and model.
 */
function estimateCostUSD(usage, model = 'gpt-4o-mini') {
	if (!usage) return null
	const PRICES = {
		'gpt-4o-mini': { inputPerM: 0.15, outputPerM: 0.6 },
	}
	const p = PRICES[model] || PRICES['gpt-4o-mini']
	const pi = (usage.prompt_tokens || 0) / 1_000_000
	const po = (usage.completion_tokens || 0) / 1_000_000
	return Number((pi * p.inputPerM + po * p.outputPerM).toFixed(6))
}

/**
 * Validate and normalize the result shape.
 */
function validateResultShape(obj) {
	const errors = []
	const out = { intent: 'chat', answer: '', sources: [] }
	try {
		const parsed = typeof obj === 'string' ? JSON.parse(obj) : obj
		if (parsed && typeof parsed.intent === 'string') out.intent = parsed.intent
		else errors.push('intent missing')
		if (parsed && typeof parsed.answer === 'string') out.answer = parsed.answer
		else errors.push('answer missing')
		if (parsed && Array.isArray(parsed.sources)) out.sources = parsed.sources
		else errors.push('sources missing')
	} catch (e) {
		errors.push('json parse failed')
	}
	return { normalized: out, errors }
}

/**
 * Run the mini agent with chat + tools + memory.
 * opts: { prompt, sessionId, useMemory, model, temperature, maxTokens, weatherQuery, docsQuery }
 * ctx: { client, debug }
 */
export async function runAgent(
	{
		prompt,
		sessionId = 'default',
		useMemory = true,
		model = 'gpt-4o-mini',
		temperature = 0.2,
		maxTokens = 400,
		weatherQuery,
		docsQuery,
	} = {},
	{ client: clientOverride, debug = false } = {}
) {
	if (!prompt || typeof prompt !== 'string') throw new Error('Missing prompt')
	const client = clientOverride || getOpenAIClient(process.env.OPENAI_API_KEY)

	// Tools
	const steps = ['init']
	const toolsContext = {}
	if (weatherQuery) toolsContext.weather = await weatherTool(weatherQuery)
	toolsContext.docs = await docsTool(client, docsQuery || prompt, { topK: 3 })
	steps.push('tools:done')

	// Memory
	const recent = useMemory ? await getRecentMessages(sessionId, { limit: 20 }) : []
	const memorySummary = recent.length > 0 ? await summarizeMessages(client, recent) : ''
	steps.push(`memory:msgs=${recent.length}`)

	// Build messages
	const sys = { role: 'system', content: buildSystemInstructions() }
	const ctx = serializeContextToSystem({ memorySummary, tools: toolsContext })
	const base = [...(useMemory ? recent : []), sys, ctx, { role: 'user', content: prompt }]

	// Trim to budget
	const budget = Math.floor(getModelContextWindow(model) * 0.8)
	const messages = trimMessagesToTokenBudget(base, budget)

	const started = Date.now()
	const completion = await client.chat.completions.create({
		model,
		temperature,
		max_tokens: maxTokens,
		messages,
	})
	const durationMs = Date.now() - started
	const text = completion?.choices?.[0]?.message?.content || ''
	const { normalized, errors } = validateResultShape(text)
	steps.push(`llm:end:${durationMs}ms`)

	// Persist memory
	await appendMessage(sessionId, { role: 'user', content: prompt })
	await appendMessage(sessionId, { role: 'assistant', content: text })

	const result = {
		...normalized,
		model,
		temperature,
		maxTokens,
		usage: completion?.usage || null,
		durationMs,
		sources: Array.from(
			new Set([...(normalized.sources || []), ...(toolsContext?.docs?.sources || [])])
		),
		costUsd: estimateCostUSD(completion?.usage || null, model),
		steps,
	}
	if (debug) {
		result.debug = { messages, toolsContext, validationErrors: errors }
	}
	return result
}
