## Week 3 – Context Management & Memory

This week focuses on designing robust context management for LLM calls and introducing lightweight memory so assistants can build up useful state across runs, while staying within model token budgets.

### Goals

- Control what the model sees using structured context, not just free-form prompts.
- Keep conversations/notes coherent via per-session memory with size limits.
- Respect model token budgets with model-aware trimming and overflow summarization.

### Core Concepts

- **Context (static inputs):** Domain info, user persona, constraints, task descriptors. Passed as a JSON object and serialized into a `system` message.
- **Memory (dynamic history):** Prior messages or summaries kept per `sessionId`, bounded by `memorySize`, optionally resettable.
- **Model-aware budgeting:** Calculate and trim messages to fit model limits; summarize overflow chunks to preserve salient info.

### Server Helpers (api/core/memory.mjs)

- `appendMessage(sessionId, message)` – persist a single message to a session.
- `getRecentMessages(sessionId, limit)` – fetch recent history bounded by `memorySize`.
- `clearSession(sessionId)` – wipe memory for a session.
- `countMessagesTokens(messages, model)` – estimate token usage for a message array.
- `splitMessagesByBudget(messages, budgetTokens, model)` – partition messages by token budget.
- `trimMessagesToTokenBudget(messages, budgetTokens, model)` – trim while keeping the most relevant parts.
- `serializeContextToSystem(context)` – convert context JSON to a concise `system` message.

These enable: building the message list, enforcing budgets, and optionally summarizing overflow.

### Routes & Parameters

Both Prompt (chat) and Notes endpoints accept shared context/memory controls:

- `useMemory` (boolean): enable session memory.
- `sessionId` (string): session key; clients may prefix with user id (e.g., `uid:notes`).
- `reset` (boolean): clear memory before run.
- `memorySize` (number): max historical messages/summaries to include.
- `context` (object): JSON context, serialized as `system`.
- `contextBudgetTokens` (number): max tokens for context/message prep.
- `summarizeOverflow` (boolean): summarize trimmed overflow.
- `summaryMaxTokens` (number): token cap for overflow summaries.

#### Prompt (Chat)

- POST `POST /prompt/chat` – non-stream; supports temperatures and returns runs.
- SSE `GET /prompt/chat/stream?...` – stream `summary`, `result`, `usage`, `server_error`, `end`.

Example (non-stream):

```ts
// Minimal example using $fetch (or fetch)
await $fetch(`${apiBase}/prompt/chat`, {
	method: 'POST',
	body: {
		prompt: 'Summarize the sprint goals',
		model: 'gpt-4o-mini',
		maxTokens: 300,
		n: 1,
		temperatures: [0.3],
		useMemory: true,
		sessionId: 'notes', // consider prefixing with user id
		memorySize: 30,
		context: { project: 'Acme', audience: 'engineers' },
		contextBudgetTokens: 800,
		summarizeOverflow: true,
		summaryMaxTokens: 200,
	},
})
```

#### Notes Assistant

- POST `POST /notes/process` – batch summarize selected files.
- SSE `GET /notes/summarize-stream?path=<file>` – real-time streaming for a single file.

Example (stream):

```ts
const sid = 'notes' // or `${uid}:notes` when auth is available
let url = `${apiBase}/notes/summarize-stream?path=${encodeURIComponent('phase-2.md')}`
url += `&useMemory=${encodeURIComponent('true')}`
url += `&sessionId=${encodeURIComponent(sid)}`
url += `&memorySize=${encodeURIComponent(30)}`
url += `&summarizeOverflow=${encodeURIComponent('true')}`
url += `&summaryMaxTokens=${encodeURIComponent(200)}`
url += `&contextBudgetTokens=${encodeURIComponent(800)}`
url += `&context=${encodeURIComponent(JSON.stringify({ project: 'Acme', noteType: 'meeting' }))}`

const es = new EventSource(url)
es.addEventListener('summary', (ev) => {
	/* chunked text */
})
es.addEventListener('result', (ev) => {
	/* final summary + tags */
})
es.addEventListener('evaluation', (ev) => {
	/* quality metrics */
})
es.addEventListener('usage', (ev) => {
	/* token counts */
})
es.addEventListener('end', () => es.close())
```

