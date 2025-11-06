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
import { semanticSearchNotes, listNoteFiles, readNote, findNoteByQuery } from './notes-core.mjs'
import { DOCS_TOPK, DOC_CAP } from '../utils/constants.mjs'
import { mergeDocSources } from '../utils/source.mjs'
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
 * Docs tool using embeddings-based semantic search over local notes.
 */
async function docsTool(client, query, { topK = DOCS_TOPK } = {}) {
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
 * Docs listing tool: enumerate available notes and return names.
 */
function docsListTool() {
	try {
		const files = listNoteFiles()
		const names = files.map((f) => f.name)
		const summary = `${names.length} notes: ${names.join(', ')}`
		const results = names.map((n) => ({ file: n, score: 1.0, snippet: '' }))

		return { ok: true, summary, sources: names, results }
	} catch (err) {
		return {
			ok: false,
			summary: `Docs list error: ${err?.message || String(err)}`,
			sources: [],
			results: [],
		}
	}
}

/**
 * Exact note match by filename or partial name.
 */
function docsExactTool(query) {
	try {
		const q = String(query || '').trim()
		const match = findNoteByQuery(q)

		// Check for successful match
		if (!match)
			return { ok: false, summary: `No exact note match for "${query}"`, sources: [], results: [] }

		// Read note content
		const text = readNote(match.path)
		const snippet = String(text || '')
			.slice(0, 300)
			.replace(/\n/g, ' ')
			.trim()

		return {
			ok: true,
			summary: `Exact match: ${match.name}`,
			sources: [match.name],
			results: [{ file: match.name, score: 1.0, snippet }],
		}
	} catch (err) {
		return {
			ok: false,
			summary: `Docs exact error: ${err?.message || String(err)}`,
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

/** Extract a focused docs query segment from the prompt */
function extractDocsQuery(prompt) {
	// Normalize whitespace and remove leading/trailing connectors
	const text = String(prompt || '')
	const parts = text
		.split(/[,.;!?]|\band\b|\bthen\b|\bbut\b|\bplease\b/i)
		.map((s) => s.trim())
		.filter(Boolean)

	// Find first part that matches a docs keyword
	const idx = parts.findIndex((p) =>
		/\b(note|notes|week|phase|doc|docs|project|agent|embedding|prompt|summarize|summary)\b/i.test(p)
	)

	// Return first part that matches a docs keyword
	if (idx >= 0) return parts[idx]

	// Fallback: "summarize <query>" or "summary <query>"
	const m = text.match(/\b(?:summarize|summary)\s+([^.!?]+)/i)

	// Return query part if found
	if (m && m[1]) return m[1].trim()

	return text
}

/** Extract a probable doc filename like "phase-1-week-2" (optional .md) */
function extractDocFilename(prompt) {
	const txt = String(prompt || '').toLowerCase()

	// Try phase-week format
	let m = txt.match(/\bphase\s*-?\s*(\d+)\b[^a-z0-9]+\bweek\s*-?\s*(\d+)\b/)
	if (m) return `phase-${m[1]}-week-${m[2]}`

	// Try week-phase format
	m = txt.match(/\bweek\s*-?\s*(\d+)\b[^a-z0-9]+\bphase\s*-?\s*(\d+)\b/)
	if (m) return `phase-${m[2]}-week-${m[1]}`

	// Try p-w format
	m = txt.match(/\bp\s*-?\s*(\d+)\s*-?\s*w\s*-?\s*(\d+)\b/)
	if (m) return `phase-${m[1]}-week-${m[2]}`

	// Try filename format
	m = txt.match(/\b([a-z0-9\-]+)\.md\b/)
	if (m) return m[1]

	return null
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
 * Plan and execute docs-related tools based on prompt/classification.
 * Returns { context, steps } where context may include docs, docsExact, docsList.
 */
async function planDocsTools(client, prompt, classification) {
	const steps = []
	const context = {}
	const dq = classification?.args?.query || extractDocsQuery(prompt)
	const wantsList =
		classification.intent === 'list_notes' ||
		classification.intent === 'count_notes' ||
		classification.intent === 'titles' ||
		(/\b(list|count|how\s+many)\b/i.test(prompt) &&
			/\b(note|notes|doc|docs|title|titles)\b/i.test(prompt))

	const exactNameArg =
		typeof classification?.args?.filename === 'string' ? classification.args.filename : null
	const exactName = exactNameArg || extractDocFilename(prompt)

	if (wantsList) {
		context.docsList = docsListTool()
		steps.push('tool:docs:list')
	}

	if (exactName) {
		context.docsExact = docsExactTool(exactName)
		steps.push(`tool:docs:exact:${exactName}`)
	} else if (
		!wantsList ||
		classification.intent === 'search_docs' ||
		classification.intent === 'multi'
	) {
		context.docs = await docsTool(client, dq, { topK: 3 })
		steps.push(`tool:docs:${(dq || '').slice(0, 32)}`)
	}

	return { context, steps }
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
		const fallback =
			(toolsContext?.docsExact?.summary && String(toolsContext.docsExact.summary)) ||
			(toolsContext?.docs?.summary && String(toolsContext.docs.summary)) ||
			(toolsContext?.weather?.summary && String(toolsContext.weather.summary)) ||
			''
		if (fallback) normalized.answer = fallback.slice(0, 500)
	}
	return normalized
}

/**
 * Assemble structured sources from tools, normalized JSON, and memory.
 */
function assembleSources({ normalized, toolsContext, memorySummary, useMemory }) {
	const docSources = Array.isArray(toolsContext?.docs?.results)
		? toolsContext.docs.results.map((r) => ({
				type: 'doc',
				file: r.file,
				snippet: r.snippet,
				score: r.score,
		  }))
		: []
	const docExactSources = Array.isArray(toolsContext?.docsExact?.results)
		? toolsContext.docsExact.results.map((r) => ({
				type: 'doc',
				file: r.file,
				snippet: r.snippet,
				score: r.score,
		  }))
		: []
	const docListSources = Array.isArray(toolsContext?.docsList?.results)
		? toolsContext.docsList.results.map((r) => ({ type: 'doc', file: r.file }))
		: []
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

	const cappedDocSources = mergeDocSources({
		docSources,
		docExactSources,
		docListSources,
		normalizedDocStrings: normalizedStrings,
		cap: DOC_CAP,
	})

	return [...weatherSrc, ...cappedDocSources, ...memorySrc]
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
		temperature = 0.2,
		maxTokens = 400,
	} = {},
	{ client: clientOverride, debug = false } = {}
) {
	if (!prompt || typeof prompt !== 'string') throw new Error('Missing prompt')
	const client = clientOverride || getOpenAIClient(process.env.OPENAI_API_KEY)

	// Tools
	const steps = ['init']
	const toolsContext = {}
	const { wantsWeather: hw, wantsDocs: hd } = planTools(prompt)

	// Classify intent via LLM to augment heuristic planning
	const classification = await classifyIntent(client, prompt)
	steps.push(`classify:${classification.intent}:${String(classification.confidence ?? 0)}`)

	// Plan tools
	const wantsWeather = hw || classification.intent === 'weather'
	const wantsDocs =
		hd ||
		classification.intent === 'list_notes' ||
		classification.intent === 'count_notes' ||
		classification.intent === 'titles' ||
		classification.intent === 'find_note' ||
		classification.intent === 'summarize_note' ||
		classification.intent === 'search_docs' ||
		classification.intent === 'multi'

	// Plan weather tool
	if (wantsWeather) {
		const { weather, steps: ws } = await planWeatherTool(prompt, classification)
		if (weather) toolsContext.weather = weather
		steps.push(...ws)
	}

	// Plan docs tools
	if (wantsDocs) {
		const { context: dctx, steps: ds } = await planDocsTools(client, prompt, classification)
		Object.assign(toolsContext, dctx)
		steps.push(...ds)
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

	// normalized already finalized above

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
