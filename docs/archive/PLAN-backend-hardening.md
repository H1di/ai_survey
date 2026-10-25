# Plan: Backend quality & reliability hardening (post Work-Values migration)
_Locked via grill — by Claude + Eugene (h1di)_

## Goal
Harden the Life Path Explorer backend **on top of the already-verified, uncommitted
Work-Values migration**, without touching product scope or the assessment/engine flow. Fix a
small set of real defects, add cheap robustness, introduce lightweight observability, close the
migration's documentation debt, and cover every fix with a regression test. The app must keep
working **keyless** (deterministic fallbacks) — an invariant of this repo — and every AI generator
already swallows its own errors into a fallback (verified in `aiEngine.js`), so no route depends on
a live OpenAI call succeeding.

**Deployment invariant (confirmed with the user): the backend runs as exactly ONE instance,
now and going forward.** The in-memory session `Map`, the process-local single-flight lock
(`inFlightKeys`), and Redis-as-write-through-mirror are therefore *correct*, not bugs. This plan
does **not** add distributed locking or make sessions Redis-authoritative; it documents and guards
the single-instance assumption so horizontal scaling can't be enabled silently and break session
routing.

## Sequencing / diff hygiene (user decision)
- **Baseline commit (prerequisite, no new logic):** commit the existing Work-Values migration
  exactly as it stands (25 changed + 7 new files, backend 156/156 + frontend 24/24 green, browser-
  walked). Fold into this same baseline the **migration's own documentation self-consistency** —
  which is precisely the **UPDATE (living docs)** and **UPDATE (stale source comments)** buckets
  enumerated in **Section 6** (`CLAUDE.md`, `README.md`, `ARCHITECTURE.md`, `PROJECT_STATUS.md`;
  `directions.js:4`, `build-onet-snapshot.js:9`, `aiEngine.js:632/689`). **(Codex R2 — commit-boundary
  consistency: the authoritative doc list lives in Section 6; this bullet defers to it rather than
  naming a shorter subset.)** Also commit the archived planning docs
  (`PLAN-work-values-migration.md`, `PLAN-REVIEW-LOG-work-values-migration.md`,
  `WIP-STATUS-work-values-migration.md`). Rationale: all of the above document *the committed code*,
  so they belong with it and keep the baseline self-describing. The new docs introduced by *this*
  plan (single-instance constraint, logging convention) stay with their fix commits.
- **Fix commits (this plan):** the new backend-quality work below, as separate, individually
  reviewable/revertable commits on top of the baseline. They must not be entangled with the
  migration diff.

## Approach

Numbered fixes. Each carries its own regression test. **Test style (Codex R1 correction):** the
repo has **no `supertest`** — `backend/package.json` runs `node --test tests/*.test.js` and existing
route tests boot the real app with `app.listen(0)` and hit it with `fetch` (see
`tests/server.test.js`). New tests follow that exact style; do **not** introduce `supertest`. (The
CLAUDE.md phrase "node:test + supertest" is itself doc-rot — corrected in fix 6.) Run
`cd backend && npm test`. None of these changes product behavior or the assessment/engine contracts.

