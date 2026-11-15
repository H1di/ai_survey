# Additions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build everything in the "add" column of the 2026-11-15 architecture map, in an order where each task ships working software on its own.

**Architecture:** Four waves. Wave 0 is safety nets with no dependencies (CI, error alerts, E2E smoke, PII scrub). Wave 1 finishes privacy + accounts (consent gate, saved-path view, delete my data). Wave 2 is measurement (PostHog, day-14 check-in). Wave 3 is the i18n epic, which opens with a spike because two inputs are still unknown. Every addition keeps the keyless rule: no key means a no-op or a deterministic fallback, never a crash.

**Tech Stack:** Node + Express 5 (CommonJS, `node:test`, no supertest), React 19 + Vite + Vitest, Supabase (service-role client on the backend only), Playwright (new, root dev dependency, tests only).

**Spec:** `project-plans/2026-10-12-project-review/PLAN-project-review-tasks.md` (decision log + T1–T13 + epics E3–E5). Tasks 1–3 below are not in that spec; they come from the architecture review of 2026-11-15.

## Global Constraints

- The app must work keyless: without `OPENAI_API_KEY`, `ONET_API_KEY`, `SUPABASE_URL`, `VITE_SUPABASE_*`, `VITE_POSTHOG_KEY`, `ERROR_WEBHOOK_URL`, email key. Verify both modes on every AI or auth path.
- Single instance only. Nothing here may add a second process, a queue or a second session store.
- Every error response carries body `requestId` + `X-Request-Id`; 4xx keep their message, 500s stay generic.
- A foreign or unknown session is 404, never 403. Unknown `/api` paths keep Express's default 404.
- Sessions persisted before a new field existed must still load. Read new fields with a default; do not bump `SESSION_SCHEMA_VERSION`.
- No scoring key leaks: Big Five items without `trait`/`reverse`, RIASEC items without `type`.
- Backend tests: `node:test`, boot with `app.listen(0)` + `fetch`. Env read at module load is set before `require("../server")`.
- No new runtime dependency except `posthog-js` (T11, already decided). Playwright is dev-only.
- Secrets never appear in URLs, logs, health output or alert payloads.
- Under-16 rule: only via a cohort link; no CV upload or paste.

## Review Focus

1. **Deleted user with a live JWT.** After `DELETE /api/me` the access token still verifies against JWKS until it expires (up to 1 h). Expected: the frontend signs out at once; a later `POST /api/session/start` from that token must not recreate a `profiles` row and must answer 401 (not 503: the frontend already signs out on 401, while 503 invites a retry loop). Pinned in Task 8.
2. **Birth year that makes the user 16 this calendar year.** Year arithmetic cannot tell 15 from 16. Expected: treated as under-16 (conservative). Pinned in Task 5.
3. **PII the regexes miss.** A name inside a sentence ("My name is Olena Kovalenko") passes the scrubber. Expected: documented as out of scope in the policy text; the CV-header name line is the only name heuristic. Pinned as a negative test in Task 4 so nobody assumes otherwise.
4. **Alert storm.** A broken upstream produces a 500 per request. Expected: at most one webhook call per route+status per minute, and a failing webhook never turns into a second error. Pinned in Task 2.
5. **Session started before the consent gate shipped.** It has no `cvAllowed`. Expected: reads as allowed, the session continues. Pinned in Task 5.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `.node-version` | The one Node version for CI and Render | 1 |
| `.github/workflows/ci.yml` | + lint, + RLS proof, + e2e job | 1, 3 |
| `backend/core/alert.js` | Throttled webhook notifier, no-op without URL | 2 |
| `frontend/src/ui/ErrorBoundary.jsx` | Catch render crash, report, offer reload | 2 |
| `e2e/smoke.spec.js`, `playwright.config.js` | One keyless walk through the whole product | 3 |
| `backend/engine/piiScrub.js` | Pure `scrubPii` / `scrubCvHeader` | 4 |
| `backend/core/consent.js` | Pure `evaluateGate`, `CONSENT_VERSION`, cohort allowlist | 5 |
| `frontend/src/screens/ConsentScreen.jsx`, `UnderAgeScreen.jsx` | Consent UI + refusal | 6 |
| `frontend/public/privacy.html` | Policy page, static | 6 |
| `frontend/src/screens/SavedPathScreen.jsx` | Read-only saved path | 7 |
| `frontend/src/analytics.js` | PostHog wrapper, no-op keyless | 9 |
| `backend/services/posthogServer.js` | Server events + person deletion | 10 |
| `backend/core/checkins.js`, `.github/workflows/checkins.yml` | Due rows, signed links, runner trigger | 11 |

