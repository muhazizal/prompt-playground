# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the repo root unless noted. The repo is a two-package layout: a root package for the API + tests/lint, and a nested `web/` package for the Nuxt app. `npm install` at the root does **not** install web dependencies — you must run `npm install --prefix web` separately (and `npm run postinstall --prefix web` to generate Nuxt types).

- `npm run dev` → runs API (`:4000`) and web (`:3000`) concurrently.
- `npm run api:dev` / `npm run web:dev` → run them individually.
- `npm run lint` / `npm run lint:fix` → flat ESLint over both packages.
- `npm run format` → Prettier check.
- `npm test` → Vitest, runs **both** `api/test/**` and `web/test/**`. The `pretest` script runs `nuxt prepare` so Nuxt type augmentations exist before TS tests compile — if you skip `npm install`'s postinstall the first test run will still bootstrap them.
- Single test: `npx vitest run api/test/agent.route.test.mjs` (or any file path). `npx vitest` (no `run`) starts watch mode.
- `npm run types:client` → regenerates `web/app/helpers/swagger.d.ts` from a **running** API at `localhost:4000/openapi`. Start the API first.

CI (`.github/workflows/test.yml`) installs both packages, runs `nuxt prepare`, then lint + tests with `OPENAI_API_KEY=dummy`. Tests mock the OpenAI SDK, so a real key is never required.

## Architecture

### API (Express, ESM, `api/`)

Layered, no framework conventions — wiring is explicit in `api/server.mjs`:

```
server.mjs              createApp() → middleware → registerXxxRoutes(app)
module/{prompt,agent}.mjs  HTTP layer: validation, auth, SSE, metrics
core/{prompt,agent,memory}.mjs  business logic, OpenAI calls, token budgeting
middleware/             auth, validate, rateLimit, contentType, logging
utils/                  http (sendError/toBool/toNum), llm, planner, usage, firebase
```

Route modules in `module/` only handle the HTTP edge: `express-validator` schemas, `requireApiKey()`, `requireJson()`, rate limiting, metrics increments, and JSON/SSE shaping. All actual work — OpenAI calls, memory access, token budgeting — lives in `core/`. When adding an endpoint, follow this split; do not put OpenAI calls inside `module/`.

**Auth model:** every AI route is wrapped in `requireApiKey()` (`api/middleware/auth.mjs`), which reads `X-API-Key` then falls back to `OPENAI_API_KEY`. Setting `DISABLE_ENV_API_KEY=true` forces header-only mode — tests use this to assert 401s. The selected key is attached as `req.aiApiKey` for downstream handlers; never read `process.env.OPENAI_API_KEY` directly in a route handler.

**Session keys:** `buildSessionKey(req, { sid })` in `core/memory.mjs` prepends `x-user-id` header (when present) to produce `userId:sessionId`. It de-duplicates if `sid` is already prefixed. All memory APIs key off this string — bypassing it breaks per-user isolation.

**Memory store:** `core/memory.mjs` auto-switches between an in-memory `Map` and Firestore based on `MEMORY_STORE=firebase`. The README mentions Redis, but only in-memory and Firestore are implemented. Firestore writes happen inside a transaction that bumps `lastSeq` on the parent `sessions/{key}` doc and writes `sessions/{key}/messages/{seq}`. Session summaries persist on the parent doc under `summary.text`.

**Token budgeting (shared by `/prompt/chat` and the agent):** the canonical pattern is
1. Build the base system message(s) and append any persisted `getSessionSummary`.
2. Concatenate with `getRecentMessages(...)` if `useMemory`.
3. Compute budget = `getModelContextWindow(model) - maxTokens - 1000` (safety), unless `contextBudgetTokens` overrides.
4. If over budget, call `splitMessagesByBudget` → `summarizeOverflowHeuristic` (no extra LLM call — bullet-list of overflow tail) → `setSessionSummary` to persist → fold the summary into the system message → `trimMessagesToTokenBudget` to final-clamp.

When extending this, reuse the helpers in `core/memory.mjs` and `core/prompt.mjs` rather than rolling your own; the heuristic summarizer is deliberately LLM-free for cost.

**Strict JSON contract:** `/prompt/chat` requests `response_format: { type: 'json_object' }` and instructs the model to return `{intent, runs: [{temperature, choices: [{text}]}]}`. The agent uses `{intent, answer, sources[]}` validated by `utils/llm.mjs#validateResultShape`. If you change either schema, update the system instructions and the validator together, and update `module/agent.mjs` callers that destructure `answer`/`sources`.

