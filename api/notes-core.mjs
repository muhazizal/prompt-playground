import fs from 'fs'
import path from 'path'
import OpenAI from 'openai'

export const NOTES_DIR = path.resolve(process.cwd(), 'notes')
export const DEFAULT_MODEL = 'gpt-4o-mini'
export const EMBEDDING_MODEL = 'text-embedding-3-small'

export const TAG_CANDIDATES = [
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

const tagEmbeddingsCache = new Map() // Map<tag, embeddingVector>
const textEmbeddingCache = new Map() // Map<hash(text), embeddingVector>

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
	return Buffer.from(require('crypto').createHash('sha1').update(str).digest('hex')).toString()
}

async function getEmbedding(client, text) {
	const key = sha1(text)

	if (textEmbeddingCache.has(key)) return textEmbeddingCache.get(key)

	const res = await client.embeddings.create({ model: EMBEDDING_MODEL, input: text })
	const vec = res?.data?.[0]?.embedding || []

	textEmbeddingCache.set(key, vec)

	return vec
}

async function ensureTagEmbeddings(client) {
	if (tagEmbeddingsCache.size === TAG_CANDIDATES.length) return

	for (const tag of TAG_CANDIDATES) {
		if (!tagEmbeddingsCache.has(tag)) {
			const res = await client.embeddings.create({ model: EMBEDDING_MODEL, input: tag })
			tagEmbeddingsCache.set(tag, res?.data?.[0]?.embedding || [])
		}
	}
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
	await ensureTagEmbeddings(client)
	const vec = await getEmbedding(client, text)
	const ranked = TAG_CANDIDATES.map((t) => ({
		tag: t,
		score: cosineSimilarity(vec, tagEmbeddingsCache.get(t)),
	}))
		.sort((a, b) => b.score - a.score)
		.slice(0, 5)
		.map((r) => r.tag)
	return ranked
}
