# Dev stage jump — design

**Date:** 2026-08-11
**Status:** approved, ready for planning

## Problem

Reaching a late screen (`summary`, `tree`, the accepted-output `detail` view) costs ~55 manual
answers. That makes every visual or behavioural change to those screens expensive to check, so they
get tested least — exactly backwards.

Setting `session.step` alone does not solve it. The steps are coupled by data: `summary` renders the
Big Five and work-values radars, and `POST /api/output/first` requires `riasecScores`, `userValues`,
`jobCharProfile`, and `personaSummary`. A step change without the matching data yields empty or
broken screens.

## Goal

One click puts the app on any step of the assessment machine, with plausible data behind it, in
roughly the time of a single request. Available locally and on the live deployment, behind a secret.

## Non-goals

Editing seeded answers from the UI; multiple persona presets; jumping to an arbitrary depth of the
refinement chain; keyboard shortcuts. All are cheap to add later and none are needed to test screens.

## Decisions

| Question | Decision |
| --- | --- |
| Mechanism | Jump **and** autofill — the only variant where late screens actually render |
| Availability | Local **and** production, gated by a secret token |
| Reach | Every step, plus two composite Page-3 targets |
| Session semantics | Forward-fill the current session; a backward jump makes a fresh one |
| Seed data | One fixed profile — reproducible across runs |
| Implementation | Backend seed route (~200 ms/jump), guarded against drift by tests |

Two alternatives were rejected. A frontend replay of the real endpoints adds no backend surface and
cannot drift, but costs ~55 sequential requests per jump (6–12 s on Render) and exhausts the
300-per-15-min global rate limit in ~5 jumps. Extracting every route body into shared handlers is
faithful and fast, but rewrites all 20 production routes for a dev tool.

## Architecture

```
DevPanel (frontend, rendered only when a dev token is present)
    │  onJump(target)
    ▼
App.handleDevJump
    │  POST /api/dev/jump {sessionId?, step}   → X-Dev-Token
    │  (composite targets then call the real
    │   /api/output/first and /api/output/accept)
    ▼
server.js dev router (mounted only when DEV_TOOLS_TOKEN is set)
    ▼
devSeed.seedTo(session, targetStep, {store, aiEngine})
    │  same store mutators + engine functions the real routes use
    ▼
standard session snapshot → App.hydrateFromSnapshot
```

## Backend

### Gate

`DEV_TOOLS_TOKEN` in `backend/.env`, optional.

- Unset → the dev router is never mounted; `/api/dev/*` returns the app's normal 404.
- Set → every request must carry `X-Dev-Token`. Compare `sha256(provided)` against
  `sha256(expected)` with `crypto.timingSafeEqual` — hashing first keeps the buffers equal-length so
  neither the token's length nor its prefix leaks through timing.
- Mismatch → **404**, not 403. A 403 would confirm the route exists.

The route passes through the existing global rate limiter. It is one request per jump, so it needs
no separate budget.

`.env.example` gets a commented `#DEV_TOOLS_TOKEN=` with a one-line explanation: set it to a long
random string to expose the dev stage switcher; leave it unset in normal operation.

### `backend/devSeed.js`

No Express dependency. Exports `STEP_ORDER`-driven seeding plus the fixed profile.

**`DEV_PROFILE`** — the fixed persona. Investigative-Artistic, high Openness, low Neuroticism; the
values and job-characteristic rankings are distinct enough that no two axes tie.

| Field | Value |
| --- | --- |
| `dreamAnswer` | "I want to build things that explain complex systems to people — research, writing, and design in one job." |
| `demographics` | `sex: "prefer_not"`, `age: 29`, `country: "Germany"`, `city: "Berlin"` |
| `bigFive` | `mip_1:2, mip_2:4, mip_3:4, mip_4:2, mip_5:5, mip_6:3, mip_7:2, mip_8:4, mip_9:4, mip_10:1, mip_11:3, mip_12:4, mip_13:2, mip_14:2, mip_15:1, mip_16:3, mip_17:2, mip_18:2, mip_19:4, mip_20:2` |
| `riasec` | `ri_1:2, ri_2:5, ri_3:5, ri_4:3, ri_5:4, ri_6:2, ri_7:1, ri_8:5, ri_9:4, ri_10:3, ri_11:3, ri_12:3` |
| `valuesOrder` | `independence, achievement, working_conditions, relationships, recognition, support` |
| `jobCharRanking` | `complexity, meaning_impact, career_growth, work_mode, compensation, job_security, social` |
| `careerJourney` | `cj_education`: "BSc in physics, finished" · `cj_role`: "Data analyst at a logistics company" · `cj_skills`: "Statistics, explaining hard ideas simply, writing" · `cj_liked`: "Loved digging into messy data; hated status meetings" · `cj_constraint`: "Need to keep earning — no long unpaid break" · `cj_horizon`: "Within two years" · `cj_retrain`: "Willing, if it builds on what I already know" |