---

## Wave 0 — safety nets (no dependencies, can run in parallel)

### Task 1: CI runs what already exists

**Files:**
- Create: `.node-version`
- Modify: `.github/workflows/ci.yml`

Context: CI runs Node 20 (end of life); local is 26; Render picks its own. Lint passes today (`cd frontend && npx eslint .` prints nothing) but CI never runs it. `supabase/tests/run-rls.sh` needs only docker.

- [ ] **Step 1:** Create `.node-version` containing `24`.
- [ ] **Step 2:** In `ci.yml`, replace both `node-version: 20` with `node-version-file: .node-version`.
- [ ] **Step 3:** Add `- run: npm run lint` (working-directory `frontend`) before the frontend test step.
- [ ] **Step 4:** Add job `rls`: checkout, then `run: supabase/tests/run-rls.sh`.
- [ ] **Step 5:** Run `cd backend && npm test` and `cd frontend && npm test -- --run && npm run lint` locally. Expected: all green.
- [ ] **Step 6:** Push to a branch; expected: three green jobs. After merge, check the Render deploy log prints Node 24. If Render ignores `.node-version`, set `NODE_VERSION=24` in `render.yaml` instead.
- [ ] **Step 7:** Commit `ci: pin Node 24, run lint and the RLS proof`.

### Task 2: Error alerts

**Files:**
- Create: `backend/core/alert.js`, `backend/tests/alert.test.js`, `frontend/src/ui/ErrorBoundary.jsx`, `frontend/src/ui/ErrorBoundary.test.jsx`
- Modify: `backend/server.js` (error handlers + one route), `frontend/src/main.jsx`, `frontend/src/api.js`, `render.yaml`, `backend/.env.example`

**Interfaces:**
- Produces: `createAlerter({ url, fetchImpl = fetch, now = Date.now, minIntervalMs = 60_000 }) → { notify({ status, route, requestId, message }) → void }`
- Produces: `POST /api/client-error` body `{ message, where }` → 204
- Produces (frontend): `reportClientError({ message, where })` in `api.js`

Decisions: env `ERROR_WEBHOOK_URL`. Payload is `{ text, content }` with the same one-line string in both (Slack reads `text`, Discord reads `content`). The string is `"<status> <route> <requestId> <message>"`; `route` is the UUID-redacted template that `logger.js` already computes, so no session id and no stack leave the server. Throttle key is `status + route`. `notify` never throws and never awaits in the request path.

- [ ] **Step 1: Failing tests** in `alert.test.js`:
  - `no url → fetchImpl never called`
  - `sends one POST with text === content and no stack`
  - `second notify for the same status+route inside 60 s is dropped; after 60 s it sends` (inject `now`)
  - `fetchImpl rejecting does not throw` (Review Focus 4)
