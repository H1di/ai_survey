# Clickable Journey Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a journey-rail entry moves between steps the user has already reached, in both directions, with every answer intact.

**Architecture:** The session gains a `furthestStep` high-water mark, raised by the three existing step writers. A new ungated `POST /api/session/goto` accepts only targets at or below that mark, so it can never skip unanswered work, and moves `session.step` without touching any data. The rail renders reachable entries as buttons; one flag in `lifePath.js` turns the whole thing back off.

**Tech Stack:** Node + Express 5 (CommonJS), `node:test` for backend tests (route tests boot via `app.listen(0)` and use `fetch` — no supertest), React 19 + Vite, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-08-11-rail-navigation-design.md`

## Global Constraints

- Backend is CommonJS; frontend is ESM.
- Backend tests use `node:test` + `assert/strict` + `fetch`. **Never add supertest.**
- `node --test` runs each file in its own process; env the server reads at module load must be set before `require("../server")`.
- Use the existing `fail(res, req, status, message)` and `sendError(res, req, error, fallback)` responders — never hand-roll `res.status(...).json(...)`. Every error body carries a `requestId`.
- **Do not bump `SESSION_SCHEMA_VERSION`.** Sessions persisted before this change hydrate without `furthestStep`; every read falls back to `session.furthestStep || session.step`. Bumping the version would invalidate live production sessions.
- `goto` must never raise or lower `furthestStep`. Only `advanceStep` / `finalizeValues` / `finalizeJobChar` raise it.
- The 7 `JOB_CHAR_PARAMS` keys and 6 `WORK_VALUES_ORDER` keys are cross-layer contracts — use them verbatim.
- Run backend tests with `cd backend && npm test`; frontend with `cd frontend && npm test`; lint with `cd frontend && npm run lint`. The frontend lint has **4 pre-existing errors** (2 react-hooks in `App.jsx`, 2 unused vars in `lifePath.test.js`) — that count must not grow.

## File Structure

**Create:**
- `backend/tests/railNavigation.test.js` — route tests for `goto` and the widened values-confirm guard.

**Modify:**
- `backend/sessionStore.js` — `furthestStep` on new sessions, `_raiseFurthest` in the three step writers, `gotoStep` mutator, `furthestStep` in the snapshot.
- `backend/tests/sessionStore.test.js` — store-level coverage of the mark and `gotoStep`.
- `backend/server.js` — `POST /api/session/goto`; widen the `/api/values/confirm` guard.
- `frontend/src/lifePath.js` — `RAIL_NAVIGATION` flag, `railStepReachable`.
- `frontend/src/lifePath.test.js` — reachability tests.
- `frontend/src/api.js` — `sessionGoto`.
- `frontend/src/App.jsx` — `furthestStep` state, re-entry fixes, clickable strip, `handleRailNavigate`.
- `frontend/src/App.css` — `.journey-rail-jump`.
- `CLAUDE.md` — the rail is no longer display-only.

---

### Task 1: `furthestStep` high-water mark and `gotoStep`

**Files:**
- Modify: `backend/sessionStore.js`
- Test: `backend/tests/sessionStore.test.js`

**Interfaces:**
- Consumes: `STEP_ORDER` (already exported from `sessionStore.js`).
- Produces: `session.furthestStep` (string, initialized `"demographics"`); `store.gotoStep(session, step)` which assigns `session.step` and touches, raising nothing; `serializeSessionState` includes `furthestStep`.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/sessionStore.test.js`:

