## Phase 1 – Week 1: Prompting Fundamentals

This week lays the foundation for effective LLM prompting: understanding prompt anatomy, key generation parameters, tokenization and budgeting, and repeatable prompt patterns that improve reliability.

### Objectives

- Learn the structure of a good prompt (system → instructions → inputs → constraints).
- Control output style and variability with `temperature`, `top_p`, and `max_tokens`.
- Reason about tokens and budgets; avoid truncation and runaway costs.
- Apply reusable prompt templates for common tasks (summarize, extract, transform).

### Key Concepts

- **Prompt Anatomy**
  - `system` (role): persona, task framing, safety and tone.
  - `user` (role): the actual request and inputs.
  - `assistant` (role): optional prior responses when iterating.
- **Parameters**
  - `temperature`: randomness (lower = more deterministic). Start at `0.2–0.5` for utility tasks.
  - `top_p`: nucleus sampling; usually keep default unless you have specific needs.
  - `max_tokens`: cap for the completion; balances cost, latency, and truncation risk.
  - `n`: number of samples/runs; useful for choosing among alternatives in brainstorming.
- **Tokenization**
  - Models operate on tokens; both prompt and completion consume tokens.
  - Budget planning prevents truncation and controls cost (prompt + completion ≤ model limit).

### Minimal Runnable Example (Node.js)

```ts
// Chat completion with system+user, deterministic output and a token cap
import OpenAI from 'openai'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const res = await client.chat.completions.create({
	model: 'gpt-4o-mini',
	temperature: 0.3,
	max_tokens: 300,
	messages: [
		{ role: 'system', content: 'You are a concise assistant for sprint planning.' },
		{ role: 'user', content: 'List three risks for the current sprint and short mitigations.' },
	],
})

console.log(res.choices?.[0]?.message?.content || '')
```

### Prompt Patterns (Templates)

- **Summarize**: “Summarize the following in ≤ N words. Focus on X. Avoid Y.”
- **Extract**: “From the text, return a JSON with fields A, B, C. If missing, use null.”
- **Transform**: “Rewrite in professional tone. Preserve facts. Remove filler.”
- **Compare & Decide**: “Given options, choose best for criteria C. Return a short rationale.”
- **Checklists**: “Output a checklist for deploying service S. Include prerequisites and validation steps.”

### Budgeting & Safety

- Start conservative: prompt ≤ 800 tokens, completion ≤ 300 for utility tasks.
- Avoid free-form, unbounded outputs; specify count, format, and scope.
- Use JSON outputs when you plan to post-process; validate schema.
- Add guardrails in `system`: “If unsure, ask for clarification. Do not invent facts.”

### Hands-on (Repo Examples)

- `examples/chat_prompting.mjs`: multi-temperature runs and structured prompts.
- `examples/prompt_engineering.mjs`: patterns and constraints for reliable style and formatting.
- `examples/tokenization.mjs`: inspect token counts for inputs/outputs and plan budgets.

---

## Reflection

### What did we learn about controlling output quality?

- Clear instructions + constraints in the `system` dramatically improve consistency.
- Lower `temperature` makes outputs predictable; increase only for ideation.
- JSON/structured outputs simplify downstream processing and validation.

### How do we balance determinism vs creativity?

- Split tasks: use low `temperature` for fact-bound or checklist tasks; use higher `temperature` for brainstorming and variations.
- When sampling (`n > 1`), choose the best from multiple candidates; log usage to watch cost.

### How should we think about tokens and budgets in Week 1?

- Track prompt and completion sizes; set caps to avoid truncation and cost surprises.
- If outputs truncate, either increase `max_tokens` or reduce input verbosity (or summarize inputs first).
- Prefer iterative refinement: small, bounded steps over single large, unbounded calls.

### Pitfalls to avoid early on

- Vague prompts without constraints → inconsistent outputs.
- Large prompts without budgets → high latency and cost.
- No formatting spec → hard-to-parse responses.

With these fundamentals, we can build reliable prompt flows and set the stage for context management and memory in later phases.
