# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Life Path Explorer** — a two-part web app. Part one is a psychological assessment (demographics → Big Five/OCEAN → RIASEC interests → an adaptive work-values tournament → CV/career-journey signal → character summary). Part two is the **Life Path Engine**: the assessment profile feeds AI prompts (OpenAI `gpt-6-luna` via the Responses API with reasoning off, JSON mode) that produce an Oriented Field + concrete job (the "1st Output") scored on the six Minnesota / O*NET Work Values; the user iterates it through a Yes/No loop (No regenerates from a different field family), and accepting an output reveals four advice blocks plus a step-by-step roadmap — all rendered as an interactive React Flow graph.

**v2 (path-first preview)** lives in `v2/` as a separate copy built from the November 2026 business report: personal questions → case → a roadmap built from a course catalogue (currently sample data) → user-managed edits with 3 free rebuilds → paid add-ons (tests + deeper guidance, unlimited rebuilds; payments mocked). It runs beside v1 on `:3002`/`:5174` and has its own tests and CI (`.github/workflows/ci-v2.yml`). Read `v2/README.md` before touching it; changes to the root `backend/`/`frontend/` do not affect v2 and vice versa.

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

Plans and in-flight work live in `project-plans/` (index: `project-plans/README.md`; the active strategy is `project-plans/2026-10-12-project-review/`). Finished plans are in `docs/archive/`. Dev-only animation demos live in `frontend/demos/` (never shipped by `vite build`; rules in `frontend/demos/README.md`).

Production is a single Render free web service (`render.yaml`, `DEPLOY.md`): the build compiles `frontend/dist`, and `backend/server.js` serves it next to `/api` (static + SPA fallback for extensionless non-`/api` paths, mounted only when the build exists; `FRONTEND_DIST` overrides the path). Unknown `/api` paths must keep Express's default 404 — the dev gate relies on it (with auth on, an anonymous caller gets 401 for every non-health `/api` path alike, so the gate stays indistinguishable).

## Environment

`backend/.env` (copy from `backend/.env.example`):
```
OPENAI_API_KEY=...      # optional — without it every AI call uses deterministic fallbacks
ONET_API_KEY=...        # optional — adds live US salary/outlook; snapshot covers the rest
SUPABASE_URL=...        # optional — accounts; unset = auth bypass (fixed dev user, nothing saved)
SUPABASE_SERVICE_ROLE_KEY=...  # backend-only; enables saved_paths writes
ERROR_WEBHOOK_URL=...     # optional — Slack/Discord webhook for 5xx + browser crashes (POST /api/client-error); unset = no-op
```
`frontend/.env.local` (copy from `frontend/.env.example`): `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` — build-time; without both the sign-in screen is skipped. Setup steps: `DEPLOY.md` → "Аккаунты".
The app must always work keyless (Supabase included — the auth bypass is the keyless mode): every AI generator in `backend/engine/aiEngine.js` has a deterministic fallback, and O*NET occupation data comes from the checked-in snapshot when `ONET_API_KEY` is absent. When touching AI paths, verify both modes.

## Architecture

### Assessment flow (Pages 1–2)

