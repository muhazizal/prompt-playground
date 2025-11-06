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
node examples/mini_agent.mjs --prompt "What is the weather and what did we learn last week?" --sessionId week4 --temp 0.2 --max 256
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