```js
test("furthestStep starts at demographics and rises with each advance", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  assert.equal(s.furthestStep, "demographics");

  store.advanceStep(s, "big_five");
  assert.equal(s.furthestStep, "big_five");

  store.finalizeValues(s, {
    scores: {}, order: [], curveVersion: 1, nextStep: "job_characteristics",
  });
  assert.equal(s.furthestStep, "job_characteristics");

  store.finalizeJobChar(s, { ranking: [], profile: {}, curveVersion: 1, nextStep: "cv" });
  assert.equal(s.furthestStep, "cv");
});

test("gotoStep moves the step back without lowering the mark or touching data", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  store.advanceStep(s, "big_five");
  store.recordBigFiveAnswer(s, "mip_1", 4);
  store.advanceStep(s, "riasec");

  store.gotoStep(s, "big_five");

  assert.equal(s.step, "big_five");
  assert.equal(s.furthestStep, "riasec", "the mark never falls");
  assert.equal(s.bigFiveAnswers.mip_1, 4, "answers survive");
});

test("advancing to a step behind the mark does not lower it", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  store.advanceStep(s, "cv");
  store.gotoStep(s, "riasec");
  store.advanceStep(s, "values");

  assert.equal(s.furthestStep, "cv");
});

test("gotoStep rejects a step outside STEP_ORDER", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  assert.throws(() => store.gotoStep(s, "nope"), /Unknown session step: nope/);
});

test("a session without furthestStep (pre-change shape) reads through to step", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  store.advanceStep(s, "riasec");
  delete s.furthestStep;

  // The fallback must treat the current step as the mark, so a later advance
  // still raises it rather than starting from undefined.
  store.advanceStep(s, "values");
  assert.equal(s.furthestStep, "values");

  const snapshot = store.serializeSessionState(s, null, null, { includeStatic: false });
  assert.equal(snapshot.furthestStep, "values");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && node --test tests/sessionStore.test.js`
Expected: FAIL — `s.furthestStep` is `undefined`, and `store.gotoStep` is not a function.

- [ ] **Step 3: Implement**

In `backend/sessionStore.js`, add `furthestStep` to the session created in `createSession`, immediately after the `step` line:

```js
      step: "demographics",
      // High-water mark: the furthest step ever reached. Rail navigation may
      // return to anything at or below it, which is what makes the ungated
      // /api/session/goto safe — it can never skip unanswered work.
      furthestStep: "demographics",
```

Add the raise helper as a method on `SessionStore`, directly above `advanceStep`:

```js
  // Read through `furthestStep || step` everywhere: sessions persisted before
  // this field existed hydrate without it, and that fallback is what lets them
  // keep working without a schema-version bump. Call this BEFORE assigning the
  // new step — it compares against the step the session is leaving.
  _raiseFurthest(session, nextStep) {
    const current = session.furthestStep || session.step;
    if (STEP_ORDER.indexOf(nextStep) > STEP_ORDER.indexOf(current)) {
      session.furthestStep = nextStep;
    }
  }
```

Call it first in each of the three writers, before any step assignment:

```js
  advanceStep(session, nextStep) {
    assertStep(nextStep);
    this._raiseFurthest(session, nextStep);
    session.step = nextStep;
    this.touch(session);
  }
```

In `finalizeJobChar`, insert `this._raiseFurthest(session, nextStep);` immediately after the existing `assertStep(nextStep);`. Do the same in `finalizeValues`. In both, it must precede `session.step = nextStep`.

Add the `gotoStep` mutator directly after `advanceStep`:

```js
  // Backward/forward move within already-reached steps. Deliberately separate
  // from advanceStep: that one means "progress", and raises the high-water
  // mark. Conflating them would let a backward move rewrite the mark and
  // silently widen what rail navigation allows.
  gotoStep(session, step) {
    assertStep(step);
    session.step = step;
    this.touch(session);
  }
```

In `serializeSessionState`, add the field next to `step`:

```js
      step: session.step,
      furthestStep: session.furthestStep || session.step,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && node --test tests/sessionStore.test.js`
Expected: PASS.

- [ ] **Step 5: Run the whole backend suite**

Run: `cd backend && npm test`
Expected: PASS — the dev seeder walks every step, so a broken mark shows up here.

- [ ] **Step 6: Commit**

```bash
git add backend/sessionStore.js backend/tests/sessionStore.test.js
git commit -m "feat: furthestStep high-water mark and gotoStep mutator"
```

---

### Task 2: `POST /api/session/goto`

**Files:**
- Modify: `backend/server.js`
- Test: `backend/tests/railNavigation.test.js`

**Interfaces:**
- Consumes: `store.gotoStep`, `session.furthestStep` (Task 1); `STEP_ORDER`, `DEV_PROFILE`/`seedTo` via the existing dev route for test setup.
- Produces: `POST /api/session/goto` accepting `{ sessionId, step }`, responding with the standard snapshot (`includeStatic: true`).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/railNavigation.test.js`:

```js
process.env.NODE_ENV = "test";
process.env.OPENAI_API_KEY = "";
process.env.DEV_TOOLS_TOKEN = "test-dev-token";
process.env.RATE_LIMIT_GLOBAL_MAX = "1000000";
process.env.RATE_LIMIT_AI_MAX = "1000000";

const test = require("node:test");
const assert = require("node:assert/strict");
const { app } = require("../server");

