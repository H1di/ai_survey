# Dev Stage Jump Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One gated request seeds a session forward to any assessment step with a fixed profile, so late screens (`summary`, `tree`, accepted-output `detail`) are reachable in ~200 ms instead of ~55 manual answers.

**Architecture:** A new pure module `backend/devSeed.js` closes each unfinished step before the target using the same store mutators and scoring functions the real routes use. A `POST /api/dev/jump` route, mounted only when `DEV_TOOLS_TOKEN` is set, drives it and returns the standard session snapshot. The frontend shows a `DevPanel` only when a `?dev=<token>` token is present, and applies the snapshot through a `hydrateFromSnapshot` helper extracted from the existing resume path.

**Tech Stack:** Node + Express 5 (CommonJS), `node:test` for backend tests (no supertest — routes boot via `app.listen(0)` and are hit with `fetch`), React 19 + Vite, Vitest + jsdom for frontend tests.

**Spec:** `docs/superpowers/specs/2026-08-11-dev-stage-jump-design.md`

## Global Constraints

- The app must always work keyless. The only AI call in a jump is `generatePersonaSummary`, which has a deterministic fallback. Never add an AI call without a fallback.
- Backend is CommonJS (`require`/`module.exports`). Frontend is ESM.
- Backend tests use `node:test` + `assert/strict` + `fetch`. **Never add supertest.**
- `node --test` runs each test file in its own process, so `process.env` set at the top of a file is isolated. Env that the server reads at module load **must** be set before `require("../server")`.
- Every error response carries a body `requestId`; 4xx keep their message, 500s return a generic fallback. Use the existing `fail(res, req, status, message)` and `sendError(res, req, error, fallback)` helpers — do not hand-roll `res.status(...).json(...)`.
- A missing or wrong dev token returns **404**, never 403. A 403 would confirm the route exists.
- The 7 `JOB_CHAR_PARAMS` keys and the 6 `WORK_VALUES_ORDER` keys are cross-layer contracts — use them verbatim, never invent variants.
- Big Five items are serialized without `trait`/`reverse`; RIASEC items without `type`. Never leak a scoring key to the client.
- Run backend tests with `cd backend && npm test`; frontend with `cd frontend && npm test`.

## File Structure

**Create:**
- `backend/devSeed.js` — the fixed `DEV_PROFILE` and `seedTo()`. No Express dependency, so it is testable without booting a server.
- `backend/tests/devSeed.test.js` — module-level tests against a raw `SessionStore`.
- `backend/tests/devJump.test.js` — route tests with `DEV_TOOLS_TOKEN` set.
- `backend/tests/devJumpDisabled.test.js` — separate file (separate process) proving the route is absent when the env var is unset.
- `frontend/src/devMode.js` — token capture from the URL.
- `frontend/src/devMode.test.js` — Vitest for the token logic.
- `frontend/src/components/DevPanel.jsx` + `DevPanel.css` — the panel.

**Modify:**
- `backend/sessionStore.js` — add and export `STEP_ORDER`; guard step writes against it.
- `backend/tests/sessionStore.test.js` — cover the guard.
- `backend/server.js` — mount the gated dev router.
- `backend/.env.example` — document `DEV_TOOLS_TOKEN`.
- `frontend/src/api.js` — add `devJump`.
- `frontend/src/App.jsx` — extract `hydrateFromSnapshot`, add `handleDevJump`, mount `DevPanel`.
- `CLAUDE.md` — a "Dev tools" subsection.

---

### Task 1: `STEP_ORDER` and guarded step writes

The assessment machine has no canonical step list — seven call sites advance it with string literals. The seeder needs one list it cannot fall out of sync with, and the guard turns a typo'd step name into an immediate error instead of a wedged session.

**Files:**
- Modify: `backend/sessionStore.js`
- Test: `backend/tests/sessionStore.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `STEP_ORDER` — a frozen `string[]` exported from `backend/sessionStore.js`, in machine order: `["demographics", "big_five", "riasec", "values", "job_characteristics", "cv", "summary", "tree"]`. `advanceStep`, `finalizeValues`, and `finalizeJobChar` throw `Error("Unknown session step: <x>")` on a value outside it.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/sessionStore.test.js`:

```js
const { SessionStore, STEP_ORDER } = require("../sessionStore");

test("STEP_ORDER is the assessment machine in order", () => {
  assert.deepEqual(STEP_ORDER, [
    "demographics",
    "big_five",
    "riasec",
    "values",
    "job_characteristics",
    "cv",
    "summary",
    "tree",
  ]);
});

test("step writes reject a step outside STEP_ORDER", () => {
  const store = new SessionStore();
  const s = makeSession(store);

  assert.throws(() => store.advanceStep(s, "big_fvie"), /Unknown session step: big_fvie/);
  assert.throws(
    () => store.finalizeValues(s, { scores: {}, order: [], curveVersion: 1, nextStep: "nope" }),
    /Unknown session step: nope/
  );
  assert.throws(
    () => store.finalizeJobChar(s, { ranking: [], profile: {}, curveVersion: 1, nextStep: "nope" }),
    /Unknown session step: nope/
  );
  // A rejected write must not have moved the session.
  assert.equal(s.step, "demographics");
});

test("every real transition is accepted", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  for (const step of STEP_ORDER) {
    store.advanceStep(s, step);
    assert.equal(s.step, step);
  }
});
```

Note: the file already requires `SessionStore` at the top. Replace that existing line with the destructuring shown above rather than adding a second `require`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && node --test tests/sessionStore.test.js`
Expected: FAIL — `STEP_ORDER` is `undefined`, so `assert.deepEqual` throws.

- [ ] **Step 3: Implement**

In `backend/sessionStore.js`, add near the top (after the existing requires, beside the other module constants):

```js
// The assessment machine, in order. Exported so anything that walks the machine
// (the dev seeder) shares one definition with the code that advances it, and so
// a typo'd step name fails loudly instead of wedging a session on a step no
// route can service.
const STEP_ORDER = Object.freeze([
  "demographics",
  "big_five",
  "riasec",
  "values",
  "job_characteristics",
  "cv",
  "summary",
  "tree",
]);