`sex: "prefer_not"` is deliberate: it is the neutral value and it exercises the withheld-sex branch
in the prompt digest.

These answers score to approximately O 94 / C 75 / E 44 / A 75 / N 25 and a RIASEC code of `IAE`
(I 100, A 88, E 63, S 50, C 38, R 13). The expected scores are asserted in the tests, so a change to
the scoring curves surfaces as a failing assertion rather than a silently different persona.

**`seedTo(session, targetStep, { store, aiEngine })`** — walks `STEP_ORDER` and closes every step
strictly before `targetStep` that is not already complete. Already-answered steps are skipped, which
is what makes "forward-fill the current session" work: real answers survive, only the gaps are
filled. Throws a 400-tagged error if `targetStep` is behind `session.step` — the route handles that
case, not the seeder.

Each filler mirrors the completion branch of its route, calling the same functions:

| Step | Filler |
| --- | --- |
| `demographics` | `setDemographicAnswer` ×4 → `advanceStep("big_five")` |
| `big_five` | `recordBigFiveAnswer` ×20 → `computeBigFiveScores` + `deriveBigFiveTraits` → `setBigFiveScores` → `advanceStep("riasec")` |
| `riasec` | `setRiasecItems(getStaticRiasecItems())` → `recordRiasecAnswer` ×12 → `computeRiasecScores` + `deriveRiasecCode` → `setRiasecScores` → `advanceStep("values")` |
| `values` | `rankToWorkValueScores(valuesOrder)` → `finalizeValues({scores, order, curveVersion, nextStep: "job_characteristics"})` |
| `job_characteristics` | `rankToJobCharTargets(ranking)` → `finalizeJobChar({ranking, profile, curveVersion, nextStep: "cv"})` |
| `cv` | `setCvIntent("new")` → `recordCareerJourneyAnswer` ×7 → `setPersonaSummary(await aiEngine.generatePersonaSummary({session}))` → `advanceStep("summary")` |
| `summary` | `advanceStep("tree")` |
| `tree` | terminal — never filled, only targeted |

The CV step closes through the career-journey path rather than a CV upload: it needs no file
parsing and works without an API key.

`generatePersonaSummary` is the only AI call in a jump. With a key it costs one request and a second
or two; without one it falls back deterministically.

### `STEP_ORDER` in `sessionStore.js`

The drift guard needs a canonical step list, and the machine currently has none — steps are advanced
with string literals in seven places. Add `STEP_ORDER = ["demographics", "big_five", "riasec",
"values", "job_characteristics", "cv", "summary", "tree"]` to `sessionStore.js`, export it, and have
`advanceStep` throw on a step outside it.

This is a small production change that pays for itself twice: it turns a typo'd step name into an
immediate error, and it gives the seeder a list it cannot quietly fall out of sync with. All seven
existing call sites plus the two `nextStep` arguments already use valid values.

### `POST /api/dev/jump`

Body `{ sessionId?, step }`. Responds with the standard full snapshot (`includeStatic: true`), so
the frontend applies it through the existing path.

- `step` must be in `STEP_ORDER` → otherwise 400 through the normal leak-safe responder.
- No `sessionId`, or a `sessionId` the store no longer holds (TTL sweep, restart) →
  `store.createSession({ dreamAnswer: DEV_PROFILE.dreamAnswer })`, then seed. A dev jump never
  answers 404 for an expired session: the point of the tool is to land on a working screen.
- `sessionId` present, target at or ahead of `session.step` → seed that session in place.
- `sessionId` present, target behind `session.step` → create a fresh session carrying the current
  `dreamAnswer` over, seed it to the target, and return it. The response's `sessionId` differs; the
  frontend treats that as the new session.
