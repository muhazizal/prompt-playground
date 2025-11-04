import fs from 'fs'
import path from 'path'
import OpenAI from 'openai'
import crypto from 'crypto'

export const NOTES_DIR = path.resolve(process.cwd(), 'notes')
export const DEFAULT_MODEL = 'gpt-4o-mini'
export const EMBEDDING_MODEL = 'text-embedding-3-small'

export const DEFAULT_TAGS = [
	'LLM Basics',
	'Prompt Design',
	'Embeddings',
	'Tokenization',
	'Reasoning',
	'Nuxt',
	'Firebase',
	'Web App',
	'CLI',
	'OpenAI SDK',
]

// Config and cache locations
export const CONFIG_DIR = path.resolve(process.cwd(), 'config')
export const TAGS_JSON = path.join(CONFIG_DIR, 'tags.json')
export const CACHE_DIR = path.resolve(process.cwd(), 'cache')
export const EMBED_CACHE_FILE = path.join(CACHE_DIR, 'embeddings.json')
export const SUMMARY_CACHE_FILE = path.join(CACHE_DIR, 'summaries.json')

// In-memory caches
const tagEmbeddingsCache = new Map() // Map<tag, embeddingVector>
const textEmbeddingCache = new Map() // Map<hash(text), embeddingVector>
let embedDiskCacheLoaded = false
let embedDiskCache = { text: {}, tags: {} }

// Summary cache (in-memory + disk)
const summaryCache = new Map() // Map<sha1(text), { model, summary, tags, usage }>
let summaryDiskCacheLoaded = false
let summaryDiskCache = {}

// Ensure config and cache directories exist
function ensureDirs() {
	if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
	if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true })
}

// Load embeddings cache from disk if it exists
function loadEmbeddingsCacheFromDisk() {
	ensureDirs()

	if (embedDiskCacheLoaded) return

	if (fs.existsSync(EMBED_CACHE_FILE)) {
		try {
			const raw = fs.readFileSync(EMBED_CACHE_FILE, 'utf-8')
			const parsed = JSON.parse(raw)

			// Validate cache format
			embedDiskCache = {
				text: parsed?.text && typeof parsed.text === 'object' ? parsed.text : {},
				tags: parsed?.tags && typeof parsed.tags === 'object' ? parsed.tags : {},
			}

			// Warm in-memory text cache
			for (const [k, v] of Object.entries(embedDiskCache.text)) {
				if (!textEmbeddingCache.has(k)) textEmbeddingCache.set(k, v)
			}

			embedDiskCacheLoaded = true
		} catch {}
	} else {
		embedDiskCacheLoaded = true
	}
}

// Save embeddings cache to disk with debounce
let saveTimer = null
function scheduleSaveEmbeddingsCache() {
	if (saveTimer) return

	saveTimer = setTimeout(() => {
		try {
			fs.writeFileSync(EMBED_CACHE_FILE, JSON.stringify(embedDiskCache), 'utf-8')
		} catch {}

		saveTimer = null
	}, 200)
}

// Load summaries cache from disk if it exists
function loadSummaryCacheFromDisk() {
	ensureDirs()

	if (summaryDiskCacheLoaded) return

	if (fs.existsSync(SUMMARY_CACHE_FILE)) {
		try {
			const raw = fs.readFileSync(SUMMARY_CACHE_FILE, 'utf-8')
			const parsed = JSON.parse(raw)

			summaryDiskCache = parsed && typeof parsed === 'object' ? parsed : {}

			// Warm in-memory summary cache
			for (const [k, v] of Object.entries(summaryDiskCache)) {
				if (!summaryCache.has(k)) summaryCache.set(k, v)
			}

			summaryDiskCacheLoaded = true
		} catch {}
	} else {
		summaryDiskCacheLoaded = true
	}
}

// Save summaries cache to disk with debounce
let summarySaveTimer = null
function scheduleSaveSummaryCache() {
	if (summarySaveTimer) return

	summarySaveTimer = setTimeout(() => {
		try {
			fs.writeFileSync(SUMMARY_CACHE_FILE, JSON.stringify(summaryDiskCache), 'utf-8')
		} catch {}

		summarySaveTimer = null
	}, 200)
}

// Create OpenAI client with API key validation
export function getClient(apiKey) {
	if (!apiKey) throw new Error('Missing OPENAI_API_KEY')
	return new OpenAI({ apiKey })
}

// List note files in notes directory
export function listNoteFiles() {
	if (!fs.existsSync(NOTES_DIR)) return []

	const all = fs.readdirSync(NOTES_DIR)

	// Filter markdown and text files
	return all
		.filter((f) => f.endsWith('.md') || f.endsWith('.txt'))
		.map((f) => ({ name: f, path: path.join(NOTES_DIR, f) }))
}

// Read note content with validation
export function readNote(filePath) {
	try {
		if (!filePath.startsWith(NOTES_DIR)) {
			throw new Error('Path outside notes directory')
		}
		return fs.readFileSync(filePath, 'utf-8')
	} catch (e) {
		return ''
	}
}