**Agent tool planning** (`core/agent.mjs`) is purely heuristic via `utils/planner.mjs#planTools` (regex over the prompt) — no LLM planning call. The weather tool requires `WEATHER_API_KEY` and silently no-ops without one. To add a new tool: add a regex flag in `planTools`, a `planXxxTool` function returning `{ result, steps }`, and merge into `toolsContext` + `assembleSources` in `runAgent`.

**SSE streaming** (`/prompt/chat/stream`): event names are `start`, `summary` (incremental chunks), `result` (final text), `usage`, `end`, `server_error`. The web client (`web/app/composables/usePromptStream.ts`) treats `summary` events as token deltas and assembles them into `RunResult.choices[0].text` — the naming is historical and a bit misleading; do not repurpose `summary` for something else without updating the client.

**OpenAPI:** `api/openapi.mjs` is a hand-maintained spec served at `GET /openapi` with Swagger UI at `/docs`. Web types are generated from it via `npm run types:client` into `web/app/helpers/swagger.d.ts`. Update the spec when adding or changing endpoints.

### Web (Nuxt 4, `web/`)

Nuxt 4 `app/` layout. Pages: `/` landing, `/prompt` playground, `/prompt/history`, `/agent`. The app uses `@nuxt/ui` for components; icon names come from bundled iconify collections (`heroicons`, `lucide`, `simple-icons`).

`runtimeConfig.public.apiBase` (default `http://localhost:4000`, overridable via `API_BASE`) is the base for all `$fetch` calls. Composables in `app/composables/` are the API edge:
- `usePromptApi.ts` — POST endpoints for chat / vision / STT / TTS / image gen.
- `usePromptStream.ts` — wraps `EventSource` against `/prompt/chat/stream`.
- `useAgent.ts` — non-streaming `/agent/run` + Firestore history persistence to `miniAgentHistory`.
- `useFirestorePagination.ts` — generic paginated reader used by history views.

When calling the agent from web, `useAgent.send()` passes the user UID via `x-user-id` header so the API's `buildSessionKey` scopes memory correctly.

**Firebase is optional and dual-sided.** Web client uses the public Firebase SDK via `plugins/firebase.client.ts` (anonymous auth + Firestore for history writes). API server uses `firebase-admin` via `api/utils/firebase.mjs` (service account JSON at `api/serviceAccountKey.json` or `FIREBASE_SERVICE_ACCOUNT_FILE`, falls back to ADC). Without these env vars/files, Firestore code paths return null/skip — the app still works end-to-end with the in-memory memory store.

### Firestore collections

History collections (written by the web app, **metadata-only** — never store full base64 audio/image binaries):
`promptTextHistory`, `visionHistory`, `transcriptionHistory`, `ttsHistory`, `imageGenHistory`, `miniAgentHistory`.

Chat memory (written by the API when `MEMORY_STORE=firebase`):
`sessions/{userId:sessionId}` with subcollection `messages/{seq}`.

## Conventions

- ESM only — every API file is `.mjs` with `import`. Don't introduce CommonJS.
- Prettier: no semicolons, single quotes, 2 spaces, 100 cols (`.prettierrc.json`). Some `.mjs` files in `api/` are inconsistently formatted with tabs — match the file you're editing rather than running a sweeping reformat.
- Errors from API routes go through `utils/http.mjs#sendError(res, status, code, error, details?)` for a consistent `{ error, code, details? }` shape. Use codes like `UNAUTHORIZED`, `VALIDATION_ERROR`, `INVALID_INPUT`, `SERVER_ERROR`, `UNSUPPORTED_MEDIA_TYPE`.
- Metrics: bump `metrics.mjs#inc('counter_name')` at the start of each route handler and on each OpenAI call. The counter name must already exist in the `counters` object — `inc` is a no-op for unknown names.
- Tests mock `openai` with `vi.mock('openai', ...)` returning a class with a `chat.completions.create` stub. Follow `api/test/agent.route.test.mjs` as the template; set `NODE_ENV=test` and `OPENAI_API_KEY=test` in `beforeAll`.
- Request body limits default to `5mb` (`JSON_LIMIT`). Vision/STT/TTS endpoints accept large base64 — bump `JSON_LIMIT` rather than hacking around 413s.
