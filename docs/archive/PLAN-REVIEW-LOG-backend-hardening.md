# Plan Review Log: Backend quality & reliability hardening (post Work-Values migration)
Act 1 (grill) complete — plan locked with the user. MAX_ROUNDS=5.

Grill decisions: focus = backend quality/reliability; deploy = single instance forever;
baseline = commit migration first, fixes separate; breadth = maximum (bugs + hardening + tests +
observability + doc-rot); observability = shared `sendError` + request-id + dependency-free JSON
logger.

Reviewer model: gpt-5.5 (config default gpt-5.3-codex 400s on ChatGPT-account auth; overridden with
`-c model="gpt-5.5"`). codex-cli 0.144.5. thread_id=019f75cd-3dea-7cc1-b4df-2e6259e86686.

## Round 1 — Codex
No files modified. VERDICT: REVISE. Ten findings (severity order):

1. `sendError` only migrating `catch` tails misses the many direct `res.status(...).json(...)`
   responses (4xx at server.js:184/207, 409 locks at :612, Multer at :760); the planned wrong-step
   `requestId` test would fail. Fix: route every error path (direct 4xx, 409, Multer, rate-limit)
   through the shared mechanism.
2. Request-id "before routers" still lets `express.json` parse errors / stray `next(error)` bypass
   route catches. Fix: request-id before body parsers + a final JSON error middleware after Multer.
3. `error.statusCode || 500` unvalidated → malformed/library statuses can leak under `<500`;
   `sendError` also lacks the `scope` that `logError(req, scope, err)` requires. Fix: clamp status to
   int 400..599, unify logger signature.
4. Test stubs `store.require`, but `store` is module-local and server.js exports only `{ app }`. Fix:
   a real seam (`createApp({ store, aiEngine, locks })` or a test-only export/reset).
5. Clearing `valuesTournament` as a separate mutator after `setUserValues` risks out-of-order
   fire-and-forget Redis writes resurrecting it on hydrate. Fix: one confirm mutation (set userValues
   + null tournament + advance + persist once).
6. CV lock copies the raw `${sessionId}:...` pattern → missing/malformed ids collide on
   `undefined:cv`. Fix: `store.require(sessionId)` first, then lock on `${session.id}:cv`.
7. Sequential CV double-submit returns **400** after step advances to `summary` (:455/:488), not a
   "clean snapshot". Fix: make CV idempotent post-summary OR assert 400 + no duplicate state.
8. Doc-rot underscoped — stale Schwartz/old-flow claims also in README.md, ARCHITECTURE.md,
   directions.js:4, build-onet-snapshot.js:9. Fix: grep all non-archived docs/comments, update or
   explicitly exclude.
9. Comment + startup log isn't a real "guard" against a future scaling config. Fix: pin the
   constraint in owned deploy config + fail-loud on multi-process signals.
10. Plan claims `supertest`, but backend/package.json has none; existing route tests use `fetch`
    against `app.listen`. Fix: match the existing fetch style or add supertest.

### Claude's response (Round 1)
Verified all 10 against the code — **all 10 accepted, none rejected.** Confirmations: no `supertest`
dep (`"test": "node --test tests/*.test.js"`, tests use `app.listen(0)`+`fetch`) [F10]; doc-rot
genuinely spread to README/ARCHITECTURE/PROJECT_STATUS + directions.js:4 + build-onet-snapshot.js:9
[F8]; `render.yaml` **exists** so the single-instance constraint has a real config home [F9]; the
"schwartz" strings in test files are **negative regression assertions** (`schwartzValues === undefined`,
`!/schwartz/i.test(digest)`) — protective guards, must NOT be rewritten [F8 nuance]; direct 4xx/409
and Multer responses are indeed non-`catch` paths [F1]. Two findings resolved with a lighter approach
than Codex's literal suggestion (logged): **F4** — a test-only export (`store`, `__locks`) + monkeypatch
in an isolated test file, chosen over a `createApp` DI factory (single consumer; factory = broad
server.js refactor); **F9** — detect + loud-warn + pin `numInstances:1` in the existing `render.yaml`,
framed honestly as documentation+detection, not true prevention. PLAN.md revised: section 2
(require-then-lock, 400-not-clean-snapshot test), section 3 (rewritten — `fail` for direct 4xx/409 +
`sendError` for catch tails + request-id mounted first + `resolveStatus` clamp + unified `logError`
signature + final JSON error middleware), section 4 (single atomic `finalizeValues` mutation), section
5 (render.yaml pin + WEB_CONCURRENCY loud-warn), section 6 (include/exclude doc-rot split with the
protective-assertion and historical-docs carve-outs), plus the shared test seam (fetch style, no
supertest) and updated Key-decisions/Risks.

