## Phase 1 – Week 2: Embeddings & Retrieval (RAG Basics)

This week we focus on embedding text for semantic search, building a simple vector index, and using top‑k retrieval to ground model responses. You’ll wire the OpenAI embeddings API, cache vectors locally, and evaluate retrieval quality.

### Objectives

- Understand text embeddings and similarity (cosine/dot product).
- Build a small vector store with metadata and caching.
- Retrieve top‑k relevant chunks and feed them into prompts.
- Evaluate retrieval quality and cost trade‑offs.

### Key Concepts

- **Embeddings**: High‑dimensional vectors that encode semantic meaning of text.
- **Similarity**: Cosine similarity is commonly used (scale −1 to 1). Higher = more similar.
- **Chunking**: Split documents into manageable pieces (e.g., 512–1024 tokens) with overlap.
- **Indexing**: Store `{ id, text, vector }` along with metadata (source, tags, timestamps).
- **Caching**: Avoid repeated API calls by saving vectors to disk (e.g., `cache/embeddings.json`).
- **RAG**: Retrieve relevant chunks and pass them to the model as context to improve factuality.

### Minimal Runnable Example (Node.js)

```ts
// Embedding a few texts and performing cosine-similarity search
import OpenAI from 'openai'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Helper: cosine similarity between two vectors
function cosine(a: number[], b: number[]): number {
	const dot = a.reduce((s, x, i) => s + x * b[i], 0)
	const na = Math.sqrt(a.reduce((s, x) => s + x * x, 0))
	const nb = Math.sqrt(b.reduce((s, x) => s + x * x, 0))
	return dot / (na * nb)
}

// Index three short texts
const docs = [
	{ id: '1', text: 'Sprint planning risks and mitigations for backend services.' },
	{ id: '2', text: 'Deploy checklist for Nuxt web app with Firebase integration.' },
	{ id: '3', text: 'LLM prompt engineering patterns: summarize, extract, transform.' },
]

// Create embeddings (model name may change; use latest stable)
const embeddingsRes = await client.embeddings.create({
	model: 'text-embedding-3-small',
	input: docs.map((d) => d.text),
})

const vectors = embeddingsRes.data.map((e) => e.embedding)
const index = docs.map((d, i) => ({ ...d, vector: vectors[i] }))

// Query embedding
const query = 'How do I deploy the frontend with Firebase?'
const qRes = await client.embeddings.create({ model: 'text-embedding-3-small', input: query })
const qVec = qRes.data[0].embedding

// Rank by similarity
const ranked = index
	.map((item) => ({ ...item, score: cosine(item.vector, qVec) }))
	.sort((a, b) => b.score - a.score)
	.slice(0, 2)

console.log(
	'Top‑k:',
	ranked.map((r) => ({ id: r.id, score: r.score.toFixed(3), text: r.text }))
)
```

### Implementation Steps

1. **Chunker**: Write a utility to split long docs into chunks with overlap (e.g., 200–300 words with 25–50 word overlap). Store chunk `id`, `source`, and `position`.
2. **Embed & Cache**: Embed chunks and save `{ id, text, vector, source }` to `cache/embeddings.json`. Reuse cached vectors when content hasn’t changed.
3. **Similarity Search**: Implement cosine similarity and a simple top‑k selector. Return `{ chunk, score }` sorted by score.
4. **RAG Prompting**: Inject the top‑k chunks into a `system` or `context` field (e.g., “Reference:” followed by selected snippets). Keep within token budgets.
5. **Evaluation**: Create queries and check whether retrieved chunks truly answer them. Track recall/precision qualitatively.

### Repo Pointers

- `examples/embeddings.mjs`: end‑to‑end embedding example.
- `cache/embeddings.json`: suggested cache location for vectors.
- `api/core/notes-core.mjs`: uses embeddings for tag similarity (see how metadata and caching are handled).

### Testing Checklist

- Vary **chunk size** and **overlap**; confirm retrieval quality and prompt token usage.
- Test **synonyms** and **paraphrases**; ensure top‑k returns expected chunks.
- Validate **cosine vs dot product** if you experiment; keep consistent normalization.
- Confirm **caching** works: re‑run embedding step and ensure no duplicate API calls for unchanged text.
- Guard against **token budget** overflows when injecting retrieved context.

### Reflection

**How do we choose chunk size and overlap?**

- Larger chunks capture more context but may dilute relevance and inflate tokens. Smaller chunks are precise but risk missing broader context. Start at 200–300 words with 10–20% overlap; adjust based on retrieval quality and token budgets.

**What’s the trade‑off between top‑k size and prompt cost?**

- More chunks improve coverage but increase prompt tokens and cost. Pick the smallest k that consistently grounds answers (often k=3–5). Consider summarizing retrieved chunks to compress context before prompting.

**How do we keep costs reasonable?**

- Cache aggressively, embed once per chunk change, and cap prompt context. Monitor `usage` from API responses and set budgets. If costs creep up, reduce k, chunk size, or summarize before injection.

**Pitfalls**

- Mixing models/dimensions (e.g., swapping embedding models) without re‑embedding will corrupt similarity.
- Failing to normalize/standardize similarity calculations leads to inconsistent ranking.
- Injecting too much context causes the model to ignore instructions; keep prompts structured and bounded.

With embeddings and basic retrieval in place, you can start grounding model outputs and prepare for richer RAG pipelines in later phases.