function assertStep(nextStep) {
  if (!STEP_ORDER.includes(nextStep)) {
    throw new Error(`Unknown session step: ${nextStep}`);
  }
}
```

Guard the three writers. `advanceStep`:

```js
  advanceStep(session, nextStep) {
    assertStep(nextStep);
    session.step = nextStep;
    this.touch(session);
  }
```

In `finalizeJobChar`, add `assertStep(nextStep);` as the first statement of the method body. In `finalizeValues`, likewise — before any assignment, so a rejected write leaves the session untouched.

Extend the export:

```js
module.exports = {
  SessionStore,
  STEP_ORDER,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && node --test tests/sessionStore.test.js`
Expected: PASS.

- [ ] **Step 5: Run the whole backend suite**

Run: `cd backend && npm test`
Expected: PASS. This is the real check — all seven existing `advanceStep` call sites and the two `nextStep` arguments must still be accepted.

- [ ] **Step 6: Commit**

```bash
git add backend/sessionStore.js backend/tests/sessionStore.test.js
git commit -m "feat: canonical STEP_ORDER, guarded step writes"
```

---

### Task 2: `backend/devSeed.js`

**Files:**
- Create: `backend/devSeed.js`
- Test: `backend/tests/devSeed.test.js`

**Interfaces:**
- Consumes: `STEP_ORDER` from Task 1.
- Produces:
  - `DEV_PROFILE` — `{ dreamAnswer: string, demographics: object, bigFive: Record<string, number>, riasec: Record<string, number>, valuesOrder: string[], jobCharRanking: string[], careerJourney: Record<string, string> }`
  - `async seedTo(session, targetStep, { store, aiEngine }) -> session` — fills every unfinished step strictly before `targetStep`; throws an error carrying `statusCode = 400` if `targetStep` is behind `session.step`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/devSeed.test.js`:

```js
process.env.NODE_ENV = "test";
process.env.OPENAI_API_KEY = "";

const test = require("node:test");
const assert = require("node:assert/strict");
const { SessionStore } = require("../sessionStore");
const { createAiEngine } = require("../aiEngine");
const { DEV_PROFILE, seedTo } = require("../devSeed");
const { WORK_VALUES_ORDER } = require("../workValues");
const { JOB_CHAR_PARAM_IDS } = require("../questionPool");

const aiEngine = createAiEngine({ apiKey: undefined, model: "test" });

function freshSession() {
  const store = new SessionStore();
  const session = store.createSession({ dreamAnswer: DEV_PROFILE.dreamAnswer });
  return { store, session };
}

test("DEV_PROFILE answers every item of every instrument", () => {
  assert.equal(Object.keys(DEV_PROFILE.bigFive).length, 20);
  assert.equal(Object.keys(DEV_PROFILE.riasec).length, 12);
  assert.equal(Object.keys(DEV_PROFILE.careerJourney).length, 7);
  assert.deepEqual([...DEV_PROFILE.valuesOrder].sort(), [...WORK_VALUES_ORDER].sort());
  assert.deepEqual([...DEV_PROFILE.jobCharRanking].sort(), [...JOB_CHAR_PARAM_IDS].sort());
});

test("the fixed profile scores to the documented persona", async () => {
  const { store, session } = freshSession();
  await seedTo(session, "tree", { store, aiEngine });

  assert.deepEqual(session.bigFiveScores, { O: 94, C: 75, E: 44, A: 75, N: 25 });
  assert.deepEqual(session.riasecScores, { R: 13, I: 100, A: 88, S: 50, E: 63, C: 38 });
  assert.equal(session.riasecCode, "IAE");
});

test("seeding to tree leaves everything the output engine needs", async () => {
  const { store, session } = freshSession();
  await seedTo(session, "tree", { store, aiEngine });

  assert.equal(session.step, "tree");
  assert.ok(session.riasecScores, "riasecScores");
  assert.ok(session.jobCharProfile, "jobCharProfile");
  assert.equal(session.userValues.source, "tournament");
  assert.equal(session.userValues.confidence, "explicit");
  assert.equal(session.valuesTournament, null, "finished tournament must be cleared");
  assert.ok(session.personaSummary, "personaSummary");
  for (const param of JOB_CHAR_PARAM_IDS) {
    assert.equal(typeof session.jobCharProfile[param], "number", param);
  }
});

test("seeding stops exactly at the requested step", async () => {
  for (const target of ["big_five", "riasec", "values", "job_characteristics", "cv", "summary"]) {
    const { store, session } = freshSession();
    await seedTo(session, target, { store, aiEngine });
    assert.equal(session.step, target, `target ${target}`);
  }
});

test("the targeted step itself is left for the user to do", async () => {
  const { store, session } = freshSession();
  await seedTo(session, "riasec", { store, aiEngine });
  // Only steps strictly before the target are filled, so the RIASEC instrument
  // is neither seeded nor answered — the frontend's start effect handles it,
  // exactly as in the real flow.
  assert.deepEqual(session.riasecAnswers, {});
  assert.equal(session.riasecScores, null);
  assert.deepEqual(session.riasecItems, []);
});

test("forward-fill preserves real answers already recorded", async () => {
  const { store, session } = freshSession();
  store.setDemographicAnswer(session, "city", "Lisbon");
  store.setDemographicAnswer(session, "country", "Portugal");

  await seedTo(session, "summary", { store, aiEngine });

  assert.equal(session.demographics.city, "Lisbon");
  assert.equal(session.demographics.country, "Portugal");
  assert.equal(session.demographics.age, DEV_PROFILE.demographics.age, "gaps still filled");
});

test("a backward target is rejected with a 400-tagged error", async () => {
  const { store, session } = freshSession();
  await seedTo(session, "cv", { store, aiEngine });

  await assert.rejects(
    () => seedTo(session, "riasec", { store, aiEngine }),
    (error) => error.statusCode === 400
  );
});

test("seeding is idempotent — re-seeding the same target changes nothing", async () => {
  const { store, session } = freshSession();
  await seedTo(session, "summary", { store, aiEngine });
  const before = JSON.stringify(session.bigFiveAnswers);

  await seedTo(session, "summary", { store, aiEngine });
  assert.equal(JSON.stringify(session.bigFiveAnswers), before);
  assert.equal(session.step, "summary");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && node --test tests/devSeed.test.js`
Expected: FAIL — `Cannot find module '../devSeed'`.

- [ ] **Step 3: Implement**

Create `backend/devSeed.js`:

```js
// Dev-only session seeder. Fills the assessment forward with one fixed profile
// so a developer can land on a late screen without answering ~55 questions.
//
// Every filler closes its step through the SAME store mutators, validators, and
// scoring functions the real route uses. That is deliberate: this module must
// never become a second implementation of the machine. The route tests seed to
// `tree` and then call the real /api/output/first — if a filler drifts from its
// route, that test is what catches it.

const { STEP_ORDER } = require("./sessionStore");
const { getStaticRiasecItems } = require("./riasecItems");
const {
  validateDemographicAnswer,
  validateBigFiveAnswer,
  validateRiasecAnswer,
  validateJobCharRanking,
  validateCareerJourneyAnswer,
  computeBigFiveScores,
  deriveBigFiveTraits,
  computeRiasecScores,
  deriveRiasecCode,
  rankToJobCharTargets,
  JOB_CHAR_CURVE_VERSION,
} = require("./questionEngine");
const {
  rankToWorkValueScores,
  WORK_VALUE_CURVE_VERSION,
} = require("./workValues");

// One fixed persona: Investigative-Artistic, high Openness, low Neuroticism.
// Fixed rather than random so a bug reproduces and two runs are comparable.
// Scores to O 94 / C 75 / E 44 / A 75 / N 25 and RIASEC code IAE — asserted in
// tests/devSeed.test.js, so a change to the scoring curves surfaces there
// instead of silently becoming a different person.
const DEV_PROFILE = Object.freeze({
  dreamAnswer:
    "I want to build things that explain complex systems to people — research, writing, and design in one job.",
  // "prefer_not" is the neutral value and exercises the withheld-sex branch in
  // the prompt digest.
  demographics: { sex: "prefer_not", age: 29, country: "Germany", city: "Berlin" },
  bigFive: {
    mip_1: 2, mip_2: 4, mip_3: 4, mip_4: 2, mip_5: 5,
    mip_6: 3, mip_7: 2, mip_8: 4, mip_9: 4, mip_10: 1,
    mip_11: 3, mip_12: 4, mip_13: 2, mip_14: 2, mip_15: 1,
    mip_16: 3, mip_17: 2, mip_18: 2, mip_19: 4, mip_20: 2,
  },
  riasec: {
    ri_1: 2, ri_2: 5, ri_3: 5, ri_4: 3, ri_5: 4, ri_6: 2,
    ri_7: 1, ri_8: 5, ri_9: 4, ri_10: 3, ri_11: 3, ri_12: 3,
  },
  valuesOrder: [
    "independence",
    "achievement",
    "working_conditions",
    "relationships",
    "recognition",
    "support",
  ],
  jobCharRanking: [
    "complexity",
    "meaning_impact",
    "career_growth",
    "work_mode",
    "compensation",
    "job_security",
    "social",
  ],
  careerJourney: {
    cj_education: "BSc in physics, finished",
    cj_role: "Data analyst at a logistics company",
    cj_skills: "Statistics, explaining hard ideas simply, writing",
    cj_liked: "Loved digging into messy data; hated status meetings",
    cj_constraint: "Need to keep earning — no long unpaid break",
    cj_horizon: "Within two years",
    cj_retrain: "Willing, if it builds on what I already know",
  },
});

// One filler per step, mirroring that step's route completion branch.
// `tree` is terminal: it is a target, never a thing to fill.
const FILLERS = {
  demographics(session, { store }) {
    for (const [questionId, value] of Object.entries(DEV_PROFILE.demographics)) {
      if (session.demographics[questionId] !== undefined) continue;
      store.setDemographicAnswer(session, questionId, validateDemographicAnswer(questionId, value));
    }
    store.advanceStep(session, "big_five");
  },

  big_five(session, { store }) {
    for (const item of session.bigFiveItems) {
      if (session.bigFiveAnswers[item.id] !== undefined) continue;
      const raw = DEV_PROFILE.bigFive[item.id];
      store.recordBigFiveAnswer(session, item.id, validateBigFiveAnswer(session, item.id, raw));
    }
    const scores = computeBigFiveScores(session);
    store.setBigFiveScores(session, scores, deriveBigFiveTraits(scores));
    store.advanceStep(session, "riasec");
  },

  riasec(session, { store }) {
    // setRiasecItems clears any recorded answers, so it must run first and only
    // when the instrument is not already seeded.
    if (!session.riasecItems.length) store.setRiasecItems(session, getStaticRiasecItems());
    for (const item of session.riasecItems) {
      if (session.riasecAnswers[item.id] !== undefined) continue;
      const raw = DEV_PROFILE.riasec[item.id];
      store.recordRiasecAnswer(session, item.id, validateRiasecAnswer(session, item.id, raw));
    }
    const { scores } = computeRiasecScores(session);
    store.setRiasecScores(session, scores, deriveRiasecCode(scores));
    store.advanceStep(session, "values");
  },

  values(session, { store }) {
    const order = DEV_PROFILE.valuesOrder;
    store.finalizeValues(session, {
      scores: rankToWorkValueScores(order),
      order,
      curveVersion: WORK_VALUE_CURVE_VERSION,
      nextStep: "job_characteristics",
    });
  },

  job_characteristics(session, { store }) {
    const ranking = validateJobCharRanking(DEV_PROFILE.jobCharRanking);
    store.finalizeJobChar(session, {
      ranking,
      profile: rankToJobCharTargets(ranking),
      curveVersion: JOB_CHAR_CURVE_VERSION,
      nextStep: "cv",
    });
  },

  // Closed through the career-journey path rather than a CV upload: no file
  // parsing, and it works without an API key.
  async cv(session, { store, aiEngine }) {
    if (!session.cvIntent) store.setCvIntent(session, "new");
    for (const [questionId, value] of Object.entries(DEV_PROFILE.careerJourney)) {
      if (session.careerJourneyAnswers[questionId] !== undefined) continue;
      store.recordCareerJourneyAnswer(
        session,
        questionId,
        validateCareerJourneyAnswer(questionId, value)
      );
    }
    store.setPersonaSummary(session, await aiEngine.generatePersonaSummary({ session }));
    store.advanceStep(session, "summary");
  },

  summary(session, { store }) {
    store.advanceStep(session, "tree");
  },
};

function httpErr(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// Closes every unfinished step strictly before `targetStep`. Steps already
// completed are skipped, which is what makes forward-fill preserve real answers.
async function seedTo(session, targetStep, { store, aiEngine }) {
  const targetIndex = STEP_ORDER.indexOf(targetStep);
  if (targetIndex === -1) throw httpErr(400, "Unknown step.");

  const startIndex = STEP_ORDER.indexOf(session.step);
  if (targetIndex < startIndex) {
    throw httpErr(400, "Target step is behind the session — seed a fresh session instead.");
  }

  for (let i = startIndex; i < targetIndex; i += 1) {
    await FILLERS[STEP_ORDER[i]](session, { store, aiEngine });
  }
  return session;
}

module.exports = { DEV_PROFILE, FILLERS, seedTo };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && node --test tests/devSeed.test.js`
Expected: PASS, all eight tests.

- [ ] **Step 5: Commit**

```bash
git add backend/devSeed.js backend/tests/devSeed.test.js
git commit -m "feat: dev session seeder with a fixed profile"
```

---

### Task 3: `POST /api/dev/jump` and the token gate

**Files:**
- Modify: `backend/server.js`, `backend/.env.example`
- Test: `backend/tests/devJump.test.js`, `backend/tests/devJumpDisabled.test.js`

**Interfaces:**
- Consumes: `DEV_PROFILE`, `FILLERS`, `seedTo` from Task 2; `STEP_ORDER` from Task 1.
- Produces: `POST /api/dev/jump` accepting `{ sessionId?: string, step: string }` with an `X-Dev-Token` header, responding with the standard session snapshot (same shape as `/api/session/start`, `includeStatic: true`).

Two test files because the gate depends on env read at module load, and `node --test` isolates each file in its own process — one file with the token set, one without.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/devJumpDisabled.test.js`:

```js
// No DEV_TOOLS_TOKEN: the dev router must not exist at all.
process.env.NODE_ENV = "test";
process.env.OPENAI_API_KEY = "";
delete process.env.DEV_TOOLS_TOKEN;

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

test("the dev route is absent when DEV_TOOLS_TOKEN is unset", async () => {
  const res = await fetch(`${base}/api/dev/jump`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Dev-Token": "anything" },
    body: JSON.stringify({ step: "summary" }),
  });
  assert.equal(res.status, 404);
});
```

Create `backend/tests/devJump.test.js`:

```js
process.env.NODE_ENV = "test";
process.env.OPENAI_API_KEY = "";
process.env.DEV_TOOLS_TOKEN = "test-dev-token";
process.env.RATE_LIMIT_GLOBAL_MAX = "1000000";
process.env.RATE_LIMIT_AI_MAX = "1000000";

