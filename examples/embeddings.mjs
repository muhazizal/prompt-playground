import OpenAI from 'openai'
import dotenv from 'dotenv'
dotenv.config()

function cosineSimilarity(a, b) {
	const dot = a.reduce((sum, v, i) => sum + v * b[i], 0)
	const na = Math.sqrt(a.reduce((s, v) => s + v * v, 0))
	const nb = Math.sqrt(b.reduce((s, v) => s + v * v, 0))
	return dot / (na * nb)
}

export async function runEmbeddingsDemo({
	model = 'text-embedding-3-small',
	query = 'What is semantic search?',
	docs = ['How to boil pasta', 'Understanding neural networks', 'A guide to semantic search'],
} = {}) {
	const apiKey = process.env.OPENAI_API_KEY
	if (!apiKey) throw new Error('Missing OPENAI_API_KEY in environment or .env')
	const client = new OpenAI({ apiKey })

	const res = await client.embeddings.create({ model, input: [query, ...docs] })
	const queryVec = res.data[0].embedding
	const docVecs = res.data.slice(1).map((d) => d.embedding)

	const scored = docs.map((d, i) => ({ doc: d, score: cosineSimilarity(queryVec, docVecs[i]) }))
	scored.sort((a, b) => b.score - a.score)

	console.log('Query:', query)
	console.log('Ranked docs by similarity:')
	console.table(scored)
}

// Direct-run support
if (process.argv[1] && process.argv[1].endsWith('embeddings.mjs')) {
	runEmbeddingsDemo().catch((err) => {
		console.error('Error:', err?.message || String(err))
		process.exitCode = 1
	})
}
