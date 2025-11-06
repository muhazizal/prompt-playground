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
 * Decide which tools to run based on the prompt only.
 */
function planTools(prompt) {
	const txt = String(prompt || '').toLowerCase()
	const wantsWeather = /\b(weather|temperature|forecast|rain|sunny|wind)\b/.test(txt)
	const wantsDocs =
		/\b(note|notes|week|phase|doc|docs|project|agent|embedding|prompt|summarize|summary|title|titles|list|count|how\s+many)\b/.test(
			txt
		)

	return { wantsWeather, wantsDocs }
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
 * Classify prompt intent using a small LLM and return strict JSON.
 * Shape: { intent: string, args?: object, confidence?: number }
 */
async function classifyIntent(client, prompt) {
	try {
		const sys = {
			role: 'system',
			content:
				'Return STRICT JSON: {"intent": string, "args": object, "confidence": number}. ' +
				'intents: ["list_notes","count_notes","titles","find_note","summarize_note","search_docs","weather","chat","multi"]. ' +
				'Do not include markdown or commentary.',
		}
		const user = { role: 'user', content: String(prompt || '') }
		const res = await client.chat.completions.create({
			model: 'gpt-4o-mini',
			temperature: 0,
			max_tokens: 120,
			response_format: { type: 'json_object' },
			messages: [sys, user],
		})
		const text = res?.choices?.[0]?.message?.content || '{}'
		const parsed = JSON.parse(text)
		const intent = typeof parsed.intent === 'string' ? parsed.intent : 'chat'
		const args = parsed && typeof parsed.args === 'object' ? parsed.args : {}
		const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0

		return { intent, args, confidence }
	} catch (e) {
		return { intent: 'chat', args: {}, confidence: 0 }
	}
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
	const pi = ((usage.prompt_tokens ?? usage.promptTokens) || 0) / 1_000_000
	const po = ((usage.completion_tokens ?? usage.completionTokens) || 0) / 1_000_000

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

		// Validate intent
		if (parsed && typeof parsed.intent === 'string') out.intent = parsed.intent
		else errors.push('intent missing')

		// Validate answer
		if (parsed && typeof parsed.answer === 'string') out.answer = parsed.answer
		else errors.push('answer missing')

		// Validate sources
		if (parsed && Array.isArray(parsed.sources)) out.sources = parsed.sources
		else errors.push('sources missing')
	} catch (e) {
		errors.push('json parse failed')
	}
	return { normalized: out, errors }
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
		const locFromCls =
			typeof classification?.args?.location === 'string' ? classification.args.location : null
		const loc = locFromCls || extractWeatherLocation(prompt)

		if (loc) {
			toolsContext.weather = await weatherTool(loc)
			steps.push(`tool:weather:${loc}`)
		} else {
			steps.push('tool:weather:skipped:no_location')
		}
	}

	// Plan docs tools
	if (wantsDocs) {
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

		// Plan list tool
		if (wantsList) {
			toolsContext.docsList = docsListTool()
			steps.push('tool:docs:list')
		}

		// Plan exact tool
		if (exactName) {
			toolsContext.docsExact = docsExactTool(exactName)
			steps.push(`tool:docs:exact:${exactName}`)
		} else if (
			!wantsList ||
			classification.intent === 'search_docs' ||
			classification.intent === 'multi'
		) {
			// Plan search tool
			toolsContext.docs = await docsTool(client, dq, { topK: 3 })
			steps.push(`tool:docs:${(dq || '').slice(0, 32)}`)
		}
	}

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
	const { normalized, errors } = validateResultShape(text)

	steps.push(`llm:end:${durationMs}ms`)

	// Fallback answer if model failed to provide one
	if (!normalized.answer || !normalized.answer.trim()) {
		const fallback =
			(toolsContext?.docsExact?.summary && String(toolsContext.docsExact.summary)) ||
			(toolsContext?.docs?.summary && String(toolsContext.docs.summary)) ||
			(toolsContext?.weather?.summary && String(toolsContext.weather.summary)) ||
			''
		if (fallback) normalized.answer = fallback.slice(0, 500)
	}

	// Persist memory
	await appendMessage(sessionId, { role: 'user', content: prompt })
	await appendMessage(sessionId, { role: 'assistant', content: text })

	// Assemble structured sources
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

	// Dedupe and prefer richer doc sources (with snippet/score). Drop doc list entries when scorable docs exist.
	const docPool = [...docExactSources, ...docSources]
	const hasScorableDocs = docPool.length > 0
	const docListIncluded = hasScorableDocs ? [] : docListSources
	const docCandidates = [
		...docPool,
		...docListIncluded,
		...normalizedStrings.filter((x) => x?.type === 'doc'),
	]
	const docByFile = new Map()

	// Dedupe doc sources by file, preferring richer entries
	for (const d of docCandidates) {
		if (!d || !d.file) continue
		const prev = docByFile.get(d.file)
		const prevScore = typeof prev?.score === 'number' ? prev.score : -Infinity
		const curScore = typeof d?.score === 'number' ? d.score : -Infinity
		const prevHasSnippet = !!prev?.snippet
		const curHasSnippet = !!d?.snippet
		// Pick better: prefer snippet; if both have snippet, prefer higher score; else prefer with score
		const pickCurrent =
			!prev ||
			(!prevHasSnippet && curHasSnippet) ||
			(prevHasSnippet && curHasSnippet && curScore > prevScore) ||
			(!prevHasSnippet && !curHasSnippet && curScore > prevScore)
		if (pickCurrent) docByFile.set(d.file, d)
	}
	const mergedDocSources = Array.from(docByFile.values())

	// Optionally cap to top N by score where available
	mergedDocSources.sort((a, b) => Number(b.score || -Infinity) - Number(a.score || -Infinity))
	const DOC_CAP = 10
	const cappedDocSources = mergedDocSources.slice(0, DOC_CAP)

	const combinedSources = [...weatherSrc, ...cappedDocSources, ...memorySrc]

	// Normalize usage stats
	function normalizeUsage(u) {
		if (!u) return null
		return {
			promptTokens: u.promptTokens ?? u.prompt_tokens ?? null,
			completionTokens: u.completionTokens ?? u.completion_tokens ?? null,
			totalTokens: u.totalTokens ?? u.total_tokens ?? null,
		}
	}

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
