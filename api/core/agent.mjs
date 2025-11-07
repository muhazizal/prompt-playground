import {
	getClient as getOpenAIClient,
	getModelContextWindow,
	summarizeMessages,
} from './prompt.mjs'
import {
	appendMessage,
	getRecentMessages,
	trimMessagesToTokenBudget,
	serializeContextToSystem,
} from './memory.mjs'
import { normalizeUsage, estimateCostUSD } from '../utils/usage.mjs'
import { validateResultShape } from '../utils/llm.mjs'
import { planTools, classifyIntent } from '../utils/planner.mjs'

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
		// Skip weather when no explicit query provided
		if (!query || !String(query).trim()) {
			return { ok: false, summary: 'Weather query missing', source: null, data: null }
		}

		// Get current weather for location
		const url = `http://api.weatherapi.com/v1/current.json?key=${encodeURIComponent(
			key
		)}&q=${encodeURIComponent(query)}`
		const res = await fetch(url)

		// Check for successful response
		if (!res.ok) {
			const text = await res.text()
			return { ok: false, summary: `Weather fetch error: ${res.status}`, source: url, data: text }
		}

		// Parse JSON response
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
 * Build system instructions for the mini agent.
 */
function buildSystemInstructions() {
	return `You are a concise AI agent. Return STRICT JSON only.
Schema: {"intent": string, "answer": string, "sources": string[]}
- intent: one of ["chat", "answer", "tool-summary"]
- answer: final short answer for user
- sources: filenames or urls you relied on
Rules:
- Prioritize answering the user's prompt directly.
- Use tool outputs only if relevant to the prompt.
- If no tools are used, return sources: [].
No markdown, no prose outside JSON.`
}

/**
 * Extract a plausible weather location from prompt.
 * Looks for patterns like "weather in <location>" or "forecast for <location>".
 */
