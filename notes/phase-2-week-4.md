## Phase 2 – Week 4: AI Product Thinking

Topics:

- Design patterns: tools, actions, chains
- Cost optimization & monitoring
- Real-world prompt debugging and refinement workflow

Learning Goals:

- Combine tools, memory, and APIs
- Build structured, reliable AI endpoints
- Optimize for cost + performance

Mini Theory:

- Think of the model as an intelligent microservice.
- Inputs → Context → Model → Outputs → Post-processing.

---

## Design Patterns

- Tools: encapsulated functions that fetch data or perform transformations (e.g., weather API, docs search).
- Actions: small, composable units (resolve user intent, gather context, call tool, call model).
- Chains: orchestrated sequence of actions that produce reliable outputs under constraints.

Example chain:

1. Parse intent → 2) Gather memory → 3) Run tools in parallel → 4) Build system/context → 5) Call model → 6) Validate/shape output → 7) Persist & return.

See `examples/mini_agent.mjs` for a runnable implementation.

---

## Cost Optimization & Monitoring

- Token Budgeting:
  - Compute `budget = contextWindow(model) - maxTokens - safety`.
  - Trim memory with `trimMessagesToTokenBudget`; prefer summarization only when needed.
- Usage Tracking:
  - Capture `usage.prompt_tokens`, `usage.completion_tokens`, and compute cost with a simple price map.
  - Log per-run `durationMs` and `steps` to diagnose slow paths.
- Model Selection:
  - Prefer `gpt-4o-mini` for most flows; reserve larger models for high-complexity tasks.
- Temperatures & n:
  - Keep temperature low for deterministic outputs; multi-sample only when ranking improves UX enough to justify cost.

---

## Debugging & Refinement Workflow

- Reproducibility:
  - Log the exact messages array, model, temperature, and `max_tokens`.
  - Save the structured output and sources for audit.
- Prompt Hygiene:
  - Use concise system messages; add tool context via a single serialized system message.
  - Prefer strict JSON in the final step when structure matters; parse defensively.
- Iteration:
  - Start with minimal context; add tools incrementally.
  - Capture failures with clear error messages; avoid crashing the chain.

---

## Final Challenge

Build a “Mini AI Agent” — a modular Node.js app that can:

- Chat
- Retrieve context from memory
- Call an external API (e.g., weather or docs)
- Return a structured JSON response

Runnable example:

```bash
node examples/mini_agent.mjs --prompt "What’s the weather in London and Summarize phase-1 week-2 notes." --sessionId week4 --temp 0.2 --max 256
```

Outputs include:

- `intent`: chosen path (chat | weather | docs)
- `answer`: model content
- `sources`: tool references (API URLs or note files)
- `usage`: tokens
- `costUsd`: approximate cost
- `steps`: trace of actions for debugging

---

## Testing Checklist

- Memory:
  - Run twice with the same `sessionId`; verify the assistant remembers context.
  - Verify token trimming is applied when history grows.
- Tools:
  - Weather: provide a `--weather "City"` override; confirm API call and source.
  - Docs: ask about “Phase 2 – Week 2” and confirm snippets from local notes.
- Structure:
  - Ensure the agent returns a JSON object with `intent`, `answer`, `sources`, `usage`, `costUsd`, `durationMs`, and `steps`.
- Cost/Monitoring:
  - Inspect `usage` and `durationMs`; compare across temperatures or `maxTokens`.
- Failure Handling:
  - Disconnect from the network temporarily; confirm the agent degrades gracefully and still returns a structured response.

---

## Reflection

**Combining tools and memory**

- Serialize tool outputs into a single context system message to avoid noisy prompts.
- Use conservative budgets; trim history first, then summarize if absolutely necessary.

**Reliability first**

- Always return well-structured JSON, even on failures, with `error` fields populated.
- Prefer deterministic parameters for agent-like tasks; use higher temperature only when creativity is required.

**Cost vs. performance**

- Track token usage and latency per run; throttle if usage spikes.
- Choose models by task complexity; avoid “bigger model by default” thinking.

With tools, memory, and structured outputs, the agent becomes a reliable microservice that can grow into more complex workflows without losing control of cost or behavior.

---

## Questions & Applied Reflections

### How could you modularize this agent for new tools (e.g., news, calendar)?

- Define a small Tool contract and a registry that the planner can use to discover and run tools based on `intent` or tags.
- Keep each tool self-contained: input schema, `run()` implementation, and a structured output with `summary` and `sources` so downstream steps can serialize cleanly.
- Run tools in parallel when they are independent; dedupe sources before surfacing to the model and UI.

Example (TypeScript) — lightweight tool interface and registry:

```ts
// tools/types.ts
export type Source = { key: string; title?: string; url?: string; file?: string; score?: number; snippet?: string };
export type ToolOutput = { summary: string; sources: Source[]; data?: unknown; error?: string };

export type ToolArgs = Record<string, unknown>;
export type Tool = {
  name: string;
  intentTags: string[]; // e.g., ["news", "current_events"], ["calendar", "schedule"]
  run: (client: unknown, args: ToolArgs) => Promise<ToolOutput>;
};

// tools/registry.ts
const registry: Record<string, Tool> = {};
export function registerTool(tool: Tool) { registry[tool.name] = tool; }
export function getToolsForIntent(intent: string): Tool[] {
  return Object.values(registry).filter(t => t.intentTags.includes(intent));
}
export function getAllTools() { return Object.values(registry); }

// Simple source dedupe by key (file/url/title)
export function dedupeSources(sources: Source[]): Source[] {
  const map = new Map<string, Source>();
  for (const s of sources) {
    const key = s.key || s.file || s.url || s.title || Math.random().toString(36);
    const prev = map.get(key);
    if (!prev) map.set(key, s);
    else {
      // prefer richer entry
      const richer = (s.snippet ? 1 : 0) + (s.score ?? 0) > (prev.snippet ? 1 : 0) + (prev.score ?? 0);
      map.set(key, richer ? s : prev);
    }
  }
  return Array.from(map.values());
}
```