let server;
let base;

test.before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

async function post(path, body, headers = {}) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// The dev seeder is the cheapest way to get a session with real answers behind
// it; the assertions below are about goto, not about how the data got there.
function seed(step) {
  return post("/api/dev/jump", { step }, { "X-Dev-Token": "test-dev-token" });
}

test("goto moves back to a reached step and keeps the mark", async () => {
  const { data: seeded } = await seed("cv");
  assert.equal(seeded.furthestStep, "cv");

  const { status, data } = await post("/api/session/goto", {
    sessionId: seeded.sessionId,
    step: "riasec",
  });

  assert.equal(status, 200);
  assert.equal(data.step, "riasec");
  assert.equal(data.furthestStep, "cv", "the mark must not fall");
  assert.ok(data.demographicQuestions, "static banks travel on a goto snapshot");
});

test("a back-and-forward round trip leaves every answer untouched", async () => {
  const { data: seeded } = await seed("cv");
  const before = {
    bigFiveAnswers: seeded.bigFiveAnswers,
    bigFiveScores: seeded.bigFiveScores,
    riasecScores: seeded.riasecScores,
    userValues: seeded.userValues,
    jobCharProfile: seeded.jobCharProfile,
  };

  await post("/api/session/goto", { sessionId: seeded.sessionId, step: "big_five" });
  const { data } = await post("/api/session/goto", { sessionId: seeded.sessionId, step: "cv" });

  assert.equal(data.step, "cv");
  assert.deepEqual(data.bigFiveAnswers, before.bigFiveAnswers);
  assert.deepEqual(data.bigFiveScores, before.bigFiveScores);
  assert.deepEqual(data.riasecScores, before.riasecScores);
  assert.deepEqual(data.userValues, before.userValues);
  assert.deepEqual(data.jobCharProfile, before.jobCharProfile);
});

test("goto refuses to skip past the furthest step reached", async () => {
  const { data: seeded } = await seed("riasec");

  const { status, data } = await post("/api/session/goto", {
    sessionId: seeded.sessionId,
    step: "summary",
  });

  assert.equal(status, 400);
  assert.ok(data.requestId);
});

test("goto to the furthest step itself is allowed", async () => {
  const { data: seeded } = await seed("values");
  await post("/api/session/goto", { sessionId: seeded.sessionId, step: "demographics" });

  const { status, data } = await post("/api/session/goto", {
    sessionId: seeded.sessionId,
    step: "values",
  });

  assert.equal(status, 200);
  assert.equal(data.step, "values");
});

test("goto rejects an unknown step and an unknown session", async () => {
  const { data: seeded } = await seed("cv");

  const bad = await post("/api/session/goto", { sessionId: seeded.sessionId, step: "nope" });
  assert.equal(bad.status, 400);

  const missing = await post("/api/session/goto", {
    sessionId: "00000000-0000-0000-0000-000000000000",
    step: "riasec",
  });
  assert.equal(missing.status, 404);
});

test("a session stored before furthestStep existed still navigates", async () => {
  const { store } = require("../server");
  const { data: seeded } = await seed("cv");

  // Simulate a session hydrated from Redis in the pre-change shape.
  delete store.get(seeded.sessionId).furthestStep;

  const { status, data } = await post("/api/session/goto", {
    sessionId: seeded.sessionId,
    step: "riasec",
  });

  // With the field gone the mark falls back to the current step (`cv`), so
  // everything at or before it stays reachable.
  assert.equal(status, 200);
  assert.equal(data.step, "riasec");
  assert.equal(data.furthestStep, "riasec", "the fallback reports the current step");
});

