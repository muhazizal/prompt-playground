# Implementation Plan

## Goals
- Add automated tests and basic CI for API and web.
- Tighten security around secrets, auth, payload limits, and CORS.
- Improve developer experience with linting, formatting, and typed contracts.

## Backend (Express API)
- Introduce unit/integration tests (supertest) for `/prompt/*` and `/agent/run`.
- Add OpenAPI schema (YAML/JSON) for endpoints and validate requests/responses.
- Extend validation: enforce `Content-Type`, clamp payload sizes, stricter body schema.
- Harden auth: optional key scoping, clearer 401/429 paths, trace IDs in errors.
- Metrics: add per-route counters and durations; expose Prometheus-friendly format.

## Frontend (Nuxt)
- Add basic component/unit tests (Vitest) for composables and pages.
- Surface usage/cost estimates consistently; add error states for SSE streaming.
- Provide typed API client with shared DTO types from OpenAPI.

## Security & Config
- Ensure `.env` files are git-ignored and use `.env.example` only in VCS.
- Replace any real-looking keys with placeholders; document secret management.
- CORS: move origins to explicit allowlist via env; production guidance.

## Dev Experience
- Add ESLint + Prettier configs aligned with project style.
- Add `npm run test` scripts at root and web; set up GitHub Actions CI.
- Optional Dockerfile + docker-compose for local API + web.

## Milestones
1. Testing scaffolds: supertest + Vitest; root scripts.
2. Validation + auth hardening; OpenAPI spec draft.
3. Frontend test coverage for key flows (chat, vision, TTS, STT).
4. Metrics enhancements; SSE error-handling polish.
5. CI pipeline and optional Dockerization.

Confirm to proceed and I will implement step 1 first, then iterate through milestones.