// Generate SHA-1 hash for text
function sha1(str) {
	return crypto.createHash('sha1').update(str).digest('hex')
}

// Get cached summary if available for given text and model
export function getCachedSummary(text, model = DEFAULT_MODEL) {
	loadSummaryCacheFromDisk()
	const key = sha1(text)
	const entry = summaryCache.get(key) || summaryDiskCache[key]
	if (entry && entry.model === model) return entry
	return null
}

// Set cached summary
export function setCachedSummary(text, model, summary, tags, usage) {
	loadSummaryCacheFromDisk()
	const key = sha1(text)
	const entry = {
		model: model || DEFAULT_MODEL,
		summary,
		tags: Array.isArray(tags) ? tags : [],
		usage: usage || null,
	}
	summaryCache.set(key, entry)
	summaryDiskCache[key] = entry
	scheduleSaveSummaryCache()
}

// Get text embedding with cache
async function getTextEmbedding(client, text) {
	loadEmbeddingsCacheFromDisk()
	const key = sha1(text)

	// Check cache first
	if (textEmbeddingCache.has(key)) {
		console.log(`[embeddings] text hit (mem) key=${key}`)
		return textEmbeddingCache.get(key)
	}

	// Get embedding from OpenAI if not cached
	const res = await client.embeddings.create({ model: EMBEDDING_MODEL, input: text })
	const vec = res?.data?.[0]?.embedding || []

	// Cache the result
	textEmbeddingCache.set(key, vec)
	embedDiskCache.text[key] = vec

	scheduleSaveEmbeddingsCache()
	console.log(`[embeddings] text miss -> computed and cached key=${key}`)

	return vec
}

// Get tag embedding with cache
async function getTagEmbedding(client, tag) {
	loadEmbeddingsCacheFromDisk()

	// Check cache first
	if (tagEmbeddingsCache.has(tag)) {
		console.log(`[embeddings] tag hit (mem) tag="${tag}"`)
		return tagEmbeddingsCache.get(tag)
	}

	// Check disk cache next
	if (embedDiskCache.tags[tag]) {
		const vec = embedDiskCache.tags[tag]
		tagEmbeddingsCache.set(tag, vec)
		console.log(`[embeddings] tag hit (disk) tag="${tag}"`)

		return vec
	}

	// Get embedding from OpenAI if not cached
	const res = await client.embeddings.create({ model: EMBEDDING_MODEL, input: tag })
	const vec = res?.data?.[0]?.embedding || []

	// Cache the result
	tagEmbeddingsCache.set(tag, vec)
	embedDiskCache.tags[tag] = vec

	scheduleSaveEmbeddingsCache()
	console.log(`[embeddings] tag miss -> computed and cached tag="${tag}"`)

	return vec
}

// Load tag candidates from disk or use default
export function loadTagCandidates() {
	ensureDirs()

	try {
		if (fs.existsSync(TAGS_JSON)) {
			const raw = fs.readFileSync(TAGS_JSON, 'utf-8')
			const arr = JSON.parse(raw)

			// Validate tags array
			if (Array.isArray(arr) && arr.every((t) => typeof t === 'string')) return arr
		}
	} catch {}

	return DEFAULT_TAGS
}

// Save tag candidates to disk with validation
export function saveTagCandidates(tags = []) {
	ensureDirs()

	// Clean and validate tags
	const clean = Array.isArray(tags)
		? tags.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim())
		: []

	fs.writeFileSync(TAGS_JSON, JSON.stringify(clean, null, 2), 'utf-8')
}

