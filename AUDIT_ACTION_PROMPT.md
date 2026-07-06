# Action Prompt: Fix Audit Findings in Life Path Explorer

You are working in the **Life Path Explorer** repository. It is a two-part web app: a psychological survey (demographics → Big Five → 40 A/B values questions) whose profile feeds an AI engine (OpenAI `gpt-4.1-mini`, JSON mode) that proposes a career direction, three professions, and a step-by-step roadmap rendered as an interactive React Flow graph.

**Active code:** `backend/` (Node 22+, Express 5, CommonJS) and `frontend/` (React 19 + Vite + `@xyflow/react`).
**Legacy code:** `server/` and `client/` — an older parallel implementation. Task P0-1 deletes them; do not modify them otherwise.

Ground rules:
- Backend tests run with `cd backend && npm test` (`node --test tests/*.test.js`). All 39 existing tests must stay green after every task. Add tests where a task says so.
- The app must keep working **without** `OPENAI_API_KEY` (deterministic fallbacks) — verify both modes when you touch AI paths.
- Work through tasks in priority order (P0 → P1 → P2). One commit per task, message format `fix(scope): summary (audit P0-N)`.
- A full audit with context for every task is in `AUDIT_FINDINGS.md` at the repo root — read it first.

---

## P0 — correctness and data-loss (do these first)

### P0-1. Remove legacy `server/` and `client/`, fix stale docs
- Delete the `server/` and `client/` directories entirely. Before deleting, check whether `server/.env` exists on disk; if it does, delete it and **tell the user to rotate the OpenAI key that was inside it** — do not print the key.
- Tag the pre-deletion commit `archive/legacy-cra-2026-07` so the code stays one `git checkout` away.
- Rewrite the root `CLAUDE.md` to describe the actual architecture (`backend/` + `frontend/`, the session step machine `demographics → depth_choice → big_five → values → complete`, the Life Path flow `direction → narrowing → professions → roadmap`, dev commands `npm run dev` at root, ports 3001/5173). Remove every mention of `client/`, `server/`, AppContext, `/api/generate-paths`, tradeoff modals.
- In `README.md`, delete the stale "Session + Questions" routes (`POST /api/session/premium`, `POST /api/questions/answer`) and document the real ones (`/api/session/demographics`, `/api/session/big-five-depth`, `/api/big-five/answer`, `/api/values/answer`). Remove `client/build/`, `server/dist/` lines from `.gitignore`. Also remove the stray `*.png` screenshots at repo root from git tracking.
- **Done when:** `git grep -l "generate-paths\|AppContext\|tradeoff"` returns nothing outside `docs/` history plans and `AUDIT_*`; `npm test` green; `npm run dev` boots both processes.

### P0-2. Fix the Mini-IPIP-20 scoring key (`backend/bigFiveItems.js`)
The 20-item fallback set has two deviations from the published Mini-IPIP (Donnellan et al., 2006):
- Line 12, `mip_8`: `"I have difficulty understanding abstract ideas."` is keyed `trait: "C", reverse: true`. It is an **Openness** item. Replace it with the real Mini-IPIP C item `{ id: "mip_8", trait: "C", reverse: false, text: "I like order." }`.
- Line 19, `mip_15`: `"I have excellent ideas."` is not a Mini-IPIP item. Replace with the real O item `{ id: "mip_15", trait: "O", reverse: true, text: "I have difficulty understanding abstract ideas." }`.
- After the fix the set must have exactly 4 items per trait with reverse keys matching the published instrument: E (2R), A (2R), C (2R), N (2R), O (3R: mip_10, mip_15, mip_20).
- Add a test in `backend/tests/` asserting: 20 items, 4 per trait, the exact reverse-key distribution above, and that no item text appears under two different traits across `MINI_IPIP_20` and `IPIP_50`.
- **Done when:** new test passes; `computeBigFiveScores` output for an all-"3" answer set returns 50 for every trait.