- [ ] **Step 2:** Run `node --test tests/alert.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement `createAlerter`.
- [ ] **Step 4:** In `server.js`, call `alerter.notify(...)` wherever `logError` runs for a status ≥ 500. Add `POST /api/client-error`: trims `message` to 300 chars and `where` to 100, logs one JSON line with `kind: "client"`, notifies with status `0`, returns 204; missing `message` → 400. It sits behind the normal auth + global limiter.
- [ ] **Step 5:** Route test in `errorHandling.test.js`: `client-error with message → 204`, `without message → 400 with requestId`.
- [ ] **Step 6:** `ErrorBoundary.jsx`: class component, `componentDidCatch` calls `reportClientError({ message: error.message, where: "render" })` once, renders a screen with the heading "Something broke" and a "Reload" button (`location.reload()`). Wrap `<App />` in `main.jsx`. Vitest: a child that throws renders the heading and calls the reporter once.
- [ ] **Step 7:** Add `ERROR_WEBHOOK_URL` (`sync: false`) to `render.yaml` and `.env.example`. Run both suites. Commit `feat: webhook alerts for 5xx and render crashes`.

### Task 3: One keyless E2E smoke

**Files:**
- Create: `playwright.config.js`, `e2e/smoke.spec.js`
- Modify: root `package.json` (`@playwright/test` dev dependency, script `"e2e": "playwright test"`), `.github/workflows/ci.yml` (job `e2e`), `.gitignore` (`test-results/`, `playwright-report/`)

Why this exists: routes and screens are tested apart; the 1200-line `App.jsx` glue between them is not. This test is the precondition for splitting `App.jsx`.

Decisions: Chromium only. `webServer` runs the production shape, not the dev servers: `npm run build && npm start --prefix backend` (Express serves `frontend/dist` on :3001; no nodemon, no HMR, same path as Render), with `OPENAI_API_KEY`, `ONET_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `DEV_TOOLS_TOKEN` all set to the empty string, so a developer's real `.env` cannot leak into the run (dotenv and Vite do not override variables that already exist; `VITE_*` are read at build time, so they must be empty for the build step too). `reducedMotion: "reduce"` so scenes show their static frame. The test does not use the dev jump: walking the real flow is the point. Selectors are role + accessible name; add a `data-testid` only where a control has no accessible name.

- [ ] **Step 1:** Write `smoke.spec.js`, one test `keyless user reaches a roadmap`: dream answer → 4 demographics → 20 Big Five (always the middle option) → 12 RIASEC → values tournament (always the left card, until the hierarchy screen) → confirm → CV intent → 7 journey answers → summary → continue → first output → Yes → roadmap. Assertions: the output node shows a non-empty profession title; the O*NET attribution line is visible; after accept, at least one roadmap node renders; the page logged no `console.error`.
- [ ] **Step 2:** Run `npx playwright install chromium && npm run e2e`. Expected: PASS in under 60 s. If the run reaches the network for AI, the empty-env assumption is wrong: fix the config, not the test.
- [ ] **Step 3:** CI job `e2e`: `npm ci` (root, backend, frontend), `npx playwright install --with-deps chromium`, `npm run e2e`; upload `playwright-report/` on failure.
- [ ] **Step 4:** Commit `test: keyless end-to-end smoke`.

### Task 4 (T3): PII scrub before prompts

**Files:**
- Create: `backend/engine/piiScrub.js`, `backend/tests/piiScrub.test.js`
- Modify: `backend/engine/prompts.js` (`buildProfileDigest`, `buildRiasecInferencePrompt`, `buildCvParsePrompt`), `backend/tests/prompts.test.js`

**Interfaces:**
- Produces: `scrubPii(text: string) → string`, `scrubCvHeader(text: string) → string`

Decisions: scrub at the prompt boundary, not at storage. The stored dream answer is shown back to the user and must stay verbatim; every prompt string is built in `prompts.js`, so three call sites cover everything. Replacement tokens: `[email]`, `[phone]`, `[link]`, `[handle]`, `[name]`. `scrubCvHeader` replaces the first non-empty line with `[name]` when it has 2–4 words, each starting with an uppercase letter (Latin or Cyrillic), and no digits. CV text goes through `scrubCvHeader` then `scrubPii`; dream and journey answers through `scrubPii` only.

- [ ] **Step 1: Failing tests** in `piiScrub.test.js`:
  - `olena.k+work@example.com.ua → [email]`
  - `+380 (67) 123-45-67`, `067 123 45 67`, `+1-202-555-0143` → `[phone]`
  - `a 4-digit year like 2019 and "5 years" stay untouched`
  - `https://linkedin.com/in/olena`, `www.site.ua/cv` → `[link]`
  - `@olena_k → [handle]`; an email is not turned into `[handle]`
  - `scrubCvHeader("Olena Kovalenko\nProduct designer…")` starts with `[name]`; `"Олена Коваленко"` too
  - `scrubCvHeader("PRODUCT DESIGNER WITH 5 YEARS…")` unchanged (digits); a 7-word first line unchanged
  - `"My name is Olena Kovalenko" passes through unchanged` (Review Focus 3, the documented limit)
  - non-string input returns `""`
