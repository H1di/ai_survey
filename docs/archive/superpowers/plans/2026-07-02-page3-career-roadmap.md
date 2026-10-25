# Page 3 Career Roadmap Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Page 3's "paths + paywall" model with a free 4-stage guided flow: direction finding → profession narrowing (3 options) → confirm → personalized AI roadmap, rendered on the existing React Flow graph.

**Architecture:** Backend keeps the existing pattern (Express routes → `SessionStore` in-memory session → `aiEngine` with OpenAI JSON-mode + deterministic fallbacks → `prompts.js` templates). Page 3 session state moves from `branches/unlockedThemes` to `direction/professionOptions/roadmap` fields tracked by a new `pathStage` field (Page 2's `session.step` stays frozen at `"complete"` so the untouchable question engine is never affected). Frontend `App.jsx` keeps its `entry → survey → tree` stages; the tree stage becomes a graph-with-floating-question-dock driven entirely by server snapshots.

**Tech Stack:** Node 26 + Express 5 (CommonJS), `node --test` built-in runner (no new deps), React 19 + Vite, `@xyflow/react`, framer-motion, OpenAI `chat.completions` JSON mode.

## Global Constraints

- **STRICT BOUNDARY — do not modify:** `backend/questionPool.js`, `backend/questionEngine.js`, `backend/bigFiveItems.js`, the Page 1/2 routes in `server.js` (`/api/health`, `/api/session/start`, `GET /api/session/:sessionId`, `/api/session/demographics`, `/api/session/big-five-depth`, `/api/big-five/answer`, `/api/values/answer`), the entry/survey JSX sections of `App.jsx`, and any Page 1/2 session fields (`entryChoice, dreamAnswer, step, demographics, bigFiveDepth, bigFiveItems, bigFiveAnswers, bigFiveScores, derivedTraits, valuesAnswers, valuesScores, createdAt, updatedAt`).
- `session.step` never advances past `"complete"`. Page 3 progress lives in a NEW field `session.pathStage`. (Verified safe: `pickNextQuestion` returns `null` for unknown steps; `buildProgress`/`summarizeAnswersForClient` never read branch/theme fields.)
- All monetization removed: no `/api/payment/unlock-theme`, no `unlockedThemes`, no locked-node UI. `BRANCH_THEMES` stays defined in `questionPool.js` (file is off-limits) but is no longer imported anywhere.
- Remove `/api/branches/initial`, `/api/branches/create`, `/api/branches/evolve`, `/api/payment/unlock-theme`.
- All UI copy, prompts, and generated content in English.
- Keep existing fallback pattern: every AI call has a deterministic fallback; the flow must work with `OPENAI_API_KEY` unset.
- Keep the existing visual language: CSS vars from `frontend/src/index.css` (`--color-bg #ffffff`, `--color-text #0a0a0a`, `--color-text-muted #666`, `--color-text-faint #999`, `--color-border #e0e0e0`, `--color-surface #f7f7f7`), 2px radii, 450ms `cubic-bezier(0.22,1,0.36,1)` node-appear animation.
- Backend tests: `node --test` only (Node 26 built-in). No new npm dependencies anywhere.
- Tests must run with `process.env.OPENAI_API_KEY = ""` set **before** requiring backend modules, so `dotenv.config()` (which never overrides existing env vars) cannot inject a real key and every AI call deterministically takes its fallback.

## Existing-Code Primer (read once before any task)

- `backend/server.js:26` — single `SessionStore` instance; `sendSessionSnapshot(res, session, extras)` (line 43) wraps every response: `{...store.serializeSessionState(session, progress, summary), ...extras}`.
- `backend/aiEngine.js` — `createAiEngine({apiKey, model})` returns methods; `client` is `null` without a key; every method is `try { AI } catch { fallback }`. Helpers to KEEP: `cleanText`, `parseJsonObject`, `runJsonCompletion`, `buildSessionDigest`, `generateBigFiveItems` (Page 2!).
- `backend/prompts.js` — KEEP `BASE_SYSTEM`, `buildProfileDigest`, `buildBigFiveItemsPrompt` (Page 2). REMOVE `buildInitialBranchPrompts`, `buildEvolutionPrompts`.
- `frontend/src/App.jsx` — one file, three stages. `applySessionSnapshot(data)` (line 409) copies snapshot into state. The `"complete"` survey card's button launches Page 3.
- `frontend/src/components/GraphView/index.jsx` — registers `nodeTypes`/`edgeTypes`; `BranchEdge` (keep as-is) animates edges with `data.delay`.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `backend/directions.js` | **Create** | Canonical catalog of 8 broad directions + deterministic `computeDirection` tally + fallback profession seeds |
| `backend/tests/directions.test.js` | **Create** | Unit tests for catalog + tally |
| `backend/tests/sessionStore.test.js` | **Create** | Unit tests for new session schema/setters |
| `backend/tests/aiEngine.test.js` | **Create** | Fallback + normalizer tests (no API key) |
| `backend/tests/prompts.test.js` | **Create** | Structural tests for the 3 new templates |
| `backend/tests/server.test.js` | **Create** | HTTP integration test of the full Page 3 flow |
| `backend/package.json` | Modify | Add `"test": "node --test tests/"` script |
| `backend/sessionStore.js` | Rewrite | Session schema: Page 3 fields replace branch/theme fields |
| `backend/prompts.js` | Modify | Add 3 templates (direction questions, professions, roadmap); drop branch/evolution templates |
| `backend/aiEngine.js` | Modify | New engine methods + fallbacks + normalizers; drop branch/evolution code |
| `backend/server.js` | Modify | 6 new routes replace 4 old ones; export `app`, guard `listen` |
| `frontend/src/api.js` | Modify | 6 new client calls replace 4 old ones |
| `frontend/src/components/GraphView/NodeComponent.jsx` | Modify | Add `DirectionNode`, `ProfessionNode`, `RoadmapNode`; remove `PathNode`, `VariationNode` |
| `frontend/src/components/GraphView/NodeComponent.css` | Modify | Styles for new nodes; remove locked/path/variation styles |
| `frontend/src/components/GraphView/index.jsx` | Modify | Register new node types |
| `frontend/src/components/GraphView/ConfirmModal.jsx` | **Create** | Minimal "see how to reach this profession?" modal |
| `frontend/src/components/GraphView/ConfirmModal.css` | **Create** | Modal styles (same language as old TradeoffModal) |
| `frontend/src/components/GraphView/TradeoffModal.jsx` | **Delete** | Tradeoff flow is gone |
| `frontend/src/components/GraphView/TradeoffModal.css` | **Delete** | — |
| `frontend/src/components/GraphView/GraphPage.css` | Modify | Add floating question-dock styles |
| `frontend/src/App.jsx` | Modify | Tree stage: stage machine, graph builder, handlers (entry/survey untouched) |
| `README.md` | Modify | New Page 3 + API routes sections; remove payment sections |

## Data Shapes (canonical — used by every task)

```js
// DirectionQuestion (scope "direction"): options carry a direction vote
{ id: "dir_q1", text: "…", options: [{ value: "opt_1", label: "…", directionId: "tech" }] }
// NarrowingQuestion (scope "narrowing"): no directionId
{ id: "nar_q1", text: "…", options: [{ value: "opt_1", label: "…" }] }
// Direction
{ id: "tech", label: "Programming & Technology" }
// Profession
{ id: "prof_1", title: "Software Developer", summary: "…", whyFit: "…", dayToDay: "…" }
// Roadmap
{ professionId: "prof_1", stages: [{ id: "stage_1", title: "…", description: "…", timeframe: "…", milestone: "…" }] }
// Session Page 3 fields (added by Task 2)
{ pathStage: "direction"|"narrowing"|"professions"|"roadmap",
  directionQuestions: [], directionAnswers: {}, proposedDirection: null, direction: null,
  narrowingQuestions: [], narrowingAnswers: {}, professionOptions: [],
  selectedProfession: null, roadmap: null }
```

---

### Task 1: Test harness + `backend/directions.js`

**Files:**
- Create: `backend/directions.js`
- Create: `backend/tests/directions.test.js`
- Modify: `backend/package.json` (scripts block only)

**Interfaces:**
- Consumes: nothing.
- Produces: `DIRECTIONS` (array of `{id, label, examples, professionSeeds: [{title, summary}]}`), `DIRECTION_IDS` (array of the 8 id strings), `getDirection(id) -> {id,label,examples,professionSeeds}|null`, `computeDirection(questions, answers) -> {id, label}`.

- [ ] **Step 1: Add the test script**

In `backend/package.json`, change the scripts block to:

```json
  "scripts": {
    "dev": "nodemon server.js",
    "start": "node server.js",
    "test": "node --test tests/"
  },
```

- [ ] **Step 2: Write the failing test**

Create `backend/tests/directions.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DIRECTIONS,
  DIRECTION_IDS,
  getDirection,
  computeDirection,
} = require("../directions");

test("catalog has 8 directions, each with id/label/examples and 3 profession seeds", () => {
  assert.equal(DIRECTIONS.length, 8);
  for (const dir of DIRECTIONS) {
    assert.ok(dir.id && typeof dir.id === "string");
    assert.ok(dir.label && typeof dir.label === "string");
    assert.ok(dir.examples && typeof dir.examples === "string");
    assert.equal(dir.professionSeeds.length, 3);
    for (const seed of dir.professionSeeds) {
      assert.ok(seed.title);
      assert.ok(seed.summary);
    }
  }
  assert.deepEqual(DIRECTION_IDS, DIRECTIONS.map((d) => d.id));
});

test("getDirection finds by id and returns null for unknown", () => {
  assert.equal(getDirection("tech").label, "Programming & Technology");
  assert.equal(getDirection("nope"), null);
});

const QUESTIONS = [
  { id: "dir_q1", text: "q1", options: [
    { value: "a", label: "A", directionId: "tech" },
    { value: "b", label: "B", directionId: "design" },
  ]},
  { id: "dir_q2", text: "q2", options: [
    { value: "a", label: "A", directionId: "tech" },
    { value: "b", label: "B", directionId: "healthcare" },
  ]},
  { id: "dir_q3", text: "q3", options: [
    { value: "a", label: "A", directionId: "design" },
    { value: "b", label: "B", directionId: "business" },
  ]},
];

test("computeDirection: majority of option votes wins", () => {
  const result = computeDirection(QUESTIONS, { dir_q1: "a", dir_q2: "a", dir_q3: "b" });
  assert.deepEqual(result, { id: "tech", label: "Programming & Technology" });
});

test("computeDirection: tie broken by DIRECTIONS catalog order", () => {
  // tech gets 1 vote (q1), design gets 1 vote (q3): tech is earlier in the catalog
  const result = computeDirection(QUESTIONS, { dir_q1: "a", dir_q3: "a" });
  assert.equal(result.id, "tech");
});

test("computeDirection: no valid answers falls back to first catalog direction", () => {
  const result = computeDirection(QUESTIONS, {});
  assert.equal(result.id, DIRECTIONS[0].id);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npm test`
Expected: FAIL with `Cannot find module '../directions'`

- [ ] **Step 4: Write the implementation**

Create `backend/directions.js`:

```js
// Canonical broad professional directions for Stage A (direction finding).
// AI-generated direction questions must tag every option with one of these ids;
// the confirmed direction is a deterministic tally of those tags (no extra AI call).
const DIRECTIONS = [
  {
    id: "tech",
    label: "Programming & Technology",
    examples: "software developer, data analyst, IT support, DevOps engineer",
    professionSeeds: [
      { title: "Software Developer", summary: "Build and maintain applications, from features to fixes, mostly in focused screen work." },
      { title: "QA / Test Engineer", summary: "Design tests and hunt defects so software ships reliably; detail-driven and systematic." },
      { title: "Data Analyst", summary: "Turn raw data into decisions with queries, dashboards, and clear findings." },
    ],
  },
  {
    id: "healthcare",
    label: "Healthcare & Wellbeing",
    examples: "nurse, physical therapist, lab technician, paramedic",
    professionSeeds: [
      { title: "Registered Nurse", summary: "Care for patients directly in clinics or hospitals; hands-on, people-first work." },
      { title: "Physical Therapist", summary: "Help people recover movement and strength through guided one-on-one programs." },
      { title: "Medical Lab Technician", summary: "Run diagnostic tests behind the scenes; precise, structured, essential." },
    ],
  },
  {
    id: "design",
    label: "Design & Creative",
    examples: "UX designer, graphic designer, interior designer, illustrator",
    professionSeeds: [
      { title: "UX/UI Designer", summary: "Shape how digital products look and behave, balancing users and constraints." },
      { title: "Graphic Designer", summary: "Craft visual identity and communication for brands and campaigns." },
      { title: "Interior Designer", summary: "Design physical spaces people live and work in; creative plus client-facing." },
    ],
  },
  {
    id: "business",
    label: "Business & Sales",
    examples: "account executive, operations manager, business analyst, founder",
    professionSeeds: [
      { title: "Account Executive", summary: "Own client relationships and close deals; measurable, people-heavy, fast-paced." },
      { title: "Operations Manager", summary: "Keep the machine running: processes, coordination, and constant problem-solving." },
      { title: "Business Analyst", summary: "Bridge business goals and execution with analysis, requirements, and numbers." },
    ],
  },
  {
    id: "trades",
    label: "Skilled Trades",
    examples: "electrician, HVAC technician, carpenter, welder",
    professionSeeds: [
      { title: "Electrician", summary: "Install and repair electrical systems; tangible results and steady demand." },
      { title: "HVAC Technician", summary: "Diagnose and service heating/cooling systems; hands-on and independent." },
      { title: "Carpenter", summary: "Build with your hands from plans to finished structures; craft you can touch." },
    ],
  },
  {
    id: "education",
    label: "Education & Coaching",
    examples: "teacher, corporate trainer, career coach, instructional designer",
    professionSeeds: [
      { title: "Corporate Trainer", summary: "Teach practical skills to adults inside companies; explaining is the job." },
      { title: "Teacher", summary: "Guide learners through structured material; steady rhythm, visible human impact." },
      { title: "Career Coach", summary: "Help individuals navigate work decisions one-on-one; empathetic and practical." },
    ],
  },
  {
    id: "finance",
    label: "Finance & Analytics",
    examples: "financial analyst, accountant, compliance specialist, actuary",
    professionSeeds: [
      { title: "Financial Analyst", summary: "Model, forecast, and explain the numbers behind business decisions." },
      { title: "Accountant", summary: "Keep financial records accurate and compliant; structured and dependable." },
      { title: "Compliance Specialist", summary: "Make sure the rules are followed; detail-oriented work with real stakes." },
    ],
  },
  {
    id: "media",
    label: "Marketing & Media",
    examples: "digital marketer, content strategist, social media manager, copywriter",
    professionSeeds: [
      { title: "Digital Marketer", summary: "Run campaigns and grow audiences with a mix of creativity and metrics." },
      { title: "Content Strategist", summary: "Plan and shape what a brand says and where; editorial thinking at scale." },
      { title: "Social Media Manager", summary: "Own a brand's public voice day to day; fast feedback, creative output." },
    ],
  },
];

const DIRECTION_IDS = DIRECTIONS.map((d) => d.id);

function getDirection(id) {
  return DIRECTIONS.find((d) => d.id === id) || null;
}

// Deterministic Stage A resolution: each answered option votes for its
// directionId; most votes wins; ties break by catalog order (strict > while
// iterating DIRECTIONS keeps the earliest). No answers -> first direction.
function computeDirection(questions, answers) {
  const counts = new Map();

  for (const question of questions) {
    const chosen = answers[question.id];
    if (chosen === undefined) continue;
    const option = question.options.find((o) => o.value === chosen);
    if (!option || !option.directionId) continue;
    counts.set(option.directionId, (counts.get(option.directionId) || 0) + 1);
  }

  let best = null;
  for (const dir of DIRECTIONS) {
    const count = counts.get(dir.id) || 0;
    if (count > 0 && (best === null || count > best.count)) {
      best = { id: dir.id, label: dir.label, count };
    }
  }

  if (!best) {
    return { id: DIRECTIONS[0].id, label: DIRECTIONS[0].label };
  }
  return { id: best.id, label: best.label };
}

module.exports = {
  DIRECTIONS,
  DIRECTION_IDS,
  getDirection,
  computeDirection,
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npm test`
Expected: PASS — 5 tests, 0 failures

- [ ] **Step 6: Commit**

```bash
git add backend/directions.js backend/tests/directions.test.js backend/package.json
git commit -m "feat(backend): add direction catalog with deterministic tally + node:test harness"
```

---

### Task 2: `sessionStore.js` — new Page 3 session schema

**Files:**
- Rewrite: `backend/sessionStore.js`
- Create: `backend/tests/sessionStore.test.js`

**Interfaces:**
- Consumes: nothing (drops the `questionPool` import entirely — `BRANCH_THEMES`/`THEME_LOOKUP` are gone).
- Produces: `SessionStore` class with **kept** methods `createSession, get, require, touch, setDemographicAnswer, advanceStep, setBigFiveDepthAndItems, recordBigFiveAnswer, setBigFiveScores, recordValuesAnswer, setValuesScores` (bodies unchanged) and **new** methods:
  - `setDirectionQuestions(session, questions)` — also resets `directionAnswers` to `{}` and `proposedDirection` to `null`
  - `recordDirectionAnswer(session, questionId, value)`
  - `setProposedDirection(session, direction)`
  - `confirmDirection(session, direction)` — sets `session.direction` and `session.pathStage = "narrowing"`
  - `setNarrowingQuestions(session, questions)` — resets `narrowingAnswers` to `{}`
  - `recordNarrowingAnswer(session, questionId, value)`
  - `setProfessionOptions(session, professions)` — sets `session.pathStage = "professions"`
  - `selectProfession(session, profession)`
  - `setRoadmap(session, roadmap)` — sets `session.pathStage = "roadmap"`
  - `serializeSessionState(session, progress, summary)` — now returns Page 3 fields, no `branches`/`unlockedThemes`/`themes` keys.
- **Removed** (callers updated in Task 5): `unlockTheme, isThemeUnlocked, hasBranchForTheme, getBranch, createBranch, appendNode`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/sessionStore.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { SessionStore } = require("../sessionStore");

function makeSession(store) {
  return store.createSession({ entryChoice: "find", dreamAnswer: "build things" });
}

test("createSession initializes Page 3 fields and keeps Page 1/2 fields", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  // Page 1/2 fields intact
  assert.equal(s.entryChoice, "find");
  assert.equal(s.dreamAnswer, "build things");
  assert.equal(s.step, "demographics");
  assert.deepEqual(s.demographics, {});
  assert.deepEqual(s.bigFiveAnswers, {});
  assert.deepEqual(s.valuesAnswers, {});
  // New Page 3 fields
  assert.equal(s.pathStage, "direction");
  assert.deepEqual(s.directionQuestions, []);
  assert.deepEqual(s.directionAnswers, {});
  assert.equal(s.proposedDirection, null);
  assert.equal(s.direction, null);
  assert.deepEqual(s.narrowingQuestions, []);
  assert.deepEqual(s.narrowingAnswers, {});
  assert.deepEqual(s.professionOptions, []);
  assert.equal(s.selectedProfession, null);
  assert.equal(s.roadmap, null);
  // Old model gone
  assert.equal("branches" in s, false);
  assert.equal("unlockedThemes" in s, false);
  assert.equal("branchCounter" in s, false);
});