## Round 2 — Codex (resume, same thread)
Round 1 blockers confirmed addressed "in shape." VERDICT: REVISE. Five remaining (mostly test-depth
+ one security nuance):

1. **Security:** `logError` deriving `route` from `req.path`/`req.originalUrl` leaks the session UUID
   (a bearer secret) for `GET /api/session/:sessionId`, and query strings via `originalUrl`. Fix: log
   the route template (`req.baseUrl + req.route.path`), redact UUID-like segments otherwise, never
   `originalUrl`.
2. The 500 test asserts the response body but not the **logger** → observability can regress silently.
   Fix: capture `console.error`, assert one JSON line with `reqId`/`method`/redacted route/`status:500`/
   truncated `stack`; assert the 4xx test emits no error log.
3. The tournament test (`=== null` + serialized nulls) would still pass with a racy multi-write impl.
   Fix: fake-Redis counting test asserting exactly one persisted write with `valuesTournament:null` +
   `userValues` + `step:"job_characteristics"`.
4. Sequencing section still names baseline doc cleanup as only CLAUDE.md + two aiEngine comments while
   Section 6 moves README/ARCHITECTURE/PROJECT_STATUS/directions/build-onet into baseline →
   commit-boundary ambiguity. Fix: point sequencing at Section 6's full list.
5. Request-id sanitization ("≤64" + "sanitize/truncate") can echo an empty id for all-invalid-char
   headers. Fix: sanitize → truncate → require non-empty → else `randomUUID()`.

### Claude's response (Round 2)
Verified all 5 against the code — **all 5 accepted, none rejected.** Confirmed the UUID-leak vector is
real and unique to the one path-param route (`GET /api/session/:sessionId`; every mutating route takes
`sessionId` in the body, not the path) [R2-1]; the `SessionStore` constructor already accepts
`{ redis }`, so a counting fake-Redis test for `finalizeValues` is directly feasible [R2-3]; the
sequencing/Section-6 baseline doc lists were genuinely inconsistent [R2-4]. PLAN.md revised: section 3
logger now logs a route **template / UUID-redacted** route (never `originalUrl`) and the request-id
sanitize order is explicit (sanitize→truncate→non-empty→UUID); section 3 tests add a **logger-capture
assertion** (one JSON line, redacted route, no error log on 4xx) and the empty-id fallback case;
section 4 adds the **fake-Redis single-write atomicity test**; the Sequencing baseline bullet now
**defers to Section 6's authoritative include list** for commit boundaries.

## Round 3 — Codex (resume, same thread)
All Round 2 findings confirmed addressed (route-template/redacted logging, deterministic request-id
sanitization, logger assertions, single-write `finalizeValues` persistence test, baseline/Section-6
sequencing). No new material blockers. Remaining risks are implementation details already named in the
plan: middleware order, restoring monkeypatches/seeded locks in tests, disciplined doc include/exclude.

VERDICT: APPROVED

### Claude's response (Round 3)
Converged after 3 rounds. Plan locked pending user sign-off — no code written in either act.