**Shared test seam (Codex R1 — enables the 500 and lock tests).** `server.js` currently exports only
`{ app }`, and `store`/`inFlightKeys` are module-local, so the planned tests can't reach them. Add a
**test-only export** from `server.js`: `{ app, store, __locks: inFlightKeys }` (or
`acquireLock`/`releaseLock`). The 500-leak test monkeypatches `store.require` to throw a bare `Error`
and restores it after; the CV-lock test seeds `__locks` with the key and asserts 409. Chosen over a
full `createApp({ store, aiEngine, locks })` factory (Codex's alternative) because there is a single
test consumer and the factory would be a broad server.js refactor — the light seam is proportionate.
Put these tests in a **dedicated file** (like `rateLimit.test.js`, which already runs in its own
process) so the `store.require` monkeypatch can't leak into other suites.

### 1. Multer size-message mismatch (real bug — trivial)
- `cvUpload` caps file size at **5 MB** (`server.js:429`), but the Multer error handler returns
  `"File too large (max 2 MB) or malformed upload."` (`server.js:760`). Correct the text to **5 MB**
  (matches the limit and CLAUDE.md's "5 MB cap").
- **Test:** post a `LIMIT_FILE_SIZE` Multer error through the handler (or an oversized buffer to
  `/api/cv`) and assert status 400 + the message says `5 MB`, not `2 MB`.

### 2. Single-flight lock on CV completion (real gap — plan Section G of the migration was not implemented)
- `/api/cv` (`server.js:451`) and `/api/cv/journey` (`server.js:484`) have **no single-flight lock**,
  so two concurrent submits both pass the `step === "cv"` check, both run AI
  (`analyzeCV` + `generatePersonaSummary`), both `advanceStep("summary")` — double OpenAI spend and
  a doubled persona generation.
- Fix: reuse the **existing** `acquireLock`/`releaseLock`. **Require-then-lock (Codex R1):** the
  output routes lock on a raw `` `${sessionId}:...` `` *before* `store.require`, so a missing/malformed
  id becomes a shared `` `undefined:cv` `` bucket (unrelated bad requests collide, and an unknown
  session 409s instead of 404ing). For CV, first `store.require(sessionId)` synchronously (throws 404
  for missing/unknown), **then** `acquireLock(`${session.id}:cv`)` on the canonical id, before the
  first `await`. Release in `finally`; return **409** (`"Another change to this path is still
  processing."`) on a busy key.
  - **Ordering note:** for `/api/cv` the handler runs *after* `cvUpload.single("file")`, so
    `req.body.sessionId` is already populated (Multer parses the multipart body first).
    `/api/cv/journey` is JSON-bodied, so `sessionId` is likewise available. Multer still buffers the
    (≤5 MB) upload before the require+lock, which is acceptable.
  - **Note the shared latent bug:** the output/roadmap routes have the same lock-before-require
    ordering; optionally apply the same require-then-lock fix there for consistency (low priority,
    pre-existing, out of this plan's core scope — flag, don't silently expand).
- **Test (fetch/app.listen style):** deterministic true-concurrency is impossible here (the module
  instantiates `aiEngine` at load; keyless `analyzeCV` returns instantly), so: (a) **seeded-lock
  test** — via the test seam, add `` `${sid}:cv` `` to `__locks`, POST `/api/cv`, assert **409**;
  (b) **sequential double-submit** — first `/api/cv` completes (step advances to `summary`); the
  second POST returns **400** (`"Not currently in the CV step"`, server.js:455/488) with **no
  duplicate state change** (persona not regenerated, still one advance). **Codex R1 correction:** the
  second sequential call is a 400, *not* a "clean snapshot" — the test asserts 400 + no-duplicate,
  which is the correct, honest behavior (idempotency is not added; the lock covers the concurrent
  case, the step guard covers the sequential one).

### 3. `error.message` leak on unexpected 500s + lightweight observability (converged into one mechanism)
Chosen shape (user decision): a **shared `sendError` helper + a request-id middleware + a tiny
dependency-free JSON logger** — no `pino`, no central `next(err)` rewrite. This fixes the leak and
adds tracing in one consistent, low-churn mechanism.

- **`backend/logger.js` (new, no deps):** `logError(req, err)` emits a single
  `console.error(JSON.stringify({ t, lvl:"error", reqId, method, route, msg, status, stack }))` line.
  **Signature unified (Codex R1):** no separate `scope` param — scope is derived from the request.
  **Route must NOT leak the session UUID (Codex R2 — security):** `GET /api/session/:sessionId`
  carries the session bearer id in its path, so log the **route template** — prefer
  `req.route ? req.baseUrl + req.route.path : redactUuids(req.path)` — and **never** `req.originalUrl`
  (query strings). `redactUuids(path)` replaces UUID-like segments with `:id` for the final-middleware
  case where `req.route` is unset. Include a **truncated `stack`** for 500s so real faults are
  debuggable in Render logs. Keep `console.log` for startup lines. Guard for a missing `req` (unit
  calls).
- **Request-id middleware — mounted FIRST, before body parsers AND rate limiters (Codex R1):** set
  `req.id` from an incoming `X-Request-Id` header in this **explicit order (Codex R2)**: sanitize to
  `[A-Za-z0-9._-]` (strip everything else — prevents log/header injection) → truncate to 64 chars →
  accept **only if the result is non-empty**; otherwise `randomUUID()`. (An all-invalid-char header
  must fall back to a UUID, never echo an empty id.) Set the `X-Request-Id` **response header
  immediately**. Mounting it ahead of `express.json` and the
  limiters means **every** response — including malformed-JSON 400s, rate-limit 429s, and Multer
  400s — carries the trace header, even the ones that never reach a route body.
- **Status clamp (Codex R1):** a shared `resolveStatus(error)` coerces `error.statusCode` to an
  integer and clamps to `400..599`, defaulting anything non-finite/out-of-range to **500**. Both
  helpers below use it, so a stray library status can't produce a bad response or a `<500` leak.
- **Two thin exit helpers (Codex R1 — direct responses need coverage too):** the leak/observability
  fix must reach the **direct** `res.status(...).json(...)` calls (400s at server.js:184/207/…, the
  **409** lock responses at :612/:640/:698/:731, and the Multer handler at :760), not just `catch`
  tails — otherwise those paths carry no `requestId` and the request-id test is inconsistent.
  - `fail(res, req, status, message)` — for **intentional client errors** (the inline 4xx/409): returns
    `res.status(clamp(status)).json({ error: message, requestId: req.id })`. Convert the inline
    `res.status(4xx|409).json({ error })` calls to `fail(...)`. Messages are ours and safe, so they
    pass through unchanged (preserves every existing 4xx-message test assertion).
  - `sendError(res, req, error, fallbackMessage)` — for **`catch` tails**: if `res.headersSent`
    return; `status = resolveStatus(error)`; for **< 500** → `{ error: error.message, requestId }`
    (intentional message); for **500** → `logError(req, error)` + `{ error: fallbackMessage, requestId }`
    (generic — no internal `error.message` leak). Never log 4xx as errors. Replace each route's
    `catch` tail with `return sendError(res, req, error, "<route-specific friendly message>")`; the AI
    routes keep their good fallback strings, the non-AI routes get a short generic. The pre-existing
    `console.error("[route]", error)` calls are subsumed by `logError`.
- **Final Express JSON error middleware (Codex R1) — mounted last, AFTER the Multer handler:** catches
  framework errors that bypass route `catch` blocks (`express.json` parse/`entity.too.large`
  SyntaxErrors, any stray `next(error)`). Maps a JSON body-parse error to a **400 generic**
  (`"Malformed or oversized JSON body."`), everything else through `sendError`/`resolveStatus` to a
  **500 generic** — always with `requestId`, never leaking framework internals. The existing Multer
  middleware stays (fix 1 only corrects its text); this new handler sits after it and must not
  re-map Multer errors.
- **Response-shape note:** adding `requestId` to error bodies is **additive**; the frontend reads
  `data.error` and is unaffected. Success bodies are unchanged.
- **Tests (fetch/app.listen + the test seam):** (a) force a non-`statusCode` throw — monkeypatch the
  exported `store.require` to throw a bare `Error` — assert 500 with the **generic** message (not the
  internal text) **and** a body `requestId`; (b) a 4xx path (wrong-step) still returns its specific
  message and a body `requestId` (proves `fail` covers direct responses); (c) the **`X-Request-Id`
  response header** is present on a normal response and echoes a supplied, sanitized inbound id, and
  an all-invalid-char inbound id is replaced by a fresh UUID (not echoed empty); (d) a malformed-JSON
  POST returns the 400 generic with a `requestId` (final error middleware).
- **Test the logger itself, not just the body (Codex R2):** in the forced-500 test, capture
  `console.error` and assert **exactly one** parseable JSON line carrying `reqId`, `method`, a
  **route template / UUID-redacted route** (no raw session UUID), `status: 500`, and a truncated
  `stack`. Separately assert the **4xx path emits no error log** (client errors are never logged as
  errors). This guards the observability half from silently regressing while response tests stay green.

### 4. Clear the values tournament after confirm (real perf/waste — hot path)
- `session.valuesTournament` is set at `/api/values/start` and **never nulled**. Because
  `serializeSessionState` calls both `nextComparison` and `finalOrder` (each a full Ford–Johnson
  replay) whenever `session.valuesTournament` is truthy, **every** snapshot for the entire rest of
  the session — job_characteristics, cv, summary, tree, and the whole output loop (many requests) —
  re-runs the FJ sort twice for nothing.
- Fix: **one atomic confirm mutation, one persist (Codex R1).** Do not add a separate
  `clearValuesTournament` write after `setUserValues` + `advanceStep` — that would be three
  fire-and-forget whole-session Redis writes (`sessionStore.js:_persist`), which under out-of-order
  completion could resurrect the tournament on a later hydrate. Instead add a single store method
  `finalizeValues(session, { order, scores, curveVersion, nextStep })` that sets `session.userValues`,
  **nulls `session.valuesTournament`**, sets `session.step = nextStep`, and calls `touch`/`_persist`
  **once** with the fully-final session. Then `valuesComparison`/`valuesRanking` serialize as `null`
  past the values step and the recompute disappears. The tournament stays live from `start` until
  `confirm`, so a refresh mid-comparison or on the reorder table still restores correctly (unchanged).
- **Pre-check (pre-empts a Codex bite):** confirm no frontend code reads `valuesRanking`/
  `valuesComparison` after the values step (the summary/tree screens read `userValues.order`). Grep
  `frontend/src` before removing; if something does, keep the field derivable from
  `userValues.order` instead of recomputing the tournament.
- **Test:** after `/api/values/confirm`, assert `session.valuesTournament === null` (store-level) and
  that a subsequent snapshot serializes `valuesComparison: null` and `valuesRanking: null`.
- **Atomicity test (Codex R2 — the end-state test alone would pass a racy multi-write impl):**
  construct a `SessionStore` with a **counting fake Redis** (the constructor already accepts
  `{ redis }`; the fake records `.set` calls), reset the counter immediately before `finalizeValues`,
  and assert **exactly one** persisted `.set` after it, whose payload contains
  `valuesTournament: null`, the confirmed `userValues`, and `step: "job_characteristics"`. This proves
  the single-write requirement, not just the final field values.

### 5. Document + guard the single-instance invariant (reliability clarity)
A comment + startup log **documents but does not enforce** the invariant (Codex R1 — a future deploy
config could still scale the service). Reframe as **detect + loudly warn + pin in owned config**:
- **Pin it in the owned deploy config:** `render.yaml` **exists** at the repo root — set/confirm the
  backend service to a single instance there (`numInstances: 1`, or the plan-tier equivalent) with a
  comment stating sessions are process-local. This is the real enforcement point we own.
- **Fail-loud on a multi-process signal at startup:** if `WEB_CONCURRENCY` (or a Render-provided
  instance-count env, if one exists) parses to **> 1**, log a prominent `console.error` warning that
  the session store is single-instance and sessions will 404 across processes. Do **not** attempt
  unreliable runtime peer detection.
- Add an explicit comment at the session-`Map` declaration in `sessionStore.js`, a startup log line
  (`"Session store: single-instance in-memory Map (Redis = durability mirror only)."`), and a one-line
  **Deploy constraint** to `CLAUDE.md` + `README.md`.

### 6. Documentation debt cleanup (doc-rot)
Doc-rot is **broader than CLAUDE.md** (Codex R1) — a grep for `schwartz|whyHere|why are you here`
plus old step-order strings must drive this, with an explicit include/exclude split so nothing stale
survives and nothing historical or protective gets wrongly rewritten:
- **UPDATE (living docs — go with the baseline commit, they describe the committed migration):**
  `CLAUDE.md` (incl. its false "node:test + supertest" claim → the repo has no supertest),
  `README.md` (Schwartz lines :8/:36/:60/:75 + the `whyHereAnswer` request body :114),
  `ARCHITECTURE.md` (Russian; Schwartz module/derivations rows, route count "17", `whyHereAnswer`
  start-session line :91), `PROJECT_STATUS.md`.
- **UPDATE (stale source comments — with the baseline commit):** `backend/directions.js:4`,
  `backend/scripts/build-onet-snapshot.js:9`, `backend/aiEngine.js:632/689`. Leave `workValues.js`'s
  own "…the Schwartz model this replaced" wording — that is an intentional, correct description of the
  replacement, not rot.
- **DO NOT TOUCH (protective — leave exactly as-is):** the "schwartz" strings in
  `backend/tests/{sessionStore,server,prompts}.test.js` are **negative regression assertions**
  (`assert.equal(first.schwartzValues, undefined)`, `!/schwartz/i.test(digest)`) that *prove* the
  migration removed Schwartz. Rewriting them would delete a guard.
- **EXCLUDE (dated historical records — mark, don't rewrite):** everything under
  `docs/superpowers/plans/*` and `docs/superpowers/specs/*` (dated 2026-07-09…14) and the
  `*-work-values-migration.md` archives. These are point-in-time history, like the archived migration
  plan.
- The **new** docs this plan introduces — the single-instance Deploy constraint (fix 5) and the
  `sendError`/request-id/logging convention note (fix 3) — go with their respective fix commits.

## Key decisions & tradeoffs
- **Single-instance is a fixed invariant, not a bug to engineer around.** Confirmed with the user.
  We document/guard it instead of adding Redis-authoritative sessions or distributed locks — that
  scope is explicitly rejected as over-engineering for this deployment.
- **Commit the migration first as a clean baseline; fixes as separate commits.** Keeps the verified
  migration reviewable/revertable as one unit and the quality work as another.
- **Observability = homegrown `fail` + `sendError` + request-id + JSON logger, no new dependency.**
  Chosen over `pino`/`pino-http` (overkill for a single-instance app; adds a dep + Render-transport
  config) and over a pure central `next(err)` rewrite (would force route-specific friendly messages
  onto error objects across ~20 routes). Two thin exit helpers cover **both** the `catch` tails
  (`sendError`, 500-genericizing + logging) and the **direct** inline 4xx/409 responses (`fail`), the
  request-id middleware mounts **first** so the trace header is universal (incl. 429/parse-error
  paths), and a **final error middleware** catches framework errors — closing the gaps Codex R1 found
  while keeping each route's friendly message and minimizing churn.
- **Test seam = light test-only export (`store`, `__locks`) over a `createApp` factory.** A single
  test consumer doesn't justify refactoring `server.js` into a DI factory; the exported references +
  a monkeypatch/seed (restored per test, isolated in a dedicated test file) are proportionate.
- **Confirm is one atomic store mutation, one persist.** Avoids the out-of-order fire-and-forget
  Redis writes that could resurrect a nulled tournament on hydrate.
- **`sendError` genericizes only 500s; 4xx keep their message.** This is what makes the change
  non-breaking for the existing 400-message test assertions (grep confirmed no test asserts a 500
  body message today).
- **CV lock reuses the existing `acquireLock` pattern** rather than a new idempotency scheme — one
  concurrency primitive across all AI-spend routes.
- **Every fix ships a regression test**, matching the repo's test culture; the multer message, the
  CV lock, the 500-leak path, and the tournament-clear are all currently uncovered (grep confirmed).

## Risks / open questions
- **CV-lock concurrency test is not fully deterministic** (module-load `aiEngine`, instant keyless
  `analyzeCV`). Resolved via the test seam: a **seeded-lock** test asserts 409 and a **sequential
  double-submit** test asserts the honest **400 + no duplicate state** (not a "clean snapshot").
- **Middleware ordering is load-bearing:** request-id must mount **before** `express.json` and the
  rate limiters (universal header); the **final JSON error middleware** must mount **after** the
  Multer handler and must not re-map Multer errors. `sendError`/`fail` guard `res.headersSent`. Verify
  the request-id → limiters → parsers → routes → Multer → final-error order end-to-end.
- **Status coercion:** `resolveStatus` clamps to integer `400..599` (default 500) so a stray library
  `statusCode` can't yield a malformed response or a `<500` message leak.
- **Request-id header is user-controlled** — sanitized/truncated before logging or echoing to avoid
  log injection / header reflection abuse.
- **Nulling `valuesTournament`** must not break resume: it is nulled only at `confirm` (past the
  values step). Frontend dependency on `valuesRanking` post-values to be grep-verified first.
- **Baseline-vs-fix attribution of CLAUDE.md edits** could blur if implemented carelessly; the plan
  fixes the split (migration-sync content in baseline, new-invariant/observability notes in fix
  commits).
- **Test churn stays green keyless** on both suites (`cd backend && npm test`,
  `cd frontend && npm test -- --run`).

## Out of scope
- No distributed locking, no Redis-authoritative sessions, no multi-instance support (single-instance
  invariant, by decision).
- No change to the assessment flow, the Life Path Engine output loop, scoring, prompts, or any
  product behavior.
- No new runtime dependency (no `pino`, no logging framework); no access/HTTP request logging beyond
  error logging (Render already logs HTTP).
- No change to the O*NET attribution badge/footnote or the `X-API-Key`-header rule (hard license
  constraints).
- The Work-Values migration itself is **not re-litigated** — it is the committed baseline this plan
  builds on; its own review lives in `PLAN-REVIEW-LOG-work-values-migration.md`.
