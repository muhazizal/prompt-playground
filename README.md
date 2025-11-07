# prompt-playground

An end-to-end playground for LLM prompting, multimodal experiments (vision, speech, image gen), and a unified Mini Agent that can operate over notes. Built with Nuxt 4, Vue 3, Node.js, Express and OpenAI API.

- Explore tokens, embeddings, and chat via the web UI and API
- Modular API server (prompt and agent) that proxies to OpenAI with metrics
- Nuxt web app with a Playground and a Mini Agent, with optional Firestore history

## Overview

This project helps you learn and experiment with LLM fundamentals and prompt design:

- Explore tokenization and embeddings via the Playground and API
- Try multiple prompting styles and compare outputs
- Run a local API that captures per-run latency and token usage
- Use a web UI to compare outputs across temperatures and samples, and save runs to Firestore
- Explore multimodal capabilities: Image Vision, Image Generation, Speech → Text, and Text → Speech
- Manage context and session memory with budget-aware trimming and overflow summarization
- Stream results via SSE for chat and agent runs, including usage and evaluation events
- Harden the API with auth, validation, rate limiting, structured logging, and metrics

## Project Structure

- `api/` → Express API (ESM modules)
  - `server.mjs` → app bootstrap (CORS, JSON, health)
  - `prompt.mjs` → prompt/Chat, vision, speech, image generation, model list
  - `prompt.mjs` → registers prompt endpoints (chat/models/vision/tts/stt/image-gen)
  - `notes.mjs` → summarization, embeddings, evaluation, caching utilities (retained for agent tools)
  - `module/agent.mjs` → registers agent endpoints (run + stream)
- `web/` → Nuxt web app
  - `app/pages/index.vue` → Landing page (overview + links)
  - `app/pages/prompt/index.vue` → Playground UI (Text, Vision, STT, TTS, Image Gen)
  - Notes UI removed; Mini Agent handles notes actions
  - `app/plugins/firebase.client.ts` → Firebase anonymous auth + Firestore
  - `app/helpers/types.ts` → shared types for results/evaluation

## Tech Stack

- Frontend
  - Nuxt 4, Vue 3, Vite 7, Nitro 2
  - Nuxt UI 4 components (UButton, UCard, USelectMenu, USlider, etc.)
  - Icons via Nuxt Icon (local bundles like `heroicons`, `lucide`)
  - TypeScript with Nuxt-generated `tsconfig` and local augmentations
  - Optional Firebase Firestore integration via a Nuxt plugin
- Backend
  - Node.js with Express and CORS
  - OpenAI SDK client
  - ESM modules (`.mjs`)
- Tooling
  - NPM scripts for API and web dev
  - Dotenv for local configuration
  - Shared HTTP utilities for input normalization in `api/utils/http.mjs` (`toBool`, `toNum`, `safeParseJson`)

## Data Flow

- Web UI → API requests → OpenAI API
- API → Firestore (optional) for run history storage

### Firestore Collections (Standardized)

- `promptTextHistory` → Text generation runs (`HistoryEntry`)
- `visionHistory` → Image vision results (`VisionHistory`)
- `transcriptionHistory` → Speech → Text results (`TranscriptionHistory`)
- `ttsHistory` → Text → Speech requests (`TTSHistory`)
- `imageGenHistory` → Image generation requests (`ImageGenHistory`)

## Setup

- Ensure Node.js is installed.
- Install dependencies: `npm install`
- Create `.env` with your OpenAI API key:

```
OPENAI_API_KEY=your_key_here
```

## NPM Scripts

- `npm run api:dev` → starts API on `http://localhost:4000/`
- `npm run web:dev` → starts Nuxt dev on `http://localhost:3000/` (port may vary)
- `npm run dev` → runs both API and web concurrently
- `npm start` → alias for `npm run dev`

## Web App (Nuxt + Express)

- Start frontend: `npm run web:dev` (Nuxt dev on `http://localhost:3000/`)
- Start API: `npm run api:dev` (Express on `http://localhost:4000/`)
- Combined dev: `npm run dev` (runs both; ports may vary)