test("re-answering a revisited step advances forward again without lowering the mark", async () => {
  const { data: seeded } = await seed("cv");
  await post("/api/session/goto", { sessionId: seeded.sessionId, step: "big_five" });

  // Re-submit one Big Five item; all 20 are already answered, so the completion
  // branch fires and the step advances to riasec exactly as on the first pass.
  const { data } = await post("/api/big-five/answer", {
    sessionId: seeded.sessionId,
    itemId: "mip_1",
    value: 5,
  });

  assert.equal(data.step, "riasec");
  assert.equal(data.furthestStep, "cv");
  assert.equal(data.bigFiveAnswers.mip_1, 5, "the edited answer is stored");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && node --test tests/railNavigation.test.js`
Expected: FAIL — `/api/session/goto` is not mounted, so the calls 404 instead of 200/400.

- [ ] **Step 3: Implement**

In `backend/server.js`, add the route directly after `app.post("/api/summary/continue", ...)`:

```js
// Rail navigation: move between steps the user has already reached. Ungated on
// purpose — the furthestStep check means it can never skip unanswered work, so
// it exposes nothing a user could not reach by answering. It writes only
// session.step: answers, scores, and outputs are left exactly as they are.
app.post("/api/session/goto", (req, res) => {
  try {
    const { sessionId, step } = req.body || {};
    const session = store.require(sessionId);

    if (!STEP_ORDER.includes(step)) {
      return fail(res, req, 400, "Unknown step.");
    }
    const furthest = session.furthestStep || session.step;
    if (STEP_ORDER.indexOf(step) > STEP_ORDER.indexOf(furthest)) {
      return fail(res, req, 400, "You haven't reached that step yet.");
    }

    store.gotoStep(session, step);
    return sendSessionSnapshot(res, session, { includeStatic: true });
  } catch (error) {
    return sendError(res, req, error, "Something went wrong.");
  }
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && node --test tests/railNavigation.test.js`
Expected: PASS, all six tests.

- [ ] **Step 5: Commit**

```bash
git add backend/server.js backend/tests/railNavigation.test.js
git commit -m "feat: POST /api/session/goto for reached steps"
```

---

### Task 3: Allow re-confirming values on a revisit

`/api/values/confirm` requires a live finished tournament, but `finalizeValues` clears it. Without this change, returning to `values` and confirming fails with "Finish the comparisons before confirming."

**Files:**
- Modify: `backend/server.js` (the `/api/values/confirm` handler)
- Test: `backend/tests/railNavigation.test.js`

**Interfaces:**
- Consumes: `POST /api/session/goto` (Task 2).
- Produces: no new surface — `/api/values/confirm` additionally accepts a submitted permutation when `session.userValues` already exists.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/railNavigation.test.js`:

```js
test("values can be re-confirmed after returning to the step", async () => {
  const { data: seeded } = await seed("job_characteristics");
  const original = seeded.userValues.order;
  const reordered = [...original].reverse();

  await post("/api/session/goto", { sessionId: seeded.sessionId, step: "values" });
  const { status, data } = await post("/api/values/confirm", {
    sessionId: seeded.sessionId,
    order: reordered,
  });

  assert.equal(status, 200);
  assert.deepEqual(data.userValues.order, reordered, "the edited hierarchy is stored");
  assert.equal(data.step, "job_characteristics", "confirming advances as on the first pass");
  // The rank->score curve is re-applied to the new order, so the value now
  // ranked first carries the highest score. Asserted relatively, not against a
  // hardcoded number, so a curve change does not break this test spuriously.
  const scores = data.userValues.scores;
  assert.equal(scores[reordered[0]], Math.max(...Object.values(scores)));
  assert.equal(scores[reordered[5]], Math.min(...Object.values(scores)));
});

test("a revisit confirm with an incomplete ordering is rejected", async () => {
  const { data: seeded } = await seed("job_characteristics");
  await post("/api/session/goto", { sessionId: seeded.sessionId, step: "values" });

  const { status } = await post("/api/values/confirm", {
    sessionId: seeded.sessionId,
    order: ["achievement", "independence"],
  });

  // No tournament order to fall back on, so a partial list cannot be accepted.
  assert.equal(status, 400);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && node --test tests/railNavigation.test.js`
Expected: FAIL — the first new test gets 400 "Finish the comparisons before confirming."

- [ ] **Step 3: Implement**

In `backend/server.js`, replace the guard and ordering block inside `/api/values/confirm` — everything from `if (!session.valuesTournament ...)` down to the `const finalHierarchy = ...` line — with:

```js
    // First pass: the finished tournament supplies both the guard and the
    // fallback order. Revisit (rail navigation back to this step): the
    // tournament is gone — finalizeValues clears it — so the already-confirmed
    // hierarchy is what authorizes the edit, and the submitted order must stand
    // on its own because there is nothing to fall back to.
    const tournamentOrder = session.valuesTournament
      ? finalOrder(session.valuesTournament)
      : null;
    const revisiting = Boolean(session.userValues);
    if (!tournamentOrder && !revisiting) {
      return fail(res, req, 400, "Finish the comparisons before confirming.");
    }

    const requested = Array.isArray(order) ? order : tournamentOrder;
    const validPermutation =
      Array.isArray(requested) &&
      requested.length === WORK_VALUES_ORDER.length &&
      WORK_VALUES_ORDER.every((k) => requested.includes(k));
    if (!validPermutation && !tournamentOrder) {
      return fail(res, req, 400, "A full ordering of the six values is required.");
    }
    const finalHierarchy = validPermutation ? requested : tournamentOrder;
```

Leave the `store.finalizeValues(...)` call below it unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && node --test tests/railNavigation.test.js`
Expected: PASS, all eight tests.

- [ ] **Step 5: Run the whole backend suite**

Run: `cd backend && npm test`
Expected: PASS — the existing values tests cover the first-pass path, which must be unchanged.

- [ ] **Step 6: Commit**

```bash
git add backend/server.js backend/tests/railNavigation.test.js
git commit -m "feat: allow re-confirming the values hierarchy on a revisit"
```

---

### Task 4: Reachability helper and the removal flag

**Files:**
- Modify: `frontend/src/lifePath.js`, `frontend/src/api.js`
- Test: `frontend/src/lifePath.test.js`

**Interfaces:**
- Consumes: `furthestStep` from the snapshot (Task 1); `POST /api/session/goto` (Task 2).
- Produces:
  - `RAIL_NAVIGATION: boolean` and `railStepReachable(step, furthestStep) -> boolean` from `lifePath.js`
  - `sessionGoto({ sessionId, step }) -> Promise<snapshot>` from `api.js`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/lifePath.test.js`:

`lifePath.test.js` already imports from `./lifePath` — add `railStepReachable` and `RAIL_NAVIGATION`
to that existing import list rather than writing a second `import` from the same module, which the
linter flags as a duplicate.

```js
describe("railStepReachable", () => {
  it("is on by default — the flag is the removal switch", () => {
    expect(RAIL_NAVIGATION).toBe(true);
  });

  it("allows steps at or before the furthest reached", () => {
    expect(railStepReachable("demographics", "values")).toBe(true);
    expect(railStepReachable("riasec", "values")).toBe(true);
    expect(railStepReachable("values", "values")).toBe(true);
  });

  it("refuses steps past the furthest reached", () => {
    expect(railStepReachable("cv", "values")).toBe(false);
    expect(railStepReachable("summary", "values")).toBe(false);
  });

  it("treats tree as past the end of the rail", () => {
    expect(railStepReachable("summary", "tree")).toBe(true);
    expect(railStepReachable("demographics", "tree")).toBe(true);
  });

  it("refuses steps that are not on the rail at all", () => {
    expect(railStepReachable("tree", "tree")).toBe(false);
    expect(railStepReachable("entry", "values")).toBe(false);
    expect(railStepReachable("summary", "entry")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test -- --run lifePath`
Expected: FAIL — `railStepReachable` is not exported.

- [ ] **Step 3: Implement**

In `frontend/src/lifePath.js`, directly below `railIndexForStep`:

```js
// Master switch for rail navigation. Set to false to restore the display-only
// rail: every entry goes inert and nothing else needs editing.
export const RAIL_NAVIGATION = true;

// A rail entry is clickable when the user has already reached it. `tree` sits
// past the end of the rail, so reaching it makes every rail step reachable.
export function railStepReachable(step, furthestStep) {
  if (!RAIL_NAVIGATION) return false;
  const target = railIndexForStep(step);
  if (target === -1) return false;
  if (furthestStep === "tree") return true;
  const furthest = railIndexForStep(furthestStep);
  return furthest !== -1 && target <= furthest;
}
```

In `frontend/src/api.js`, add next to the other session wrappers:

```js
export function sessionGoto(payload) {
  return request("/api/session/goto", { method: "POST", body: JSON.stringify(payload) });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm test -- --run lifePath`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lifePath.js frontend/src/lifePath.test.js frontend/src/api.js
git commit -m "feat: rail reachability helper and sessionGoto wrapper"
```

---

### Task 5: Fix the two blank re-entry screens

Without this, navigating back lands on an empty page. Land it before the rail becomes clickable so no commit in between ships a broken screen.

**Files:**
- Modify: `frontend/src/App.jsx` (`applySessionSnapshot`, and the values card render condition at `App.jsx:1589`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `applySessionSnapshot` seeds `rankDraft` from `data.jobCharRanking` and `valuesRankDraft` from `data.userValues.order` when revisiting; the values hierarchy card no longer requires `!profile?.userValues`.

- [ ] **Step 1: Fix the job-characteristics draft**

Replace the existing seeding block in `applySessionSnapshot`:

```jsx
    // Seed the reorderable ranking. First entry: the canonical parameter order.
    // Revisit (rail navigation back): the stored ranking — without this the
    // draft stays empty and RankCard, which requires 7 entries, renders nothing.
    if (data.step === "job_characteristics") {
      if (data.jobCharRanking && data.jobCharRanking.length === 7) {
        setRankDraft(data.jobCharRanking);
      } else {
        const paramsSource = data.jobCharParams || jobCharParams;
        if (paramsSource.length === 7) {
          setRankDraft((draft) => (draft.length === 7 ? draft : paramsSource.map((p) => p.id)));
        }
      }
    }
```

- [ ] **Step 2: Fix the values draft**

In `applySessionSnapshot`, directly after the existing `setValuesRanking(data.valuesRanking || null);`:

```jsx
    // Revisiting a confirmed values step: finalizeValues cleared the tournament
    // and the auto-start effect is blocked by userValues, so there is nothing to
    // render unless the confirmed hierarchy is put back into the draft.
    if (
      data.step === "values" &&
      !data.valuesComparison &&
      data.userValues &&
      data.userValues.order &&
      data.userValues.order.length === 6
    ) {
      setValuesRankDraft(data.userValues.order);
    }
```

- [ ] **Step 3: Let the hierarchy card render on a revisit**

At `App.jsx:1589`, drop the `!profile?.userValues` condition — `step === "values"` is the authoritative gate, and step and profile arrive in the same snapshot, so the card cannot flash after a confirm:

```jsx
          {step === "values" && !valuesComparison && valuesRankDraft.length === 6 && (
            <ValuesHierarchyCard
```

- [ ] **Step 4: Verify nothing regressed**

Run: `cd frontend && npm test && npm run lint`
Expected: tests PASS; lint still reports exactly 4 errors, none new.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "fix: render the values and ranking screens when revisited"
```

---

### Task 6: Clickable rail strip

**Files:**
- Modify: `frontend/src/App.jsx` (`JourneyRailStrip`, its call site at `App.jsx:1502`, state, `resetAll`), `frontend/src/App.css`

**Interfaces:**
- Consumes: `railStepReachable`, `RAIL_NAVIGATION`, `sessionGoto` (Task 4); `hydrateFromSnapshot` (already present).
- Produces: `<JourneyRailStrip step furthestStep busy onNavigate />`; `App.handleRailNavigate(step)`; `busy.goto`.

- [ ] **Step 1: Add the state**

Declare it with the other `useState` calls, next to `pathStage`:

```jsx
  const [furthestStep, setFurthestStep] = useState("demographics");
```

Set it in `applySessionSnapshot`, next to `setPathStage`:

```jsx
    setFurthestStep(data.furthestStep || data.step);
```

Reset it in `resetAll`, next to `setStep("entry")`:

```jsx
    setFurthestStep("demographics");
```

Add the busy flag to the `busy` state initializer:

```jsx
    goto: false,
```

- [ ] **Step 2: Make the strip clickable**

Replace `JourneyRailStrip` with:

```jsx
function JourneyRailStrip({ step, furthestStep, busy, onNavigate }) {
  const active = railIndexForStep(step);
  if (active === -1) return null;
  return (
    <ol className="journey-rail-strip" aria-label="Career Discovery Journey progress">
      {JOURNEY_RAIL.map((r, index) => {
        // The active step is never a link — it is where you already are.
        const clickable = index !== active && railStepReachable(r.step, furthestStep);
        return (
          <li
            key={r.step}
            className={`journey-rail-step ${index === active ? "active" : ""} ${index < active ? "done" : ""}`}
          >
            {clickable ? (
              <button
                type="button"
                className="journey-rail-jump"
                disabled={busy}
                onClick={() => onNavigate(r.step)}
              >
                {r.label}
              </button>
            ) : (
              r.label
            )}
          </li>
        );
      })}
    </ol>
  );
}
```

Add `railStepReachable` to the existing `from "./lifePath"` import list.

- [ ] **Step 3: Add the handler**

Next to the other handlers in `App`:

```jsx
  // Rail navigation between steps already reached. The backend refuses anything
  // past furthestStep, so this cannot skip unanswered work; it only moves the
  // step, which is why the full snapshot can be applied wholesale.
  const handleRailNavigate = async (targetStep) => {
    if (!sessionId || targetStep === step) return;
    setError("");
    setBusy((p) => ({ ...p, goto: true }));
    try {
      const data = await sessionGoto({ sessionId, step: targetStep });
      hydrateFromSnapshot(data);
      setRetryAction(null);
    } catch (e) {
      setError(e.message || "Could not switch steps.");
    } finally {
      setBusy((p) => ({ ...p, goto: false }));
    }
  };
```

Add `sessionGoto` to the existing `from "./api"` import list.

- [ ] **Step 4: Pass the props**

At `App.jsx:1502`:

```jsx
            <JourneyRailStrip
              step={step}
              furthestStep={furthestStep}
              busy={busy.goto}
              onNavigate={handleRailNavigate}
            />
```

- [ ] **Step 5: Style the button**

In `frontend/src/App.css`, after the `.journey-rail-step.active` rule:

```css
/* The rail label as a control. Inherits the li's colour states so `done` and
   `active` styling keeps working; only the affordance is added. */
.journey-rail-jump {
  padding: 0;
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 3px;
}

.journey-rail-jump:hover:not(:disabled) {
  color: #863bff;
}

.journey-rail-jump:disabled {
  cursor: default;
  opacity: 0.6;
}
```

- [ ] **Step 6: Verify automatically**

Run: `cd frontend && npm test && npm run lint`
Expected: tests PASS; lint still exactly 4 errors, none new.

- [ ] **Step 7: Verify by hand**

Start the app (`npm run dev` from the repo root) and open `http://localhost:5173/?dev=local-dev-token`.

1. Jump to `cv` from the dev panel. In the header strip, "About you" through "Step 4" are underlined; "Who you are" is not.
2. Click "Step 1 — How you think". The Big Five questions come back, already answered, positioned at the first unanswered item (all answered → the last index).
3. Click "Step 3 — Your values". The confirmed hierarchy table renders — not a blank screen, not a fresh tournament.
4. Reorder one row and confirm. It advances to Step 4 with the new order.
5. Click "Step 4 — What motivates you" from a later step. The ranking card renders prefilled with the stored ranking.
6. Confirm no rail entry beyond the furthest step is clickable at any point.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.css
git commit -m "feat: clickable journey rail for reached steps"
```

---

### Task 7: Document it

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the frontend section**

In `CLAUDE.md`, replace the sentence describing the rail as display-only (in the "Assessment flow" section, which currently reads "The frontend presents this as a display-only 'Career Discovery Journey' rail … the rail never changes execution order.") with:

```markdown
The frontend presents this as a "Career Discovery Journey" rail (`JOURNEY_RAIL` in `frontend/src/lifePath.js`: intro card after entry + condensed strip in the survey header). Rail entries at or before `session.furthestStep` are clickable and call `POST /api/session/goto`, which moves `session.step` without touching any data; entries past it stay plain text, so the rail can never skip unanswered work or change execution order. `RAIL_NAVIGATION` in `lifePath.js` is the off switch — set it to `false` and the rail is display-only again.
```

- [ ] **Step 2: Document the route and the mark**

Add to the "Contracts to keep in sync" list:

```markdown
- `session.furthestStep` is a high-water mark raised only by `advanceStep` / `finalizeValues` / `finalizeJobChar`, never by `gotoStep`. Reads go through `session.furthestStep || session.step` so sessions persisted before the field existed still work — do not bump `SESSION_SCHEMA_VERSION` for it.
- `POST /api/session/goto` is ungated because it accepts only targets at or below `furthestStep`. If that check ever loosens, the route needs a gate.
```

- [ ] **Step 3: Update the testing paragraph**

In the Testing section, add `rail navigation (goto bounds, round-trip data integrity, values re-confirm)` to the list of what `backend/tests/` covers, and `rail reachability` to the frontend Vitest list.

- [ ] **Step 4: Verify the claims**

Re-read the section against the code: every route path, field name, file path, and flag name must exist as written.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document rail navigation"
```

---

## Verification

```bash
cd backend && npm test
cd ../frontend && npm test && npm run lint
```

Backend all green; frontend all green with exactly the 4 pre-existing lint errors. Then confirm by hand that a rail entry past `furthestStep` is not clickable and that `POST /api/session/goto` with such a step returns 400.
