# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Life Path Explorer** — a two-part web app. Part one is a psychological survey (demographics → Big Five/OCEAN → 40 A/B values questions). Part two is the **Life Path Engine**: the survey profile feeds AI prompts (OpenAI `gpt-4.1-mini`, JSON mode) that propose a broad career direction, three concrete professions, and a step-by-step roadmap, rendered as an interactive React Flow graph.

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
OPENAI_API_KEY=...   # optional — without it every AI call uses deterministic fallbacks
```
The app must always work keyless: every AI generator in `backend/aiEngine.js` has a deterministic fallback. When touching AI paths, verify both modes.

## Architecture

### Survey flow (Pages 1–2)

A `session.step` state machine on the backend drives the survey:
```
entry → demographics → depth_choice → big_five → values → complete
```
- **Entry**: `entryChoice` (`change` | `find`) + free-text `dreamAnswer` → `POST /api/session/start`.
- **Demographics**: 3 static questions (sex, age, country) from `backend/questionPool.js`.
- **Depth choice**: `short` (20 items) or `deep` (50) → `POST /api/session/big-five-depth`.
- **Big Five**: Likert 1–5 items; static public-domain IPIP sets in `backend/bigFiveItems.js`. Scoring (reverse keys, 0–100 normalization, Stability/Plasticity derivation) in `backend/questionEngine.js`.
- **Values**: 40 static A/B pairs across 8 dimensions (`VALUES_QUESTIONS` in `backend/questionPool.js`); scored per dimension in `computeValuesScores`.

### Life Path Engine (Page 3)

After `complete`, a separate `pathStage` progression: `direction → narrowing → professions → roadmap`.
- `POST /api/direction/question` — 3 AI-generated multiple-choice questions; every option is tagged with a `directionId` from the 15-direction catalog in `backend/directions.js`.
- `POST /api/direction/answer` — deterministic tally (`computeDirection`) proposes a direction; user confirms (`/api/direction/confirm`), refines with a reason + free text (`/api/direction/refine`, max 2 rejections), or picks manually (`/api/direction/choose`).
- `POST /api/professions/narrow` — 2 narrowing questions, then exactly 3 professions.
- `POST /api/professions/select` + `POST /api/roadmap/generate` — per-profession roadmap (5–7 stages), cached in `session.roadmaps` keyed by profession id.

### Backend modules

- `backend/server.js` — all routes, express-rate-limit, CORS allowlist
- `backend/sessionStore.js` — in-memory `Map` sessions with TTL sweep; `serializeSessionState` is the single snapshot the frontend consumes
- `backend/questionEngine.js` — step machine (`pickNextQuestion`), validation, all scoring
- `backend/questionPool.js` — demographic + values question banks, dimension metadata
- `backend/bigFiveItems.js` — IPIP-20/IPIP-50 item sets (public domain)
- `backend/aiEngine.js` — one generator per AI artifact, each with normalizer + deterministic fallback
- `backend/prompts.js` — prompt builders; `buildProfileDigest` is the profile every prompt receives
- `backend/directions.js` — direction catalog (alphabetical on purpose) + `computeDirection` tally

### Frontend

Single-page app, no router: `frontend/src/App.jsx` holds a `stage` machine (`entry → survey → tree`) and all state via `useState`. **The server snapshot is the single source of truth** — every mutating API call returns the full session snapshot, applied wholesale in `applySessionSnapshot`. Local state is only view state (current question indexes, busy flags, modal contexts).

- `frontend/src/api.js` — thin fetch wrappers, one per endpoint
- `frontend/src/components/GraphView/` — React Flow wrapper: node types `me`/`direction`/`profession`/`roadmap`/`loading`, custom `branch` edge, camera director that refits on stage changes
- `frontend/src/components/ProfileCharts.jsx` — Big Five radar + values bar panel (recharts)

The graph is rebuilt declaratively on each render by `buildLifePathGraph` in `App.jsx` from session data — do not mutate nodes/edges imperatively.

### Contracts to keep in sync

- Answer payloads: demographics `questionId/value`, Big Five `itemId/value`, values `questionId/choice`.
- `session.step` and `pathStage` string values (backend ↔ frontend).
- `REFINE_REASONS` labels in `App.jsx` ↔ `REFINE_REASON_VALUES` in `backend/directions.js`.
- Big Five items are serialized to the client **without** `trait`/`reverse` — never leak the scoring key.

## Testing

`backend/tests/` uses `node:test` + supertest (39+ tests): route guards and ordering, refine/reject/choose cycle, direction tally, AI payload normalizers, session serialization. Run with `cd backend && npm test`. There are currently no frontend tests.