Example tools:

```ts
// tools/news.ts
import type { Tool, ToolOutput } from './types';

export const newsTool: Tool = {
  name: 'news',
  intentTags: ['news', 'current_events'],
  async run(_client, args): Promise<ToolOutput> {
    const topic = String(args.topic ?? 'technology');
    // Replace with a real API call (guard secrets via env)
    const articles = [
      { title: `Latest on ${topic}`, url: 'https://example.com/news/latest' },
    ];
    return {
      summary: `Fetched ${articles.length} ${topic} article(s).`,
      sources: articles.map(a => ({ key: a.url, title: a.title, url: a.url })),
      data: { articles },
    };
  }
};

// tools/calendar.ts
import type { Tool, ToolOutput } from './types';

export const calendarTool: Tool = {
  name: 'calendar',
  intentTags: ['calendar', 'schedule'],
  async run(_client, args): Promise<ToolOutput> {
    const userId = String(args.userId ?? 'anonymous');
    // Replace with Calendar API (Google, CalDAV) and OAuth
    const events = [
      { title: 'Team Sync', start: '2025-11-07T10:00:00Z' },
      { title: 'Planning', start: '2025-11-08T14:00:00Z' },
    ];
    return {
      summary: `Loaded ${events.length} upcoming events for ${userId}.`,
      sources: events.map((e, i) => ({ key: `event:${i}`, title: e.title })),
      data: { events },
    };
  }
};
```

Planner integration (simplified):

```ts
// agent/toolsRunner.ts
import { getToolsForIntent, dedupeSources } from './tools/registry';

export async function runToolsForIntent(intent: string, client: unknown, args: Record<string, unknown>) {
  const tools = getToolsForIntent(intent);
  const outputs = await Promise.all(tools.map(t => t.run(client, args).catch(err => ({ summary: '', sources: [], error: String(err) }))));
  const sources = dedupeSources(outputs.flatMap(o => o.sources));
  const summary = outputs.map(o => o.summary).filter(Boolean).join('\n');
  return { summary, sources, outputs };
}
```

Key practices:

- Keep tool outputs small and structured; the planner serializes them into a single system context to keep prompts clean.
- Prefer deterministic parameters for tool-backed answers; only raise temperature for creative tasks.
- Tag tools by intent and avoid redundant calls for pure list/titles queries (skip semantic search when lists suffice).

### How might you persist state across sessions?

- Use a stable session key and a memory store abstraction; swap implementations without changing agent logic.
- Options: file-backed JSON (already present), Redis for durable shared state, or a DB schema (SQLite/Postgres) for auditability.
- Persist both raw messages and summarized context; trim by token budget and snapshot summaries to keep costs stable.

Interfaces and patterns:

```ts
// memory/types.ts
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string; ts?: number };
export type MemorySummary = { text: string; ts?: number };

export interface MemoryStore {
  getMessages(sessionKey: string): Promise<ChatMessage[]>;
  appendMessage(sessionKey: string, msg: ChatMessage): Promise<void>;
  getSummary(sessionKey: string): Promise<MemorySummary | null>;
  setSummary(sessionKey: string, summary: MemorySummary): Promise<void>;
  trimToTokenBudget(sessionKey: string, model: string, maxContextTokens: number): Promise<void>;
}

export function buildSessionKey(userId: string | undefined, agentId: string | undefined, sessionId: string | undefined) {
  const uid = userId?.trim() || 'anon';
  const aid = agentId?.trim() || 'mini-agent';
  const sid = sessionId?.trim() || 'default';
  return `${uid}:${aid}:${sid}`;
}
```

Example Redis-backed store:

```ts
// memory/redisStore.ts
import type { MemoryStore, ChatMessage, MemorySummary } from './types';
import Redis from 'ioredis';

export function createRedisStore(url = process.env.REDIS_URL || 'redis://localhost:6379'): MemoryStore {
  const redis = new Redis(url);
  const keyMsgs = (s: string) => `chat:${s}:msgs`;
  const keySum = (s: string) => `chat:${s}:summary`;

  return {
    async getMessages(s) {
      const raw = await redis.lrange(keyMsgs(s), 0, -1);
      return raw.map(r => JSON.parse(r) as ChatMessage);
    },
    async appendMessage(s, msg) {
      await redis.rpush(keyMsgs(s), JSON.stringify({ ...msg, ts: Date.now() }));
    },
    async getSummary(s) {
      const raw = await redis.get(keySum(s));
      return raw ? (JSON.parse(raw) as MemorySummary) : null;
    },
    async setSummary(s, summary) {
      await redis.set(keySum(s), JSON.stringify({ ...summary, ts: Date.now() }));
    },
    async trimToTokenBudget(_s, _model, _max) {
      // Implement token counting and trimming (e.g., keep last N messages, then summarize)
    }
  };
}
```

Operational tips:

- Store secrets in environment variables (`REDIS_URL`, OAuth credentials) and never hard-code keys.
- Use TTLs or archival policies for old sessions; run a summarizer job to keep memory size bounded.
- Log `usage` and `durationMs` per run; monitor spikes and throttle if needed.
- Ensure graceful degradation: if the store is down, fall back to local cache and still return structured JSON with `error` populated.