Environment:

- Backend: `.env` at repo root
  - `OPENAI_API_KEY=your_key_here`
  - `PORT=4000` (optional; override API port)
  - `JSON_LIMIT=5mb` (optional; increase if sending large base64 image/audio)
  - Optional: `WEB_ORIGIN=http://localhost:3000,http://localhost:3002`
  - Chat memory (optional; Redis-backed)
    - `MEMORY_STORE=redis` (set to `redis` to enable Redis; otherwise file-backed)
    - `REDIS_URL=redis://localhost:6379` (your Redis connection URL)
    - `MEMORY_TTL_SECONDS=86400` (per-session TTL; default 1 day)
    - `MEMORY_MAX_ITEMS=200` (max messages kept per session)
- Frontend: `.env` in `web` (or export vars before running)
  - `API_BASE=http://localhost:4000`
  - `NUXT_PUBLIC_FIREBASE_API_KEY=...`
  - `NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...`
  - `NUXT_PUBLIC_FIREBASE_PROJECT_ID=...`
  - `NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...`
  - `NUXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...`
  - `NUXT_PUBLIC_FIREBASE_APP_ID=...`

### Pages

- Landing: `http://localhost:3000/`
- Prompt Playground: `http://localhost:3000/prompt`
- Prompt History: `http://localhost:3000/prompt/history`
- Agent: `http://localhost:3000/agent`

Features:

- Playground UI with isolated tasks:
  - Text Generation (text-only)
  - Image Vision (image URL or file upload)
  - Image Generation (prompt → image, selectable size)
  - Speech → Text (Whisper)
  - Text → Speech (gpt-4o-mini-tts)
- Model select, max tokens, samples, temperatures
- Temperatures multi-select; compare outputs across temperatures
- Per-run latency and token usage (prompt/completion/total)
- Dynamic `/prompt/models` list (fallback on missing API key)
- Save history to Firestore for: Text Gen, Vision, STT, TTS, and Image Gen (metadata only)
  - Collections: `promptTextHistory`, `visionHistory`, `transcriptionHistory`, `ttsHistory`, `imageGenHistory`
- Mini Agent:
  - Uses notes corpus under `notes/` via `api/core/notes.mjs`
  - Streaming SSE route with `step`, `summary`, `result`, and `usage` events
  - Memory and context budgeting; supports embeddings retrieval over notes

API Endpoints:

- `POST /prompt/chat`
  - Body: `{ prompt, model, maxTokens, n, temperatures }`
  - Returns: `{ runs: Array<{ temperature, choices, usage, durationMs }>, prompt, model, maxTokens }`
- `GET /prompt/chat/stream?prompt=...&model=...&temperature=...&maxTokens=...`
  - Server-Sent Events: `start`, `summary`, `result`, `usage`, `end`, `server_error`
- `POST /prompt/vision`
  - Body: `{ imageUrl?, imageBase64?, prompt?, model?, maxTokens?, temperature? }`
  - Returns: `{ text, usage, model, durationMs }`
- `POST /prompt/image-generation`
  - Body: `{ prompt, model?, size?, format? }`
  - Returns: `{ imageBase64, contentType, model, durationMs, size }`
- `POST /prompt/speech-to-text`
  - Body: `{ audioBase64, model?, language? }`
  - Returns: `{ text, model, durationMs }`
- `POST /prompt/text-to-speech`
  - Body: `{ text, model?, voice?, format? }`
  - Returns: `{ audioBase64, contentType, model, durationMs }`
- `GET /prompt/models`

  - Returns `{ models: Array<{ label, value }> }` from backend or fallback list

- Agent

  - `POST /agent/run`
    - Body: `{ prompt, model?, temperature?, maxTokens?, useMemory?, sessionId?, chain? }`
    - Returns: `{ result: {...}, usage?, durationMs? }`