test("direction flow setters", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  const questions = [{ id: "dir_q1", text: "q", options: [{ value: "a", label: "A", directionId: "tech" }] }];

  store.setDirectionQuestions(s, questions);
  assert.deepEqual(s.directionQuestions, questions);

  store.recordDirectionAnswer(s, "dir_q1", "a");
  assert.equal(s.directionAnswers.dir_q1, "a");

  store.setProposedDirection(s, { id: "tech", label: "Programming & Technology" });
  assert.equal(s.proposedDirection.id, "tech");

  store.confirmDirection(s, { id: "tech", label: "Programming & Technology" });
  assert.equal(s.direction.id, "tech");
  assert.equal(s.pathStage, "narrowing");
});

test("setDirectionQuestions resets stale answers and proposal", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  s.directionAnswers = { dir_q1: "a" };
  s.proposedDirection = { id: "tech", label: "x" };
  store.setDirectionQuestions(s, []);
  assert.deepEqual(s.directionAnswers, {});
  assert.equal(s.proposedDirection, null);
});

test("narrowing, professions, selection, roadmap setters advance pathStage", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  store.confirmDirection(s, { id: "tech", label: "Programming & Technology" });

  store.setNarrowingQuestions(s, [{ id: "nar_q1", text: "q", options: [{ value: "a", label: "A" }] }]);
  store.recordNarrowingAnswer(s, "nar_q1", "a");
  assert.equal(s.narrowingAnswers.nar_q1, "a");

  const professions = [
    { id: "prof_1", title: "Software Developer", summary: "s", whyFit: "w", dayToDay: "d" },
    { id: "prof_2", title: "QA / Test Engineer", summary: "s", whyFit: "w", dayToDay: "d" },
    { id: "prof_3", title: "Data Analyst", summary: "s", whyFit: "w", dayToDay: "d" },
  ];
  store.setProfessionOptions(s, professions);
  assert.equal(s.pathStage, "professions");
  assert.equal(s.professionOptions.length, 3);

  store.selectProfession(s, professions[0]);
  assert.equal(s.selectedProfession.id, "prof_1");

  store.setRoadmap(s, { professionId: "prof_1", stages: [{ id: "stage_1", title: "t", description: "d", timeframe: "", milestone: "" }] });
  assert.equal(s.pathStage, "roadmap");
  assert.equal(s.roadmap.professionId, "prof_1");
});

test("serializeSessionState exposes Page 3 fields and hides the old model", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  const snapshot = store.serializeSessionState(s, { done: false }, {});
  assert.equal(snapshot.pathStage, "direction");
  assert.deepEqual(snapshot.directionQuestions, []);
  assert.deepEqual(snapshot.directionAnswers, {});
  assert.equal(snapshot.proposedDirection, null);
  assert.equal(snapshot.direction, null);
  assert.deepEqual(snapshot.narrowingQuestions, []);
  assert.deepEqual(snapshot.narrowingAnswers, {});
  assert.deepEqual(snapshot.professionOptions, []);
  assert.equal(snapshot.selectedProfession, null);
  assert.equal(snapshot.roadmap, null);
  assert.equal("branches" in snapshot, false);
  assert.equal("unlockedThemes" in snapshot, false);
  assert.equal("themes" in snapshot, false);
  // Page 2 surface intact
  assert.equal(snapshot.step, "demographics");
  assert.ok(snapshot.progress);
  assert.ok(snapshot.summary !== undefined);
});