function extractWeatherLocation(prompt) {
	// Normalize whitespace and remove leading/trailing connectors
	const text = String(prompt || '')
	const clean = (s) =>
		String(s || '')
			.replace(/\s+/g, ' ')
			.trim()

	// Capture location allowing trailing connectors; we will trim later
	let m = text.match(/\b(?:weather|forecast)\s+(?:in|for|at)\s+([A-Za-z][A-Za-z\s\-']{1,})/i)
	let loc = m && m[1] ? m[1] : null

	// First try: "weather in <location>" or "forecast for <location>"
	if (!loc) {
		m = text.match(/\b(?:in|for|at)\s+([A-Za-z][A-Za-z\s\-']{1,})/i)
		loc = m && m[1] ? m[1] : null
	}

	// Return null if no location found
	if (!loc) return null

	// Trim at connectors or punctuation (handles "and ...")
	loc = loc.split(/[,.;!?]|\band\b|\bthen\b|\bbut\b|\bplease\b/i)[0]

	return clean(loc)
}

/**
 * Plan and execute the weather tool based on prompt/classification.
 * Returns { weather, steps } where weather may be null.
 */
async function planWeatherTool(prompt, classification) {
	const steps = []
	const locFromCls =
		typeof classification?.args?.location === 'string' ? classification.args.location : null
	const loc = locFromCls || extractWeatherLocation(prompt)
	if (loc) {
		const weather = await weatherTool(loc)
		steps.push(`tool:weather:${loc}`)
		return { weather, steps }
	}
	steps.push('tool:weather:skipped:no_location')
	return { weather: null, steps }
}

/**
 * Build trimmed messages including memory and tool context.
 * Returns { messages, memorySummary, step }.
 */
async function buildMessages({ client, prompt, useMemory, sessionId, model, toolsContext }) {
	const recent = useMemory ? await getRecentMessages(sessionId, { limit: 20 }) : []
	const memorySummary = recent.length > 0 ? await summarizeMessages(client, recent) : ''
	const sys = { role: 'system', content: buildSystemInstructions() }
	const ctx = serializeContextToSystem({ memorySummary, tools: toolsContext })
	const base = [...(useMemory ? recent : []), sys, ctx, { role: 'user', content: prompt }]
	const budget = Math.floor(getModelContextWindow(model) * 0.8)
	const messages = trimMessagesToTokenBudget(base, budget)
	return { messages, memorySummary, step: `memory:msgs=${recent.length}` }
}

/**
 * Ensure an answer exists by falling back to tool summaries when needed.
 */
function finalizeAnswer(normalized, toolsContext) {
	if (!normalized.answer || !normalized.answer.trim()) {
		const fallback = (toolsContext?.weather?.summary && String(toolsContext.weather.summary)) || ''
		if (fallback) normalized.answer = fallback.slice(0, 500)
	}
	return normalized
}

/**
 * Assemble structured sources from tools, normalized JSON, and memory.
 */
function assembleSources({ normalized, toolsContext, memorySummary, useMemory }) {
	const weatherSrc = toolsContext?.weather?.ok
		? [
				{
					type: 'weather',
					title: toolsContext.weather?.data?.location?.name || null,
					url: toolsContext.weather?.source || null,
					snippet: toolsContext.weather?.summary,
					meta: {
						temp_c: toolsContext.weather?.data?.current?.temp_c,
						condition: toolsContext.weather?.data?.current?.condition?.text,
					},
				},
		  ]
		: []
	const normalizedStrings = Array.isArray(normalized.sources)
		? normalized.sources.map((s) => (typeof s === 'string' ? { type: 'doc', file: s } : s))
		: []
	const memorySrc = useMemory && memorySummary ? [{ type: 'memory', snippet: memorySummary }] : []
	return [...weatherSrc, ...normalizedStrings, ...memorySrc]
}

/**
 * Run the mini agent with chat + tools + memory.
 * opts: { prompt, sessionId, useMemory, model, temperature, maxTokens }
 * ctx: { client, debug }
 */
export async function runAgent(
	{
		prompt,
		sessionId = 'mini-agent',
		useMemory = true,
		model = 'gpt-4o-mini',
		temperature = 0.5,
		maxTokens = 1000,
	} = {},
	{ client: clientOverride, debug = false } = {}
) {
	if (!prompt || typeof prompt !== 'string') throw new Error('Missing prompt')
	const client = clientOverride || getOpenAIClient(process.env.OPENAI_API_KEY)

	// Tools
	const steps = ['init']
	const toolsContext = {}
	const { wantsWeather: hw } = planTools(prompt)

	// Classify intent via LLM to augment heuristic planning
	const classification = await classifyIntent(client, prompt)
	steps.push(`classify:${classification.intent}:${String(classification.confidence ?? 0)}`)

	// Plan tools
	const wantsWeather = hw || classification.intent === 'weather'

	// Plan weather tool
	if (wantsWeather) {
		const { weather, steps: ws } = await planWeatherTool(prompt, classification)
		if (weather) toolsContext.weather = weather
		steps.push(...ws)
	}

	steps.push('tools:done')

	// Build messages + memory
	const {
		messages,
		memorySummary,
		step: memStep,
	} = await buildMessages({
		client,
		prompt,
		useMemory,
		sessionId,
		model,
		toolsContext,
	})
	steps.push(memStep)

	// LLM call
	const started = Date.now()
	const completion = await client.chat.completions.create({
		model,
		temperature,
		max_tokens: maxTokens,
		response_format: { type: 'json_object' },
		messages,
	})
	const durationMs = Date.now() - started
	const text = completion?.choices?.[0]?.message?.content || ''
	const { normalized: rawNormalized, errors } = validateResultShape(text)
	const normalized = finalizeAnswer(rawNormalized, toolsContext)

	steps.push(`llm:end:${durationMs}ms`)

	// Persist memory
	await appendMessage(sessionId, { role: 'user', content: prompt })
	await appendMessage(sessionId, { role: 'assistant', content: text })

	const combinedSources = assembleSources({ normalized, toolsContext, memorySummary, useMemory })

	const result = {
		...normalized,
		model,
		temperature,
		maxTokens,
		usage: normalizeUsage(completion?.usage || null),
		durationMs,
		sources: combinedSources,
		costUsd: estimateCostUSD(completion?.usage || null, model),
		steps,
	}

	if (debug) {
		result.debug = { messages, toolsContext, validationErrors: errors }
	}

	return result
}
