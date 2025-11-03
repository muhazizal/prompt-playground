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

// In-memory caches
const tagEmbeddingsCache = new Map() // Map<tag, embeddingVector>
const textEmbeddingCache = new Map() // Map<hash(text), embeddingVector>
let embedDiskCacheLoaded = false
let embedDiskCache = { text: {}, tags: {} }

function ensureDirs() {
	if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
	if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true })
}

function loadEmbeddingsCacheFromDisk() {
	ensureDirs()

	if (embedDiskCacheLoaded) return

	if (fs.existsSync(EMBED_CACHE_FILE)) {
		try {
			const raw = fs.readFileSync(EMBED_CACHE_FILE, 'utf-8')
			const parsed = JSON.parse(raw)

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

export function getClient(apiKey) {
	if (!apiKey) throw new Error('Missing OPENAI_API_KEY')

	return new OpenAI({ apiKey })
}

export function listNoteFiles() {
	if (!fs.existsSync(NOTES_DIR)) return []

	const all = fs.readdirSync(NOTES_DIR)

	return all
		.filter((f) => f.endsWith('.md') || f.endsWith('.txt'))
		.map((f) => ({ name: f, path: path.join(NOTES_DIR, f) }))
}

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

function sha1(str) {
	return crypto.createHash('sha1').update(str).digest('hex')
}

async function getTextEmbedding(client, text) {
	loadEmbeddingsCacheFromDisk()
	const key = sha1(text)

	if (textEmbeddingCache.has(key)) return textEmbeddingCache.get(key)

	const res = await client.embeddings.create({ model: EMBEDDING_MODEL, input: text })
	const vec = res?.data?.[0]?.embedding || []

	textEmbeddingCache.set(key, vec)
	embedDiskCache.text[key] = vec

	scheduleSaveEmbeddingsCache()

	return vec
}

async function getTagEmbedding(client, tag) {
	loadEmbeddingsCacheFromDisk()

	if (tagEmbeddingsCache.has(tag)) return tagEmbeddingsCache.get(tag)

	if (embedDiskCache.tags[tag]) {
		const vec = embedDiskCache.tags[tag]
		tagEmbeddingsCache.set(tag, vec)

		return vec
	}

	const res = await client.embeddings.create({ model: EMBEDDING_MODEL, input: tag })
	const vec = res?.data?.[0]?.embedding || []

	tagEmbeddingsCache.set(tag, vec)
	embedDiskCache.tags[tag] = vec

	scheduleSaveEmbeddingsCache()

	return vec
}

export function loadTagCandidates() {
	ensureDirs()

	try {
		if (fs.existsSync(TAGS_JSON)) {
			const raw = fs.readFileSync(TAGS_JSON, 'utf-8')
			const arr = JSON.parse(raw)

			if (Array.isArray(arr) && arr.every((t) => typeof t === 'string')) return arr
		}
	} catch {}

	return DEFAULT_TAGS
}

export function saveTagCandidates(tags = []) {
	ensureDirs()

	const clean = Array.isArray(tags)
		? tags.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim())
		: []

	fs.writeFileSync(TAGS_JSON, JSON.stringify(clean, null, 2), 'utf-8')
}

function cosineSimilarity(a = [], b = []) {
	let dot = 0,
		na = 0,
		nb = 0

	for (let i = 0; i < Math.min(a.length, b.length); i++) {
		dot += a[i] * b[i]
		na += a[i] * a[i]
		nb += b[i] * b[i]
	}

	return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

export async function summarize(client, text, { model = DEFAULT_MODEL } = {}) {
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

	try {
		const parsed = JSON.parse(raw)
		summary = parsed?.summary || summary
		tags = Array.isArray(parsed?.tags) ? parsed.tags : tags
	} catch {}

	return { summary, tags, usage: completion?.usage || null }
}

export async function rankTags(client, text) {
	const TAGS = loadTagCandidates()
	const vec = await getTextEmbedding(client, text)
	const scored = await Promise.all(
		TAGS.map(async (t) => {
			const te = await getTagEmbedding(client, t)
			return { tag: t, score: cosineSimilarity(vec, te) }
		})
	)
	const ranked = scored
		.sort((a, b) => b.score - a.score)
		.slice(0, 5)
		.map((r) => r.tag)
	return ranked
}

export async function evaluateSummary(client, text, summary, { model = DEFAULT_MODEL } = {}) {
	const completion = await client.chat.completions.create({
		model,
		temperature: 0,
		max_tokens: 200,
		messages: [
			{
				role: 'system',
				content:
					'You are an evaluator that grades summaries for coverage and concision. Return strict JSON.',
			},
			{
				role: 'user',
				content: `Evaluate the following summary against the original note.\n
Original note:\n${text}\n\nSummary:\n${summary}\n\nReturn JSON with {"coverage": number (0-1), "concision": number (0-1), "feedback": string}.`,
			},
		],
	})
	const raw = completion?.choices?.[0]?.message?.content || ''
	let coverage = 0.0,
		concision = 0.0,
		feedback = ''

	try {
		const parsed = JSON.parse(raw)

		coverage =
			typeof parsed.coverage === 'number' ? Math.max(0, Math.min(1, parsed.coverage)) : coverage

		concision =
			typeof parsed.concision === 'number' ? Math.max(0, Math.min(1, parsed.concision)) : concision

		feedback = typeof parsed.feedback === 'string' ? parsed.feedback : feedback
	} catch {
		// Fallback heuristic if JSON parsing fails
		const lenNote = text.length || 1
		const lenSum = summary.length || 1
		const ratio = Math.min(1, lenSum / lenNote)

		coverage = Math.max(0.2, Math.min(1, ratio * 1.2))
		concision = Math.max(0.2, Math.min(1, 1 - ratio * 0.5))
		feedback = 'Heuristic evaluation applied due to parsing failure.'
	}

	return { coverage, concision, feedback, usage: completion?.usage || null }
}