### P0-3. Session persistence across reloads (frontend) + TTL cleanup (backend)
- Frontend: persist `sessionId` to `localStorage` when a session starts (`frontend/src/App.jsx`, `handleStartSession`). On app mount, if a stored id exists, call the existing `GET /api/session/:sessionId`, feed the response through `applySessionSnapshot`, and restore the correct screen: `stage="survey"` when `step !== "complete"`, `stage="tree"` when the snapshot has `directionQuestions.length > 0` or a `direction`, otherwise the "Assessment complete" card. Derive `demoIndex`/`bigFiveIndex`/`valuesIndex` from the first unanswered question so the user resumes mid-survey. Clear the stored id on `resetAll` and on a 404 from the restore call.
- Backend: add TTL eviction to `SessionStore` (`backend/sessionStore.js`) — a sweep (e.g. `setInterval` started in `server.js`, unref'd) that deletes sessions with `updatedAt` older than 24h. Make TTL and sweep interval constructor options so tests can use short values.
- Add tests: store test for eviction; a supertest flow proving `GET /api/session/:id` returns enough state to resume (it already serializes questions + answers — assert that).
- **Done when:** manual check — complete 5 answers, reload the page, you continue from question 6; backend test for eviction passes.

### P0-4. Basic abuse protection on AI-spending routes
- Add `express-rate-limit` (new dependency in `backend/`): a global limiter (e.g. 300 req / 15 min / IP) plus a strict one (e.g. 10 req / 15 min / IP) on the five AI-calling routes: `/api/session/big-five-depth`, `/api/direction/question`, `/api/direction/confirm`, `/api/direction/refine`, `/api/professions/narrow` (last-answer call), `/api/roadmap/generate`.
- Restrict CORS: `cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:5173"] })` in `backend/server.js:36`.
- Cap `dreamAnswer` length in `/api/session/start` (`backend/server.js:68`) — trim and reject or slice at 500 chars, mirroring the existing `feedbackText` cap (`server.js:315`).
- **Done when:** tests cover the dream-length cap and a 429 after exceeding the strict limit; the frontend flow still works (limits must be generous enough for one human session — a full session makes ~70 requests, only ~6 of them AI-priced).

---

## P1 — validity and trust (product core)

### P1-1. Make static IPIP the default; gate AI item generation
- In `backend/aiEngine.js` (`generateBigFiveItems`, lines ~473-507): return `getFallbackItems(depth)` by default. Only attempt AI generation when `process.env.AI_BIG_FIVE_ITEMS === "true"`.
- When AI generation is enabled, harden validation before accepting: exactly `count/5` items per trait; between 30% and 70% of each trait's items reverse-keyed; all `id`s unique (else reassign `ai_N`); reject duplicate item texts. On any violation fall back to static items (current behavior).
- Add tests for the validator with malformed payloads (uneven traits, duplicate ids, all-forward keys).
- **Done when:** default flow serves identical validated IPIP items for every session; tests pass.

### P1-2. Fix the alphabetical tie-break in direction selection
- `backend/directions.js` `computeDirection` (lines 172-199): with 3 questions and ≥8 distinct `directionId`s across options, a 1-1-1 vote is the common case and currently resolves to the alphabetically-first direction — a systematic bias (live-verified in the audit).
- Implement a real resolution: when the top vote count is shared by 2+ directions, **do not auto-pick**. Return the tied ids (e.g. `{ tie: true, candidates: [...] }`); in `/api/direction/answer` (`backend/server.js:254-262`), when the tally ties, set `proposedDirection = null` and expose the tied candidates in the snapshot; the frontend dock shows a "Which of these pulls you most?" card listing the 2-3 tied direction labels — reuse the existing `direction-pick` card pattern in `frontend/src/App.jsx` (lines ~917-942). A single clear winner keeps the current auto-propose behavior.
- Update `backend/tests/directions.test.js` for the tie contract and keep the "no votes → first non-excluded" fallback for the keyless refine path.
- **Done when:** a 1-1-1 vote surfaces a user choice instead of "Agriculture wins by alphabet"; unique-winner and refine flows unchanged; tests green.

### P1-3. Surface fallback/offline mode honestly
- The `/api/health` endpoint already reports `hasOpenAIKey`. Include an `aiEnabled: Boolean(client)` flag in every session snapshot (`backend/sessionStore.js` `serializeSessionState` — pass it from `server.js`), or fetch health once at app start.
- Frontend: when `aiEnabled` is false, show a small persistent notice ("Demo mode — answers are matched by fixed rules, not AI") on the survey and tree screens, and in the refine card replace the free-text promise: hide the textarea or label it as unused in demo mode (currently `fallbackRefineDirection` ignores the text while the UI says "Thinking…").
- **Done when:** running without `OPENAI_API_KEY` visibly labels the experience; with a key, nothing changes.

### P1-4. Timeouts and retry affordance on AI calls
- Backend: construct the OpenAI client with a sane timeout (`new OpenAI({ apiKey, timeout: 30_000, maxRetries: 1 })` in `backend/aiEngine.js:340`). A timeout then flows into the existing catch → fallback path.
- Frontend: give `request()` in `frontend/src/api.js` an `AbortController` with a ~45s timeout and map aborts to a readable error. Add a "Try again" button next to the dock/graph error text (`frontend/src/App.jsx:1223`) that re-invokes the last failed action (at minimum for `handleEnterLifePath`, `handleConfirmRoadmap`, `handleRefineDirection`).
- **Done when:** killing the backend mid-flow shows an error with a working retry once it is back; no infinite "Thinking…" is possible.

### P1-5. Disclaimer + uncertainty framing
- Add a one-line disclaimer on the entry screen and the profile panel (`frontend/src/components/ProfileCharts.jsx` `ProfilePanel`): this is an exploratory self-reflection tool, not professional career counseling or a psychological assessment.
- Label the profile "Preliminary profile"; when `bigFiveDepth === "short"`, add "based on a 20-item short screen" next to the radar chart.
- Rename `behaviourTendencies`/`decisionPriorities` semantics in copy to their psychometric names (Stability/Plasticity) or explain them; the formulas in `backend/questionEngine.js:155-165` are correct — this is a naming/communication fix only (do not change the math; the digest consumed by prompts may keep existing keys).
- **Done when:** both screens show the disclaimer; profile reads as preliminary; no API contract break.

### P1-6. De-bias the values inventory (content edit, no schema change)
Edit `VALUES_ROWS` in `backend/questionPool.js:78-127`, keeping 5 questions per dimension and the `A = dimension-aligned` scoring convention **but** counterbalancing presentation:
- Add a per-question `flip` flag (or randomize A/B render order per session on the backend when serializing `serializeValueQuestion`) so the dimension-aligned pole appears on the left only ~half the time. Scoring must respect the flag — adjust `computeValuesScores` accordingly and cover with a test.
- Rewrite the near-duplicate pairs so each asks something distinct: `economic_return` #2 vs #5 and #3 vs #4; `achievement` #1 vs #5.
- Soften social desirability in `meaning_impact`: make each B option a genuinely attractive alternative (e.g. "Focus on results and outcomes" → "Build things whose impact shows up in the numbers").
- Resolve the cross-dimension collision: `lifestyle` #3 (fixed vs flexible hours) vs `independence` #4 (control over schedule) — replace one of them with a non-schedule item for its dimension.
- Stop showing the dimension label/emoji during questioning (`frontend/src/App.jsx:194-198`); keep the "N of 40" counter, reveal dimensions only in the profile panel afterwards.
- **Done when:** no two questions are near-paraphrases; aligned pole side is balanced ~50/50; dimension names are hidden during the survey; scoring tests updated and green.

---

## P2 — quality of life

### P2-1. Overall progress + honest time estimate
Add a thin overall progress bar across survey stages (demographics + Big Five + values as one journey) in `frontend/src/App.jsx` (`stepProgressText` area), and extend the depth-choice card copy to state the total remaining ("Short: ~63 questions total, 8-12 min").

### P2-2. Trim snapshot payloads
`sendSessionSnapshot` (`backend/server.js:43`) re-sends all question lists on every answer. Send static lists (`demographicQuestions`, `valuesQuestions`, `bigFiveItems`) only on `/api/session/start`, `GET /api/session/:id`, and when they change (`big-five-depth`); answer endpoints return only dynamic state. Update `applySessionSnapshot` to merge instead of replace. Remove the unused `nextQuestion`/`valuesDimensions` extras the frontend never reads.

### P2-3. Dead code and duplicated constants
- Delete `BRANCH_THEMES` from `backend/questionPool.js:1-37` (exported, never imported).
- Single-source cross-layer constants: serve `VALUES_DIMENSIONS` and refine reasons from the backend snapshot (frontend copies live in `frontend/src/components/ProfileCharts.jsx:32-41` and `frontend/src/App.jsx:247-252`), or add a contract test that fails on drift.

### P2-4. Mobile polish
At ≤480px: fix the graph header grid (`frontend/src/components/GraphView/GraphPage.css`) so logo/hint don't wrap into a broken column; give the profile panel an explicit close/back affordance covering the graph; slightly larger tap targets for roadmap nodes.

### P2-5. Frontend smoke tests + CI
- Add Vitest + React Testing Library to `frontend/`: test `buildLifePathGraph` (node/edge shapes for direction → professions → multiple roadmaps) and the dock-card state machine (which card renders for a given session snapshot).
- Add a GitHub Actions workflow running backend `npm test` and frontend tests on push/PR.

### P2-6. (Research track) Ground recommendations in real data
Prototype a mapping from the profile to Holland RIASEC codes (O*NET Interest Profiler items are public domain, like IPIP) and enrich professions/roadmaps with O*NET/ESCO occupation data (outlook, typical entry paths) either in the prompt as retrieved context or as a post-generation validation list. Keep the LLM for narrative, use data for the *set* of professions offered.

---

## Final verification (after all P0+P1)

1. `cd backend && npm test` — all green, including new tests.
2. Keyless run: full flow entry → roadmap works, demo-mode notice visible, direction tie asks the user instead of silently picking.
3. Keyed run (if a key is available): AI paths respond, timeouts/retries in place, static IPIP items served by default.
4. Reload mid-survey and mid-tree: session resumes in place.
5. `git grep -n "BRANCH_THEMES\|generate-paths\|AppContext"` → no hits in active code.