// Calculate cosine similarity between two vectors
function cosineSimilarity(a = [], b = []) {
	let dot = 0,
		na = 0,
		nb = 0

	// Calculate dot product and norms
	for (let i = 0; i < Math.min(a.length, b.length); i++) {
		dot += a[i] * b[i]
		na += a[i] * a[i]
		nb += b[i] * b[i]
	}

	// Handle zero norm case
	return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

// Summarize note text with tags
export async function summarize(client, text, { model = DEFAULT_MODEL } = {}) {
	// Return cached summary when available
	const cached = getCachedSummary(text, model)
	if (cached) {
		return { summary: cached.summary, tags: cached.tags, usage: cached.usage, model: cached.model }
	}
	// Generate summary and tags
	const completion = await client.chat.completions.create({
		model,
		temperature: 0.2,
		max_tokens: 300,
		messages: [
			{ role: 'system', content: 'You summarize and tag notes concisely.' },
			{
				role: 'user',
				content: `Summarize the following note in 3-5 sentences. Then propose 5 short tags.
Return JSON with {"summary": string, "tags": string[]}.
Note:\n\n${text}`,
			},
		],
	})
	const raw = completion?.choices?.[0]?.message?.content || ''
	let summary = raw
	let tags = []

	// Parse JSON response
	try {
		const parsed = JSON.parse(raw)
		summary = parsed?.summary || summary
		tags = Array.isArray(parsed?.tags) ? parsed.tags : tags
	} catch {}

	const usage = completion?.usage || null
	// Cache the result to avoid repeat costs
	try {
		setCachedSummary(text, model, summary, tags, usage)
	} catch {}

	return { summary, tags, usage, model }
}

// Rank tags based on cosine similarity
export async function rankTags(client, text) {
	const TAGS = loadTagCandidates()
	const vec = await getTextEmbedding(client, text)

	// Calculate similarity scores for each tag
	const scored = await Promise.all(
		TAGS.map(async (t) => {
			const te = await getTagEmbedding(client, t)
			return { tag: t, score: cosineSimilarity(vec, te) }
		})
	)

	// Sort tags by similarity score
	const ranked = scored
		.sort((a, b) => b.score - a.score)
		.slice(0, 5)
		.map((r) => r.tag)

	return ranked
}

// Evaluate summary quality against original note
export async function evaluateSummary(client, text, summary, { model = DEFAULT_MODEL } = {}) {
	// Generate evaluation metrics
	const completion = await client.chat.completions.create({
		model,
		temperature: 0,
		max_tokens: 200,
		messages: [
			{
				role: 'system',
				content:
					'You are an evaluator that grades summaries for coverage, concision, formatting, and factuality. Return strict JSON only.',
			},
			{
				role: 'user',
				content: `Evaluate the following summary against the original note.\n\nOriginal note:\n${text}\n\nSummary:\n${summary}\n\nReturn JSON with {"coverage": number (0-1), "concision": number (0-1), "formatting": number (0-1), "factuality": number (0-1), "feedback": string}.\n- coverage: Does the summary capture key points.\n- concision: Is the summary succinct without losing meaning.\n- formatting: Is the output well-structured (3-5 sentences, readable).\n- factuality: Does the summary avoid introducing facts not present in the note.`,
			},
		],
	})
	const raw = completion?.choices?.[0]?.message?.content || ''
	let coverage = 0.0,
		concision = 0.0,
		formatting = 0.0,
		factuality = 0.0,
		feedback = ''

	try {
		const parsed = JSON.parse(raw)

		// Validate and normalize evaluation metrics
		coverage =
			typeof parsed.coverage === 'number' ? Math.max(0, Math.min(1, parsed.coverage)) : coverage
		concision =
			typeof parsed.concision === 'number' ? Math.max(0, Math.min(1, parsed.concision)) : concision
		formatting =
			typeof parsed.formatting === 'number'
				? Math.max(0, Math.min(1, parsed.formatting))
				: formatting
		factuality =
			typeof parsed.factuality === 'number'
				? Math.max(0, Math.min(1, parsed.factuality))
				: factuality
		feedback = typeof parsed.feedback === 'string' ? parsed.feedback : feedback
	} catch {
		// Fallback heuristic if JSON parsing fails
		const lenNote = text.length || 1
		const lenSum = summary.length || 1
		const ratio = Math.min(1, lenSum / lenNote)

		coverage = Math.max(0.2, Math.min(1, ratio * 1.2))
		concision = Math.max(0.2, Math.min(1, 1 - ratio * 0.5))
		// Simple formatting heuristic based on sentence count
		const sentences = (summary.match(/[.!?]\s/g) || []).length + (summary.endsWith('.') ? 1 : 0)
		formatting = Math.max(0.2, Math.min(1, sentences >= 2 && sentences <= 8 ? 0.8 : 0.4))
		// Factuality is difficult to assess heuristically; set neutral baseline
		factuality = 0.5
		feedback = 'Heuristic evaluation applied due to parsing failure.'
	}

	return { coverage, concision, formatting, factuality, feedback, usage: completion?.usage || null }
}

// Basic exponential backoff with jitter
async function withRetries(fn, { retries = 3, baseDelayMs = 400 } = {}) {
	let attempt = 0

	// Retry loop with exponential backoff
	while (true) {
		try {
			return await fn()
		} catch (err) {
			attempt++

			if (attempt > retries) throw err

			// Add jitter to avoid thundering herd problem
			const isRateLimited = err && (err.status === 429 || /rate limit/i.test(err.message || ''))
			const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 200)

			// Add extra delay if it's a rate-limit error
			const waitMs = isRateLimited ? delay + 500 : delay
			await new Promise((r) => setTimeout(r, waitMs))
		}
	}
}

// Simple concurrency limiter for bulk processing
export async function processWithConcurrency(items, limit, handler) {
	const queue = [...items]
	const results = []

	// Process items in parallel with concurrency limit
	const workers = new Array(Math.min(limit, queue.length)).fill(0).map(async () => {
		while (queue.length) {
			const item = queue.shift()
			try {
				const r = await handler(item)
				if (r) results.push(r)
			} catch (err) {
				results.push({ error: err?.message || String(err) })
			}
		}
	})

	await Promise.all(workers)

	return results
}
