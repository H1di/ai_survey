# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Life Path Explorer** — a two-part web app. Part one is a psychological assessment (demographics → Big Five/OCEAN → RIASEC interests → ranked 7-parameter job-characteristics targets → CV/career-journey signal). Part two is the **Life Path Engine**: the assessment profile feeds AI prompts (OpenAI `gpt-4.1-mini`, JSON mode) that propose a broad career direction, three concrete professions, and a step-by-step roadmap, rendered as an interactive React Flow graph.

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

### Life Path Engine (Page 3)

After `tree`, a separate `pathStage` progression: `direction → narrowing → professions → roadmap`.
- `POST /api/direction/question` — 3 AI-generated multiple-choice questions; every option is tagged with a `directionId` from the 15-direction catalog in `backend/directions.js`.
- `POST /api/direction/answer` — deterministic tally (`computeDirection`) proposes a direction; user confirms (`/api/direction/confirm`), refines with a reason + free text (`/api/direction/refine`, max 2 rejections), or picks manually (`/api/direction/choose`).
- `POST /api/professions/narrow` — 2 narrowing questions, then exactly 3 professions.
- `POST /api/professions/select` + `POST /api/roadmap/generate` — per-profession roadmap (5–7 stages), cached in `session.roadmaps` keyed by profession id.

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
- `backend/directions.js` — direction catalog (alphabetical on purpose) + `computeDirection` tally
- `backend/riasec.js` — per-direction Holland weights + `rankDirections(riasecScores)` catalog ranking (direction-prompt hint); `inferRiasecScores` is the Big Five-only quiz-skip fallback

### Frontend

Single-page app, no router: `frontend/src/App.jsx` holds a `stage` machine (`entry → survey → tree`) and all state via `useState`. **The server snapshot is the single source of truth** — every mutating API call returns the full session snapshot, applied wholesale in `applySessionSnapshot`. Local state is only view state (current question indexes, busy flags, modal contexts).

- `frontend/src/api.js` — thin fetch wrappers, one per endpoint
- `frontend/src/components/GraphView/` — React Flow wrapper: node types `me`/`direction`/`profession`/`roadmap`/`loading`, custom `branch` edge, camera director that refits on stage changes
- `frontend/src/components/ProfileCharts.jsx` — Big Five radar + RIASEC interest bars (recharts)

The graph is rebuilt declaratively on each render by `buildLifePathGraph` in `App.jsx` from session data — do not mutate nodes/edges imperatively.

### Contracts to keep in sync

- Answer payloads: demographics `questionId/value`, Big Five `itemId/value`, RIASEC `itemId/value 1-5`, jobChar `itemId/value` (value must equal one of the item's option values), journey `questionId/value`.
- `session.step` and `pathStage` string values (backend ↔ frontend).
- The 7 `JOB_CHAR_PARAMS` keys are a cross-layer contract (prompts, scoring, session, UI).
- `REFINE_REASONS` labels in `App.jsx` ↔ `REFINE_REASON_VALUES` in `backend/directions.js`.
- Big Five items are serialized **without** `trait`/`reverse`; RIASEC items **without** `type` — never leak a scoring key.

## Testing

`backend/tests/` uses `node:test` + supertest (100+ tests): route guards and step ordering, RIASEC/jobChar scoring, CV extraction, refine/reject/choose cycle, direction tally, AI payload normalizers, session serialization. Run with `cd backend && npm test`. Frontend: Vitest over `frontend/src/lifePath.js` (graph builder, dock state machine, rank-list helper) — `cd frontend && npm test -- --run`.