A `session.step` state machine on the backend drives the assessment:
```
entry → demographics → big_five → riasec → values → cv → summary → tree
```
The frontend presents this as a "Career Discovery Journey" rail (`JOURNEY_RAIL` in `frontend/src/lifePath.js`: intro card after entry + condensed strip in the survey header). Rail entries at or before `session.furthestStep` are clickable and call `POST /api/session/goto`, which moves `session.step` without touching any data; entries past it stay plain text, so the rail can never skip unanswered work or change execution order. `RAIL_NAVIGATION` in `lifePath.js` is the off switch — set it to `false` and the rail is display-only again. Completing a revisited step advances one step forward exactly as on the first pass; the rail is how you get back.
- **Entry**: one required free-text answer, capped at 500 chars — `dreamAnswer` → `POST /api/session/start`. The `cvIntent` choice (`new` | `use_skills`) is made later, on the CV slide, via `POST /api/cv/intent` (step-guarded to `cv`, re-selectable).
- **Demographics**: 4 static questions (sex, age, country, city) from `backend/assessment/questionPool.js`. Completing them advances straight to `big_five`.
- **Big Five**: one fixed instrument — the static public-domain `MINI_IPIP_20` (`backend/assessment/bigFiveItems.js`), seeded into the session at creation; no AI item generation, no depth choice. Likert 1–5; scoring (reverse keys, 0–100 normalization, Stability/Plasticity derivation) in `backend/assessment/questionEngine.js`.
- **RIASEC**: one fixed instrument — 12 static enjoyment-Likert activity items (`getStaticRiasecItems` in `backend/assessment/riasecItems.js`) served by `POST /api/riasec/start`; `/api/riasec/answer` records; scored per Holland type to 0–100 + top-3 `riasecCode` in `questionEngine.js`. `/api/riasec/skip` infers a low-confidence profile from Big Five + dream instead (`riasecInferred`).
- **Values**: an explicit adaptive pairwise tournament over the six Minnesota / O*NET Work Values (`WORK_VALUES_ORDER` in `backend/engine/workValues.js`). `POST /api/values/start` seeds a pure Ford–Johnson merge-insertion engine (`backend/assessment/valuesTournament.js`, ≤10 comparisons for 6 items); `/api/values/answer` `{comparisonId, winner}` records each A/B (stale/duplicate comparisonId is a no-op); the snapshot echoes the recorded answers as `valuesDecided` (`[{a, b, winner}]`, `null` outside a running tournament) so the screen can draw the order they imply; `/api/values/confirm` `{order}` validates a permutation of the 6 keys, stores `session.userValues` (`{scores, order, source:"tournament", confidence:"explicit", curveVersion}`) via `store.finalizeValues` (one atomic write that also clears the tournament) and advances to `cv`. Magnitudes come from a fixed rank→score curve (`rankToWorkValueScores`), not measured.
- **CV**: the slide first asks "Where should we start from?" (`/api/cv/intent`, required in the UI before the paths unlock); then `/api/cv` accepts pasted `cvText` (JSON) or a multipart file (`.pdf`/`.docx`/`.pptx`/`.html`/`.txt`, 5 MB cap, `backend/assessment/cvExtract.js`) and AI-parses it to `{roles, skills, domains, seniority, keywords}`; without a CV, 7 static career-journey questions via `/api/cv/journey`. Completing either generates `session.personaSummary` and advances to `summary`. Both CV-completion routes are single-flight-locked (`${session.id}:cv`, require-then-lock) so a double-submit can't double the AI spend or advance twice. `.pptx` needs the optional MarkItDown CLI (`MARKITDOWN_BIN`); snapshots advertise the currently supported list as `cvUploadFormats`.
- **Summary**: a character-conclusion screen — deterministic named archetype (`deriveArchetype`) + Big Five radar + AI persona prose (`personaSummary`, deterministic keyless fallback) + the confirmed work-values radar. `POST /api/summary/continue` (step-guarded to `summary`, idempotent past it) acknowledges it and advances to `tree`. `tree` is a waiting screen (`FirstPathScreen`): the frontend fires `/api/output/first` from an effect the moment the step opens (also on a reload that lands there before an output exists) and meanwhile plays the occupation funnel — 923 occupations → 5 families → 15 shortlist, holding there until the response supplies the pick. The hand-over to the graph is `FirstPathScreen`'s `onDone` (scene end, the "See your path" button, or at once when there is no scene to finish) — `handleEnterLifePath` only applies the snapshot.

### Life Path Engine (Page 3 — output loop)

