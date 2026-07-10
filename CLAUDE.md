# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Life Path Explorer** — a two-part web app. Part one is a psychological assessment (demographics → Big Five/OCEAN → RIASEC interests → ranked 7-parameter job-characteristics targets → CV/career-journey signal). Part two is the **Life Path Engine**: the assessment profile feeds AI prompts (OpenAI `gpt-4.1-mini`, JSON mode) that produce an Oriented Field + concrete job (the "1st Output") explained through the 7 parameters and scored on Schwartz Basic Human Values; the user iterates it through a Yes/No refinement loop, and accepting an output reveals four advice blocks plus a step-by-step roadmap — all rendered as an interactive React Flow graph.

Active code lives in `backend/` (Node + Express 5, CommonJS) and `frontend/` (React 19 + Vite + `@xyflow/react`). An older CRA implementation was removed in July 2026; if you ever need it, it is preserved at git tag `archive/legacy-cra-2026-07`.

## Development Commands

From the root (runs both processes concurrently):
```bash
npm run dev          # backend on :3001, frontend on :5173
```

Individual processes:
```bash
npm run dev:backend   # nodemon backend/server.js, port 3001
npm run dev:frontend  # vite dev server, port 5173
```

First-time setup:
```bash
npm run install:all   # installs backend/ and frontend/ node_modules
```

Backend tests (node:test, no jest):
```bash
cd backend && npm test
```

The frontend dev server proxies `/api/*` to `http://localhost:3001` (see `frontend/vite.config.js`).

## Environment

`backend/.env` (copy from `backend/.env.example`):
```
OPENAI_API_KEY=...      # optional — without it every AI call uses deterministic fallbacks
AI_BIG_FIVE_ITEMS=false # forces static IPIP items; AI-generated is the default with a key
```
The app must always work keyless: every AI generator in `backend/aiEngine.js` has a deterministic fallback. When touching AI paths, verify both modes.

## Architecture

### Assessment flow (Pages 1–2)

A `session.step` state machine on the backend drives the assessment:
```
entry → demographics → depth_choice → big_five → riasec → job_characteristics → cv → tree
```
- **Entry**: `entryChoice` (`change` | `find`) + `cvIntent` (`new` | `use_skills`) + free-text `dreamAnswer` → `POST /api/session/start`.
- **Demographics**: 4 static questions (sex, age, country, city) from `backend/questionPool.js`.
- **Depth choice**: `short` (20 items) or `deep` (50) → `POST /api/session/big-five-depth`.
- **Big Five**: Likert 1–5 items; AI-generated per session by default (hardened validator), static public-domain IPIP sets in `backend/bigFiveItems.js` as fallback / `AI_BIG_FIVE_ITEMS=false`. Scoring (reverse keys, 0–100 normalization, Stability/Plasticity derivation) in `backend/questionEngine.js`.
- **RIASEC**: 12 (deep: 18) enjoyment-Likert activity items — `POST /api/riasec/start` generates (AI, fallback `backend/riasecItems.js`), `/api/riasec/answer` records; scored per Holland type to 0–100 + top-3 `riasecCode` in `questionEngine.js`. `/api/riasec/skip` infers a low-confidence profile from Big Five + dream instead (`riasecInferred`).
- **Job characteristics**: user ranks the 7 canonical parameters (`compensation, work_mode, job_security, career_growth, complexity, meaning_impact, social` — `JOB_CHAR_PARAMS`) and picks depth 5|10 → `/api/job-characteristics/rank` generates single-parameter tradeoff questions (AI, static bank fallback); each option encodes a 0–100 target; answers → `jobCharProfile` (unasked params default 50).
- **CV**: `/api/cv` accepts pasted `cvText` (JSON) or a multipart file (`.pdf`/`.docx`/`.txt`, 2 MB cap, `backend/cvExtract.js`) and AI-parses it to `{skills, domains, seniority}`; without a CV, 7 static career-journey questions via `/api/cv/journey`. Completing either advances to `tree`.

### Life Path Engine (Page 3 — output loop)