- [ ] **Step 2:** Run `node --test tests/piiScrub.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement both functions.
- [ ] **Step 4:** In `prompts.test.js` add `no builder leaks seeded PII`: build the digest, the RIASEC inference prompt and the CV parse prompt from a dream, CV and journey answers that each contain `olena@example.com` and `+380671234567`; assert neither string appears in `system` or `user` of any of them.
- [ ] **Step 5:** Apply the scrubbers at the three call sites. Run `npm test`. Expected: all green.
- [ ] **Step 6:** Commit `feat: scrub emails, phones, links, handles and the CV name line before prompts`.

---

## Wave 1 — privacy + accounts (sequential: 5 → 6 → 7 → 8)

### Task 5 (T6): Consent + age gate, backend

**Files:**
- Create: `backend/core/consent.js`, `backend/tests/consent.test.js`
- Modify: `backend/server.js` (`fail`, `/api/session/start`, `/api/cv`, new `GET /api/me/profile`), `backend/core/sessionStore.js` (`createSession`, serializer), `backend/assessment/questionPool.js` (drop `age`), `backend/core/devSeed.js`, `backend/services/supabaseDb.js`, existing tests that call `/api/session/start`

**Interfaces:**
- Produces: `CONSENT_VERSION = "2026-11"`; `evaluateGate({ consentVersion, birthYear, cohort, now = new Date(), cohorts }) → { ok: true, age, under16, cohort } | { ok: false, status, code, message }`
- Produces: `fail(res, req, status, message, code?)` — body gains `code` when given
- Produces: `POST /api/session/start` body `{ dreamAnswer, consentVersion, birthYear, cohort? }`
- Produces: snapshot fields `cvAllowed: boolean`, `cohort: string | null`
- Produces: `supabaseDb.saveConsent({ userId, birthYear, consentVersion, cohort }) → Promise<void>`, `supabaseDb.getProfile(userId) → Promise<{ birthYear, consentVersion, cohort } | null>`
- Produces: `GET /api/me/profile` → `{ profile }` (`null` keyless or before consent)

Decisions:
- `age = now.getUTCFullYear() − birthYear`; `under16 = age <= 16` (conservative, Review Focus 2). Valid `birthYear`: integer with age 10..100, else 400 `BIRTH_YEAR_INVALID`.
- `consentVersion !== CONSENT_VERSION` → 400 `CONSENT_REQUIRED`.
- Cohort allowlist comes from env `COHORT_ALLOWLIST` (comma-separated). A cohort not on the list counts as no cohort. `under16` with no valid cohort → 403 `UNDER_16_NO_COHORT`.
- The gate applies in bypass mode too. Consent is not an auth feature.
- `cvAllowed = !under16`. Reads use `session.cvAllowed !== false` (Review Focus 5). `/api/cv` paste and upload → 403 `CV_NOT_ALLOWED`; `/api/cv/journey` and `/api/cv/intent` stay open.
- The `age` question leaves the demographics bank; `createSession` writes `demographics.age = age`, so prompts and scoring read it where they always did. Demographics becomes 3 questions.
- `saveConsent` is awaited before the session is created; a failure is a 503. A consent record that silently fails to save is worse than a retry. (Differs from `saveAcceptedPath`, which logs and continues.)

- [ ] **Step 1: Failing unit tests** in `consent.test.js` (fixed `now = 2026-11-15`): adult 2000 → `{ ok, age: 26, under16: false }`; 2010 → `under16: true`; 2010 + valid cohort → ok with that cohort; 2010 + unknown cohort → 403 `UNDER_16_NO_COHORT`; 2011 no cohort → 403; missing version → 400 `CONSENT_REQUIRED`; `"2000"` (string), 1900, 2020 → 400 `BIRTH_YEAR_INVALID`; adult + unknown cohort → ok with `cohort: null`.
- [ ] **Step 2:** Run. Expected: FAIL. Implement `consent.js`. Expected: PASS.
- [ ] **Step 3: Failing route tests** in `server.test.js`: start without consent → 400 with `code` and `requestId`; under-16 without cohort → 403; under-16 with cohort → 200, snapshot `cvAllowed: false`, then `POST /api/cv` → 403 `CV_NOT_ALLOWED` and `/api/cv/journey` still accepted; adult → `cvAllowed: true`, demographics has 3 questions, digest contains the derived age; a session object without `cvAllowed` serializes `cvAllowed: true`; `saveConsent` rejecting → 503 and no session created (inject the db).
- [ ] **Step 4:** Implement route, store and db changes. Update the shared start-session helper in the tests and the `devSeed.js` filler map (its `STEP_ORDER` coverage test must stay green).
- [ ] **Step 5:** `supabaseDb.test`: `saveConsent` upserts `profiles` on `id` with `consented_at`; no-op without env.
- [ ] **Step 6:** Run `npm test`. Commit `feat: consent and age gate on session start (T6)`.

### Task 6 (T7 rest + T10): Consent screens and policy page

**Files:**
- Create: `frontend/src/screens/ConsentScreen.jsx` + test, `UnderAgeScreen.jsx` + test, `frontend/src/cohort.js` + test, `frontend/public/privacy.html`
- Modify: `frontend/src/App.jsx`, `frontend/src/api.js` (`fetchProfile`), `e2e/smoke.spec.js`

**Interfaces:**
- Consumes: Task 5 start body, `GET /api/me/profile`, error `code`
- Produces: `captureCohort(location, storage) → string | null` (same pattern as `devMode.js`: read `?cohort=`, move it to `sessionStorage`, scrub the URL)
- Produces: `CONSENT_VERSION` mirrored in `frontend/src/lifePath.js`; a Vitest asserts it equals the backend constant by reading `backend/core/consent.js`

Decisions: order is sign-in → consent → entry. `ConsentScreen` holds a checkbox, a link to `/privacy.html` (new tab), and a birth-year `<select>` (current year − 10 down to − 100). Continue is disabled until both are set. Values live in App view state and go out with `startSession`. If `fetchProfile` returns a profile with the current version, the screen is skipped and its values are reused. A 403 `UNDER_16_NO_COHORT` shows `UnderAgeScreen` ("Ask your school for its link, or come back later") with sign-out as its only control. The policy is a static file so Express serves it without the SPA fallback. Its processor list: OpenAI, Supabase, the email provider, PostHog, Google, Upstash, Render. Vercel is gone and must not be listed.

- [ ] **Step 1:** Vitest for `captureCohort` (present, absent, URL scrubbed, storage throwing) and for both screens (disabled until complete; submit payload; refusal copy).
- [ ] **Step 2:** Implement; wire into `App.jsx` next to the existing `authGate` branch.
- [ ] **Step 3:** Write `privacy.html` from the retention and processor defaults in the spec's decision log; version string equals `CONSENT_VERSION`. Mark it "draft, pending legal review" at the top until Eugene signs off.
- [ ] **Step 4:** Extend the smoke test: tick consent, pick 2000, then the dream answer. Run `npm run e2e`.
- [ ] **Step 5:** Commit `feat: consent screen, under-16 refusal, privacy page (T7, T10 draft)`.

### Task 7 (T8 rest): Saved path view

**Files:**
- Create: `frontend/src/screens/SavedPathScreen.jsx` + test
- Modify: `frontend/src/api.js` (`fetchSavedPaths` → `GET /api/me/paths`), `frontend/src/screens/EntryScreen.jsx`, `frontend/src/App.jsx`

Decisions: a plain read-only screen, not the graph. The graph builder needs a live session; a saved row has only `title`, `soc_code`, `output` and `roadmap`. Entry shows a "Your saved path" link when the list is non-empty, newest first. The screen renders title, field, the `valuesFit.overall` number, the roadmap steps as an ordered list, and the O*NET attribution line from `output.onet.attribution` (license condition). A row without a roadmap shows "Roadmap not generated".

- [ ] **Step 1:** Vitest: empty list → no link; one row → link; screen renders title, steps in order, attribution; row with `roadmap: null` shows the fallback line.
- [ ] **Step 2:** Implement. Run `npm test -- --run`.
- [ ] **Step 3:** Commit `feat: read-only saved path view (T8)`.

### Task 8 (T9): Delete my data

**Files:**
- Modify: `backend/server.js` (`DELETE /api/me`), `backend/core/sessionStore.js`, `backend/services/supabaseDb.js`, `backend/tests/auth.test.js`, `frontend/src/api.js`, the profile panel in `frontend/src/App.jsx`

**Interfaces:**
- Produces: `store.deleteSessionsOfUser(userId) → number` (Map and Redis)
- Produces: `supabaseDb.deleteUser(userId) → Promise<"deleted" | "not_found">` (`auth.admin.deleteUser`; rows cascade)
- Produces: `DELETE /api/me` → 204; 404 when the user is already gone
- Produces: `supabaseDb.saveConsent` must not create a `profiles` row for a missing auth user (the foreign key already guarantees it; the test pins it)

Decisions: order is sessions → auth user. A failure after the sessions are gone returns 503 and a retry is safe. In bypass mode it deletes live sessions and returns 204. PostHog person deletion is added by Task 10, not here, so this task does not wait on Wave 2.

- [ ] **Step 1: Failing tests** in `auth.test.js`: delete removes the user's sessions and calls `deleteUser` once → 204; a second call → 404; another user's session survives; with the same still-valid token, `POST /api/session/start` → 401 with `code: "ACCOUNT_DELETED"` (`saveConsent` maps the foreign-key violation, Postgres `23503`, to that error; any other failure stays 503) and no session or profile row is created (Review Focus 1); `deleteUser` rejecting → 503; a session present only in Redis (not in the Map) is deleted too and does not come back after a fresh store hydrate.
- [ ] **Step 2:** Implement store, db, route.
- [ ] **Step 3:** Frontend: "Delete my data" in the profile panel → existing `ConfirmDialog` ("This removes your account, saved path and answers. It cannot be undone.") → `deleteMe()` → `signOut()`. Vitest for confirm and cancel.
- [ ] **Step 4:** Run both suites. Commit `feat: delete my data (T9)`.

---

## Wave 2 — measurement (9 → 10 → 11)

### Task 9 (T11): Frontend analytics

**Interfaces:** `initAnalytics({ key, host })`, `identify(userId, { cohort, locale })`, `track(event, props)`, `trackOutbound(url, block, itemId)`, `resetAnalytics()`. All are no-ops without `VITE_POSTHOG_KEY`.

Decisions (from the spec, verbatim): EU host, `persistence: "memory"`, autocapture and recordings off, identified by the Supabase user UUID. Events: `signup_completed`, `step_completed{step}`, `output_first_shown`, `output_refined`, `output_accepted`, `roadmap_viewed`. Props are an allowlist (`step`, `outputId`, `socCode`, `directionId`, `block`, `itemId`, `url`); `track` drops any other key, so free text cannot reach PostHog by accident.

- [ ] Tests: no key → the library is never imported; a prop outside the allowlist is dropped; a scripted flow fires the six events in order; `resetAnalytics` runs on sign-out.
- [ ] Implement with a dynamic `import("posthog-js")` so keyless builds do not load the chunk. Commit.

### Task 10 (T12): Server-side PostHog

**Interfaces:** `createPosthogServer({ key, host, fetchImpl }) → { capture(userId, event, props), deletePerson(userId) }`, no-op keyless.

- [ ] Unit tests with injected `fetch`: capture body shape, `deletePerson` request, failures swallowed and logged once.
- [ ] Wire `deletePerson` into `DELETE /api/me` after the auth user is deleted; extend the Task 8 route test. Commit.

### Task 11 (T13): Day-14 check-in

**Interfaces:**
- `signCheckinToken({ savedPathId, stepId, exp }, secret) → string`, `verifyCheckinToken(token, secret, now) → payload | null` (HMAC-SHA256, `crypto.timingSafeEqual`)
- `POST /api/internal/checkins/run` with header `X-Internal-Secret`; a wrong or missing secret falls through to the default 404, like the dev gate
- `GET /api/checkin/:token` → a plain page with three buttons (done / planned / no); **GET never writes**. Mail-security scanners (Outlook Safe Links, corporate gateways) open every link in a mail, so a GET that records would store a random answer.
- `POST /api/checkin/:token` form body `answer=done|planned|no` → upsert on `(saved_path_id, step_id)`, then a plain confirmation page

Decisions: the trigger is a GitHub Actions `schedule` workflow (daily) that curls the runner with the secret from repo secrets. Render's free plan sleeps, so the clock must be outside the process, and this adds no new processor. `/api/internal/*` and `/api/checkin/*` are exempt from the JWT middleware (the signed token is the credential) but stay rate-limited by IP. Token lifetime 30 days. The workflow's curl uses `--max-time 120 --retry 3 --retry-all-errors` (a sleeping free instance takes ~50 s to wake). The same run purges accounts inactive for 12 months: inactive means `auth.users.last_sign_in_at` (or `created_at` when never signed in) older than 12 months. The purge is irreversible, so it ships behind `PURGE_MODE=dry_run` (the default): it only logs the count and user ids it would delete; switching to `PURGE_MODE=delete` is Eugene's call after reading a few dry-run logs. Without an email key, due mails are logged, not sent.

- [ ] Tests: forged token → 400; expired → 400; GET with a valid token renders the buttons and writes nothing; double POST → one row, second answer wins, 200 both times; runner without secret → 404; purge deletes only users inactive over 12 months and, with `PURGE_MODE` unset, deletes nothing and logs the would-be list; keyless run logs and sends nothing.
- [ ] Implement, add the workflow, add `CHECKIN_SECRET` and the email key to `render.yaml`. Commit.

---

## Wave 3 — i18n epic (E3)

Not detailed to step level on purpose: two inputs are unknown, and guessing them would produce a plan that gets rewritten.

### Task 12: Spike S3 (output is a decision note in `project-plans/`, no production code)

- [ ] Per language (UA, RU, FR, DE, ES, PT): is there a published Mini-IPIP-20 translation, and under what licence? Same for the 12 RIASEC items.
- [ ] O*NET content is English only (923 titles, skills, tech). Decide: translate titles at snapshot build time, or show English titles with a translated explanation. This is the largest hidden cost of the epic.
- [ ] Count hard-coded strings in `frontend/src` (JSX text, `aria-label`, placeholders) and in the backend's deterministic fallbacks. Keyless mode must work in all seven languages, so every fallback sentence in `aiEngine.js` needs seven versions or a template.
- [ ] Library choice. Starting position: no library; a `t(key, vars)` over per-locale JSON loaded with dynamic `import()`, plurals through `Intl.PluralRules`. Adopt a library only if the string inventory shows message shapes this cannot express.

### After the spike (shape already fixed by the spec)

1. String extraction to `frontend/src/i18n/<locale>.json`; English first, behaviour unchanged.
2. `session.locale` set at `POST /api/session/start`, in the snapshot; per-locale item sets carrying `validated: boolean`; item ids and scoring keys do not change.
3. Prompts gain one line naming the output language; the fallbacks get their translations.
4. Translation files: machine translation, then native review (Eugene sources reviewers).
5. `analytics.identify` gets `locale` (already in the Task 9 signature).

---

## Order and blockers

| Wave | Tasks | Blocked by | Who can start today |
|---|---|---|---|
| 0 | 1, 2, 3, 4 | nothing | all four, in parallel worktrees |
| 1 | 5 → 6 → 7 → 8 | Task 3 should land first so the consent screen is added to the smoke test | 5 |
| 2 | 9 → 10 → 11 | 9: PostHog key for the live check only; 11: Tasks 7, 10 and an email key for the live check | 9 |
| 3 | 12, then the epic | nothing for the spike | 12 |

T1 (Supabase project, Google OAuth client, SMTP, keys — Eugene) blocks only the live checks. Every task above is built and tested keyless.

Not in this plan: Render region move, the `App.jsx` and `server.js` splits (the "change" column), E4 UA local steps, E5 adaptive RIASEC, paywall.