const test = require("node:test");
const assert = require("node:assert/strict");
const { app } = require("../server");
const { STEP_ORDER } = require("../sessionStore");
const { FILLERS } = require("../devSeed");

let server;
let base;

test.before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

async function jump(body, token = "test-dev-token") {
  const headers = { "Content-Type": "application/json" };
  if (token !== null) headers["X-Dev-Token"] = token;
  const res = await fetch(`${base}/api/dev/jump`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function post(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

test("a wrong or missing token is indistinguishable from an absent route", async () => {
  const absent = await fetch(`${base}/api/dev/definitely-not-a-route`, { method: "POST" });
  const absentBody = await absent.text();
  assert.equal(absent.status, 404);

  for (const token of ["wrong-token", null]) {
    const res = await fetch(`${base}/api/dev/jump`, {
      method: "POST",
      headers: token === null
        ? { "Content-Type": "application/json" }
        : { "Content-Type": "application/json", "X-Dev-Token": token },
      body: JSON.stringify({ step: "summary" }),
    });
    assert.equal(res.status, 404, `token ${token}`);
    // Same body, not just the same status: a distinct error shape would confirm
    // the route exists just as surely as a 403 would.
    assert.equal(await res.text(), absentBody, `token ${token}`);
  }
});

test("a jump with no sessionId creates a seeded session", async () => {
  const { status, data } = await jump({ step: "summary" });
  assert.equal(status, 200);
  assert.ok(data.sessionId);
  assert.equal(data.step, "summary");
  assert.ok(data.bigFiveScores, "summary renders the Big Five radar");
  assert.ok(data.userValues, "summary renders the work-values radar");
  assert.ok(data.personaSummary, "summary renders the persona prose");
  assert.ok(data.demographicQuestions, "static banks travel on a jump snapshot");
});

test("every step is reachable", async () => {
  for (const step of STEP_ORDER) {
    const { status, data } = await jump({ step });
    assert.equal(status, 200, step);
    assert.equal(data.step, step, step);
  }
});

test("an unknown step is a 400 carrying a requestId", async () => {
  const { status, data } = await jump({ step: "not_a_step" });
  assert.equal(status, 400);
  assert.ok(data.requestId);
});

// Drift guard: if a filler stops writing something the engine needs, this fails.
test("a session seeded to tree can generate a real first output", async () => {
  const { data: seeded } = await jump({ step: "tree" });
  const { status, data } = await post("/api/output/first", { sessionId: seeded.sessionId });
  assert.equal(status, 200);
  assert.equal(data.outputs.length, 1);
  assert.ok(data.outputs[0].jobTitle);
  assert.ok(data.outputs[0].socCode);
});

// Drift guard: a step added to the machine without a filler fails here.
test("the filler map covers every non-terminal step", () => {
  assert.deepEqual(Object.keys(FILLERS).sort(), STEP_ORDER.slice(0, -1).sort());
});

test("forward-fill keeps real answers already in the session", async () => {
  const { data: started } = await post("/api/session/start", { dreamAnswer: "my own dream" });
  await post("/api/session/demographics", {
    sessionId: started.sessionId,
    questionId: "city",
    value: "Lisbon",
  });

  const { data } = await jump({ sessionId: started.sessionId, step: "summary" });
  assert.equal(data.sessionId, started.sessionId, "same session, filled forward");
  assert.equal(data.demographics.city, "Lisbon");
  assert.equal(data.dreamAnswer, "my own dream");
});

test("a backward jump returns a fresh session carrying the dream over", async () => {
  const { data: ahead } = await jump({ step: "summary" });
  const { status, data } = await jump({ sessionId: ahead.sessionId, step: "riasec" });

  assert.equal(status, 200);
  assert.notEqual(data.sessionId, ahead.sessionId);
  assert.equal(data.step, "riasec");
  assert.equal(data.dreamAnswer, ahead.dreamAnswer);
});

test("an unknown sessionId seeds a fresh session instead of 404ing", async () => {
  const { status, data } = await jump({
    sessionId: "00000000-0000-0000-0000-000000000000",
    step: "summary",
  });
  assert.equal(status, 200);
  assert.equal(data.step, "summary");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && node --test tests/devJump.test.js tests/devJumpDisabled.test.js`
Expected: `devJumpDisabled` PASSES already (the route genuinely does not exist yet); `devJump` FAILS with 404s on the calls that expect 200.

- [ ] **Step 3: Implement**

In `backend/server.js`, add `createHash` and `timingSafeEqual` to the existing `node:crypto` require:

```js
const { randomUUID, createHash, timingSafeEqual } = require("node:crypto");
```

Add the seeder require beside the other module requires:

```js
const { DEV_PROFILE, seedTo } = require("./devSeed");
const { SessionStore, STEP_ORDER } = require("./sessionStore");
```

(the `SessionStore` require already exists — extend it rather than duplicating it.)

Mount the route after the assessment routes and before the 404/error tail — placing it next to `/api/summary/continue` keeps it with the assessment machine it drives:

```js
// --- Dev tools -------------------------------------------------------------
// Stage switcher for manual testing: seeds a session forward to any step so a
// late screen is reachable without answering the whole assessment.
//
// Gated twice. Without DEV_TOOLS_TOKEN the route is never registered, so the
// production deploy does not carry it unless it is deliberately switched on. A
// wrong token answers 404 rather than 403 — a 403 would confirm the route is
// there.
const DEV_TOOLS_TOKEN = process.env.DEV_TOOLS_TOKEN;

function devTokenMatches(provided) {
  if (typeof provided !== "string" || !provided) return false;
  // Hash both sides first: equal-length buffers, so neither the token's length
  // nor its prefix leaks through comparison timing.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(DEV_TOOLS_TOKEN).digest();
  return timingSafeEqual(a, b);
}

if (DEV_TOOLS_TOKEN) {
  app.post("/api/dev/jump", async (req, res, next) => {
    // next() falls through to Express's default 404, so a wrong token produces
    // byte-for-byte the same response as a path that was never mounted. A
    // distinct JSON error here would confirm the route exists.
    if (!devTokenMatches(req.get("x-dev-token"))) return next();

    const { sessionId, step } = req.body || {};
    if (!STEP_ORDER.includes(step)) {
      return fail(res, req, 400, "Unknown step.");
    }

    // An expired or unknown id must not 404: the point of the tool is to land
    // on a working screen, so fall through to a fresh session instead.
    const existing = sessionId ? store.get(sessionId) : null;
    const behind =
      existing && STEP_ORDER.indexOf(step) < STEP_ORDER.indexOf(existing.step);
    const session =
      existing && !behind
        ? existing
        : store.createSession({
            dreamAnswer: existing ? existing.dreamAnswer : DEV_PROFILE.dreamAnswer,
          });

    const lockKey = `${session.id}:dev`;
    if (!acquireLock(lockKey)) {
      return fail(res, req, 409, "Another change to this path is still processing.");
    }
    try {
      await seedTo(session, step, { store, aiEngine });
      return sendSessionSnapshot(res, session, { includeStatic: true });
    } catch (error) {
      return sendError(res, req, error, "Could not seed the session.");
    } finally {
      releaseLock(lockKey);
    }
  });

  console.warn(
    "[dev-tools] DEV_TOOLS_TOKEN is set — POST /api/dev/jump is live. Unset it to remove the route."
  );
}
```

Add to `backend/.env.example`, after the O*NET block:

```
# Optional: enables the dev stage switcher (POST /api/dev/jump + the in-app DEV
# panel at ?dev=<token>), which seeds a session forward to any assessment step.
# Unset, the route is not registered at all. Use a long random value.
#DEV_TOOLS_TOKEN=
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && node --test tests/devJump.test.js tests/devJumpDisabled.test.js`
Expected: PASS, both files.

- [ ] **Step 5: Run the whole backend suite**

Run: `cd backend && npm test`
Expected: PASS. Confirms the new route did not disturb the existing route or rate-limit suites.

- [ ] **Step 6: Commit**

```bash
git add backend/server.js backend/.env.example backend/tests/devJump.test.js backend/tests/devJumpDisabled.test.js
git commit -m "feat: gated POST /api/dev/jump stage switcher"
```

---

### Task 4: Frontend token capture and API wrapper

**Files:**
- Create: `frontend/src/devMode.js`, `frontend/src/devMode.test.js`
- Modify: `frontend/src/api.js`

**Interfaces:**
- Consumes: `POST /api/dev/jump` from Task 3.
- Produces:
  - `frontend/src/devMode.js` — `captureDevToken()` (call once at module init; moves `?dev=<token>` from the URL into `sessionStorage`), `getDevToken() -> string | null`, `isDevMode() -> boolean`, and the pure helper `readTokenFromSearch(search) -> string | null`.
  - `frontend/src/api.js` — `devJump({ sessionId, step }) -> Promise<snapshot>`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/devMode.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import { readTokenFromSearch, captureDevToken, getDevToken, isDevMode } from "./devMode";

describe("readTokenFromSearch", () => {
  it("pulls the dev token out of a query string", () => {
    expect(readTokenFromSearch("?dev=abc123")).toBe("abc123");
    expect(readTokenFromSearch("?foo=1&dev=abc123&bar=2")).toBe("abc123");
  });

  it("returns null when there is no usable token", () => {
    expect(readTokenFromSearch("")).toBe(null);
    expect(readTokenFromSearch("?foo=1")).toBe(null);
    expect(readTokenFromSearch("?dev=")).toBe(null);
  });
});

describe("captureDevToken", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("stores the token and strips it from the address bar", () => {
    window.history.replaceState({}, "", "/?dev=secret-token");

    captureDevToken();

    expect(getDevToken()).toBe("secret-token");
    expect(isDevMode()).toBe(true);
    expect(window.location.search).toBe("");
  });

  it("keeps other query parameters", () => {
    window.history.replaceState({}, "", "/?dev=secret-token&keep=1");

    captureDevToken();

    expect(window.location.search).toBe("?keep=1");
  });

  it("is inert without a token", () => {
    captureDevToken();

    expect(getDevToken()).toBe(null);
    expect(isDevMode()).toBe(false);
  });

  it("keeps a token captured earlier in the tab", () => {
    window.history.replaceState({}, "", "/?dev=secret-token");
    captureDevToken();
    window.history.replaceState({}, "", "/");

    captureDevToken();

    expect(getDevToken()).toBe("secret-token");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test -- --run devMode`
Expected: FAIL — cannot resolve `./devMode`.

- [ ] **Step 3: Implement**

Create `frontend/src/devMode.js`:

```js
// Dev stage switcher access. The token arrives once as ?dev=<token>, moves into
// sessionStorage, and is scrubbed from the address bar so it does not sit in
// history or get copy-pasted along with a shared link.
//
// sessionStorage, not localStorage: the token dies with the tab, so it is
// harder to leave behind in a browser.

const TOKEN_KEY = "lpe.devToken";
const PARAM = "dev";

export function readTokenFromSearch(search) {
  const token = new URLSearchParams(search).get(PARAM);
  return token || null;
}

export function captureDevToken() {
  const token = readTokenFromSearch(window.location.search);
  if (!token) return;

  sessionStorage.setItem(TOKEN_KEY, token);

  const url = new URL(window.location.href);
  url.searchParams.delete(PARAM);
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export function getDevToken() {
  return sessionStorage.getItem(TOKEN_KEY) || null;
}

export function isDevMode() {
  return Boolean(getDevToken());
}
```

Add to `frontend/src/api.js` — the import at the top:

```js
import { getDevToken } from "./devMode";
```

and the wrapper at the end of the file:

```js
// Dev stage switcher. The only request that carries the dev token; without one
// the backend answers 404, same as when the route is not mounted at all.
export function devJump(payload) {
  return request("/api/dev/jump", {
    method: "POST",
    headers: { "X-Dev-Token": getDevToken() || "" },
    body: JSON.stringify(payload),
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm test -- --run devMode`
Expected: PASS, all six tests.

- [ ] **Step 5: Run the whole frontend suite**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/devMode.js frontend/src/devMode.test.js frontend/src/api.js
git commit -m "feat: dev token capture and devJump api wrapper"
```

---

### Task 5: Extract `hydrateFromSnapshot`

Pure refactor, no behaviour change. Doing it before the panel exists keeps the two changes separable for review, and means the dev jump has exactly one way to apply a snapshot.

**Files:**
- Modify: `frontend/src/App.jsx:663–696` (the resume `useEffect`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `hydrateFromSnapshot(data)` inside `App` — applies the snapshot, repositions the four question indexes, sets `cvMode`, `dreamAnswer`, and `stage`. Defined immediately after `applySessionSnapshot`.

- [ ] **Step 1: Add the function**

In `frontend/src/App.jsx`, directly after the closing brace of `applySessionSnapshot` (currently line 661):

```jsx
  // A full session snapshot arriving from outside the normal answer flow —
  // page reload, or a dev stage jump. Beyond the shared state, this repositions
  // the local question indexes and picks the top-level stage. Both callers must
  // go through here: a second place that knows about indexes would drift.
  const hydrateFromSnapshot = (data) => {
    applySessionSnapshot(data);
    setDreamAnswer(data.dreamAnswer || "");
    setDemoIndex(firstUnansweredIndex(data.demographicQuestions || [], data.demographics));
    setBigFiveIndex(firstUnansweredIndex(data.bigFiveItems || [], data.bigFiveAnswers));
    setRiasecIndex(firstUnansweredIndex(data.riasecItems || [], data.riasecAnswers));
    setJourneyIndex(
      firstUnansweredIndex(data.careerJourneyQuestions || [], data.careerJourneyAnswers)
    );
    if (Object.keys(data.careerJourneyAnswers || {}).length) setCvMode("journey");
    const inTree = data.step === "tree" && (data.outputs || []).length > 0;
    setStage(inTree ? "tree" : "survey");
  };
```

- [ ] **Step 2: Rewrite the resume effect to use it**

Replace the body of the resume `useEffect` (`applySessionSnapshot(data)` through `setStage(inTree ? "tree" : "survey");`) with a single call, leaving the surrounding try/catch/finally and the `cancelled` guard exactly as they are:

```jsx
        const data = await fetchSession(storedId);
        if (cancelled) return;
        hydrateFromSnapshot(data);
```

- [ ] **Step 3: Verify no behaviour changed**

Run: `cd frontend && npm test`
Expected: PASS.

Run: `cd frontend && npm run lint`
Expected: no new errors. The resume effect keeps its existing `eslint-disable-next-line react-hooks/exhaustive-deps` comment — `hydrateFromSnapshot` is a new dependency the mount-only effect deliberately ignores.

- [ ] **Step 4: Verify by hand**

Start the app (`npm run dev` from the root), answer two demographic questions, reload the page. The survey must resume on the third question, not the first.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "refactor: extract hydrateFromSnapshot from the resume path"
```

---

### Task 6: `DevPanel` and `handleDevJump`

**Files:**
- Create: `frontend/src/components/DevPanel.jsx`, `frontend/src/components/DevPanel.css`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `devJump` (Task 4), `isDevMode` (Task 4), `hydrateFromSnapshot` (Task 5), and the existing `fetchFirstOutput`, `acceptOutput`, `generateRoadmap` from `api.js`.
- Produces: `<DevPanel step pathStage sessionId busy onJump />`, where `onJump(target)` accepts any value in `STEP_ORDER` plus `"tree+output"` and `"detail"`.

- [ ] **Step 1: Create the panel**

`frontend/src/components/DevPanel.jsx`:

```jsx
import { useState } from "react";
import "./DevPanel.css";

// Deliberately utilitarian: monospace, dark plate, none of the product's
// styling. This must never read as part of the application.
const TARGETS = [
  { id: "demographics", label: "demographics" },
  { id: "big_five", label: "big_five" },
  { id: "riasec", label: "riasec" },
  { id: "values", label: "values" },
  { id: "job_characteristics", label: "job_characteristics" },
  { id: "cv", label: "cv" },
  { id: "summary", label: "summary" },
  { id: "tree", label: "tree (empty)" },
  { id: "tree+output", label: "tree + 1st output" },
  { id: "detail", label: "detail (accepted)" },
];

export default function DevPanel({ step, pathStage, sessionId, busy, onJump }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="dev-panel-pill" onClick={() => setOpen(true)}>
        DEV
      </button>
    );
  }

  return (
    <div className="dev-panel">
      <div className="dev-panel-head">
        <span>dev stage jump</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close dev panel">
          ×
        </button>
      </div>

      <dl className="dev-panel-state">
        <dt>step</dt>
        <dd>{step || "—"}</dd>
        <dt>pathStage</dt>
        <dd>{pathStage || "—"}</dd>
        <dt>session</dt>
        <dd>{sessionId ? sessionId.slice(0, 8) : "—"}</dd>
      </dl>

      <div className="dev-panel-targets">
        {TARGETS.map((target) => (
          <button
            key={target.id}
            type="button"
            disabled={busy}
            onClick={() => onJump(target.id)}
          >
            {target.label}
          </button>
        ))}
      </div>

      {busy && <p className="dev-panel-busy">seeding…</p>}
    </div>
  );
}
```

`frontend/src/components/DevPanel.css`:

```css
.dev-panel-pill,
.dev-panel {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 9999;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: #d6e2f0;
  background: #10161f;
  border: 1px solid #2b3a4d;
  border-radius: 6px;
}

.dev-panel-pill {
  padding: 6px 10px;
  letter-spacing: 0.08em;
  cursor: pointer;
}

.dev-panel {
  width: 210px;
  padding: 10px;
}

.dev-panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  color: #7e93ab;
}

.dev-panel-head button {
  background: none;
  border: none;
  color: #7e93ab;
  font-size: 14px;
  cursor: pointer;
}

.dev-panel-state {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 8px;
  margin: 0 0 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #2b3a4d;
}

.dev-panel-state dt {
  color: #7e93ab;
}

.dev-panel-state dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.dev-panel-targets {
  display: grid;
  gap: 4px;
}

.dev-panel-targets button {
  padding: 5px 8px;
  text-align: left;
  font: inherit;
  color: inherit;
  background: #182231;
  border: 1px solid #2b3a4d;
  border-radius: 4px;
  cursor: pointer;
}

.dev-panel-targets button:hover:not(:disabled) {
  background: #223047;
}

.dev-panel-targets button:disabled {
  opacity: 0.45;
  cursor: default;
}

.dev-panel-busy {
  margin: 8px 0 0;
  color: #7e93ab;
}
```

- [ ] **Step 2: Wire it into `App.jsx`**

Add the imports beside the existing ones:

```jsx
import DevPanel from "./components/DevPanel";
import { captureDevToken, isDevMode } from "./devMode";
import { devJump } from "./api";
```

`devJump` goes into the existing `from "./api"` import list rather than a second import statement. `fetchFirstOutput`, `acceptOutput`, and `generateRoadmap` are already imported.

Immediately after the imports, at module scope, run the capture once:

```jsx
// Runs before React mounts: moves ?dev=<token> into sessionStorage and scrubs
// it from the URL, so the panel's visibility is settled by first render.
captureDevToken();
const DEV_MODE = isDevMode();
```

Add the busy flag to the existing `busy` state object initializer:

```jsx
    dev: false,
```

Add the handler next to the other handlers (after `handleAcceptOutput` is a natural home):

```jsx
  // Dev stage jump. The composite targets cannot call handleEnterLifePath /
  // handleAcceptOutput: those read sessionId and latestOutput from React state,
  // which has not re-rendered yet inside this same async function. So chain the
  // api wrappers on ids taken straight from each response and hydrate once at
  // the end.
  const handleDevJump = async (target) => {
    const step = target === "tree+output" || target === "detail" ? "tree" : target;
    setError("");
    setBusy((p) => ({ ...p, dev: true }));
    try {
      let data = await devJump({ sessionId: sessionId || undefined, step });
      const jumpedSessionId = data.sessionId;
      localStorage.setItem(SESSION_STORAGE_KEY, jumpedSessionId);

      if (target === "tree+output" || target === "detail") {
        data = await fetchFirstOutput({ sessionId: jumpedSessionId });
      }
      if (target === "detail") {
        const outputId = data.outputs[data.outputs.length - 1].id;
        data = await acceptOutput({ sessionId: jumpedSessionId, outputId });
        // The real Yes-branch always builds the roadmap right after accepting;
        // stopping short would leave a state no user ever sees.
        data = await generateRoadmap({ sessionId: jumpedSessionId, outputId });
      }

      hydrateFromSnapshot(data);
      setRetryAction(null);
    } catch (e) {
      setError(e.message || "Dev jump failed.");
    } finally {
      setBusy((p) => ({ ...p, dev: false }));
    }
  };
```

`pathStage` arrives in every snapshot but App does not currently hold it. Add it — the panel's status line is the reason it is worth having on the client. Declare it with the other `useState` calls:

```jsx
  const [pathStage, setPathStage] = useState("output");
```

and set it in `applySessionSnapshot`, alongside the other setters:

```jsx
    setPathStage(data.pathStage || "output");
```

Then mount the panel as the last child of `<main>`, immediately before the closing `</main>` tag at the end of the component:

```jsx
      {DEV_MODE && (
        <DevPanel
          step={step}
          pathStage={pathStage}
          sessionId={sessionId}
          busy={busy.dev}
          onJump={handleDevJump}
        />
      )}
```

- [ ] **Step 3: Verify the panel is invisible without a token**

Run: `npm run dev` from the repo root, open `http://localhost:5173`.
Expected: no DEV pill anywhere. This is the important negative check — the panel must be inert for real users.

- [ ] **Step 4: Verify the jump end to end**

Set `DEV_TOOLS_TOKEN=local-dev-token` in `backend/.env`, restart the backend, and open `http://localhost:5173/?dev=local-dev-token`.

Expected:
- the address bar drops back to `/` immediately, and a DEV pill appears bottom-right;
- `summary` lands on the character screen with a populated Big Five radar, values radar, and persona prose;
- `tree + 1st output` lands on the graph with one output node;
- `detail (accepted)` lands on the accepted output with the four advice blocks and a roadmap;
- jumping backward to `riasec` shows the RIASEC question flow and the session id in the panel changes.

- [ ] **Step 5: Run both suites and the linter**

Run: `cd frontend && npm test && npm run lint`
Expected: PASS, no new lint errors.

Run: `cd backend && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/DevPanel.jsx frontend/src/components/DevPanel.css frontend/src/App.jsx
git commit -m "feat: in-app dev stage jump panel"
```

---

### Task 7: Document the tool

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything above. Produces no code.

- [ ] **Step 1: Add the section**

In `CLAUDE.md`, add a `### Dev tools` subsection at the end of the `## Architecture` section, after `### Frontend`:

```markdown
### Dev tools

A stage switcher for manual testing, off unless `DEV_TOOLS_TOKEN` is set in `backend/.env`.

- Unset (the normal state, including production): the dev router is never registered and `/api/dev/jump` 404s like any unknown path.
- Set: `POST /api/dev/jump` `{sessionId?, step}` with an `X-Dev-Token` header seeds the session forward to `step` with the fixed persona in `backend/devSeed.js` (`DEV_PROFILE` — Investigative-Artistic, O 94 / C 75 / E 44 / A 75 / N 25, RIASEC `IAE`) and returns the usual snapshot. Already-answered steps are preserved; a target behind the current step gets a fresh session carrying the dream answer over. A wrong token answers 404, never 403.
- Frontend: open `?dev=<token>` once — the token moves to `sessionStorage`, the URL is scrubbed, and a `DevPanel` pill appears with all eight steps plus the composite `tree + 1st output` and `detail (accepted)` targets (those chain the real `/api/output/first`, `/api/output/accept`, and `/api/roadmap/generate`).
- `backend/devSeed.js` closes each step through the same store mutators and scoring functions as the real routes. Two tests guard the drift: seeding to `tree` must survive a real `/api/output/first`, and the filler map must cover exactly `STEP_ORDER` minus `tree`. A new step in the machine without a filler fails the suite.
```

- [ ] **Step 2: Verify the claims**

Re-read the section against the code. Every route path, env var name, header name, and file path must exist as written — this section is what a future session will trust without checking.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document the dev stage switcher"
```

---

## Verification

Run before considering the work done:

```bash
cd backend && npm test
cd ../frontend && npm test && npm run lint
```

Then confirm by hand, with `DEV_TOOLS_TOKEN` unset and the backend restarted, that `POST /api/dev/jump` returns 404 and no DEV pill renders — the production default must be provably inert.