- Single-flight lock on `${session.id}:dev`, matching the CV and output routes, so a double click
  cannot run two seeds against one session.

Page 3 is out of the seeder's scope. The composite targets are assembled on the frontend from
`jump("tree")` plus the real `/api/output/first` and `/api/output/accept`. That keeps output
generation in exactly one place and exercises the real code path.

## Frontend

### `frontend/src/devMode.js`

On load, read `?dev=<token>` from the URL, store it in `sessionStorage` under `lpe.devToken`, and
strip the parameter via `history.replaceState`. Exports `isDevMode()` and `getDevToken()`.

`sessionStorage` rather than `localStorage`: the token dies with the tab, so it is harder to leave
behind in a browser.

The published bundle contains the panel code but no secret — it is inert until a token is supplied.

### `api.js`

One new wrapper, `devJump({ sessionId, step })`, sending `X-Dev-Token: getDevToken()`. No other
request carries the token.

### `hydrateFromSnapshot` — refactor

"Apply the snapshot, reposition the local indexes, pick the stage" currently lives inline in the
resume effect (`App.jsx:665–684`), including the non-obvious rule
`stage = step === "tree" && outputs.length ? "tree" : "survey"`.

Extract it into `hydrateFromSnapshot(data)`: `applySessionSnapshot`, the four
`firstUnansweredIndex` calls, `cvMode`, `dreamAnswer`, `stage`. Resume and the dev jump both call
it. Without this there would be a second place obliged to know about local indexes, and it would
drift from the first.

### `frontend/src/components/DevPanel.jsx`

Mounted only when `isDevMode()`. Collapsed it is a small "DEV" pill in the bottom-right corner,
above the graph; expanded it lists ten targets — the eight machine steps plus `tree + 1st output`
and `detail (accepted)` — and a status line showing the current `step`, `pathStage`, and the first
eight characters of `sessionId`.

Props `{ step, pathStage, sessionId, busy, onJump }`; no session state of its own. All execution
lives in `App.handleDevJump`.

The composite targets cannot delegate to the existing `handleEnterLifePath` / `handleAcceptOutput`
handlers: those read `sessionId` and `latestOutput` from React state, which has not re-rendered yet
inside the same async jump. `handleDevJump` therefore calls the `api.js` wrappers directly, chaining
ids from each response, and hydrates once at the end. The `detail` target also generates the roadmap
— the real Yes-branch always does, so stopping short would produce a state no user ever sees.

Styling is deliberately utilitarian — monospace, dark plate, none of the product's premium
treatment. The panel must never read as part of the application.

### Errors

A 404 (missing or wrong token) surfaces in the existing error banner as "Dev tools are not
available." A backward jump returns a new `sessionId`, which `handleDevJump` writes to
`localStorage`. A new `busy.dev` flag disables the panel's buttons while a jump is in flight.

## Testing

`backend/tests/devSeed.test.js`, in the style of the existing route tests (`app.listen(0)` +
`fetch`):

1. `DEV_TOOLS_TOKEN` unset → 404; wrong token → 404; correct token → 200.
2. A jump to each step leaves `session.step === target` and satisfies that screen's invariants —
   e.g. `summary` carries `bigFiveScores`, `userValues`, and `personaSummary`.
3. **Drift guard 1:** seed to `tree`, then call the real `POST /api/output/first` → 200 with an
   output. This is what catches a seeder that omits a field the engine needs.
4. **Drift guard 2:** the filler map covers exactly `STEP_ORDER` minus the terminal `tree`. Adding a
   step to the machine without a filler fails here.
5. Forward-fill leaves already-recorded real answers untouched.
6. A backward jump returns a different `sessionId`; a jump quoting an unknown `sessionId` succeeds
   with a fresh one rather than 404.
7. `DEV_PROFILE` scores to the documented Big Five values and the `IAE` RIASEC code.

Frontend: the panel is view code and gets no new Vitest; `lifePath.js` is untouched.

## Documentation

`backend/.env.example` — commented `#DEV_TOOLS_TOKEN=` with its explanation.
`CLAUDE.md` — a short "Dev tools" subsection covering the token, the route, and the `?dev=` entry.
