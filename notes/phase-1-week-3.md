## Phase 1 – Week 3: Prompt Orchestration & Evaluation

This week builds on prompting fundamentals by orchestrating multi‑sample runs, ranking outputs, enforcing formats (e.g., JSON), and measuring quality. The goal is more reliable results through structure, sampling, and lightweight evaluation.

### Objectives

- Run prompts across multiple temperatures or samples and pick the best.
- Define output formats (JSON/text) and validate results.
- Rank outputs with simple, task‑specific heuristics or rubrics.
- Track token usage and cost when sampling (n > 1).

### Key Concepts

- **Multi‑sampling**: Generate several candidates (vary temperature or run count) and select best.
- **Ranking**: Score candidates with heuristics (keyword coverage, structure, length bounds) or a rubric.
- **Formatting**: Ask for JSON (or markdown sections) and validate; retry on failure.
- **Budget awareness**: Sampling multiplies prompt tokens and cost; cap `max_tokens` and samples.

### Minimal Runnable Example (Node.js)

```ts
// Orchestrate multiple temperatures, rank by simple heuristic, choose best
import OpenAI from 'openai'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const SYSTEM = 'You are a release notes assistant. Be concise and accurate.'
const USER = 'Draft release notes for v1.2. Focus on API changes and breaking changes.'

const temperatures = [0.2, 0.5, 0.8]

// Generate candidates
const runs = await Promise.all(
  temperatures.map(async (t) => {
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: t,
      max_tokens: 240,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: USER },
      ],
    })
    const text = res.choices?.[0]?.message?.content ?? ''
    return { temperature: t, text }
  })
)

// Heuristic scorer: favors presence of key terms & reasonable length
function score(text: string): number {
  const keys = ['API', 'breaking', 'changes']
  const keyScore = keys.reduce((s, k) => s + (text.toLowerCase().includes(k.toLowerCase()) ? 1 : 0), 0)
  const len = text.split(/\s+/).length
  const lengthPenalty = len > 260 ? 0.5 : len < 60 ? 0.7 : 1.0
  return keyScore * lengthPenalty
}

const ranked = runs
  .map((r) => ({ ...r, score: score(r.text) }))
  .sort((a, b) => b.score - a.score)

const best = ranked[0]
console.log('Selected temperature:', best.temperature)
console.log('\nRelease notes:\n', best.text)
```

### Implementation Steps

1. **Sampling Strategy**: Decide temperatures (e.g., 0.2/0.5/0.8) or `n` samples at one temperature.
2. **Heuristics**: Encode task‑specific checks (keywords, section headers, length bounds, JSON validity).
3. **Retry Loop**: If the best candidate fails format checks, optionally re‑prompt with stricter instructions.
4. **Usage Tracking**: Log prompt/completion tokens and estimate cost to cap sampling.
5. **Persistence**: Save prompts, candidates, and final selection for auditability.

### Repo Pointers

- `examples/chat_prompting.mjs`: multi‑temperature runs and candidate handling.
- `examples/prompt_engineering.mjs`: stronger templates and constraints for consistency.
- `examples/tokenization.mjs`: inspect token counts and set budgets.
- `web/app/pages/prompt/index.vue`: UI supports temperature selection and streaming.
- `api/module/prompt.mjs`: server orchestration for `chatWithTemperatures`.

### Testing Checklist

- Verify candidates obey format (JSON/sections) and constraints (length, tone).
- Check coverage (contains key terms) and clarity (no filler, correct headings).
- Adjust temperatures or sample size if candidates look too similar or too random.
- Monitor `usage` and cost; reduce `max_tokens` or samples if needed.

### Reflection

**How do we pick temperatures and sample size?**
- Use low temperatures (0.2–0.4) for deterministic tasks; add 1–2 higher temps (0.6–0.8) for diversity. Start with 2–3 candidates; increase only if selection quality is weak.

**How do we evaluate outputs effectively?**
- Create a lightweight rubric (coverage, correctness, structure, concision). Score each candidate and choose the best. Enforce formatting via JSON or markdown sections and reject/repair invalid outputs.

**What’s the cost impact of sampling?**
- Sampling multiplies prompt tokens and completion tokens by the number of candidates. Cap `max_tokens`, track `usage`, and prefer heuristics that quickly filter/accept to limit retries.

**Common pitfalls**
- No explicit format → hard to compare candidates.
- Over‑sampling → high cost with marginal gains.
- Vague instructions → inconsistent outputs even after ranking.

With orchestration and evaluation in place, you can consistently select high‑quality outputs while keeping costs under control.