- System
  - `GET /metrics` → `{ counters: { requests_total, sse_starts_total, openai_calls_total, cache_hits_total } }`
  - `GET /health` → `{ ok: true }`

## Learning Track Notes

- Week 1 (Phase 1): `notes/phase-1-week-1.md` — Prompting fundamentals
- Week 2 (Phase 1): `notes/phase-1-week-2.md` — Embeddings & Retrieval (RAG basics)
- Week 3 (Phase 1): `notes/phase-1-week-3.md` — Orchestration & evaluation
- Week 1 (Phase 2): `notes/phase-2-week-1.md` — API & OpenAI SDK integration, SSE
- Week 2 (Phase 2): `notes/phase-2-week-2.md` — Auth, validation, rate limiting, observability
- Week 3 (Phase 2): `notes/phase-2-week-3.md` — Context management & memory, trimming/summarization

## Notes

- Firestore is optional. If Firebase env vars are not set, saving is skipped.
- The API server now has modular prompt and agent routes. Notes-specific endpoints were removed; the Mini Agent uses `notes.mjs` internally.
- Embeddings caching lives in `cache/embeddings.json` and warms in-memory caches.
- SSE streaming emits usage and evaluation after the result for better UX.
- Large image/audio payloads are supported by increasing JSON limits (`JSON_LIMIT`, default around `5mb`). Prefer URLs for images and compressed audio to keep requests small.

## Cost Estimation

LLM call estimate per run:

```
Cost ≈ (prompt_tokens / 1,000,000) * INPUT_PRICE + (completion_tokens / 1,000,000) * OUTPUT_PRICE
```

- Example (gpt-4o-mini): INPUT ≈ $0.15 / 1M tokens; OUTPUT ≈ $0.60 / 1M.
- Example (gpt-4o): INPUT ≈ $5.00 / 1M; OUTPUT ≈ $15.00 / 1M.

Firestore guidance:

- Store metadata only; avoid large binaries.
- Paginate reads (page size ~10); monitor daily quotas.
- Apply least-privilege rules; segregate user data.

## Screenshots / Demo

- Add screenshots/GIFs under `docs/` and link here (Landing, Playground, Histories, Agent).

## Documentation & Links

- Nuxt: https://nuxt.com/
- Nuxt UI: https://ui.nuxt.com/
- OpenAI SDK: https://github.com/openai/openai-node
- Firebase Firestore: https://firebase.google.com/docs/firestore

## Chat Memory

- Overview

  - Persistent session memory with optional Redis backend and disk fallback at `cache/chat_memory.json`.
  - Model-aware token budget is computed as `contextWindow(model) - maxTokens - safety` (safety ≈ `1000`). Override via `contextBudgetTokens`.
  - Summarization fallback compresses overflow history into a compact system message instead of dropping it.
  - Per-user isolation via `X-User-Id` header; memory keys are `userId:sessionId`.

- Request fields (POST `/prompt/chat`)

  - `useMemory` (boolean) — enable memory.
  - `sessionId` (string) — logical conversation id.
  - `reset` (boolean) — clear session before the run.
  - `memorySize` (int) — max recent messages fetched from store.
  - `contextBudgetTokens` (int) — override budget; otherwise computed per model.
  - `context` (object) — arbitrary data wired into a system message via `serializeContextToSystem(context)`.
  - `summarizeOverflow` (boolean) — summarize trimmed history into a system message.
  - `summaryMaxTokens` (int) — token cap for summary generation.

- Headers

  - `X-API-Key` — OpenAI API key (or use `OPENAI_API_KEY` in env).
  - `X-User-Id` — optional user id to isolate memory across users.
  - `X-Session-Id` — optional session id header if not using body `sessionId`.

- Redis configuration (optional)
  - Set `MEMORY_STORE=redis` and `REDIS_URL=redis://...` to enable Redis.
  - Use `MEMORY_TTL_SECONDS` to enforce per-session auto-expiration.
  - Use `MEMORY_MAX_ITEMS` to cap list size per session; older entries are trimmed.

