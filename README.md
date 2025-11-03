# prompt-playground

An end-to-end playground for LLM prompting and notes summarization.

- CLI demos for tokens, embeddings, and chat prompting
- Modular API server (prompt and notes) that proxies to OpenAI with metrics
- Nuxt web app with a Notes Assistant (batch and streaming) and Firestore history

## Overview

This project helps you learn and experiment with LLM fundamentals and prompt design:

- Explore tokenization and embeddings from the CLI
- Try multiple prompting styles and compare outputs
- Run a local API that captures per-run latency and token usage
- Use a web UI to compare outputs across temperatures and samples, and save runs to Firestore

## Project Structure

- `cli.mjs` → Main CLI entry point
- `api/` → Express API (ESM modules)
  - `server.mjs` → app bootstrap (CORS, JSON, health)
  - `prompt-core.mjs` → prompt/Chat and model-list logic
  - `prompt.mjs` → registers prompt endpoints (chat/models)
  - `notes-core.mjs` → summarization, embeddings, evaluation, caching utilities
  - `notes.mjs` → registers notes endpoints (list/process/summarize/stream, tags)
- `web/` → Nuxt web app
  - `app/pages/notes.vue` → Notes Assistant UI
  - `app/plugins/firebase.client.ts` → Firebase anonymous auth + Firestore
  - `app/helpers/types.ts` → shared types for results/evaluation
- `examples/` → Sample scripts for CLI demos

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
  - NPM scripts for CLI, examples, API, and web dev
  - Dotenv for local configuration

## Data Flow

- Web UI → API requests → OpenAI API
- API → Firestore (optional) for run history storage

## Setup

- Ensure Node.js is installed.
- Install dependencies: `npm install`
- Create `.env` with your OpenAI API key:

```
OPENAI_API_KEY=your_key_here
```

## CLI Usage

- Help: `node cli.mjs --help`
- Tokenization: `node cli.mjs tokens --text "Hello LLMs"` (no API key needed)
- Chat demo: `node cli.mjs chat --mode role` (requires `OPENAI_API_KEY`)
- Embeddings demo: `node cli.mjs embed --query "What is semantic search?"`

Options:

- Chat: `--mode role|iter|embed` `--model gpt-4o-mini` `--temp 0.3` `--max 100`
- Embeddings: `--model text-embedding-3-small` `--docs "doc1|doc2|doc3"`
- Tokens: `--tokenizer cl100k_base` `--text "..."`

## Interactive Mode

- Menu: `node cli.mjs interactive`
- Auto-prompt: run any command without options to be asked for inputs
  - Examples: `node cli.mjs tokens`, `node cli.mjs chat`, `node cli.mjs embed`, `node cli.mjs prompt`
  - You’ll be prompted for the relevant fields (text, mode, query, template, labels, etc.)

## NPM Scripts

- `npm run demo` → runs the CLI (same as `node cli.mjs`)
- `npm run demo:interactive` → launches the interactive menu
- `npm run demo:tokens` → `node examples/tokenization.mjs`
- `npm run demo:chat` → `node examples/chat_prompting.mjs`
- `npm run demo:embeddings` → `node examples/embeddings.mjs`
- `npm run demo:prompt` → `node examples/prompt_engineering.mjs`
- `npm run demo:notes` → `node examples/notes_summarization.mjs`

## Web App (Nuxt + Express)

- Start frontend: `npm run web:dev` (Nuxt dev on `http://localhost:3002/`)
- Start API: `npm run api:dev` (Express on `http://localhost:4000/`)
- Combined dev: `npm run dev` (runs both; ports may vary)

Environment:

- Backend: `.env` at repo root
  - `OPENAI_API_KEY=your_key_here`
  - Optional: `WEB_ORIGIN=http://localhost:3000,http://localhost:3002`
- Frontend: `.env` in `web` (or export vars before running)
  - `NUXT_PUBLIC_FIREBASE_API_KEY=...`
  - `NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...`
  - `NUXT_PUBLIC_FIREBASE_PROJECT_ID=...`
  - `NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...`
  - `NUXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...`
  - `NUXT_PUBLIC_FIREBASE_APP_ID=...`

Features:

- Prompt UI with model select, max tokens, samples
- Temperatures multi-select; compare outputs across temperatures
- Per-run latency and token usage (prompt/completion/total)
- Dynamic `/prompt/models` list (fallback on missing API key)
- Save prompt + runs to Firestore when Firebase is configured
- Notes Assistant:
  - Loads notes from `notes/`
  - Batch process (`POST /notes/process`) with usage and evaluation
  - Streaming summarize (`GET /notes/summarize-stream`) via SSE with usage and evaluation events
  - Saves summaries per file to Firestore and lists history
  - Tag configuration (`GET/POST /notes/tags`) stored in `config/tags.json`

API Endpoints:

- `POST /prompt/chat`
  - Body: `{ prompt, model, maxTokens, n, temperatures }`
  - Returns: `{ runs: Array<{ temperature, choices, usage, durationMs }>, prompt, model, maxTokens }`
- `GET /prompt/models`
  - Returns `{ models: Array<{ label, value }> }` from backend or fallback list
- Notes
  - `GET /notes/list` → `{ files: Array<{ name }> }`
  - `POST /notes/process` → `{ results: Array<{ file, summary, model, tags, usage, evaluation }> }`
  - `POST /notes/summarize` → `{ summary, model, tags, usage, evaluation }`
  - `GET /notes/summarize-stream?path=<file>` → SSE events: `start`, `summary`, `result`, `usage`, `evaluation`, `end`, `server_error`
  - `GET /notes/tags` / `POST /notes/tags` → load/save tag candidates

## Prompt Templates & Notes Assistant

- See `notes/prompt-templates.md` for:
  - Few-shot classification (JSON)
  - Few-shot transformation (style/format)
  - Structured extraction (schema)
  - Stepwise reasoning (concise steps)

## Notes

- Firestore is optional. If Firebase env vars are not set, saving is skipped.
- The API server now has modular prompt and notes routes for clarity and maintainability.
- Embeddings caching lives in `cache/embeddings.json` and warms in-memory caches.
- SSE streaming emits usage and evaluation after the result for better UX.

## Quick Tests

```bash
# Models list (fallback if no OPENAI_API_KEY)
curl -s http://localhost:4000/prompt/models | jq

# Chat with two temperatures
curl -s -X POST http://localhost:4000/prompt/chat \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Explain embeddings in 2 sentences","temperatures":[0.2,0.7],"n":1,"maxTokens":120}' | jq

# Notes: list and process
curl -s http://localhost:4000/notes/list | jq
curl -s -X POST http://localhost:4000/notes/process -H 'Content-Type: application/json' -d '{}' | jq
```
