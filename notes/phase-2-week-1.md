## Phase 2 – Week 1: API & OpenAI SDK Integration

This week is about wiring the OpenAI Node SDK into our API, shaping clean route handlers, and exposing endpoints the web client can consume (including SSE streaming). We focus on environment setup, authentication, core chat/embeddings calls, and reliable HTTP plumbing.

### Objectives

- Initialize and reuse a single OpenAI client per request.
- Implement core endpoints for chat, embeddings, and model listing.
- Add secure auth, CORS, rate limiting, and structured errors.
- Provide SSE streaming endpoints and client wiring patterns.

### Architecture Overview

- `api/server.mjs`: Express server boot, middlewares (logging, CORS, rate limit, JSON parsing).
- `api/middleware/auth.mjs`: Accept `X-API-Key` header or fallback to `OPENAI_API_KEY` env.
- `api/module/prompt.mjs`: Prompt endpoints (chat, stream, models).
- `api/module/notes.mjs`: Notes endpoints (list/process/stream/tags).
- `api/core/prompt.mjs`: Helpers like `getClient`, `chatWithTemperatures`, `listModels`.
- `api/core/notes.mjs`: Helpers: `getClient`, `summarize`, embeddings for tag similarity.
- `web/nuxt.config.ts`: `apiBase` runtime config and Firebase env wiring.

### Environment & Config

- `.env`: set `OPENAI_API_KEY` (used by `auth.mjs`), plus Firebase keys for the web client if needed.
- `apiBase`: defaults to `http://localhost:4000`; Nuxt dev runs on `http://localhost:3000` or `3002`.
- CORS: API allows local dev origins; verify when changing ports.

### Minimal Chat Example (Node.js)

```ts
// Basic chat completion using the OpenAI Node SDK
import OpenAI from 'openai'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const res = await client.chat.completions.create({
	model: 'gpt-4o-mini',
	temperature: 0.3,
	max_tokens: 300,
	messages: [
		{ role: 'system', content: 'You are a helpful assistant.' },
		{ role: 'user', content: 'Give me three strategies to reduce build times.' },
	],
})

console.log(res.choices?.[0]?.message?.content || '')
```

### Minimal Embeddings Example

```ts
// Embed short texts and compute cosine similarity
import OpenAI from 'openai'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

function cosine(a: number[], b: number[]): number {
	const dot = a.reduce((s, x, i) => s + x * b[i], 0)
	const na = Math.sqrt(a.reduce((s, x) => s + x * x, 0))
	const nb = Math.sqrt(b.reduce((s, x) => s + s * x, 0)) // simple norm
	return dot / (na * nb)
}

const docs = [
	{ id: '1', text: 'Optimize Webpack caching and parallelization.' },
	{ id: '2', text: 'Use Vite for faster HMR and smaller bundles.' },
]

const emb = await client.embeddings.create({
	model: 'text-embedding-3-small',
	input: docs.map((d) => d.text),
})
const idx = docs.map((d, i) => ({ ...d, vec: emb.data[i].embedding }))

const q = 'How to speed up the frontend build?'
const qEmb = await client.embeddings.create({ model: 'text-embedding-3-small', input: q })
const qVec = qEmb.data[0].embedding

const ranked = idx
	.map((it) => ({ ...it, score: cosine(it.vec, qVec) }))
	.sort((a, b) => b.score - a.score)
console.log(ranked[0])
```

### SSE Streaming (Server Pattern)

```ts
// Express SSE skeleton for streaming events
import express from 'express'
import OpenAI from 'openai'

const app = express()
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

app.get('/prompt/chat/stream', async (req, res) => {
	res.setHeader('Content-Type', 'text/event-stream')
	res.setHeader('Cache-Control', 'no-cache')
	res.flushHeaders?.()

	const send = (event: string, data: any) => {
		res.write(`event: ${event}\n`)
		res.write(`data: ${JSON.stringify(data)}\n\n`)
	}

	try {
		// Non-chunked example: compute result, then emit
		const r = await client.chat.completions.create({
			model: 'gpt-4o-mini',
			messages: [
				{ role: 'system', content: 'Stream a concise summary.' },
				{ role: 'user', content: String(req.query.prompt || '') },
			],
			max_tokens: 200,
		})
		const text = r.choices?.[0]?.message?.content || ''
		send('summary', { chunk: text.slice(0, 80) }) // optional early preview
		send('result', { text })
		// If usage data is available
		send('usage', r.usage || null)
		send('end', { ok: true })
	} catch (e: any) {
		send('server_error', { error: e?.message || 'Unknown error' })
	}
})
```

I believe streaming chunked tokens directly from the SDK depends on specific stream support; please verify with the latest OpenAI docs. The pattern above matches our event names used by the web client (`summary`, `result`, `usage`, `server_error`, `end`).

### Client Wiring (Web)

- Use `EventSource` for SSE; it cannot send custom headers. Pass required params via query string.
- Non-stream requests can send `x-api-key` (if used) and `x-user-id` headers.
- Respect `apiBase` from Nuxt runtime config and avoid hardcoding URLs.

### Testing Checklist

- Environment: `.env` has `OPENAI_API_KEY`; API boots on `http://localhost:4000`.
- Permissions: CORS allows your dev origin; rate limit isn’t blocking happy-path.
- Endpoints: verify `/prompt/chat`, `/prompt/chat/stream`, `/prompt/models` respond.
- Error paths: invalid input returns structured errors; server doesn’t crash.
- SSE: events arrive in order; connection closes cleanly after `end`.

### Pitfalls & Tips

- Missing headers for SSE (`text/event-stream`) → client won’t receive events.
- Long-running responses without heartbeats → browsers may drop connections.
- Forgetting to sanitize inputs → prompt injection risks; constrain via `system` messages.
- Cost awareness: track `usage` and cap `max_tokens` early.

---

## Reflection

**What were the biggest integration lessons?**

- Centralize the OpenAI client and per-route helpers for consistency and reuse.
- Be explicit about error contracts (JSON shape, status codes) and keep them uniform.
- Treat SSE as a first-class transport: standardized event names and clean termination.

**Streaming vs non-stream trade-offs?**

- Streaming improves UX for long operations but adds complexity (connection lifecycle, event ordering). Non-stream is simpler to implement and test. Use streaming when feedback matters and outputs are large.

**Security and configuration takeaways**

- Never hardcode keys; use environment variables and accept optional `X-API-Key` headers.
- Configure CORS and rate limits for dev and prod separately; log origin and request counts.
- Validate inputs server-side (e.g., via `express-validator`) to reduce bad requests.

With the SDK and API scaffolding in place, we have a reliable foundation to layer on advanced features in later weeks (context management, memory, and budgeting).