### Examples

```bash
# Basic chat with memory
curl -s -X POST http://localhost:4000/prompt/chat \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Hi, I am Bob.","useMemory":true,"sessionId":"readme-demo"}' | jq
curl -s -X POST http://localhost:4000/prompt/chat \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Remind me of my name","useMemory":true,"sessionId":"readme-demo"}' | jq

# Per-user isolation (headers)
curl -s -X POST http://localhost:4000/prompt/chat \
  -H 'Content-Type: application/json' \
  -H 'X-User-Id: user123' \
  -H 'X-Session-Id: project-alpha' \
  -d '{"prompt":"Track my tasks","useMemory":true}' | jq

# Context wiring (serialized into a system message)
curl -s -X POST http://localhost:4000/prompt/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt":"Summarize next steps",
    "useMemory":true,
    "sessionId":"ctx-demo",
    "context": {"project":"ACME","userPreferences":{"tone":"friendly"}}
  }' | jq

# Model-aware budget override and summarization fallback
curl -s -X POST http://localhost:4000/prompt/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt":"Continue",
    "useMemory":true,
    "sessionId":"big-convo",
    "contextBudgetTokens": 4000,
    "summarizeOverflow": true,
    "summaryMaxTokens": 128
  }' | jq

# Reset memory
curl -s -X POST http://localhost:4000/prompt/chat \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Start fresh","useMemory":true,"sessionId":"readme-demo","reset":true}' | jq

# Streaming with memory and summarization
curl -s -N 'http://localhost:4000/prompt/chat/stream?prompt=Hello&model=gpt-4o-mini&temperature=0.2&maxTokens=128&useMemory=true&sessionId=stream-demo&summarizeOverflow=true&summaryMaxTokens=128'
```

## Quick Tests

```bash
# Models list (fallback if no OPENAI_API_KEY)
curl -s http://localhost:4000/prompt/models | jq

# Chat with two temperatures
curl -s -X POST http://localhost:4000/prompt/chat \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Explain embeddings in 2 sentences","temperatures":[0.2,0.7],"n":1,"maxTokens":120}' | jq

# Chat with memory enabled
curl -s -X POST http://localhost:4000/prompt/chat \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Hi, I am Bob.","useMemory":true,"sessionId":"readme-demo"}' | jq
curl -s -X POST http://localhost:4000/prompt/chat \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Remind me of my name","useMemory":true,"sessionId":"readme-demo"}' | jq

# Stream chat (SSE)
curl -s -N 'http://localhost:4000/prompt/chat/stream?prompt=Say%20hi&model=gpt-4o-mini&temperature=0.2&maxTokens=64'

# Vision: describe an image via URL
curl -s -X POST http://localhost:4000/prompt/vision \
  -H 'Content-Type: application/json' \
  -d '{"imageUrl":"https://picsum.photos/seed/cat/512","prompt":"Describe","maxTokens":200}' | jq

# Image Generation
curl -s -X POST http://localhost:4000/prompt/image-generation \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"A watercolor landscape","size":"512x512"}' | jq '.imageBase64 | length'

# Speech → Text (audio base64 required)
# Note: replace AUDIO_B64 with a small base64-encoded mp3/wav data URL or plain base64
curl -s -X POST http://localhost:4000/prompt/speech-to-text \
  -H 'Content-Type: application/json' \
  -d '{"audioBase64":"AUDIO_B64"}' | jq

# Text → Speech
curl -s -X POST http://localhost:4000/prompt/text-to-speech \
  -H 'Content-Type: application/json' \
  -d '{"text":"Hello there","voice":"alloy"}' | jq '.audioBase64 | length'


# Agent: minimal run
curl -s -X POST http://localhost:4000/agent/run \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Plan a todo list","useMemory":true,"sessionId":"agent-demo"}' | jq

# Metrics & Health
curl -s http://localhost:4000/metrics | jq
curl -s http://localhost:4000/health | jq
```