### Client Integration (Web)

- Prompt page (`web/app/pages/prompt/index.vue`): A “Context & Memory” section for Text Generation exposes all controls above; both POST and SSE wire them through. Non-stream sends `x-user-id` header when available; SSE embeds `sessionId` in the query.
- Notes page (`web/app/pages/notes/index.vue`): Similar controls between Tag Set and Action Buttons; POST and SSE include the same parameters. Summaries save to Firestore keyed by filename.

### Testing Checklist

- Toggle `useMemory` on/off; verify history inclusion across runs.
- Change `sessionId`; confirm isolated memory.
- Use `reset`; confirm memory cleared before the next run.
- Set `contextBudgetTokens` small (e.g., 200) and enable `summarizeOverflow`; verify overflow summaries and that results still make sense.
- Inspect `usage` events; validate token counts and cost estimates.

### Pitfalls & Tips

- **SSE headers:** `EventSource` cannot send custom headers; include `sessionId` in the query (prefix with user id if available).
- **Context JSON:** Must be valid JSON; clients should parse and fail gracefully.
- **Token budgets:** Large budgets increase cost and latency; start conservative.
- **Security:** Don’t embed secrets in context; prefer environment config for API keys.

With these controls, assistants maintain coherence and relevance while staying within model limits, and you retain fine-grained control over cost and quality.

---

## Reflection

### How can you trim history once it grows too long?

- Prefer token-aware trimming over message-count-only limits. Estimate tokens for the current `system` context + recent memory + user input, then trim to a target budget.
- Keep the `system` context and the most recent messages; summarize older overflow into a short “prior summary” that preserves goals, decisions, and constraints.
- Pin critical facts (requirements, IDs, rules) in the `system` context so they aren’t lost during trimming.
- Use hierarchical summaries: summarize in chunks, then summarize those summaries if needed.
- Reset selectively: allow `reset` per session to clear stale history for a fresh run.

Example strategy (pseudocode):

```ts
// Build messages and enforce a token budget
const messages = [serializeContextToSystem(context), ...recentHistory, currentUserMessage]
const budget = contextBudgetTokens ?? autoBudget(model) // choose per-model default

// Partition within-budget vs overflow (older messages first)
const { withinBudget, overflow } = splitMessagesByBudget(messages, budget, model)

let finalMessages = withinBudget
if (overflow.length && summarizeOverflow) {
	// Summarize overflow into a short gist
	const gist = await summarizeMessages(overflow, { maxTokens: summaryMaxTokens, model })
	finalMessages = [
		serializeContextToSystem(context),
		{ role: 'assistant', content: `Prior summary: ${gist}` },
		...withinBudget.filter((m) => m.role !== 'system'),
	]
}

// Proceed with model call using finalMessages
```

This approach: preserves recency, compresses distant history, and stays within budget.

### What’s the balance between memory depth and token cost?

- Deeper memory improves coherence but increases prompt tokens (and latency/cost). Aim for a sweet spot where critical context is retained and noise is summarized.
- Practical ranges:
  - Chat: `memorySize` ≈ 25–50 messages, `contextBudgetTokens` ≈ 800–1,600, `summaryMaxTokens` ≈ 128–256.
  - Notes: `memorySize` ≈ 10–30 summaries, `contextBudgetTokens` ≈ 400–800, `summaryMaxTokens` ≈ 64–128.
- Dynamically adapt: if `usage.total_tokens` exceeds a threshold, reduce `memorySize` or increase summarization aggressiveness.
- Separate anchors from history: keep persona, constraints, and key facts in the `system` context; use memory for temporal conversation/notes.
- Cost estimation (example):
  ```ts
  // Verify vendor pricing; values below are illustrative.
  const PRICE = { inputPerM: 0.15, outputPerM: 0.6 } // gpt-4o-mini
  const cost =
  	(promptTokens / 1_000_000) * PRICE.inputPerM + (completionTokens / 1_000_000) * PRICE.outputPerM
  ```
- Team policy tip: set caps (e.g., prompt ≤ 1,200 tokens, completion ≤ 400 tokens) and enforce via trimming before every call.

In practice, start conservative, monitor `usage`, and tune `memorySize` and budgets until coherence gains outweigh marginal token costs.