test("old branch/theme methods are gone", () => {
  const store = new SessionStore();
  for (const gone of ["unlockTheme", "isThemeUnlocked", "hasBranchForTheme", "getBranch", "createBranch", "appendNode"]) {
    assert.equal(store[gone], undefined, `${gone} should be removed`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test tests/sessionStore.test.js`
Expected: FAIL (pathStage undefined, old methods still present)

- [ ] **Step 3: Replace `backend/sessionStore.js` with the new implementation**

Full new file content:

```js
const { randomUUID } = require("node:crypto");

class SessionStore {
  constructor() {
    this.sessions = new Map();
  }

  createSession({ entryChoice, dreamAnswer }) {
    const id = randomUUID();
    const now = new Date().toISOString();

    const session = {
      id,
      entryChoice,
      dreamAnswer,
      step: "demographics",
      demographics: {},
      bigFiveDepth: null,
      bigFiveItems: [],
      bigFiveAnswers: {},
      bigFiveScores: null,
      derivedTraits: null,
      valuesAnswers: {},
      valuesScores: null,
      // Page 3 — Life Path Engine
      pathStage: "direction",
      directionQuestions: [],
      directionAnswers: {},
      proposedDirection: null,
      direction: null,
      narrowingQuestions: [],
      narrowingAnswers: {},
      professionOptions: [],
      selectedProfession: null,
      roadmap: null,
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(id, session);
    return session;
  }

  get(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  require(sessionId) {
    const session = this.get(sessionId);

    if (!session) {
      const error = new Error("Session not found.");
      error.statusCode = 404;
      throw error;
    }

    return session;
  }

  touch(session) {
    session.updatedAt = new Date().toISOString();
  }

  setDemographicAnswer(session, questionId, value) {
    session.demographics[questionId] = value;
    this.touch(session);
  }

  advanceStep(session, nextStep) {
    session.step = nextStep;
    this.touch(session);
  }

  setBigFiveDepthAndItems(session, depth, items) {
    session.bigFiveDepth = depth;
    session.bigFiveItems = items;
    session.bigFiveAnswers = {};
    session.bigFiveScores = null;
    session.derivedTraits = null;
    this.touch(session);
  }

  recordBigFiveAnswer(session, itemId, value) {
    session.bigFiveAnswers[itemId] = value;
    this.touch(session);
  }

  setBigFiveScores(session, scores, derivedTraits) {
    session.bigFiveScores = scores;
    session.derivedTraits = derivedTraits;
    this.touch(session);
  }

  recordValuesAnswer(session, questionId, choice) {
    session.valuesAnswers[questionId] = choice;
    this.touch(session);
  }

  setValuesScores(session, scores) {
    session.valuesScores = scores;
    this.touch(session);
  }

  setDirectionQuestions(session, questions) {
    session.directionQuestions = questions;
    session.directionAnswers = {};
    session.proposedDirection = null;
    this.touch(session);
  }

  recordDirectionAnswer(session, questionId, value) {
    session.directionAnswers[questionId] = value;
    this.touch(session);
  }

  setProposedDirection(session, direction) {
    session.proposedDirection = direction;
    this.touch(session);
  }

  confirmDirection(session, direction) {
    session.direction = direction;
    session.pathStage = "narrowing";
    this.touch(session);
  }

  setNarrowingQuestions(session, questions) {
    session.narrowingQuestions = questions;
    session.narrowingAnswers = {};
    this.touch(session);
  }

  recordNarrowingAnswer(session, questionId, value) {
    session.narrowingAnswers[questionId] = value;
    this.touch(session);
  }

  setProfessionOptions(session, professions) {
    session.professionOptions = professions;
    session.pathStage = "professions";
    this.touch(session);
  }

  selectProfession(session, profession) {
    session.selectedProfession = profession;
    this.touch(session);
  }

  setRoadmap(session, roadmap) {
    session.roadmap = roadmap;
    session.pathStage = "roadmap";
    this.touch(session);
  }

  serializeSessionState(session, progress, summary) {
    return {
      sessionId: session.id,
      entryChoice: session.entryChoice,
      dreamAnswer: session.dreamAnswer,
      step: session.step,
      demographics: session.demographics,
      bigFiveDepth: session.bigFiveDepth,
      bigFiveScores: session.bigFiveScores,
      derivedTraits: session.derivedTraits,
      valuesScores: session.valuesScores,
      progress,
      summary,
      pathStage: session.pathStage,
      directionQuestions: session.directionQuestions,
      directionAnswers: session.directionAnswers,
      proposedDirection: session.proposedDirection,
      direction: session.direction,
      narrowingQuestions: session.narrowingQuestions,
      narrowingAnswers: session.narrowingAnswers,
      professionOptions: session.professionOptions,
      selectedProfession: session.selectedProfession,
      roadmap: session.roadmap,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }
}

module.exports = {
  SessionStore,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && node --test tests/sessionStore.test.js`
Expected: PASS — 6 tests. Note: `npm test` (all files) will FAIL until Task 5 because `server.js` still calls removed methods — that is expected mid-refactor; only this file's tests must pass here.

- [ ] **Step 5: Commit**

```bash
git add backend/sessionStore.js backend/tests/sessionStore.test.js
git commit -m "feat(backend): replace branch/theme session model with direction->roadmap schema"
```

---

### Task 3: `prompts.js` — three new templates

**Files:**
- Modify: `backend/prompts.js`
- Create: `backend/tests/prompts.test.js`

**Interfaces:**
- Consumes: `DIRECTIONS` from `backend/directions.js` (Task 1).
- Produces (each returns `{ system, user }` strings):
  - `buildAnswersDigest(questions, answers) -> string` — "Q → chosen label" lines for prompt context
  - `buildDirectionQuestionsPrompt({ profileDigest })`
  - `buildNarrowingQuestionsPrompt({ profileDigest, direction })` — `direction` is `{id, label}`
  - `buildProfessionsPrompt({ profileDigest, direction, directionDigest, narrowingDigest })`
  - `buildRoadmapPrompt({ profileDigest, direction, profession, narrowingDigest })` — `profession` is the full profession object
- Keeps exports: `buildProfileDigest`, `buildBigFiveItemsPrompt` (Page 2 — bodies untouched).
- Removes exports: `buildInitialBranchPrompts`, `buildEvolutionPrompts`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/prompts.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const prompts = require("../prompts");
const { DIRECTION_IDS } = require("../directions");

const PROFILE = "Entry intent: find\nDream answer: build things";
const DIRECTION = { id: "tech", label: "Programming & Technology" };
const PROFESSION = { id: "prof_1", title: "Software Developer", summary: "s", whyFit: "w", dayToDay: "d" };

test("buildAnswersDigest renders question -> chosen label lines", () => {
  const questions = [
    { id: "q1", text: "Pick one", options: [{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }] },
    { id: "q2", text: "Unanswered", options: [{ value: "a", label: "Alpha" }] },
  ];
  const digest = prompts.buildAnswersDigest(questions, { q1: "b" });
  assert.match(digest, /Pick one/);
  assert.match(digest, /Beta/);
  assert.doesNotMatch(digest, /Unanswered/);
});

test("direction questions prompt lists every direction id and demands exactly 3 questions", () => {
  const { system, user } = prompts.buildDirectionQuestionsPrompt({ profileDigest: PROFILE });
  for (const id of DIRECTION_IDS) assert.match(system, new RegExp(id));
  assert.match(system, /exactly 3 questions/i);
  assert.match(system, /directionId/);
  assert.match(system, /"questions"/);
  assert.match(user, /build things/);
});

test("narrowing questions prompt scopes to the direction and demands exactly 2 questions", () => {
  const { system, user } = prompts.buildNarrowingQuestionsPrompt({ profileDigest: PROFILE, direction: DIRECTION });
  assert.match(system, /exactly 2 questions/i);
  assert.doesNotMatch(system, /directionId/);
  assert.match(user, /Programming & Technology/);
});

test("professions prompt demands exactly 3 professions inside the direction", () => {
  const { system, user } = prompts.buildProfessionsPrompt({
    profileDigest: PROFILE,
    direction: DIRECTION,
    directionDigest: "Q -> A",
    narrowingDigest: "Q -> B",
  });
  assert.match(system, /exactly 3/i);
  assert.match(system, /"professions"/);
  assert.match(user, /Programming & Technology/);
  assert.match(user, /Q -> B/);
});

test("roadmap prompt demands 5-7 ordered stages for the profession", () => {
  const { system, user } = prompts.buildRoadmapPrompt({
    profileDigest: PROFILE,
    direction: DIRECTION,
    profession: PROFESSION,
    narrowingDigest: "Q -> B",
  });
  assert.match(system, /"stages"/);
  assert.match(system, /5.*7|5-7/);
  assert.match(system, /order/i);
  assert.match(user, /Software Developer/);
});

test("old branch templates are removed, Page 2 templates kept", () => {
  assert.equal(prompts.buildInitialBranchPrompts, undefined);
  assert.equal(prompts.buildEvolutionPrompts, undefined);
  assert.equal(typeof prompts.buildProfileDigest, "function");
  assert.equal(typeof prompts.buildBigFiveItemsPrompt, "function");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test tests/prompts.test.js`
Expected: FAIL (`buildAnswersDigest` is not a function; old templates still exported)

- [ ] **Step 3: Edit `backend/prompts.js`**

Keep lines 1–77 exactly as they are (`BASE_SYSTEM`, `buildProfileDigest`, `buildBigFiveItemsPrompt`). Delete `buildInitialBranchPrompts` (old lines 79–109) and `buildEvolutionPrompts` (old lines 111–138), and put this in their place:

```js
const { DIRECTIONS } = require("./directions");

function buildAnswersDigest(questions, answers) {
  const lines = [];
  for (const question of questions) {
    const chosen = answers[question.id];
    if (chosen === undefined) continue;
    const option = question.options.find((o) => o.value === chosen);
    if (!option) continue;
    lines.push(`- ${question.text} → ${option.label}`);
  }
  return lines.join("\n");
}

function directionCatalogLines() {
  return DIRECTIONS.map((d) => `- ${d.id}: ${d.label} (${d.examples})`).join("\n");
}

function buildDirectionQuestionsPrompt({ profileDigest }) {
  const system = [
    BASE_SYSTEM,
    "Generate exactly 3 questions (multiple-choice) whose only job is to converge on ONE broad professional direction for this user.",
    "Return valid JSON only and no extra keys.",
    'JSON schema: {"questions":[{"text":"","options":[{"value":"","label":"","directionId":""}]}]}',
    "Each question has exactly 4 options.",
    "Every option MUST set directionId to exactly one id from this catalog:",
    directionCatalogLines(),
    "Across the 3 questions the options must collectively cover at least 6 different directionIds.",
    "Option labels are concrete day-to-day preferences (under 80 characters), never direction names.",
    "Questions must be sharp and specific to this profile, not generic career-quiz filler.",
  ].join("\n");

  const user = [
    "Generate the 3 direction-finding questions now.",
    "Profile:",
    profileDigest,
  ].join("\n\n");

  return { system, user };
}

function buildNarrowingQuestionsPrompt({ profileDigest, direction }) {
  const system = [
    BASE_SYSTEM,
    "The user confirmed a broad professional direction. Generate exactly 2 questions to narrow toward specific professions inside that direction.",
    "Ask about work style, environment, or day-to-day preference within the direction.",
    "Return valid JSON only and no extra keys.",
    'JSON schema: {"questions":[{"text":"","options":[{"value":"","label":""}]}]}',
    "Each question has exactly 4 options. Option labels under 80 characters.",
  ].join("\n");

  const user = [
    `Confirmed direction: ${direction.label}`,
    "Profile:",
    profileDigest,
  ].join("\n\n");

  return { system, user };
}

function buildProfessionsPrompt({ profileDigest, direction, directionDigest, narrowingDigest }) {
  const system = [
    BASE_SYSTEM,
    "Generate exactly 3 specific, realistic professions that fit the user's confirmed direction and answers.",
    "Return valid JSON only and no extra keys.",
    'JSON schema: {"professions":[{"title":"","summary":"","whyFit":"","dayToDay":""}]}',
    "title: a real, recognizable job title. summary: one sentence, what the job is.",
    "whyFit: one or two sentences tying THIS user's profile and answers to the job.",
    "dayToDay: one sentence about a typical working day.",
    "The 3 professions must be meaningfully different from each other (role, seniority path, or work mode).",
    "Stay grounded in labor-market reality. No fantasy titles.",
  ].join("\n");

  const user = [
    `Confirmed direction: ${direction.label}`,
    "Direction-finding answers:",
    directionDigest || "(none)",
    "Narrowing answers:",
    narrowingDigest || "(none)",
    "Profile:",
    profileDigest,
  ].join("\n\n");

  return { system, user };
}

function buildRoadmapPrompt({ profileDigest, direction, profession, narrowingDigest }) {
  const system = [
    BASE_SYSTEM,
    "Generate a personalized, ordered, step-by-step career roadmap toward one target profession.",
    "Return valid JSON only and no extra keys.",
    'JSON schema: {"stages":[{"title":"","description":"","timeframe":"","milestone":""}]}',
    "Produce 5-7 stages, strictly in chronological order: foundations → first practice → entry-level role → key credential or milestone → mid-level growth → target role.",
    "title: short (under 40 characters), one main idea. description: 1-2 actionable sentences saying exactly what to learn, build, or gain.",
    "timeframe: rough duration like '2-3 months'. milestone: the concrete checkpoint that proves the stage is done.",
    "Personalize using the profile (age, country, personality, values) — adjust pace, entry point, and credential choices accordingly.",
  ].join("\n");

  const user = [
    `Target profession: ${profession.title}`,
    `Profession summary: ${profession.summary}`,
    `Direction: ${direction.label}`,
    "Narrowing answers:",
    narrowingDigest || "(none)",
    "Profile:",
    profileDigest,
  ].join("\n\n");

  return { system, user };
}
```

Then replace the `module.exports` block at the bottom with:

```js
module.exports = {
  buildProfileDigest,
  buildBigFiveItemsPrompt,
  buildAnswersDigest,
  buildDirectionQuestionsPrompt,
  buildNarrowingQuestionsPrompt,
  buildProfessionsPrompt,
  buildRoadmapPrompt,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && node --test tests/prompts.test.js`
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add backend/prompts.js backend/tests/prompts.test.js
git commit -m "feat(backend): direction/professions/roadmap prompt templates replace branch prompts"
```

---

### Task 4: `aiEngine.js` — fallbacks, normalizers, new engine methods

**Files:**
- Rewrite: `backend/aiEngine.js`
- Create: `backend/tests/aiEngine.test.js`

**Interfaces:**
- Consumes: Task 1 (`DIRECTIONS`, `DIRECTION_IDS`, `getDirection`), Task 3 (prompt builders, `buildAnswersDigest`), existing `bigFiveItems.getFallbackItems`, `questionPool.VALUES_DIMENSIONS`.
- Produces: `createAiEngine({ apiKey, model })` returning:
  - `generateBigFiveItems({ depth })` — unchanged (Page 2)
  - `generateDirectionQuestions({ session }) -> DirectionQuestion[3]`
  - `generateNarrowingQuestions({ session }) -> NarrowingQuestion[2]`
  - `generateProfessions({ session }) -> Profession[3]`
  - `generateRoadmap({ session }) -> { professionId, stages }` (uses `session.selectedProfession`)
- Removed: `generateInitialBranch`, `evolveBranch` (and their fallbacks/normalizers).
- Every new method: no client → fallback; AI error or invalid payload → `console.error` + fallback (existing pattern).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/aiEngine.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAiEngine } = require("../aiEngine");
const { DIRECTION_IDS } = require("../directions");

// No apiKey -> client is null -> every call takes the deterministic fallback.
const engine = createAiEngine({ apiKey: undefined, model: "test" });

function fakeSession(overrides = {}) {
  return {
    entryChoice: "find",
    dreamAnswer: "build things",
    demographics: { age: 30, country: "Testland" },
    bigFiveScores: { O: 70, C: 60, E: 40, A: 55, N: 45 },
    derivedTraits: null,
    valuesScores: null,
    direction: { id: "tech", label: "Programming & Technology" },
    directionQuestions: [],
    directionAnswers: {},
    narrowingQuestions: [],
    narrowingAnswers: {},
    selectedProfession: { id: "prof_1", title: "Software Developer", summary: "s", whyFit: "w", dayToDay: "d" },
    ...overrides,
  };
}

test("fallback direction questions: 3 questions, 4 options each, valid directionIds, >=6 directions covered", async () => {
  const questions = await engine.generateDirectionQuestions({ session: fakeSession() });
  assert.equal(questions.length, 3);
  const covered = new Set();
  questions.forEach((q, i) => {
    assert.equal(q.id, `dir_q${i + 1}`);
    assert.ok(q.text.length > 0);
    assert.equal(q.options.length, 4);
    for (const o of q.options) {
      assert.ok(o.value && o.label);
      assert.ok(DIRECTION_IDS.includes(o.directionId), `bad directionId ${o.directionId}`);
      covered.add(o.directionId);
    }
  });
  assert.ok(covered.size >= 6, `only ${covered.size} directions covered`);
});

test("fallback narrowing questions: 2 questions, ids nar_q1/nar_q2, no directionId on options", async () => {
  const questions = await engine.generateNarrowingQuestions({ session: fakeSession() });
  assert.equal(questions.length, 2);
  questions.forEach((q, i) => {
    assert.equal(q.id, `nar_q${i + 1}`);
    assert.equal(q.options.length, 4);
    for (const o of q.options) assert.equal(o.directionId, undefined);
  });
});

test("fallback professions: exactly 3 from the direction's seeds with generated whyFit/dayToDay", async () => {
  const professions = await engine.generateProfessions({ session: fakeSession() });
  assert.equal(professions.length, 3);
  professions.forEach((p, i) => {
    assert.equal(p.id, `prof_${i + 1}`);
    assert.ok(p.title && p.summary && p.whyFit && p.dayToDay);
  });
  assert.equal(professions[0].title, "Software Developer");
});

test("fallback professions for an unknown direction still returns 3 (first catalog direction)", async () => {
  const professions = await engine.generateProfessions({
    session: fakeSession({ direction: { id: "nope", label: "Nope" } }),
  });
  assert.equal(professions.length, 3);
});

test("fallback roadmap: 6 ordered stages tied to the selected profession", async () => {
  const roadmap = await engine.generateRoadmap({ session: fakeSession() });
  assert.equal(roadmap.professionId, "prof_1");
  assert.equal(roadmap.stages.length, 6);
  roadmap.stages.forEach((s, i) => {
    assert.equal(s.id, `stage_${i + 1}`);
    assert.ok(s.title && s.description && s.timeframe && s.milestone);
  });
  assert.match(roadmap.stages[5].title, /Software Developer/);
});

test("generateBigFiveItems still works (Page 2 untouched)", async () => {
  const items = await engine.generateBigFiveItems({ depth: "short" });
  assert.equal(items.length, 20);
});

test("old branch methods are gone", () => {
  assert.equal(engine.generateInitialBranch, undefined);
  assert.equal(engine.evolveBranch, undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test tests/aiEngine.test.js`
Expected: FAIL (`generateDirectionQuestions` is not a function)

- [ ] **Step 3: Replace `backend/aiEngine.js` with the new implementation**

Full new file content:

```js
const OpenAI = require("openai");
const {
  buildProfileDigest,
  buildBigFiveItemsPrompt,
  buildAnswersDigest,
  buildDirectionQuestionsPrompt,
  buildNarrowingQuestionsPrompt,
  buildProfessionsPrompt,
  buildRoadmapPrompt,
} = require("./prompts");
const { VALUES_DIMENSIONS } = require("./questionPool");
const { DIRECTIONS, DIRECTION_IDS, getDirection } = require("./directions");
const { getFallbackItems } = require("./bigFiveItems");

function cleanText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function parseJsonObject(content) {
  if (!content || typeof content !== "string") {
    throw new Error("Empty model response.");
  }

  const trimmed = content.trim();

  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    // continue
  }

  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch (_error) {
    // continue
  }

  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(withoutFence.slice(firstBrace, lastBrace + 1));
  }

  throw new Error("Could not parse model JSON output.");
}

function buildSessionDigest(session) {
  return buildProfileDigest({
    entryChoice: session.entryChoice,
    dreamAnswer: session.dreamAnswer,
    demographics: session.demographics,
    bigFiveScores: session.bigFiveScores,
    derivedTraits: session.derivedTraits,
    valuesScores: session.valuesScores,
    valuesDimensions: VALUES_DIMENSIONS,
  });
}

// ---------------------------------------------------------------------------
// Deterministic fallbacks (used when there is no API key or the AI call fails)
// ---------------------------------------------------------------------------

function fallbackDirectionQuestions() {
  return [
    {
      id: "dir_q1",
      text: "Which kind of problem would you happily spend a whole day on?",
      options: [
        { value: "opt_1", label: "Building or fixing a system until it works", directionId: "tech" },
        { value: "opt_2", label: "Helping one person through a difficult situation", directionId: "healthcare" },
        { value: "opt_3", label: "Shaping how something looks, feels, and reads", directionId: "design" },
        { value: "opt_4", label: "Closing a deal or growing a number that matters", directionId: "business" },
      ],
    },
    {
      id: "dir_q2",
      text: "Which work setting drains you the least?",
      options: [
        { value: "opt_1", label: "Quiet focus with numbers, models, and precision", directionId: "finance" },
        { value: "opt_2", label: "A workshop or site, building with my hands", directionId: "trades" },
        { value: "opt_3", label: "A room where I explain things and people learn", directionId: "education" },
        { value: "opt_4", label: "A fast feed of content, campaigns, and reactions", directionId: "media" },
      ],
    },
    {
      id: "dir_q3",
      text: "Which result would make you proudest at the end of a year?",
      options: [
        { value: "opt_1", label: "Something beautiful I designed is out in the world", directionId: "design" },
        { value: "opt_2", label: "A tangible thing I built that people rely on", directionId: "trades" },
        { value: "opt_3", label: "Clear, measurable growth I personally drove", directionId: "business" },
        { value: "opt_4", label: "Someone's health or life is concretely better", directionId: "healthcare" },
      ],
    },
  ];
}

function fallbackNarrowingQuestions() {
  return [
    {
      id: "nar_q1",
      text: "Day to day, which working mode fits you best?",
      options: [
        { value: "opt_1", label: "Deep solo focus with few interruptions" },
        { value: "opt_2", label: "Constant collaboration inside a team" },
        { value: "opt_3", label: "A mix of craft work and client contact" },
        { value: "opt_4", label: "Coordinating people and decisions" },
      ],
    },
    {
      id: "nar_q2",
      text: "What pace of environment do you want?",
      options: [
        { value: "opt_1", label: "Calm and structured, few surprises" },
        { value: "opt_2", label: "Fast and changing, new problems weekly" },
        { value: "opt_3", label: "Project-based bursts with recovery time" },
        { value: "opt_4", label: "Steady rhythm with clear routines" },
      ],
    },
  ];
}

function fallbackProfessions(direction) {
  const catalogDirection = getDirection(direction?.id) || DIRECTIONS[0];

  return catalogDirection.professionSeeds.map((seed, index) => ({
    id: `prof_${index + 1}`,
    title: seed.title,
    summary: seed.summary,
    whyFit: `Fits your confirmed ${catalogDirection.label} direction and the preferences you expressed in your answers.`,
    dayToDay: `A typical day centers on the core work of a ${seed.title.toLowerCase()}, at a pace matching your stated preferences.`,
  }));
}

function fallbackRoadmap(profession) {
  const title = profession.title;

  const stages = [
    {
      title: "Foundations",
      description: `Learn the core skills every ${title} uses daily. Pick one reputable beginner course and finish it end to end.`,
      timeframe: "2-3 months",
      milestone: "Core concepts applied in small exercises without help.",
    },
    {
      title: "First real projects",
      description: "Build 2-3 small but complete projects that mirror real work, and document them publicly as a portfolio.",
      timeframe: "2-3 months",
      milestone: "A portfolio you can walk a stranger through in 10 minutes.",
    },
    {
      title: "Entry-level readiness",
      description: "Translate the portfolio into a focused CV, practice common interview formats, and apply consistently every week.",
      timeframe: "1-2 months",
      milestone: "First interviews scheduled.",
    },
    {
      title: "First role",
      description: `Land an entry-level or junior ${title} position — prioritize learning environment over salary at this stage.`,
      timeframe: "0-3 months of searching",
      milestone: "Signed offer and first 90 days completed.",
    },
    {
      title: "Credibility milestone",
      description: "Earn the one certification or visible achievement most recognized in this field, chosen with input from seniors around you.",
      timeframe: "3-6 months",
      milestone: "Credential earned and added to your profile.",
    },
    {
      title: `Established ${title}`,
      description: "Deepen a specialization, take ownership of larger pieces of work, and build the track record that defines the target role.",
      timeframe: "12-24 months",
      milestone: "Operating independently at the level you set out to reach.",
    },
  ];

  return {
    professionId: profession.id,
    stages: stages.map((stage, index) => ({ id: `stage_${index + 1}`, ...stage })),
  };
}

// ---------------------------------------------------------------------------
// Normalizers — throw on structurally invalid AI payloads so the caller
// falls back deterministically.
// ---------------------------------------------------------------------------

function normalizeQuestionOption(option, index, { requireDirectionId }) {
  const normalized = {
    value: cleanText(option?.value, `opt_${index + 1}`)
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_"),
    label: cleanText(option?.label),
  };

  if (!normalized.label) {
    throw new Error("Question option missing label.");
  }

  if (requireDirectionId) {
    if (!DIRECTION_IDS.includes(option?.directionId)) {
      throw new Error(`Invalid directionId: ${option?.directionId}`);
    }
    normalized.directionId = option.directionId;
  }

  return normalized;
}

function normalizeQuestionsPayload(payload, { count, idPrefix, requireDirectionId }) {
  const questions = Array.isArray(payload?.questions) ? payload.questions : [];

  if (questions.length !== count) {
    throw new Error(`Expected ${count} questions, got ${questions.length}.`);
  }

  return questions.map((question, index) => {
    const text = cleanText(question?.text);
    if (!text) {
      throw new Error("Question missing text.");
    }
    const rawOptions = Array.isArray(question?.options) ? question.options : [];
    if (rawOptions.length !== 4) {
      throw new Error(`Question needs exactly 4 options, got ${rawOptions.length}.`);
    }
    return {
      id: `${idPrefix}${index + 1}`,
      text,
      options: rawOptions.map((option, optionIndex) =>
        normalizeQuestionOption(option, optionIndex, { requireDirectionId })
      ),
    };
  });
}

function normalizeProfessionsPayload(payload) {
  const professions = Array.isArray(payload?.professions) ? payload.professions : [];

  if (professions.length !== 3) {
    throw new Error(`Expected exactly 3 professions, got ${professions.length}.`);
  }

  return professions.map((profession, index) => {
    const title = cleanText(profession?.title);
    if (!title) {
      throw new Error("Profession missing title.");
    }
    return {
      id: `prof_${index + 1}`,
      title,
      summary: cleanText(profession?.summary, "A realistic role within your confirmed direction."),
      whyFit: cleanText(profession?.whyFit, "Aligned with your profile and answers."),
      dayToDay: cleanText(profession?.dayToDay, "Day-to-day work typical for this role."),
    };
  });
}

function normalizeRoadmapPayload(payload, profession) {
  let stages = Array.isArray(payload?.stages) ? payload.stages : [];

  if (stages.length > 8) {
    stages = stages.slice(0, 8);
  }
  if (stages.length < 4) {
    throw new Error(`Expected at least 4 roadmap stages, got ${stages.length}.`);
  }

  return {
    professionId: profession.id,
    stages: stages.map((stage, index) => {
      const title = cleanText(stage?.title);
      const description = cleanText(stage?.description);
      if (!title || !description) {
        throw new Error("Roadmap stage missing title or description.");
      }
      return {
        id: `stage_${index + 1}`,
        title,
        description,
        timeframe: cleanText(stage?.timeframe, ""),
        milestone: cleanText(stage?.milestone, ""),
      };
    }),
  };
}

async function runJsonCompletion(client, { model, system, user, temperature = 0.7 }) {
  const completion = await client.chat.completions.create({
    model,
    temperature,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const content = completion?.choices?.[0]?.message?.content;
  return parseJsonObject(content);
}

function createAiEngine({ apiKey, model }) {
  const client = apiKey ? new OpenAI({ apiKey }) : null;

  async function generateDirectionQuestions({ session }) {
    if (!client) {
      return fallbackDirectionQuestions();
    }

    try {
      const prompts = buildDirectionQuestionsPrompt({
        profileDigest: buildSessionDigest(session),
      });
      const parsed = await runJsonCompletion(client, {
        model,
        system: prompts.system,
        user: prompts.user,
        temperature: 0.8,
      });
      return normalizeQuestionsPayload(parsed, {
        count: 3,
        idPrefix: "dir_q",
        requireDirectionId: true,
      });
    } catch (error) {
      console.error("[AI direction questions fallback]", error.message);
      return fallbackDirectionQuestions();
    }
  }

  async function generateNarrowingQuestions({ session }) {
    if (!client) {
      return fallbackNarrowingQuestions();
    }

    try {
      const prompts = buildNarrowingQuestionsPrompt({
        profileDigest: buildSessionDigest(session),
        direction: session.direction,
      });
      const parsed = await runJsonCompletion(client, {
        model,
        system: prompts.system,
        user: prompts.user,
        temperature: 0.8,
      });
      return normalizeQuestionsPayload(parsed, {
        count: 2,
        idPrefix: "nar_q",
        requireDirectionId: false,
      });
    } catch (error) {
      console.error("[AI narrowing questions fallback]", error.message);
      return fallbackNarrowingQuestions();
    }
  }

  async function generateProfessions({ session }) {
    if (!client) {
      return fallbackProfessions(session.direction);
    }

    try {
      const prompts = buildProfessionsPrompt({
        profileDigest: buildSessionDigest(session),
        direction: session.direction,
        directionDigest: buildAnswersDigest(session.directionQuestions, session.directionAnswers),
        narrowingDigest: buildAnswersDigest(session.narrowingQuestions, session.narrowingAnswers),
      });
      const parsed = await runJsonCompletion(client, {
        model,
        system: prompts.system,
        user: prompts.user,
        temperature: 0.8,
      });
      return normalizeProfessionsPayload(parsed);
    } catch (error) {
      console.error("[AI professions fallback]", error.message);
      return fallbackProfessions(session.direction);
    }
  }

  async function generateRoadmap({ session }) {
    const profession = session.selectedProfession;

    if (!client) {
      return fallbackRoadmap(profession);
    }

    try {
      const prompts = buildRoadmapPrompt({
        profileDigest: buildSessionDigest(session),
        direction: session.direction,
        profession,
        narrowingDigest: buildAnswersDigest(session.narrowingQuestions, session.narrowingAnswers),
      });
      const parsed = await runJsonCompletion(client, {
        model,
        system: prompts.system,
        user: prompts.user,
        temperature: 0.7,
      });
      return normalizeRoadmapPayload(parsed, profession);
    } catch (error) {
      console.error("[AI roadmap fallback]", error.message);
      return fallbackRoadmap(profession);
    }
  }

  async function generateBigFiveItems({ depth }) {
    if (!client) {
      return getFallbackItems(depth);
    }
    try {
      const { system, user } = buildBigFiveItemsPrompt(depth);
      const parsed = await runJsonCompletion(client, {
        model,
        system,
        user,
        temperature: 0.85,
      });
      const items = Array.isArray(parsed?.items) ? parsed.items : [];
      const expected = depth === "deep" ? 50 : 20;
      const normalized = items
        .filter(
          (i) =>
            i && typeof i.text === "string" && ["O", "C", "E", "A", "N"].includes(i.trait)
        )
        .map((i, idx) => ({
          id: typeof i.id === "string" && i.id ? i.id : `ai_${idx + 1}`,
          trait: i.trait,
          reverse: Boolean(i.reverse),
          text: i.text.trim().slice(0, 200),
        }));
      if (normalized.length !== expected) {
        console.warn("[AI Big Five items] count mismatch, using fallback");
        return getFallbackItems(depth);
      }
      return normalized;
    } catch (error) {
      console.error("[AI Big Five items fallback]", error.message);
      return getFallbackItems(depth);
    }
  }

  return {
    generateDirectionQuestions,
    generateNarrowingQuestions,
    generateProfessions,
    generateRoadmap,
    generateBigFiveItems,
  };
}

module.exports = {
  createAiEngine,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && node --test tests/aiEngine.test.js`
Expected: PASS — 7 tests

- [ ] **Step 5: Commit**

```bash
git add backend/aiEngine.js backend/tests/aiEngine.test.js
git commit -m "feat(backend): direction/narrowing/professions/roadmap AI engine with deterministic fallbacks"
```

---

### Task 5: `server.js` — new Page 3 routes + app export

**Files:**
- Modify: `backend/server.js`
- Create: `backend/tests/server.test.js`

**Interfaces:**
- Consumes: Tasks 1–4 (`computeDirection`, store setters, engine methods).
- Produces HTTP API (all bodies JSON; every success response is a full session snapshot via `sendSessionSnapshot`):
  - `POST /api/direction/question` `{sessionId}` → generates direction questions if absent (idempotent), 400 if `step !== "complete"`
  - `POST /api/direction/answer` `{sessionId, questionId, value}` → records; when all 3 answered sets `proposedDirection`
  - `POST /api/direction/confirm` `{sessionId}` → 400 without `proposedDirection`; sets `direction`, generates narrowing questions (idempotent if already confirmed)
  - `POST /api/professions/narrow` `{sessionId, questionId, value}` → records; when all answered generates exactly 3 `professionOptions`
  - `POST /api/professions/select` `{sessionId, professionId}` → 400 if not in `professionOptions`; sets `selectedProfession`
  - `POST /api/roadmap/generate` `{sessionId}` → 400 without `selectedProfession`; returns cached roadmap if `roadmap.professionId === selectedProfession.id`, else generates
  - `module.exports = { app }`; `app.listen` only when `require.main === module`
- Removed routes (must 404): `/api/branches/initial`, `/api/branches/create`, `/api/branches/evolve`, `/api/payment/unlock-theme`.
- Page 1/2 routes: byte-identical.

- [ ] **Step 1: Write the failing integration test**

Create `backend/tests/server.test.js`:

```js
// Force fallback mode BEFORE requiring server: dotenv.config() never
// overrides an env var that is already set, so this blanks any real key.
process.env.OPENAI_API_KEY = "";

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

async function post(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// Fast-forwards Page 1 + Page 2 (fallback Big Five items are deterministic).
async function completeAssessment() {
  let { data } = await post("/api/session/start", { entryChoice: "find", dreamAnswer: "build useful things" });
  const sessionId = data.sessionId;

  const demoValues = { sex: "female", age: 30, country: "Testland" };
  while (data.step === "demographics") {
    const q = data.nextQuestion.question;
    ({ data } = await post("/api/session/demographics", { sessionId, questionId: q.id, value: demoValues[q.id] }));
  }

  ({ data } = await post("/api/session/big-five-depth", { sessionId, depth: "short" }));

  while (data.step === "big_five") {
    const q = data.nextQuestion.question;
    ({ data } = await post("/api/big-five/answer", { sessionId, itemId: q.id, value: 3 }));
  }

  while (data.step === "values") {
    const q = data.nextQuestion.question;
    ({ data } = await post("/api/values/answer", { sessionId, questionId: q.id, choice: "A" }));
  }

  assert.equal(data.step, "complete");
  return { sessionId, data };
}

test("full Page 3 flow: direction -> narrowing -> professions -> select -> roadmap", async () => {
  const { sessionId } = await completeAssessment();

  // Stage A: direction questions (fallback: deterministic 3)
  let { status, data } = await post("/api/direction/question", { sessionId });
  assert.equal(status, 200);
  assert.equal(data.directionQuestions.length, 3);
  assert.equal(data.pathStage, "direction");

  // idempotent: second call does not regenerate/reset
  ({ data } = await post("/api/direction/question", { sessionId }));
  assert.equal(data.directionQuestions.length, 3);

  // answer all 3 with the first option
  for (const q of data.directionQuestions) {
    ({ status, data } = await post("/api/direction/answer", { sessionId, questionId: q.id, value: q.options[0].value }));
    assert.equal(status, 200);
  }
  assert.ok(data.proposedDirection, "proposedDirection set after final answer");
  // fallback q1/q2/q3 first options vote tech/finance/design -> tie broken by catalog order = tech
  assert.equal(data.proposedDirection.id, "tech");

  // Stage A confirm -> narrowing questions generated
  ({ status, data } = await post("/api/direction/confirm", { sessionId }));
  assert.equal(status, 200);
  assert.equal(data.direction.id, "tech");
  assert.equal(data.pathStage, "narrowing");
  assert.equal(data.narrowingQuestions.length, 2);

  // Stage B: answer narrowing questions -> exactly 3 professions
  for (const q of data.narrowingQuestions) {
    ({ status, data } = await post("/api/professions/narrow", { sessionId, questionId: q.id, value: q.options[0].value }));
    assert.equal(status, 200);
  }
  assert.equal(data.pathStage, "professions");
  assert.equal(data.professionOptions.length, 3);

  // Stage C: select a profession
  const chosen = data.professionOptions[1];
  ({ status, data } = await post("/api/professions/select", { sessionId, professionId: chosen.id }));
  assert.equal(status, 200);
  assert.equal(data.selectedProfession.id, chosen.id);

  // Stage D: roadmap
  ({ status, data } = await post("/api/roadmap/generate", { sessionId }));
  assert.equal(status, 200);
  assert.equal(data.pathStage, "roadmap");
  assert.equal(data.roadmap.professionId, chosen.id);
  assert.ok(data.roadmap.stages.length >= 4);

  // cached: same roadmap object on repeat call
  const firstStageTitle = data.roadmap.stages[0].title;
  ({ data } = await post("/api/roadmap/generate", { sessionId }));
  assert.equal(data.roadmap.stages[0].title, firstStageTitle);
});

test("guards: ordering and validation", async () => {
  const { data: start } = await post("/api/session/start", { entryChoice: "find", dreamAnswer: "x" });
  const sessionId = start.sessionId;

  // direction endpoints require completed assessment
  let res = await post("/api/direction/question", { sessionId });
  assert.equal(res.status, 400);

  // confirm without proposal
  const done = await completeAssessment();
  res = await post("/api/direction/confirm", { sessionId: done.sessionId });
  assert.equal(res.status, 400);

  // roadmap without selection
  res = await post("/api/roadmap/generate", { sessionId: done.sessionId });
  assert.equal(res.status, 400);

  // unknown session
  res = await post("/api/direction/question", { sessionId: "nope" });
  assert.equal(res.status, 404);
});

test("select rejects a professionId that is not one of the options", async () => {
  const { sessionId } = await completeAssessment();
  await post("/api/direction/question", { sessionId });
  let { data } = await post("/api/direction/question", { sessionId });
  for (const q of data.directionQuestions) {
    ({ data } = await post("/api/direction/answer", { sessionId, questionId: q.id, value: q.options[0].value }));
  }
  ({ data } = await post("/api/direction/confirm", { sessionId }));
  for (const q of data.narrowingQuestions) {
    ({ data } = await post("/api/professions/narrow", { sessionId, questionId: q.id, value: q.options[0].value }));
  }
  const res = await post("/api/professions/select", { sessionId, professionId: "prof_99" });
  assert.equal(res.status, 400);
});

test("monetization and branch routes are gone", async () => {
  for (const path of ["/api/payment/unlock-theme", "/api/branches/initial", "/api/branches/create", "/api/branches/evolve"]) {
    const res = await post(path, {});
    assert.equal(res.status, 404, `${path} should be removed`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test tests/server.test.js`
Expected: FAIL — `app` is undefined (server.js does not export it yet) or crash on removed store methods.

- [ ] **Step 3: Edit `backend/server.js`**

Three edits. **Everything between `app.use(express.json(...))` and the end of the `/api/values/answer` route stays byte-identical** (Page 1/2 routes).

**(3a)** Replace the import block at the top (current lines 4–21) with:

```js
const { createAiEngine } = require("./aiEngine");
const {
  VALUES_DIMENSIONS,
  DEMOGRAPHIC_QUESTIONS,
} = require("./questionPool");
const {
  pickNextQuestion,
  validateDemographicAnswer,
  validateBigFiveAnswer,
  validateValuesAnswer,
  computeBigFiveScores,
  deriveBigFiveTraits,
  computeValuesScores,
  buildProgress,
  summarizeAnswersForClient,
} = require("./questionEngine");
const { computeDirection } = require("./directions");
const { SessionStore } = require("./sessionStore");
```

(Only changes: drop `BRANCH_THEMES` from the questionPool import; add the `directions` require. `cors`/`dotenv`/`express` requires above stay.)

**(3b)** Delete these four routes entirely: `POST /api/branches/initial` (current lines 210–248), `POST /api/payment/unlock-theme` (250–278), `POST /api/branches/create` (280–320), `POST /api/branches/evolve` (322–381). In their place insert:

```js
function requireCompletedAssessment(session) {
  if (session.step !== "complete") {
    const error = new Error("Complete the assessment before this step.");
    error.statusCode = 400;
    throw error;
  }
}

app.post("/api/direction/question", async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const session = store.require(sessionId);
    requireCompletedAssessment(session);

    if (!session.directionQuestions.length) {
      const questions = await aiEngine.generateDirectionQuestions({ session });
      store.setDirectionQuestions(session, questions);
    }

    return sendSessionSnapshot(res, session);
  } catch (error) {
    console.error("[direction/question]", error);
    return res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Failed to load direction questions." });
  }
});

app.post("/api/direction/answer", (req, res) => {
  try {
    const { sessionId, questionId, value } = req.body || {};
    const session = store.require(sessionId);
    requireCompletedAssessment(session);

    const question = session.directionQuestions.find((q) => q.id === questionId);
    if (!question) {
      return res.status(400).json({ error: "Unknown direction question." });
    }
    if (!question.options.some((o) => o.value === value)) {
      return res.status(400).json({ error: "Invalid answer option." });
    }

    store.recordDirectionAnswer(session, questionId, value);

    const allAnswered = session.directionQuestions.every(
      (q) => session.directionAnswers[q.id] !== undefined
    );
    if (allAnswered) {
      store.setProposedDirection(
        session,
        computeDirection(session.directionQuestions, session.directionAnswers)
      );
    }

    return sendSessionSnapshot(res, session);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post("/api/direction/confirm", async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const session = store.require(sessionId);
    requireCompletedAssessment(session);

    if (!session.direction) {
      if (!session.proposedDirection) {
        return res.status(400).json({ error: "Answer the direction questions first." });
      }
      store.confirmDirection(session, session.proposedDirection);
    }

    if (!session.narrowingQuestions.length) {
      const questions = await aiEngine.generateNarrowingQuestions({ session });
      store.setNarrowingQuestions(session, questions);
    }

    return sendSessionSnapshot(res, session);
  } catch (error) {
    console.error("[direction/confirm]", error);
    return res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Failed to confirm direction." });
  }
});

app.post("/api/professions/narrow", async (req, res) => {
  try {
    const { sessionId, questionId, value } = req.body || {};
    const session = store.require(sessionId);

    if (!session.direction) {
      return res.status(400).json({ error: "Confirm a direction first." });
    }

    const question = session.narrowingQuestions.find((q) => q.id === questionId);
    if (!question) {
      return res.status(400).json({ error: "Unknown narrowing question." });
    }
    if (!question.options.some((o) => o.value === value)) {
      return res.status(400).json({ error: "Invalid answer option." });
    }

    store.recordNarrowingAnswer(session, questionId, value);

    const allAnswered = session.narrowingQuestions.every(
      (q) => session.narrowingAnswers[q.id] !== undefined
    );
    if (allAnswered && !session.professionOptions.length) {
      const professions = await aiEngine.generateProfessions({ session });
      store.setProfessionOptions(session, professions);
    }

    return sendSessionSnapshot(res, session);
  } catch (error) {
    console.error("[professions/narrow]", error);
    return res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Failed to narrow professions." });
  }
});

app.post("/api/professions/select", (req, res) => {
  try {
    const { sessionId, professionId } = req.body || {};
    const session = store.require(sessionId);

    const profession = session.professionOptions.find((p) => p.id === professionId);
    if (!profession) {
      return res.status(400).json({ error: "Unknown profession." });
    }

    store.selectProfession(session, profession);

    return sendSessionSnapshot(res, session);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post("/api/roadmap/generate", async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const session = store.require(sessionId);

    if (!session.selectedProfession) {
      return res.status(400).json({ error: "Select a profession first." });
    }

    if (!session.roadmap || session.roadmap.professionId !== session.selectedProfession.id) {
      const roadmap = await aiEngine.generateRoadmap({ session });
      store.setRoadmap(session, roadmap);
    }

    return sendSessionSnapshot(res, session);
  } catch (error) {
    console.error("[roadmap/generate]", error);
    return res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Failed to generate roadmap." });
  }
});
```

**(3c)** Replace the final `app.listen(...)` block with:

```js
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Working Name API listening on http://localhost:${PORT}`);
  });
}

module.exports = { app };
```

Note: the Page 2 route `POST /api/session/start` uses `sendSessionSnapshot(res, session, { nextQuestion: ..., valuesDimensions: ... })` — the `extras` mechanism is unchanged; the new routes simply pass no extras (clients derive the current question from `directionQuestions` + `directionAnswers`).

- [ ] **Step 4: Run the full backend suite**

Run: `cd backend && npm test`
Expected: PASS — all files (directions, sessionStore, prompts, aiEngine, server), 0 failures. This is also the moment the Task 2 note resolves: `npm test` must be fully green from here on.

- [ ] **Step 5: Manually verify Page 2 routes still respond** (untouched-boundary check)

Run: `cd backend && node -e "
process.env.OPENAI_API_KEY = '';
const { app } = require('./server');
const s = app.listen(0);
fetch('http://127.0.0.1:' + s.address().port + '/api/health')
  .then(r => r.json())
  .then(d => { console.log(d); s.close(); });
"`
Expected: `{ ok: true, model: 'gpt-4.1-mini', hasOpenAIKey: false }`

- [ ] **Step 6: Commit**

```bash
git add backend/server.js backend/tests/server.test.js
git commit -m "feat(backend): free direction->roadmap API replaces branch+payment routes"
```

---

### Task 6: `frontend/src/api.js` — new client functions

**Files:**
- Modify: `frontend/src/api.js`

**Interfaces:**
- Consumes: Task 5 endpoints.
- Produces (all return the parsed snapshot; `request` helper unchanged): `fetchDirectionQuestions({sessionId})`, `answerDirectionQuestion({sessionId, questionId, value})`, `confirmDirection({sessionId})`, `answerNarrowingQuestion({sessionId, questionId, value})`, `selectProfession({sessionId, professionId})`, `generateRoadmap({sessionId})`.
- **Add-only in this task.** The four legacy functions (`generateInitialBranch`, `unlockTheme`, `createThematicBranch`, `evolveBranch`) are still imported by the not-yet-rewritten `App.jsx`; they get deleted in Task 9 together with their last callers so every commit keeps `vite build` green.
- Kept untouched: `request`, `startSession`, `submitDemographics`, `chooseBigFiveDepth`, `submitBigFiveAnswer`, `submitValuesAnswer`.

- [ ] **Step 1: Apply the edit**

Append to the end of `frontend/src/api.js`:

```js
export function fetchDirectionQuestions(payload) {
  return request("/api/direction/question", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function answerDirectionQuestion(payload) {
  return request("/api/direction/answer", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function confirmDirection(payload) {
  return request("/api/direction/confirm", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function answerNarrowingQuestion(payload) {
  return request("/api/professions/narrow", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function selectProfession(payload) {
  return request("/api/professions/select", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function generateRoadmap(payload) {
  return request("/api/roadmap/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
```

- [ ] **Step 2: Verify the frontend still builds**

Run: `cd frontend && npx vite build 2>&1 | tail -5`
Expected: build succeeds (old functions still present for App.jsx; new ones added).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat(frontend): api client for direction/professions/roadmap endpoints"
```

---

### Task 7: Graph node components for the new flow

**Files:**
- Modify: `frontend/src/components/GraphView/NodeComponent.jsx`
- Modify: `frontend/src/components/GraphView/NodeComponent.css`
- Modify: `frontend/src/components/GraphView/index.jsx`

**Interfaces:**
- Consumes: nothing new (pure presentation).
- Produces node types registered in GraphView: `me` (unchanged), `direction` (`data: {label}`), `profession` (`data: {title, summary, selected, onOpen}`), `roadmap` (`data: {index, title, timeframe, last, onOpen}`), `loading` (unchanged). Exports kept: `MeNode`, `LoadingNode`, `DetailPanel` (unchanged bodies), new `DirectionNode`, `ProfessionNode`, `RoadmapNode`. Removed: `PathNode`, `VariationNode`.
- `App.jsx` (Task 9) will reference these only via node `type` strings and `DetailPanel` — removing `PathNode`/`VariationNode` keeps the build green because only `index.jsx` imports them, and it is updated here.

- [ ] **Step 1: Edit `NodeComponent.jsx`**

Delete the `PathNode` and `VariationNode` functions (current lines 18–72). Keep `MeNode`, `LoadingNode`, `DetailPanel` byte-identical. Insert in place of the deleted functions:

```jsx
export function DirectionNode({ data }) {
  const { label } = data;

  return (
    <div className="node node--direction">
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <p className="node-archetype">Your direction</p>
      <h3 className="node-title">{label}</h3>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

export function ProfessionNode({ data }) {
  const { title, summary, selected, onOpen } = data;

  return (
    <button
      type="button"
      className={`node node--profession ${selected ? 'node--profession-selected' : ''}`}
      onClick={onOpen}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <p className="node-archetype">Profession</p>
      <h3 className="node-title">{title}</h3>
      <p className="node-profession-summary">{summary}</p>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </button>
  );
}

export function RoadmapNode({ data }) {
  const { index, title, timeframe, last, onOpen } = data;

  return (
    <button
      type="button"
      className={`node node--roadmap ${last ? 'node--roadmap-last' : ''}`}
      onClick={onOpen}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <span className="node-roadmap-index">{index}</span>
      <span className="node-roadmap-body">
        <span className="node-roadmap-title">{title}</span>
        {timeframe && <span className="node-roadmap-timeframe">{timeframe}</span>}
      </span>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </button>
  );
}
```

- [ ] **Step 2: Edit `NodeComponent.css`**

Delete these rules (dead styles): `.node--path`, `.node--locked`, `.node--expanding`, `.node-locked-content`, `.node-lock`, `.node-locked-label`, `.node-expand-btn`, `.node-expand-btn:hover`, `.node-expand-btn--sm`, `.node-expanding-label`, both `.node--variation` blocks, `.node-var-title`, `.node-var-diff`. Keep `.node`, `.node--me`/ring/label rules, `node-appear` keyframes, `.node-archetype`, `.node-title`, `.node--loading` + dots, and every `.detail-*` rule. Add:

```css
.node--direction {
  min-width: 220px;
  max-width: 250px;
  border-color: var(--color-border-strong);
  animation: node-appear 450ms cubic-bezier(0.22, 1, 0.36, 1) 200ms both;
}

.node--profession {
  min-width: 210px;
  max-width: 240px;
  text-align: left;
  cursor: pointer;
  animation: node-appear 450ms cubic-bezier(0.22, 1, 0.36, 1) 200ms both;
}

.node--profession:hover {
  border-color: var(--color-border-strong);
  box-shadow: 0 2px 16px rgba(0,0,0,0.06);
}

.node--profession-selected {
  border-color: var(--color-text);
}

.node-profession-summary {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.45;
}

.node--roadmap {
  min-width: 230px;
  max-width: 260px;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  text-align: left;
  cursor: pointer;
  padding: 16px 20px;
  animation: node-appear 450ms cubic-bezier(0.22, 1, 0.36, 1) 200ms both;
}

.node--roadmap:hover {
  border-color: var(--color-border-strong);
  box-shadow: 0 2px 16px rgba(0,0,0,0.06);
}

.node--roadmap-last {
  border-color: var(--color-text);
}

.node-roadmap-index {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-faint);
  border: 1px solid var(--color-border);
  border-radius: 50%;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
}

.node-roadmap-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.node-roadmap-title {
  font-size: 13px;
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1.3;
  color: var(--color-text);
}

.node-roadmap-timeframe {
  font-size: 11px;
  color: var(--color-text-faint);
}
```

- [ ] **Step 3: Edit `GraphView/index.jsx`**

Replace the import and `nodeTypes` (current lines 10 and 14–19) with:

```jsx
import { MeNode, DirectionNode, ProfessionNode, RoadmapNode, LoadingNode } from './NodeComponent';
```

```jsx
const nodeTypes = {
  me: MeNode,
  direction: DirectionNode,
  profession: ProfessionNode,
  roadmap: RoadmapNode,
  loading: LoadingNode,
};
```

Everything else in the file stays.

- [ ] **Step 4: Verify build stays green**

Run: `cd frontend && npx vite build 2>&1 | tail -5`
Expected: build succeeds (App.jsx never imported PathNode/VariationNode directly).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/GraphView/NodeComponent.jsx frontend/src/components/GraphView/NodeComponent.css frontend/src/components/GraphView/index.jsx
git commit -m "feat(frontend): direction/profession/roadmap graph nodes replace path/variation/locked nodes"
```

---

### Task 8: `ConfirmModal` component

**Files:**
- Create: `frontend/src/components/GraphView/ConfirmModal.jsx`
- Create: `frontend/src/components/GraphView/ConfirmModal.css`

**Interfaces:**
- Consumes: framer-motion (already a dependency).
- Produces: `default ConfirmModal({ professionTitle, busy, onConfirm, onDismiss })` — Stage C popover. `onConfirm` = "Yes, show me the way" (generates roadmap); `onDismiss` = "Not now" and backdrop/× close.
- `TradeoffModal.jsx`/`.css` are deleted in Task 9 (they still have an import in App.jsx until then).

- [ ] **Step 1: Create `ConfirmModal.jsx`**

```jsx
import { motion as Motion } from 'framer-motion';
import './ConfirmModal.css';

export default function ConfirmModal({ professionTitle, busy, onConfirm, onDismiss }) {
  return (
    <Motion.div
      className="confirm-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => e.target === e.currentTarget && !busy && onDismiss()}
    >
      <Motion.div
        className="confirm-modal"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <button className="confirm-close" onClick={onDismiss} disabled={busy}>×</button>
        <p className="confirm-label">Chosen profession</p>
        <h2 className="confirm-title">{professionTitle}</h2>
        <p className="confirm-question">Would you like to see how to reach this profession?</p>
        <div className="confirm-actions">
          <button className="confirm-yes" onClick={onConfirm} disabled={busy}>
            {busy ? 'Building your roadmap…' : 'Yes, show me the way'}
          </button>
          <button className="confirm-later" onClick={onDismiss} disabled={busy}>
            Not now
          </button>
        </div>
      </Motion.div>
    </Motion.div>
  );
}
```

- [ ] **Step 2: Create `ConfirmModal.css`**

```css
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(255,255,255,0.9);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 24px;
}

.confirm-modal {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 2px;
  padding: 40px;
  max-width: 420px;
  width: 100%;
  position: relative;
  text-align: left;
}

.confirm-close {
  position: absolute;
  top: 20px;
  right: 20px;
  font-size: 20px;
  color: var(--color-text-muted);
  transition: color var(--transition);
}

.confirm-close:hover { color: var(--color-text); }

.confirm-label {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-text-faint);
  margin-bottom: 8px;
}

.confirm-title {
  font-size: 22px;
  font-weight: 400;
  letter-spacing: -0.02em;
  margin-bottom: 12px;
}

.confirm-question {
  font-size: 14px;
  color: var(--color-text-muted);
  line-height: 1.5;
  margin-bottom: 32px;
}

.confirm-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.confirm-yes {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-bg);
  background: var(--color-text);
  padding: 12px 20px;
  border-radius: 2px;
  transition: opacity var(--transition);
}

.confirm-yes:hover:not(:disabled) { opacity: 0.85; }
.confirm-yes:disabled { opacity: 0.5; cursor: default; }

.confirm-later {
  font-size: 13px;
  color: var(--color-text-muted);
  border-bottom: 1px solid var(--color-border);
  transition: all 0.15s ease;
}

.confirm-later:hover:not(:disabled) {
  color: var(--color-text);
  border-color: var(--color-text);
}
```

- [ ] **Step 3: Verify build stays green**

Run: `cd frontend && npx vite build 2>&1 | tail -5`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/GraphView/ConfirmModal.jsx frontend/src/components/GraphView/ConfirmModal.css
git commit -m "feat(frontend): minimal roadmap confirmation modal"
```

---

### Task 9: `App.jsx` — 4-stage tree flow + question dock

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/api.js` (delete the 4 legacy functions)
- Modify: `frontend/src/components/GraphView/GraphPage.css` (dock styles)
- Delete: `frontend/src/components/GraphView/TradeoffModal.jsx`, `frontend/src/components/GraphView/TradeoffModal.css`

**Interfaces:**
- Consumes: Task 6 api functions, Task 7 node types (`direction`/`profession`/`roadmap`/`loading` type strings + `DetailPanel`), Task 8 `ConfirmModal`.
- Produces: the working Page 3 UX. Entry + survey JSX sections stay byte-identical except the `"complete"` card's button handler.

**UX contract (drives the dock precedence below):** Stage A questions appear one at a time in a floating dock over the graph (Me node alone) → direction proposal card → confirmed Direction node animates in → "narrow it down?" prompt → narrowing questions (same dock) → 3 profession nodes fork from Direction → clicking a profession selects it server-side and opens ConfirmModal → Yes generates + renders the vertical roadmap chain under that profession; Not now leaves it highlighted → roadmap node click opens DetailPanel with description/milestone.

- [ ] **Step 1: Delete the tradeoff modal and legacy api functions**

```bash
git rm frontend/src/components/GraphView/TradeoffModal.jsx frontend/src/components/GraphView/TradeoffModal.css
```

In `frontend/src/api.js`, delete the four legacy functions `generateInitialBranch`, `unlockTheme`, `createThematicBranch`, `evolveBranch` (their callers disappear in this same task).

- [ ] **Step 2: Rewrite the App.jsx header (imports)**

Replace current lines 1–18 with:

```jsx
import { useState } from "react";
import { AnimatePresence, motion as Motion } from "framer-motion";
import GraphView from "./components/GraphView";
import ConfirmModal from "./components/GraphView/ConfirmModal";
import { DetailPanel } from "./components/GraphView/NodeComponent";
import {
  answerDirectionQuestion,
  answerNarrowingQuestion,
  chooseBigFiveDepth,
  confirmDirection,
  fetchDirectionQuestions,
  generateRoadmap,
  selectProfession,
  startSession,
  submitBigFiveAnswer,
  submitDemographics,
  submitValuesAnswer,
} from "./api";
import "./App.css";
import "./components/GraphView/GraphPage.css";
```

`ENTRY_OPTIONS`, `LIKERT`, `stepHeading`, `stepProgressText`, `DemographicQuestionCard`, `DepthChoiceCard`, `BigFiveQuestionCard`, `ValuesQuestionCard` (current lines 20–205): **unchanged**.

- [ ] **Step 3: Replace the graph builder (current lines 207–369)**

Delete `ME_NODE`, the old layout constants, `branchColumnX`, and `buildGraphFromState`. Insert:

```jsx
const ME_NODE = { id: "me", type: "me", position: { x: 0, y: 0 }, data: {} };

// Vertical story: Me -> Direction -> 3 professions -> roadmap chain.
const DIRECTION_Y = 240;
const PROFESSION_Y = 500;
const PROFESSION_GAP = 340;
const ROADMAP_START_Y = 760;
const ROADMAP_GAP = 200;

function professionX(index, count) {
  return (index - (count - 1) / 2) * PROFESSION_GAP;
}

function buildLifePathGraph({
  direction,
  professionOptions,
  selectedProfessionId,
  roadmap,
  roadmapPending,
  onProfessionOpen,
  onStageOpen,
}) {
  const nodes = [ME_NODE];
  const edges = [];

  if (!direction) {
    return { nodes, edges };
  }

  nodes.push({
    id: "direction",
    type: "direction",
    position: { x: 0, y: DIRECTION_Y },
    draggable: true,
    data: { label: direction.label },
  });
  edges.push({
    id: "me-direction",
    source: "me",
    target: "direction",
    type: "branch",
    data: { delay: 0 },
  });

  professionOptions.forEach((profession, index) => {
    nodes.push({
      id: profession.id,
      type: "profession",
      position: { x: professionX(index, professionOptions.length), y: PROFESSION_Y },
      draggable: true,
      data: {
        title: profession.title,
        summary: profession.summary,
        selected: profession.id === selectedProfessionId,
        onOpen: () => onProfessionOpen(profession),
      },
    });
    edges.push({
      id: `direction-${profession.id}`,
      source: "direction",
      target: profession.id,
      type: "branch",
      data: { delay: index * 180 },
    });
  });

  const anchorIndex = professionOptions.findIndex((p) => p.id === selectedProfessionId);
  const anchor = anchorIndex === -1 ? null : professionOptions[anchorIndex];
  const anchorX = anchor ? professionX(anchorIndex, professionOptions.length) : 0;

  if (roadmapPending && anchor) {
    nodes.push({
      id: "roadmap-loading",
      type: "loading",
      position: { x: anchorX, y: ROADMAP_START_Y },
      data: {},
    });
    edges.push({
      id: `${anchor.id}-roadmap-loading`,
      source: anchor.id,
      target: "roadmap-loading",
      type: "branch",
    });
  }

  if (roadmap && anchor && roadmap.professionId === anchor.id) {
    roadmap.stages.forEach((stage, index) => {
      const nodeId = `stage-${stage.id}`;
      const parentId = index === 0 ? anchor.id : `stage-${roadmap.stages[index - 1].id}`;
      nodes.push({
        id: nodeId,
        type: "roadmap",
        position: { x: anchorX, y: ROADMAP_START_Y + index * ROADMAP_GAP },
        draggable: true,
        data: {
          index: index + 1,
          title: stage.title,
          timeframe: stage.timeframe,
          last: index === roadmap.stages.length - 1,
          onOpen: () => onStageOpen(stage, index),
        },
      });
      edges.push({
        id: `${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
        type: "branch",
        data: { delay: index * 120 },
      });
    });
  }

  return { nodes, edges };
}

