# prompt-playground

An end-to-end learning and experimentation repo for LLMs with:

- CLI demos for tokens, embeddings, and chat prompting
- A simple API server that proxies to OpenAI with metrics
- A Nuxt web app UI for multi-sample comparison and history

## Overview

This project helps you learn and experiment with LLM fundamentals and prompt design:

- Explore tokenization and embeddings from the CLI
- Try multiple prompting styles and compare outputs
- Run a local API that captures per-run latency and token usage
- Use a web UI to compare outputs across temperatures and samples, and save runs to Firestore

## Project Structure

- `cli.mjs` → Main CLI entry point
- `api.mjs` → Express API server
- `web/` → Nuxt web app
  - `pages/` → Vue components
  - `components/` → Reusable UI components
  - `plugins/` → Firebase Firestore integration (optional)
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

## Web App (Nuxt + Express)

- Start frontend: `npm run web:dev` (Nuxt dev on `http://localhost:3000/`)
- Start API: `npm run api:dev` (Express on `http://localhost:4000/`)
- Combined dev: `npm run dev` (requires `concurrently` installed)

Environment:

- Backend: `.env` at repo root
  - `OPENAI_API_KEY=your_key_here`
  - Optional: `WEB_ORIGIN=http://localhost:3000`
- Frontend: `.env` in `web` (or export vars before running)
  - `NUXT_PUBLIC_FIREBASE_API_KEY=...`
  - `NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...`
  - `NUXT_PUBLIC_FIREBASE_PROJECT_ID=...`
  - `NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...`
  - `NUXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...`
  - `NUXT_PUBLIC_FIREBASE_APP_ID=...`

Features:

- Prompt form with model select (`USelectMenu`), max tokens, samples
- Temperatures multi-select to run multiple temperature batches at once
- Multi-sample outputs per temperature, with per-run latency and token usage
- Copy button for each sample output
- Dynamic model list fetched from backend capabilities
- Save prompt + runs to Firestore when Firebase is configured
- History list shows past runs with metadata

API Endpoints:

- `POST /chat`
  - Request body: `{ prompt, model, maxTokens, n, temperatures }`
    - `n` = number of samples per run
    - `temperatures` = array of temperatures to run (e.g., `[0.25, 0.5, 0.75]`)
  - Response body: `{ runs: Array<{ temperature, choices, usage, durationMs }> }`
    - `choices` = array of `{ index, text }`
    - `usage` = `{ prompt_tokens, completion_tokens, total_tokens }`
    - `durationMs` = latency in milliseconds per temperature run
- `GET /models`
  - Returns `{ models: Array<{ label, value }> }` from backend capabilities or a fallback list

## Prompt Templates

- See `notes/prompt-templates.md` for:
  - Few-shot classification (JSON)
  - Few-shot transformation (style/format)
  - Structured extraction (schema)
  - Stepwise reasoning (concise steps)

## Notes

- Firestore is optional. If Firebase env vars are not set, the app still runs; saving will be skipped.
- The web app uses Nuxt’s server-driven configuration. Types are derived from Nuxt’s generated `tsconfig` with local augmentations for injected app values.
- The API server supports multi-sample output comparison across temperatures and reports per-run metrics; it does not stream tokens.