After `tree`, a `pathStage` progression: `output → detail`. `session.userValues` is the six-key work-values hierarchy confirmed in the values step (`{scores, order, source:"tournament", confidence:"explicit", curveVersion}` — explicit, not inferred). `session.personaSummary` (3–5 second-person sentences from Big Five scores, `generatePersonaSummary`, deterministic fallback keyless) is generated at the `cv → summary` transition — shown as the "Who you are" block in the profile panel next to the deterministic per-axis takeaways (`bigFiveTakeaways` in `frontend/src/lifePath.js`; Neuroticism displays as "Emotional Steadiness" = 100−N, the stored score keeps raw N).
- `POST /api/output/first` — generates the Oriented Field + 1st Output (idempotent). Grounding is O*NET-based: `rankDirections(riasecScores)` picks the top-5 direction families, `rankOccupations` (`backend/engine/onet.js`, Pearson correlation against measured O*NET RIASEC profiles) builds a 15-occupation shortlist inside them, and the AI must pick one and return its `socCode` (`resolveShortlistSoc` enforces membership: valid code → title match → shortlist top). Keyless fallback takes the best-correlated unused occupation directly (with every family rejected it takes the best unused occupation from any family). Every output is assembled in `buildOutput` (`server.js`) and work-values-scored: it takes the chosen SOC's measured O*NET work values (per-direction prototype fallback for the ~40 SOCs without them and any keyless job), and the backend derives `topValues` + `valuesFit` (a single `{overall}` 0–100, centered cosine of the two 6-vectors against the user's confirmed hierarchy) — the AI never scores values; the same async path attaches `output.onet` (snapshot facts: job zone, skills, tech, related + live US salary/outlook when `ONET_API_KEY` is set). A separate second AI call (`generateWhyThisFits`) then attaches `output.whyThisFits` — a structured, traceable explanation (2 personality bullets, 1 interest, 1 work-value, 2–3 current skills, 3–4 skills to develop, grounded in the occupation's O*NET skills); the UI renders it (the old free-text `whyFit` field is gone).
- `POST /api/output/refine` — the No-loop: `{ outputId }` regenerates from a different field family (all used `directionId`s excluded). There is no per-parameter adjustment — "No" always means "not this one". Each regeneration appends a parent-linked `output_N` to `session.outputs` (with its own `whyThisFits` and `onet` block) and logs `refinementHistory`.
- `POST /api/output/accept` — the Yes-branch: marks the output accepted (`pathStage="detail"`, accept-once) and generates the four advice blocks (`aiRecommendations/events/universities/courses`) into `output.detail`.
- `POST /api/roadmap/generate` — `{ sessionId, outputId }`; only for the accepted output, cached in `session.roadmaps` keyed by output id.
- `backend/engine/workValues.js` — pure work-values module: `WORK_VALUES_ORDER` (the six Minnesota keys), `rankToWorkValueScores` (rank→intensity curve + `curveVersion`), `valuesFit` (centered cosine → single `{overall}`), per-direction prototypes + `buildFallbackProfessionValues`.
- `backend/assessment/valuesTournament.js` — pure Ford–Johnson merge-insertion engine (replays decided answers, so it is resumable and immune to stale/double answers); ≤10 comparisons for 6 items, proven exhaustively over all 720 permutations.

### Backend modules

Layout: `server.js` (entry + routes) at the root; `assessment/` (instruments, validation/scoring, values tournament, CV extraction), `engine/` (AI generators, prompts, field families, RIASEC ranking, O*NET lookups, work values), `core/` (session store, Redis client, logger, dev seeder), `services/` (external CLI/API wrappers), `data/`, `scripts/`, `tests/`. Finished plans and audits live in `docs/archive/`.

- `backend/server.js` — all routes, express-rate-limit (no CORS: same-origin in prod, Vite proxy in dev), request-id middleware + leak-safe `fail`/`sendError` responders + single-flight lock (process-local; **single-instance only**)
- `backend/core/auth.js` — `createAuth({supabaseUrl})` → `/api` middleware mounted before the rate limiters (`/api/health` exempt): verifies the Supabase access token (`Authorization: Bearer`) with `jose` against the project JWKS (issuer `<url>/auth/v1`, audience `authenticated`) and sets `req.user = {id, bypass}`; only a verdict about the token itself (`TOKEN_VERDICTS`: expired, bad signature, wrong claims, unknown key) → 401; anything else, including a non-200 or malformed JWKS, → 503 — a 401 signs the user out and drops the stored session id, so an outage must never produce one. Without `SUPABASE_URL`: bypass, `req.user` = `DEV_USER_ID` with `bypass: true`
- `backend/services/supabaseDb.js` — service-role supabase-js client: `saveAcceptedPath` (upsert on `session_id` at accept and again when the roadmap lands; failures logged, never surfaced) and `listSavedPaths` (`GET /api/me/paths`); no-op without both env values
- `supabase/migrations/` — Postgres schema: `profiles` (sign-up trigger; consent/age columns reserved for T6), `saved_paths`, `checkins`; RLS = authenticated reads own rows only, no client writes, anon nothing; rows cascade with the auth user. Proof: `supabase/tests/run-rls.sh` (docker Postgres + a Supabase stub)
- `backend/core/alert.js` — `createAlerter({url})` → `notify({status,route,requestId,message})`: optional webhook (`ERROR_WEBHOOK_URL`), one-line `{text, content}` payload, throttled 1/min per status+route, never throws; the line is defanged (no `<>`, `@`, masked link or live URL — part of it is caller-controlled) and sent with `allowed_mentions: {parse: []}`; called from `sendError` on 500s, from the auth middleware's JWKS-outage 503 (`createAuth({onOutage})`) and from `POST /api/client-error` (the frontend `ErrorBoundary` reports render crashes there)
- `backend/core/logger.js` — dependency-free structured error logging (`logError` one JSON line per ≥500, route template / UUID-redacted so the session id never leaks) + `resolveStatus` (clamp 400..599)
- `backend/core/sessionStore.js` — in-memory `Map` sessions with TTL sweep (the process-local authoritative set — **do not run >1 instance**) + optional Upstash Redis write-through/hydrate for durability; `serializeSessionState` is the single snapshot the frontend consumes; `finalizeValues` / `finalizeJobChar` are the atomic step-closing writes
- `backend/assessment/questionEngine.js` — answer validation and all scoring (Big Five, RIASEC, career-journey, derived traits)
- `backend/assessment/questionPool.js` — demographic bank, `CAREER_JOURNEY_QUESTIONS`
- `backend/assessment/bigFiveItems.js` — the static Mini-IPIP-20 instrument (public domain)
- `backend/assessment/riasecItems.js` — the static 12-item RIASEC instrument (interleaved by type)
- `backend/assessment/cvExtract.js` — CV file → text: MarkItDown-first hybrid (pdf-parse / mammoth / tag-strip / utf8 fallbacks), hard failures become 400s
- `backend/services/markitdown.js` — optional MarkItDown CLI wrapper (probe + spawn + cleanup); absent binary = silent fallback to Node parsers
- `backend/engine/aiEngine.js` — one generator per AI artifact, each with normalizer + deterministic fallback
- `backend/engine/prompts.js` — prompt builders; `buildProfileDigest` is the profile every prompt receives
- `backend/engine/piiScrub.js` — `scrubPii` (emails/phones/links/@handles → `[email]`/`[phone]`/`[link]`/`[handle]`) + `scrubCvHeader` (the name in the top three CV lines → `[name]`; heading/job-title words are skipped). Digit runs with a year-shaped group, a spaced dash or two long groups are dates/ranges, not phones, unless they start with `+`, applied only inside `prompts.js` so stored answers stay verbatim; names inside sentences are a documented non-goal
- `backend/engine/directions.js` — field-family catalog (alphabetical on purpose): labels + prompt hints
- `backend/engine/workValues.js` / `backend/assessment/valuesTournament.js` — the six Minnesota work values (order, rank curve, `valuesFit`, prototypes) and the pure Ford–Johnson tournament engine
- `backend/engine/riasec.js` — per-direction Holland weights + `rankDirections(riasecScores)` catalog ranking (direction-prompt hint; sorted on the unrounded score); `inferRiasecScores` is the Big Five-only quiz-skip fallback; `rankingRiasec(riasecScores, bigFiveScores)` is what all family/occupation ranking uses — a quiz with spread (max−min) under `RIASEC_MIN_SPREAD` (40) is blended toward the Big Five inference in proportion, so answering every item alike no longer ties all families into alphabetical order
- `backend/engine/onet.js` — pure lookups + `rankOccupations` (Pearson) over the checked-in O*NET snapshot; exports `ONET_ATTRIBUTION` (CC-BY requirement) and `JOB_ZONE_LABELS`
- `backend/data/onet-snapshot.json` — 923 occupations (O*NET 30.3): RIASEC profile, job zone, top skills/tech, related SOCs, the six `workValues` (merged from O*NET 28.0 by SOC — 30.3 dropped the descriptor), `directionId`; regenerate with `node scripts/build-onet-snapshot.js <db_30_3_text dir> <28.0 "Work Values.txt">` (embeds the SOC→direction mapping)
- `backend/services/onetApi.js` — optional O*NET Web Services client (`ONET_API_KEY`, X-API-Key header): live US salary/outlook per SOC, 24h in-process cache, one 429 retry; absent key or any failure = silent null — failures are logged at most once per 15 min (`FAILURE_LOG_INTERVAL_MS`, via the injected `now`), and `getStatus()` exposes cached liveness (`liveKey`/`lastLookupOk`/`lastLookupAt`/`lastError`/`cachedOccupations`) on `GET /api/health` alongside `SNAPSHOT_VERSION` + `SNAPSHOT_OCCUPATION_COUNT` from `onet.js` — that is how a bad key is told from no key; health stays unauthenticated, triggers no request, and **must never carry the key itself** (a boolean, never a prefix or hash)

### Frontend

Single-page app, no router: `frontend/src/App.jsx` holds a `stage` machine (`entry → survey → tree`) and all state via `useState`. **The server snapshot is the single source of truth** — every mutating API call returns the full session snapshot, applied wholesale in `applySessionSnapshot`. Local state is only view state (current question indexes, busy flags, modal contexts).

- `frontend/src/api.js` — thin fetch wrappers, one per endpoint; attaches the Supabase bearer token and signs out locally on a 401
- `frontend/src/auth.js` — supabase-js (PKCE, anon key) + `authGate`; `App` renders `SignInScreen` (magic link + Google) until a session exists, `LifePathApp` after. The browser never queries tables directly
- `frontend/src/components/GraphView/` — React Flow wrapper: node types `me`/`output`/`advice`/`roadmapPath`/`loading`, custom `branch` edge, camera director that refits on stage changes (on a phone it fits the roadmap path by width, top-aligned). The roadmap is one `roadmapPath` node (`motion/path/`: pure `pathLayout.js` — timeframe parser, months-from-now axis, wave, non-overlapping pills — + `RoadmapPath.jsx` SVG renderer with real buttons per stage; horizontal on desktop, vertical ≤640px), revealed by the `motion/roadmap` clock
- `frontend/src/components/ProfileCharts.jsx` — Big Five radar + RIASEC interest bars + the six-axis work-values radar (all recharts)
- `frontend/src/motion/` — the shipped explanatory scenes (one folder per scene: pure engine + thin Canvas/SVG renderer + vitest), the clocks (`usePlayOnce` runs once, `useSceneClock` loops), and `onetField.js`: a lazy chunk of the O*NET snapshot (`data/onet-field.json`, built by `frontend/scripts/build-onet-field.cjs`) plus a client-side mirror of `rankDirections` / `rankOccupations`, pinned to the backend by `onetField.test.js`. The same components back the dev demos in `frontend/demos/` — see the table in `frontend/demos/README.md` for which scene is mounted where. Rules that bind them: no new dependencies, colours from `tokens.css`, `prefers-reduced-motion` → a meaningful static frame, a scene never gates a button, and a scene waiting on a response never shows a result it does not have.
- `RiasecResultScreen` is a *view over step `values`* (`riasecReveal` in App, set when the quiz closes, cleared by Continue, the rail, or any `hydrateFromSnapshot`) — the step machine is not involved and gains no step.

The graph is rebuilt declaratively on each render by `buildLifePathGraph` in `App.jsx` from session data — do not mutate nodes/edges imperatively.

Snapshots arriving outside the answer flow (page reload, dev stage jump) go through `hydrateFromSnapshot` — it wraps `applySessionSnapshot` and additionally repositions the four local question indexes and picks the top-level stage. Both callers must use it; a second place that knows about indexes would drift.

### Dev tools

A stage switcher for manual testing, off unless `DEV_TOOLS_TOKEN` is set in `backend/.env`.

- Unset (the normal state, including production): the dev router is never registered and `/api/dev/jump` 404s like any unknown path.
- Set: `POST /api/dev/jump` `{sessionId?, step}` with an `X-Dev-Token` header seeds the session forward to `step` with the fixed persona in `backend/core/devSeed.js` (`DEV_PROFILE` — Investigative-Artistic, O 94 / C 75 / E 44 / A 75 / N 25, RIASEC `IAE`) and returns the usual snapshot. Already-answered steps are preserved; a target behind the current step gets a fresh session carrying the dream answer over; an expired/unknown `sessionId` seeds a fresh session rather than 404ing. A wrong token falls through to Express's default 404 — byte-for-byte what an unmounted route returns, never a 403.
- Frontend: open `?dev=<token>` once — the token moves to `sessionStorage`, the URL is scrubbed, and a `DevPanel` pill appears with all eight steps plus the composite `tree + 1st output` and `detail (accepted)` targets (those chain the real `/api/output/first`, `/api/output/accept`, and `/api/roadmap/generate`, because the App handlers read React state that has not re-rendered mid-jump).
- `backend/core/devSeed.js` closes each step through the same store mutators, validators, and scoring functions as the real routes. Two tests guard the drift: seeding to `tree` must survive a real `/api/output/first`, and the filler map must cover exactly `STEP_ORDER` minus `tree`. A new step in the machine without a filler fails the suite.
- `STEP_ORDER` (exported from `sessionStore.js`) is the canonical machine order; `advanceStep`, `finalizeValues`, and `finalizeJobChar` throw on a step outside it.

### Contracts to keep in sync

- Answer payloads: demographics `questionId/value`, Big Five `itemId/value`, RIASEC `itemId/value 1-5`, journey `questionId/value`.
- `session.step` and `pathStage` string values (backend ↔ frontend).
- The 6 work-value keys (`WORK_VALUES_ORDER`: `achievement, independence, recognition, relationships, support, working_conditions`) are likewise shared backend ↔ frontend labels; `valuesFit` is a single `{overall}` (0–100).
- Every error response carries a body `requestId` and an `X-Request-Id` header; 4xx keep their message, 500s return a generic fallback (internal text/stack only in the server log).
- `session.furthestStep` is a high-water mark raised only by `advanceStep` / `finalizeValues` / `finalizeJobChar`, never by `gotoStep`. Reads go through `session.furthestStep || session.step` so sessions persisted before the field existed still work — do not bump `SESSION_SCHEMA_VERSION` for it.
- `POST /api/session/goto` is ungated because it accepts only targets at or below `furthestStep`. If that check ever loosens, the route needs a gate.
- `rankingRiasecScores` is derived snapshot data (never stored): `rankingRiasec` of the session's quiz + Big Five. The funnel and output figure must rank with it, not with `riasecScores`, or they draw a shortlist the backend never used.
- `valuesDecided` is additive snapshot data read only by the values screens (`motion/insertion`); nothing may depend on it being present — a session persisted before the field existed serializes it from the same `valuesTournament`, and after `finalizeValues` it is `null`.
- `frontend/src/motion/data/onet-field.json` must be regenerated (`node frontend/scripts/build-onet-field.cjs`) whenever `backend/data/onet-snapshot.json`, `engine/riasec.js` weights or `engine/directions.js` labels change; it must never carry salary or outlook. Any scene drawing from it renders the attribution line (`field.attribution` / `output.onet.attribution`).
- `/api/values/confirm` accepts a submitted permutation either with a finished tournament (first pass) or when `session.userValues` already exists (rail revisit — `finalizeValues` cleared the tournament, so there is no order to fall back to and a partial list is a 400).
- **Sessions are user-bound**: `createSession` stores `userId`; every route reads its session through `ownSession(req, id)` → `store.require(id, req.user.id)`, and a foreign session is the same 404 as an unknown one (never 403). Rate limits key on `user:<id>` when signed in, on IP under the bypass. `/api/health` carries only `auth: "supabase"|"bypass"` and `savedPaths: bool` — never a URL or key.
- **Single-instance invariant**: the session `Map`, single-flight lock, and rate-limit counters are process-local — never run >1 instance (see `render.yaml` + the boot warning on `WEB_CONCURRENCY>1`).
- Refine payload: `{outputId}` — the route takes no other input; every refine is a regeneration from an unused field family.
- `output.socCode` (O*NET-SOC) + `output.onet` (`soc/jobZone/jobZoneLabel/skills/tech/related/usMarket/attribution` + optional `salary/outlook`): the SOC must come from the prompt shortlist; salary/outlook are US-market and must stay visibly US-flagged in the UI; the attribution line must render wherever O*NET data shows.
- **O*NET license conditions — do not remove**: the `OnetAttribution` block on the entry screen (official "O*NET in-it" badge — a local copy in `frontend/src/assets/onet-in-it.svg`, adapted to the light theme (transparent, monochrome ink fills; shapes unchanged) + the exact "This site incorporates information from O*NET Web Services… O*NET® is a trademark of USDOL/ETA." sentence) and the `ONET_ATTRIBUTION` footnote in the details panel. Wording and the badge shapes are fixed by the USDOL/ETA developer terms; the API key goes only in the `X-API-Key` header, never in URLs.
- Big Five items are serialized **without** `trait`/`reverse`; RIASEC items **without** `type` — never leak a scoring key.

## Testing

`backend/tests/` uses `node:test` (185+ tests; route tests boot the app with `app.listen(0)` and hit it with `fetch` — **no supertest**): route guards and step ordering, RIASEC scoring, the values tournament (720-permutation optimality) + work-values derivations/fit properties, CV extraction + the CV single-flight lock, the error-handling/request-id contract, the full output loop (first → refine → refine → accept → roadmap), AI payload normalizers, session serialization + Redis migration, the dev seeder + its gate, and rail navigation (goto bounds, round-trip data integrity, values re-confirm). `auth.test.js` runs with auth on against a local JWKS server (no token / bad signature / expired / wrong aud+iss → 401, foreign session 404, dev jump never adopts a foreign session, accept → one saved-path write, roadmap → same row). Env read at module load must be set before `require("../server")` — `node --test` gives each file its own process, which is why the dev gate needs both `devJump.test.js` (token set) and `devJumpDisabled.test.js` (token unset). Run with `cd backend && npm test`. Frontend: Vitest over every engine in `frontend/src/motion/` and each screen's reduced-motion/static state, plus `frontend/src/lifePath.js` (output-chain graph builder, dock state machine, rank-list helper, work-values + archetype, rail reachability) and `frontend/src/devMode.js` (dev token capture) — `cd frontend && npm test -- --run`.