After `tree`, a `pathStage` progression: `output → detail`. At the `cv → tree` transition the backend infers `session.userValues` (Schwartz 10-value vector, always low-confidence).
- `POST /api/output/first` — generates the Oriented Field + 1st Output (idempotent). Grounding: `rankDirections(riasecScores)` over the 15-direction catalog feeds the prompt as a hint; keyless fallback picks the top-ranked direction's `professionSeeds`. Every output is Schwartz-scored (`scoreProfessionValues`) and the backend derives `higherOrder/axes/dominantPole/topValues/valuesFit` in `buildScoredOutput` — the AI never outputs aggregates.
- `POST /api/output/refine` — the No-loop: `{ outputId, changes: [{param, reason}] }` (1–7 of the 7 canonical params) shifts named parameters while holding the rest, XOR `{ outputId, notSuitable: true }` regenerates from a different field family (all used `directionId`s excluded). Each regeneration appends a parent-linked `output_N` to `session.outputs` and logs `refinementHistory`.
- `POST /api/output/accept` — the Yes-branch: marks the output accepted (`pathStage="detail"`, accept-once) and generates the four advice blocks (`aiRecommendations/events/universities/courses`) into `output.detail`.
- `POST /api/roadmap/generate` — `{ sessionId, outputId }`; only for the accepted output, cached in `session.roadmaps` keyed by output id.
- `backend/schwartzValues.js` — pure Schwartz module: circular order, higher-order poles (hedonism split 50/50), plane axes, `valuesFit` (0.6 axis + 0.4 centered cosine), per-direction prototypes + deterministic fallbacks.

### Backend modules

- `backend/server.js` — all routes, express-rate-limit, CORS allowlist
- `backend/sessionStore.js` — in-memory `Map` sessions with TTL sweep; `serializeSessionState` is the single snapshot the frontend consumes
- `backend/questionEngine.js` — answer validation and all scoring (Big Five, RIASEC, job-characteristics profile, career-journey, derived traits)
- `backend/questionPool.js` — demographic bank, `JOB_CHAR_PARAMS` + static jobChar tradeoff bank, `CAREER_JOURNEY_QUESTIONS`
- `backend/bigFiveItems.js` — IPIP-20/IPIP-50 fallback item sets (public domain)
- `backend/riasecItems.js` — static RIASEC fallback item pool (12/18, interleaved by type)
- `backend/cvExtract.js` — CV file → text (pdf-parse / mammoth / utf8), hard failures become 400s
- `backend/aiEngine.js` — one generator per AI artifact, each with normalizer + deterministic fallback
- `backend/prompts.js` — prompt builders; `buildProfileDigest` is the profile every prompt receives
- `backend/directions.js` — field-family catalog (alphabetical on purpose): prompt hints, fallback `professionSeeds`, Schwartz prototype keys
- `backend/schwartzValues.js` — Schwartz derivations, values fit, direction prototypes, deterministic value fallbacks
- `backend/riasec.js` — per-direction Holland weights + `rankDirections(riasecScores)` catalog ranking (direction-prompt hint); `inferRiasecScores` is the Big Five-only quiz-skip fallback

### Frontend

Single-page app, no router: `frontend/src/App.jsx` holds a `stage` machine (`entry → survey → tree`) and all state via `useState`. **The server snapshot is the single source of truth** — every mutating API call returns the full session snapshot, applied wholesale in `applySessionSnapshot`. Local state is only view state (current question indexes, busy flags, modal contexts).

- `frontend/src/api.js` — thin fetch wrappers, one per endpoint
- `frontend/src/components/GraphView/` — React Flow wrapper: node types `me`/`output`/`advice`/`roadmap`/`loading`, custom `branch` edge, camera director that refits on stage changes
- `frontend/src/components/ProfileCharts.jsx` — Big Five radar + RIASEC interest bars (recharts) + the Schwartz circumplex map (`SchwartzMap.jsx`, plain SVG)

The graph is rebuilt declaratively on each render by `buildLifePathGraph` in `App.jsx` from session data — do not mutate nodes/edges imperatively.

### Contracts to keep in sync

- Answer payloads: demographics `questionId/value`, Big Five `itemId/value`, RIASEC `itemId/value 1-5`, jobChar `itemId/value` (value must equal one of the item's option values), journey `questionId/value`.
- `session.step` and `pathStage` string values (backend ↔ frontend).
- The 7 `JOB_CHAR_PARAMS` keys are a cross-layer contract (prompts, scoring, session, refine panel).
- The 10 Schwartz value keys (`SCHWARTZ_ORDER`) are likewise shared backend ↔ frontend labels.
- Refine payload: `{outputId, changes:[{param, reason}]}` XOR `{outputId, notSuitable: true}`.
- Big Five items are serialized **without** `trait`/`reverse`; RIASEC items **without** `type` — never leak a scoring key.

## Testing

`backend/tests/` uses `node:test` + supertest (110+ tests): route guards and step ordering, RIASEC/jobChar scoring, CV extraction, Schwartz derivations + fit properties, the full output loop (first → refine → notSuitable → accept → roadmap), AI payload normalizers, session serialization. Run with `cd backend && npm test`. Frontend: Vitest over `frontend/src/lifePath.js` (output-chain graph builder, dock state machine, rank-list helper) — `cd frontend && npm test -- --run`.