function GraphQuestionCard({ heading, question, busy, busyLabel, onChoose }) {
  return (
    <div className="question-card dock-card">
      <p className="question-category">{heading}</p>
      <h3>{question.text}</h3>
      <div className="option-list">
        {question.options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="option-button"
            onClick={() => onChoose(option.value)}
            disabled={busy}
          >
            {option.label}
          </button>
        ))}
      </div>
      {busy && <p className="dock-busy">{busyLabel || "Working…"}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Replace the Page 3 state and handlers inside `App()`**

Keep `stage/entryChoice/dreamAnswer/sessionId/step/nextQuestion/demoDraft/bigFiveDraft/progress` state and the Page 1/2 handlers (`handleStartSession`, `handleSubmitDemographic`, `handleChooseDepth`, `handleSubmitBigFive`, `handleSubmitValues`) untouched.

Replace the old Page 3 state block (current lines 384–406: `branches/themes/unlockedThemes/tradeoffContext/detailContext/evolvingBranchId/expandingBranchId/graphStatus/busy`) with:

```jsx
  const [directionQuestions, setDirectionQuestions] = useState([]);
  const [directionAnswers, setDirectionAnswers] = useState({});
  const [proposedDirection, setProposedDirection] = useState(null);
  const [direction, setDirection] = useState(null);
  const [narrowingQuestions, setNarrowingQuestions] = useState([]);
  const [narrowingAnswers, setNarrowingAnswers] = useState({});
  const [professionOptions, setProfessionOptions] = useState([]);
  const [selectedProfession, setSelectedProfession] = useState(null);
  const [roadmap, setRoadmap] = useState(null);

  const [narrowIntent, setNarrowIntent] = useState(false);
  const [confirmContext, setConfirmContext] = useState(null);
  const [stageDetail, setStageDetail] = useState(null);

  const [busy, setBusy] = useState({
    start: false,
    demo: false,
    depth: "",
    bigFive: false,
    values: false,
    enterTree: false,
    direction: false,
    confirmDirection: false,
    narrowing: false,
    roadmap: false,
  });

  const [error, setError] = useState("");
```

Replace `applySessionSnapshot` (current lines 409–417) with:

```jsx
  const applySessionSnapshot = (data) => {
    setSessionId(data.sessionId);
    setStep(data.step);
    setNextQuestion(data.nextQuestion || null);
    setProgress(data.progress || null);
    setDirectionQuestions(data.directionQuestions || []);
    setDirectionAnswers(data.directionAnswers || {});
    setProposedDirection(data.proposedDirection || null);
    setDirection(data.direction || null);
    setNarrowingQuestions(data.narrowingQuestions || []);
    setNarrowingAnswers(data.narrowingAnswers || {});
    setProfessionOptions(data.professionOptions || []);
    setSelectedProfession(data.selectedProfession || null);
    setRoadmap(data.roadmap || null);
  };
```

Delete the old Page 3 handlers (current lines 516–607: `handleGenerateInitialBranch`, `handleUnlockTheme`, `handleCreateThemeBranch`, `handleOpenTradeoff`, `handleTradeoffClose`, `handleTradeoffSubmit`, `handleSelectVariation`) and insert:

```jsx
  const handleEnterLifePath = async () => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, enterTree: true }));
    try {
      const data = await fetchDirectionQuestions({ sessionId });
      applySessionSnapshot(data);
      setStage("tree");
    } catch (e) {
      setError(e.message || "Could not start the Life Path Engine.");
    } finally {
      setBusy((p) => ({ ...p, enterTree: false }));
    }
  };

  const currentDirectionQuestion =
    directionQuestions.find((q) => directionAnswers[q.id] === undefined) || null;
  const currentNarrowingQuestion =
    narrowingQuestions.find((q) => narrowingAnswers[q.id] === undefined) || null;

  const handleAnswerDirection = async (value) => {
    if (!sessionId || !currentDirectionQuestion) return;
    setError("");
    setBusy((p) => ({ ...p, direction: true }));
    try {
      const data = await answerDirectionQuestion({
        sessionId,
        questionId: currentDirectionQuestion.id,
        value,
      });
      applySessionSnapshot(data);
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setBusy((p) => ({ ...p, direction: false }));
    }
  };

  const handleConfirmDirection = async () => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, confirmDirection: true }));
    try {
      const data = await confirmDirection({ sessionId });
      applySessionSnapshot(data);
    } catch (e) {
      setError(e.message || "Could not confirm direction.");
    } finally {
      setBusy((p) => ({ ...p, confirmDirection: false }));
    }
  };

  const handleAnswerNarrowing = async (value) => {
    if (!sessionId || !currentNarrowingQuestion) return;
    setError("");
    setBusy((p) => ({ ...p, narrowing: true }));
    try {
      const data = await answerNarrowingQuestion({
        sessionId,
        questionId: currentNarrowingQuestion.id,
        value,
      });
      applySessionSnapshot(data);
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setBusy((p) => ({ ...p, narrowing: false }));
    }
  };

  const handleProfessionOpen = async (profession) => {
    if (busy.roadmap) return;
    setError("");
    try {
      const data = await selectProfession({ sessionId, professionId: profession.id });
      applySessionSnapshot(data);
      setConfirmContext(profession);
    } catch (e) {
      setError(e.message || "Could not select profession.");
    }
  };

  const handleConfirmRoadmap = async () => {
    if (!sessionId || !confirmContext) return;
    setError("");
    setBusy((p) => ({ ...p, roadmap: true }));
    try {
      const data = await generateRoadmap({ sessionId });
      applySessionSnapshot(data);
      setConfirmContext(null);
    } catch (e) {
      setError(e.message || "Could not generate roadmap.");
    } finally {
      setBusy((p) => ({ ...p, roadmap: false }));
    }
  };

  const handleStageOpen = (stageItem, index) => {
    setStageDetail({ stage: stageItem, index });
  };
```

Replace `resetAll` (current lines 609–639) with:

```jsx
  const resetAll = () => {
    setStage("entry");
    setEntryChoice("");
    setDreamAnswer("");
    setSessionId("");
    setStep("entry");
    setNextQuestion(null);
    setDemoDraft("");
    setBigFiveDraft(0);
    setProgress(null);
    setDirectionQuestions([]);
    setDirectionAnswers({});
    setProposedDirection(null);
    setDirection(null);
    setNarrowingQuestions([]);
    setNarrowingAnswers({});
    setProfessionOptions([]);
    setSelectedProfession(null);
    setRoadmap(null);
    setNarrowIntent(false);
    setConfirmContext(null);
    setStageDetail(null);
    setError("");
    setBusy({
      start: false,
      demo: false,
      depth: "",
      bigFive: false,
      values: false,
      enterTree: false,
      direction: false,
      confirmDirection: false,
      narrowing: false,
      roadmap: false,
    });
  };
```

Replace the old `const graph = buildGraphFromState({...})` call (current lines 641–651) with:

```jsx
  const graph = buildLifePathGraph({
    direction,
    professionOptions,
    selectedProfessionId: selectedProfession?.id || null,
    roadmap,
    roadmapPending: busy.roadmap,
    onProfessionOpen: handleProfessionOpen,
    onStageOpen: handleStageOpen,
  });

  const treeHint = !direction
    ? "Answer the questions to find your direction"
    : professionOptions.length === 0
      ? "Direction locked — now narrow it down"
      : roadmap
        ? "Your roadmap — click any step for details"
        : "Click a profession to continue";
```

- [ ] **Step 5: Update the survey `"complete"` card button** (only handler + busy flag change; JSX around it untouched)

```jsx
                <button
                  type="button"
                  className="primary-action"
                  onClick={handleEnterLifePath}
                  disabled={busy.enterTree}
                >
                  {busy.enterTree ? "Preparing..." : "Run Life Path Engine"}
                </button>
```

- [ ] **Step 6: Replace the tree-stage JSX** (current lines 764–832, everything inside `{stage === "tree" && (...)}`) with:

```jsx
      {stage === "tree" && (
        <div className="graph-page">
          <div className="graph-header">
            <button type="button" className="graph-back" onClick={resetAll}>
              ← Restart
            </button>
            <span className="graph-logo">Life Path Explorer</span>
            <span className="graph-hint">{treeHint}</span>
          </div>

          <div className="graph-canvas">
            <GraphView nodes={graph.nodes} edges={graph.edges} />
          </div>

          {!direction && currentDirectionQuestion && (
            <div className="graph-question-dock">
              <GraphQuestionCard
                heading={`Direction · Question ${Object.keys(directionAnswers).length + 1} of ${directionQuestions.length}`}
                question={currentDirectionQuestion}
                busy={busy.direction}
                busyLabel="Reading your answer…"
                onChoose={handleAnswerDirection}
              />
            </div>
          )}

          {!direction && !currentDirectionQuestion && proposedDirection && (
            <div className="graph-question-dock">
              <div className="question-card dock-card">
                <p className="question-category">Direction found</p>
                <h3>{proposedDirection.label}</h3>
                <p className="dock-subtext">
                  Based on your profile and answers, this is your strongest broad direction.
                </p>
                <div className="question-actions single">
                  <button
                    type="button"
                    className="primary-action"
                    onClick={handleConfirmDirection}
                    disabled={busy.confirmDirection}
                  >
                    {busy.confirmDirection ? "Confirming…" : "Confirm this direction"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {direction && professionOptions.length === 0 && !narrowIntent && (
            <div className="graph-question-dock">
              <div className="question-card dock-card">
                <p className="question-category">Direction confirmed</p>
                <h3>{direction.label}</h3>
                <p className="dock-subtext">
                  Want to narrow it down to specific professions?
                </p>
                <div className="question-actions single">
                  <button
                    type="button"
                    className="primary-action"
                    onClick={() => setNarrowIntent(true)}
                  >
                    Yes, narrow it down
                  </button>
                </div>
              </div>
            </div>
          )}

          {direction && professionOptions.length === 0 && narrowIntent && currentNarrowingQuestion && (
            <div className="graph-question-dock">
              <GraphQuestionCard
                heading={`Narrowing · Question ${Object.keys(narrowingAnswers).length + 1} of ${narrowingQuestions.length}`}
                question={currentNarrowingQuestion}
                busy={busy.narrowing}
                busyLabel="Finding your professions…"
                onChoose={handleAnswerNarrowing}
              />
            </div>
          )}

          <AnimatePresence>
            {confirmContext && (
              <ConfirmModal
                key="confirm"
                professionTitle={confirmContext.title}
                busy={busy.roadmap}
                onConfirm={handleConfirmRoadmap}
                onDismiss={() => !busy.roadmap && setConfirmContext(null)}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {stageDetail && (
              <Motion.div
                key="stage-detail"
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 20, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <DetailPanel
                  data={{
                    path: {
                      archetype: `Step ${stageDetail.index + 1}${stageDetail.stage.timeframe ? ` · ${stageDetail.stage.timeframe}` : ""}`,
                      title: stageDetail.stage.title,
                      description: stageDetail.stage.description,
                      careerTrajectory: stageDetail.stage.milestone || null,
                    },
                    onClose: () => setStageDetail(null),
                  }}
                />
              </Motion.div>
            )}
          </AnimatePresence>

          {error && <p className="error-text graph-error">{error}</p>}
        </div>
      )}
```

(The `DetailPanel` maps `careerTrajectory` to a "Milestone" heading — exactly right for a roadmap stage. `graphStatus` and its div are gone.)

- [ ] **Step 7: Add dock styles to `GraphPage.css`**

Append (and verify `.graph-page` already has `position: relative` or `position: fixed/absolute` context — if it has neither, add `position: relative;` to the existing `.graph-page` rule):

```css
.graph-question-dock {
  position: absolute;
  left: 50%;
  bottom: 32px;
  transform: translateX(-50%);
  z-index: 150;
  width: min(560px, calc(100vw - 48px));
}

.graph-question-dock .question-card {
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.08);
  margin: 0;
}

.dock-subtext {
  font-size: 13px;
  color: var(--color-text-muted);
  line-height: 1.5;
  margin-bottom: 20px;
}

.dock-busy {
  font-size: 12px;
  color: var(--color-text-faint);
  font-style: italic;
  margin-top: 12px;
}
```

- [ ] **Step 8: Verify build and lint**

Run: `cd frontend && npx vite build 2>&1 | tail -5 && npm run lint`
Expected: build succeeds; lint reports no NEW errors (pre-existing warnings, if any, are acceptable). A leftover-import error here means a missed deletion in Steps 1–2.

- [ ] **Step 9: Commit**

```bash
git add -A frontend/src
git commit -m "feat(frontend): 4-stage life path flow (direction -> professions -> confirm -> roadmap)"
```

---

### Task 10: README + end-to-end verification

**Files:**
- Modify: `README.md`
- No code changes — this task gates the deliverable.

**Interfaces:**
- Consumes: everything above.
- Produces: accurate docs + verified working flow.

- [ ] **Step 1: Update README.md**

Three edits — the Page 1/Page 2 bullets, Tech Stack, Run Locally sections stay untouched:

**(1a)** Replace the `3. **Page 3 - Life Path Engine**` block (current lines 18–27) with:

```markdown
3. **Page 3 - Life Path Engine** (free for every session)
- React Flow graph with centered root node: `Me`
- **Direction finding**: 2-3 sharp AI-generated questions converge on one broad professional direction (e.g. Programming, Healthcare, Design), rendered as a confirmed Direction node
- **Narrowing**: 1-2 follow-up questions about work style and environment, then exactly 3 realistic professions fork off the Direction node
- **Confirm**: clicking a profession asks "Would you like to see how to reach this profession?"
- **Roadmap**: on confirmation, a personalized ordered step-by-step roadmap (foundations → first projects → entry role → credential → established role) renders as a vertical chain under the chosen profession; click any step for details
```

**(1b)** In `Key backend modules`, replace the `aiEngine.js` line's description with `direction questions, profession narrowing, roadmap generation` and add a line: `- \`backend/directions.js\` broad-direction catalog + deterministic direction tally`. Update the `sessionStore.js` line to `in-memory session, direction, profession, and roadmap state`.

**(1c)** Replace the `### Branch Engine` and `### Payment Lock (MVP mock)` sections of API Routes (current lines 90–101) with:

```markdown
### Life Path Engine
- `POST /api/direction/question`
  - body: `{ "sessionId": "..." }` — generates/returns the direction-finding questions
- `POST /api/direction/answer`
  - body: `{ "sessionId": "...", "questionId": "...", "value": "..." }`
- `POST /api/direction/confirm`
  - body: `{ "sessionId": "..." }` — locks the proposed direction, returns narrowing questions
- `POST /api/professions/narrow`
  - body: `{ "sessionId": "...", "questionId": "...", "value": "..." }` — after the last answer, returns exactly 3 profession options
- `POST /api/professions/select`
  - body: `{ "sessionId": "...", "professionId": "..." }`
- `POST /api/roadmap/generate`
  - body: `{ "sessionId": "..." }` — personalized ordered roadmap for the selected profession
```

**(1d)** Replace the `## Notes` section (current lines 103–107) with:

```markdown
## Notes

- Every feature is free — there is no payment flow.
- If OpenAI fails or no API key is set, deterministic fallback generators cover direction questions, narrowing questions, professions, and roadmaps, so the flow never breaks.
```

- [ ] **Step 2: Full backend verification**

Run: `cd backend && npm test`
Expected: PASS — every suite (directions, sessionStore, prompts, aiEngine, server), 0 failures.

- [ ] **Step 3: Full frontend verification**

Run: `cd frontend && npx vite build 2>&1 | tail -3 && npm run lint`
Expected: build succeeds, lint clean.

- [ ] **Step 4: Live end-to-end smoke test (fallback mode)**

```bash
cd backend && OPENAI_API_KEY= node server.js &   # port 3001
cd frontend && npm run dev &                      # port 5173
```

In a browser (or via Playwright): complete Page 1 (pick intent, enter a dream) → Page 2 (3 demographics, choose Short, 20 Big Five, 40 values) → click "Run Life Path Engine" and verify on Page 3:
1. Dock shows direction question 1 of 3 over the lone Me node; answer all 3.
2. "Direction found" card appears; confirm → Direction node animates in under Me.
3. "Narrow it down?" prompt → yes → 2 narrowing questions → 3 profession nodes fork out.
4. Click a profession → ConfirmModal → "Not now" leaves it highlighted; reopen → Yes → roadmap chain of 6 nodes renders below it.
5. Click a roadmap node → DetailPanel shows description + milestone. No locked nodes, no unlock/payment UI anywhere.

Then kill both dev servers.

- [ ] **Step 5: Grep for leftovers**

Run: `grep -rn "unlockTheme\|unlockedThemes\|BRANCH_THEMES\|payment\|TradeoffModal\|evolveBranch\|generateInitialBranch" backend/*.js frontend/src --include="*.js" --include="*.jsx" --include="*.css" | grep -v questionPool.js`
Expected: no output (`questionPool.js` keeps its unused `BRANCH_THEMES` export because the file is off-limits).

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: describe free direction->roadmap Page 3 flow and new API routes"
```

---

## Self-Review Notes (already applied)

1. **Spec coverage:** monetization removal → Tasks 2/5/7/9/10; Stage A → Tasks 1/3/4/5/9; Stage B (exactly 3 professions) → Tasks 3/4/5/9; Stage C modal → Tasks 8/9; Stage D roadmap + fallback → Tasks 3/4/5/9; `/api/branches/evolve` removed (not kept — nothing refines roadmap stages, YAGNI); English copy throughout; README → Task 10.
2. **Type consistency:** `directionId` ∈ `DIRECTION_IDS` everywhere; question ids `dir_q1..3`/`nar_q1..2`; profession ids `prof_1..3`; stage ids `stage_1..n`; snapshot field names identical across `serializeSessionState` (Task 2), route tests (Task 5), and `applySessionSnapshot` (Task 9).
3. **Boundary check:** `questionPool.js`, `questionEngine.js`, `bigFiveItems.js` never edited; Page 1/2 routes byte-identical; Page 2 session fields untouched; `session.step` never advances past `"complete"` (new `pathStage` field instead).






