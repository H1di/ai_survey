# Question Engine v2 — Phase 1 (Page 1–2 Engine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Page 2 assessment pipeline `demographics → depth_choice → big_five → values → complete` with `demographics(+city) → depth_choice → big_five → riasec → job_characteristics → cv → tree`, deleting the 40-item A/B values inventory and adding a RIASEC quiz, a ranked 7-parameter job-characteristics elicitation, and a CV track (paste/upload/7 journey questions). CV intent is chosen on Page 1.

**Architecture:** Spec: `docs/superpowers/specs/2026-07-09-question-engine-v2-schwartz-design.md`. Backend keeps the in-memory `SessionStore` + full-snapshot serialization + one-AI-generator-per-artifact-with-deterministic-fallback patterns. **The old Page 3 (direction → narrowing → professions → roadmap) keeps working in this phase** — it is removed in Phase 3; the only Page 3 change here is that RIASEC direction ranking now uses measured quiz scores and the final assessment step is renamed `complete` → `tree`. Frontend stays a single `App.jsx` stage machine; the server snapshot remains the single source of truth.

**Tech Stack:** Node + Express 5 (CommonJS), `node:test` + supertest, React 19 + Vite, Vitest, recharts. New backend deps: `multer`, `pdf-parse`, `mammoth`.

## Global Constraints

- Branch: `feat/question-engine-v2` off `fix/audit-p0-p2` (Task 1 creates it).
- Everything must work keyless: every AI generator gets a strict normalizer AND a deterministic fallback; tests run with `OPENAI_API_KEY=""`.
- The 7 canonical parameter keys, exactly: `compensation, work_mode, job_security, career_growth, complexity, meaning_impact, social`.
- RIASEC item `type` must NEVER be serialized to the client (same rule as Big Five `trait`/`reverse`).
- Big Five items: AI-generated is the default again; `AI_BIG_FIVE_ITEMS=false` (or no key) forces the static IPIP sets.
- Session snapshot trimming (`includeStatic`) is preserved: question banks travel only on start / GET resume / depth choice / riasec start / job-char rank.
- Step strings (backend ↔ frontend contract): `demographics, depth_choice, big_five, riasec, job_characteristics, cv, tree`.
- Run backend tests with `cd backend && npm test`; frontend with `cd frontend && npm test -- --run`. Commit after every green task.
- UI strings are English. Reuse existing CSS classes (`question-card`, `option-button`, `likert-row`, `ghost-action`, `primary-action`) before inventing new ones.

## File Map

| File | Phase-1 action |
|---|---|
| `backend/riasecItems.js` | NEW — static RIASEC fallback pool |
| `backend/questionEngine.js` | +RIASEC/jobChar/journey validation & scoring; −values validation/scoring; buildProgress/summarize rework |
| `backend/questionPool.js` | +city question, `JOB_CHAR_PARAMS`, `JOB_CHAR_FALLBACK_QUESTIONS`, `CAREER_JOURNEY_QUESTIONS`; −values banks |
| `backend/riasec.js` | rework: `inferRiasecScores(bigFiveScores)`, `rankDirections(riasecScores, opts)` |
| `backend/sessionStore.js` | new fields/mutators/serialization; −values fields |
| `backend/prompts.js` | BASE_SYSTEM merge, digest v2, 4 new builders |
| `backend/aiEngine.js` | 4 new generators + normalizers; Big Five default flip |
| `backend/cvExtract.js` | NEW — file→text extraction (pdf/docx/txt) |
| `backend/server.js` | 7 new routes, step-machine rewiring, −values route |
| `backend/tests/*` | new suites + rewrites of `server.test.js`, `sessionStore.test.js`, `questionEngine.test.js`, `riasec.test.js`, `prompts.test.js`, `aiEngine.test.js` |
| `frontend/src/api.js` | new wrappers; −submitValuesAnswer |
| `frontend/src/App.jsx` | entry cvIntent chips; riasec/jobChar/cv stage UIs; −values UI; step rename |
| `frontend/src/lifePath.js` | +`moveRankItem` pure helper |
| `frontend/src/lifePath.test.js` | +moveRankItem tests |
| `frontend/src/components/ProfileCharts.jsx` | ValuesBarChart → RiasecBarChart |
| `frontend/src/App.css` | rank-list + cv-card styles |
| `CLAUDE.md`, `README.md`, `backend/.env.example` | docs sync |

---

### Task 1: Static RIASEC item pool

**Files:**
- Create: `backend/riasecItems.js`
- Test: `backend/tests/riasecItems.test.js`

**Interfaces:**
- Produces: `getFallbackRiasecItems(depth)` → `[{ id: "ri_1", type: "R"|"I"|"A"|"S"|"E"|"C", text }]` — 12 items for `"short"`, 18 for `"deep"`, interleaved by type. Also exports `RIASEC_POOL` for tests.

- [ ] **Step 0: Create the branch**

```bash
git checkout -b feat/question-engine-v2
```

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/riasecItems.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { getFallbackRiasecItems, RIASEC_POOL } = require("../riasecItems");

const TYPES = ["R", "I", "A", "S", "E", "C"];

test("pool has 3 items per type, unique texts, all under 90 chars", () => {
  assert.equal(RIASEC_POOL.length, 18);
  for (const type of TYPES) {
    assert.equal(RIASEC_POOL.filter((i) => i.type === type).length, 3);
  }
  const texts = new Set(RIASEC_POOL.map((i) => i.text.toLowerCase()));
  assert.equal(texts.size, 18);
  for (const item of RIASEC_POOL) assert.ok(item.text.length < 90);
});

test("short set = 12 items (2 per type), deep = 18 (3 per type)", () => {
  const short = getFallbackRiasecItems("short");
  const deep = getFallbackRiasecItems("deep");
  assert.equal(short.length, 12);
  assert.equal(deep.length, 18);
  for (const type of TYPES) {
    assert.equal(short.filter((i) => i.type === type).length, 2);
    assert.equal(deep.filter((i) => i.type === type).length, 3);
  }
});

test("items are interleaved by type and ids are sequential ri_N", () => {
  const items = getFallbackRiasecItems("short");
  assert.deepEqual(items.slice(0, 6).map((i) => i.type), TYPES);
  assert.deepEqual(items.map((i) => i.id), items.map((_, n) => `ri_${n + 1}`));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test tests/riasecItems.test.js`
Expected: FAIL — `Cannot find module '../riasecItems'`

- [ ] **Step 3: Write the implementation**

```js
// backend/riasecItems.js
// Static Holland RIASEC interest items (public-domain style, written for this
// app). Fallback instrument when the AI item generator is unavailable —
// activity statements rated 1–5 for enjoyment, never job titles.

const RIASEC_POOL = [
  // Realistic
  { type: "R", text: "Assembling or repairing a physical device until it works" },
  { type: "R", text: "Working outdoors with tools, plants, or animals" },
  { type: "R", text: "Operating machines or vehicles with real skill" },
  // Investigative
  { type: "I", text: "Analysing data to find the pattern behind it" },
  { type: "I", text: "Running a small experiment to test an idea" },
  { type: "I", text: "Digging into research to understand how something really works" },
  // Artistic
  { type: "A", text: "Shaping how something looks, feels, or reads" },
  { type: "A", text: "Writing, composing, or performing for an audience" },
  { type: "A", text: "Inventing an original concept where nothing existed before" },
  // Social
  { type: "S", text: "Helping someone work through a difficult situation" },
  { type: "S", text: "Teaching a skill until the learner truly gets it" },
  { type: "S", text: "Caring for someone's health or wellbeing" },
  // Enterprising
  { type: "E", text: "Pitching an idea and winning people over" },
  { type: "E", text: "Organizing a team toward an ambitious goal" },
  { type: "E", text: "Negotiating a deal where the stakes are real" },
  // Conventional
  { type: "C", text: "Bringing order to messy records or information" },
  { type: "C", text: "Planning a detailed schedule or budget" },
  { type: "C", text: "Checking work carefully for errors before it ships" },
];

const TYPE_ORDER = ["R", "I", "A", "S", "E", "C"];

// Interleave R,I,A,S,E,C so same-type items never sit in a block (less
// pattern-y for the respondent). short=2 per type, deep=3 per type.
function getFallbackRiasecItems(depth) {
  const perType = depth === "deep" ? 3 : 2;
  const byType = Object.fromEntries(
    TYPE_ORDER.map((t) => [t, RIASEC_POOL.filter((i) => i.type === t)])
  );
  const items = [];
  for (let round = 0; round < perType; round += 1) {
    for (const type of TYPE_ORDER) {
      items.push(byType[type][round]);
    }
  }
  return items.map((item, index) => ({ id: `ri_${index + 1}`, ...item }));
}

module.exports = { RIASEC_POOL, getFallbackRiasecItems };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test tests/riasecItems.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/riasecItems.js backend/tests/riasecItems.test.js
git commit -m "feat(riasec): static RIASEC fallback item pool"
```

---

### Task 2: RIASEC answer validation + scoring in questionEngine

**Files:**
- Modify: `backend/questionEngine.js`
- Test: `backend/tests/questionEngine.test.js` (append)

**Interfaces:**
- Consumes: `session.riasecItems` (`[{id,type,text}]`), `session.riasecAnswers` (`{[id]: 1..5}`).
- Produces:
  - `serializeRiasecItem(item)` → `{ id, text }` (drops `type`)
  - `validateRiasecAnswer(session, itemId, value)` → int 1..5 or throws 404/400
  - `computeRiasecScores(session)` → `{ scores: {R,I,A,S,E,C}|null, answered }` — per-type mean of 1–5 rescaled to 0–100 (round), `scores` null until every item answered
  - `deriveRiasecCode(scores)` → top-3 string like `"IAS"`, ties broken by `R,I,A,S,E,C` order

- [ ] **Step 1: Write the failing tests** (append to `backend/tests/questionEngine.test.js`)

```js
const {
  serializeRiasecItem,
  validateRiasecAnswer,
  computeRiasecScores,
  deriveRiasecCode,
} = require("../questionEngine");
const { getFallbackRiasecItems } = require("../riasecItems");

test("serializeRiasecItem strips the scoring type", () => {
  const item = { id: "ri_1", type: "R", text: "Fixing things" };
  assert.deepEqual(serializeRiasecItem(item), { id: "ri_1", text: "Fixing things" });
});

test("validateRiasecAnswer rejects unknown items and out-of-range values", () => {
  const session = { riasecItems: getFallbackRiasecItems("short"), riasecAnswers: {} };
  assert.equal(validateRiasecAnswer(session, "ri_1", 4), 4);
  assert.throws(() => validateRiasecAnswer(session, "nope", 3), /Unknown RIASEC item/);
  assert.throws(() => validateRiasecAnswer(session, "ri_1", 0), /1–5/);
  assert.throws(() => validateRiasecAnswer(session, "ri_1", 3.5), /1–5/);
});

test("computeRiasecScores: null until complete, then per-type 0–100 means", () => {
  const items = getFallbackRiasecItems("short");
  const session = { riasecItems: items, riasecAnswers: {} };
  assert.equal(computeRiasecScores(session).scores, null);

  // All R items -> 5, everything else -> 1
  for (const item of items) session.riasecAnswers[item.id] = item.type === "R" ? 5 : 1;
  const { scores, answered } = computeRiasecScores(session);
  assert.equal(answered, 12);
  assert.equal(scores.R, 100);
  assert.equal(scores.I, 0);
});

test("deriveRiasecCode returns top-3 with stable R,I,A,S,E,C tie-break", () => {
  assert.equal(deriveRiasecCode({ R: 10, I: 90, A: 80, S: 70, E: 10, C: 10 }), "IAS");
  // full tie -> catalog order
  assert.equal(deriveRiasecCode({ R: 50, I: 50, A: 50, S: 50, E: 50, C: 50 }), "RIA");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && node --test tests/questionEngine.test.js`
Expected: FAIL — `serializeRiasecItem is not a function`

- [ ] **Step 3: Implement** (add to `backend/questionEngine.js`, before `module.exports`; define the type keys locally — do NOT require `./riasec` here, aiEngine already links both and a local constant keeps the modules independent):

```js
const RIASEC_TYPE_KEYS = ["R", "I", "A", "S", "E", "C"];

function serializeRiasecItem(item) {
  return { id: item.id, text: item.text };
}

function validateRiasecAnswer(session, itemId, value) {
  const item = (session.riasecItems || []).find((i) => i.id === itemId);
  if (!item) throw httpErr(404, "Unknown RIASEC item.");
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw httpErr(400, "RIASEC answer must be an integer 1–5.");
  }
  return n;
}

function computeRiasecScores(session) {
  const items = session.riasecItems || [];
  const answered = items.filter((i) => session.riasecAnswers[i.id] !== undefined).length;
  if (!items.length || answered < items.length) return { scores: null, answered };

  const scores = {};
  for (const type of RIASEC_TYPE_KEYS) {
    const group = items.filter((i) => i.type === type);
    const mean = group.reduce((sum, i) => sum + session.riasecAnswers[i.id], 0) / group.length;
    scores[type] = Math.round(((mean - 1) / 4) * 100);
  }
  return { scores, answered };
}

function deriveRiasecCode(scores) {
  return RIASEC_TYPE_KEYS
    .map((key, index) => ({ key, index, score: scores[key] ?? 0 }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3)
    .map((e) => e.key)
    .join("");
}
```

Export all four from `module.exports`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && node --test tests/questionEngine.test.js`
Expected: PASS (existing + 4 new)

- [ ] **Step 5: Commit**

```bash
git add backend/questionEngine.js backend/tests/questionEngine.test.js
git commit -m "feat(riasec): quiz answer validation, 0-100 scoring, Holland code"
```

---

### Task 3: Rework riasec.js — Big Five inference + score-based ranking

**Files:**
- Modify: `backend/riasec.js` (drop values-based derivation), `backend/aiEngine.js:396-424` (call site)
- Test: `backend/tests/riasec.test.js` (rewrite the derivation tests)

**Interfaces:**
- Produces:
  - `inferRiasecScores(bigFiveScores)` → `{R,I,A,S,E,C}` 0–100, Big Five only (heuristic fallback for the skip path; missing input → all 50)
  - `rankDirections(riasecScores, { excludeIds = [] })` → `[{ id, score }]` high-to-low (signature change: takes a scores object, no longer a profile)
  - `RIASEC_KEYS`, `DIRECTION_RIASEC` unchanged.
- Consumers updated here: `aiEngine.generateDirectionQuestions` passes `session.riasecScores ?? inferRiasecScores(session.bigFiveScores)`.

- [ ] **Step 1: Rewrite the derivation tests** in `backend/tests/riasec.test.js` — replace tests referencing `deriveRiasecScores`/`valuesScores` with:

```js
const { inferRiasecScores, rankDirections, DIRECTION_RIASEC } = require("../riasec");

test("inferRiasecScores: neutral profile -> all 50, extremes move sanely", () => {
  assert.deepEqual(inferRiasecScores(undefined), { R: 50, I: 50, A: 50, S: 50, E: 50, C: 50 });
  const artist = inferRiasecScores({ O: 95, C: 30, E: 40, A: 55, N: 50 });
  assert.ok(artist.A > 70, "high O drives Artistic");
  assert.ok(artist.R < 40, "high O suppresses Realistic");
  const organizer = inferRiasecScores({ O: 20, C: 90, E: 60, A: 50, N: 40 });
  assert.ok(organizer.C > 70, "high C drives Conventional");
});

test("rankDirections ranks by weighted dot product over measured scores", () => {
  const scientist = { R: 20, I: 95, A: 40, S: 30, E: 20, C: 40 };
  const ranked = rankDirections(scientist);
  assert.equal(ranked[0].id, "science");
  assert.ok(ranked.every((r) => Number.isFinite(r.score)));
});

test("rankDirections excludes rejected ids", () => {
  const ranked = rankDirections({ R: 20, I: 95, A: 40, S: 30, E: 20, C: 40 }, { excludeIds: ["science"] });
  assert.ok(!ranked.some((r) => r.id === "science"));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && node --test tests/riasec.test.js`
Expected: FAIL — `inferRiasecScores is not a function`

- [ ] **Step 3: Implement.** In `backend/riasec.js`: delete `valuePct` and `deriveRiasecScores`, delete the `VALUES_DIMENSIONS` require and `_valueDimensionIds` export, and replace with:

```js
// Big Five–only heuristic used ONLY when the user skips the RIASEC quiz and
// the AI inference is unavailable. Direction/magnitude follow the Barrick,
// Mount & Gupta (2003) / Larson et al. (2002) meta-analytic links; Realistic
// has no solid Big Five anchor, so it leans on low Openness + introversion.
function inferRiasecScores(bigFiveScores) {
  const O = bigFiveScores?.O ?? 50;
  const C = bigFiveScores?.C ?? 50;
  const E = bigFiveScores?.E ?? 50;
  const A = bigFiveScores?.A ?? 50;

  return {
    R: clamp(0.5 * (100 - O) + 0.5 * (100 - E)),
    I: clamp(0.7 * O + 0.3 * (100 - E)),
    A: clamp(0.8 * O + 0.2 * (100 - C)),
    S: clamp(0.55 * A + 0.45 * E),
    E: clamp(0.65 * E + 0.35 * C),
    C: clamp(0.7 * C + 0.3 * (100 - O)),
  };
}

// Rank catalog directions against a measured (or inferred) RIASEC score
// vector — weighted dot product, high to low. excludeIds drops rejected ids.
function rankDirections(riasecScores, { excludeIds = [] } = {}) {
  const excluded = new Set(excludeIds);
  return Object.entries(DIRECTION_RIASEC)
    .filter(([id]) => !excluded.has(id))
    .map(([id, weights]) => {
      let score = 0;
      for (const [key, weight] of Object.entries(weights)) {
        score += weight * (riasecScores?.[key] ?? 50);
      }
      return { id, score: Math.round(score) };
    })
    .sort((a, b) => b.score - a.score);
}

module.exports = { RIASEC_KEYS, DIRECTION_RIASEC, inferRiasecScores, rankDirections };
```

In `backend/aiEngine.js` `generateDirectionQuestions`, replace the `rankDirections({...})` call with:

```js
        riasecRanking: rankDirections(
          session.riasecScores ?? inferRiasecScores(session.bigFiveScores)
        ),
```

and change the import line to `const { rankDirections, inferRiasecScores } = require("./riasec");`.

- [ ] **Step 4: Run the full backend suite** (aiEngine tests exercise the call site)

Run: `cd backend && npm test`
Expected: PASS except any test that asserted `deriveRiasecScores` values-behavior — those were rewritten in Step 1. If `aiEngine.test.js` or `prompts.test.js` reference `valuesScores` in direction-question fixtures they still pass (extra fields are ignored).

- [ ] **Step 5: Commit**

```bash
git add backend/riasec.js backend/aiEngine.js backend/tests/riasec.test.js
git commit -m "refactor(riasec): rank from measured scores; Big Five-only skip inference"
```

---

### Task 4: Job-characteristics + career-journey banks and scoring; city question; delete values bank

**Files:**
- Modify: `backend/questionPool.js` (add city, JOB_CHAR_PARAMS, JOB_CHAR_FALLBACK_QUESTIONS, CAREER_JOURNEY_QUESTIONS; delete VALUES_*), `backend/questionEngine.js` (add jobChar/journey validation+scoring; delete values validation/scoring — buildProgress/summarize are reworked in Task 5)
- Test: `backend/tests/questionEngine.test.js` (append; delete values tests)

**Interfaces:**
- Produces (questionPool):
  - `JOB_CHAR_PARAMS` = `[{ id, label, meaning }]` — the 7 canonical keys in spec order
  - `JOB_CHAR_PARAM_IDS` = the 7 ids
  - `selectFallbackJobCharQuestions(ranking, count)` → `count` items `{ id: "jc_N", param, text, options: [{value, label}] }` in ranking order (count=5 → 1 question for each of top-5 params; count=10 → 2 questions for top-3 + 1 for the remaining 4)
  - `CAREER_JOURNEY_QUESTIONS` = 7 × `{ id, question, placeholder }`
  - `CAREER_JOURNEY_BY_ID` Map
  - Demographics gain `{ id: "city", kind: "text", question: "Which city are you based in?", placeholder: "Type your city" }` after `country`.
- Produces (questionEngine):
  - `validateJobCharRanking(ranking)` → validated array or throws 400 (must be a permutation of all 7 ids)
  - `validateJobCharAnswer(session, itemId, value)` → number (must equal one of the item's option values) or throws
  - `computeJobCharProfile(session)` → `{ profile|null, answered }` — per-param mean of answered option values, unasked params = 50; null until all `jobCharItems` answered
  - `validateCareerJourneyAnswer(questionId, value)` → trimmed string ≤400 chars or throws
  - `serializeJobCharItem(item)` → item as-is (id/param/text/options are all client-safe)

- [ ] **Step 1: Write the failing tests** (append to `backend/tests/questionEngine.test.js`; DELETE the existing values-scoring tests in the same file)

```js
const {
  validateJobCharRanking,
  validateJobCharAnswer,
  computeJobCharProfile,
  validateCareerJourneyAnswer,
} = require("../questionEngine");
const {
  JOB_CHAR_PARAM_IDS,
  selectFallbackJobCharQuestions,
  CAREER_JOURNEY_QUESTIONS,
} = require("../questionPool");

test("validateJobCharRanking accepts only a permutation of all 7 params", () => {
  const ok = [...JOB_CHAR_PARAM_IDS].reverse();
  assert.deepEqual(validateJobCharRanking(ok), ok);
  assert.throws(() => validateJobCharRanking(JOB_CHAR_PARAM_IDS.slice(0, 6)), /all 7/);
  assert.throws(() => validateJobCharRanking([...JOB_CHAR_PARAM_IDS.slice(0, 6), "salary"]), /all 7/);
  assert.throws(
    () => validateJobCharRanking([JOB_CHAR_PARAM_IDS[0], ...JOB_CHAR_PARAM_IDS.slice(0, 6)]),
    /all 7/
  );
});

test("fallback jobChar questions follow ranking order and depth weighting", () => {
  const ranking = [...JOB_CHAR_PARAM_IDS];
  const five = selectFallbackJobCharQuestions(ranking, 5);
  assert.equal(five.length, 5);
  assert.deepEqual(five.map((q) => q.param), ranking.slice(0, 5));
  const ten = selectFallbackJobCharQuestions(ranking, 10);
  assert.equal(ten.length, 10);
  // top-3 params get 2 questions each, the remaining 4 get 1
  for (const p of ranking.slice(0, 3)) assert.equal(ten.filter((q) => q.param === p).length, 2);
  for (const p of ranking.slice(3)) assert.equal(ten.filter((q) => q.param === p).length, 1);
  assert.deepEqual(ten.map((q) => q.id), ten.map((_, n) => `jc_${n + 1}`));
  for (const q of ten) {
    assert.ok(q.options.length >= 3 && q.options.length <= 4);
    for (const o of q.options) assert.ok(o.value >= 0 && o.value <= 100 && o.label);
  }
});

test("validateJobCharAnswer only accepts one of the item's option values", () => {
  const items = selectFallbackJobCharQuestions([...JOB_CHAR_PARAM_IDS], 5);
  const session = { jobCharItems: items, jobCharAnswers: {} };
  const legal = items[0].options[0].value;
  assert.equal(validateJobCharAnswer(session, items[0].id, legal), legal);
  assert.throws(() => validateJobCharAnswer(session, items[0].id, 42.5), /option/);
  assert.throws(() => validateJobCharAnswer(session, "jc_99", legal), /Unknown/);
});

test("computeJobCharProfile: null until complete, then per-param means with 50 default", () => {
  const ranking = [...JOB_CHAR_PARAM_IDS];
  const items = selectFallbackJobCharQuestions(ranking, 5);
  const session = { jobCharItems: items, jobCharAnswers: {} };
  assert.equal(computeJobCharProfile(session).profile, null);
  for (const item of items) session.jobCharAnswers[item.id] = item.options[0].value;
  const { profile } = computeJobCharProfile(session);
  for (const p of ranking.slice(0, 5)) {
    const item = items.find((i) => i.param === p);
    assert.equal(profile[p], item.options[0].value);
  }
  for (const p of ranking.slice(5)) assert.equal(profile[p], 50, "unasked params default to 50");
});

test("career journey: 7 questions; answers trimmed and capped at 400 chars", () => {
  assert.equal(CAREER_JOURNEY_QUESTIONS.length, 7);
  assert.equal(validateCareerJourneyAnswer(CAREER_JOURNEY_QUESTIONS[0].id, "  BSc  "), "BSc");
  assert.throws(() => validateCareerJourneyAnswer("nope", "x"), /Unknown/);
  assert.throws(() => validateCareerJourneyAnswer(CAREER_JOURNEY_QUESTIONS[0].id, ""), /empty/);
  assert.equal(
    validateCareerJourneyAnswer(CAREER_JOURNEY_QUESTIONS[0].id, "x".repeat(1000)).length,
    400
  );
});

test("demographics include city as the 4th question", () => {
  const { DEMOGRAPHIC_QUESTIONS } = require("../questionPool");
  assert.deepEqual(DEMOGRAPHIC_QUESTIONS.map((q) => q.id), ["sex", "age", "country", "city"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && node --test tests/questionEngine.test.js`
Expected: FAIL — `validateJobCharRanking is not a function`

- [ ] **Step 3: Implement questionPool.js changes.** Add the city question after `country`. Delete `VALUES_DIMENSIONS`, `VALUES_ROWS`, `VALUES_QUESTIONS`, `VALUES_BY_ID` and their exports. Add:

```js
// The 7 tunable job-characteristic parameters (career-question-engine v2).
// These keys are a cross-layer contract: prompts, scoring, session state,
// and the frontend refinement panel all use them verbatim.
const JOB_CHAR_PARAMS = [
  { id: "compensation", label: "Compensation", meaning: "Pay level and upside" },
  { id: "work_mode", label: "Work Mode", meaning: "Remote/hybrid/on-site, hours, flexibility" },
  { id: "job_security", label: "Job Security", meaning: "Stability, demand, redundancy risk" },
  { id: "career_growth", label: "Career Growth", meaning: "Advancement speed and ceiling" },
  { id: "complexity", label: "Complexity", meaning: "Intellectual difficulty and variety" },
  { id: "meaning_impact", label: "Meaning / Impact", meaning: "Contribution and purpose" },
  { id: "social", label: "Social", meaning: "Amount and type of people interaction" },
];
const JOB_CHAR_PARAM_IDS = JOB_CHAR_PARAMS.map((p) => p.id);

// Two static tradeoff questions per parameter; each option encodes a 0–100
// target on that parameter. Fallback bank for the AI question generator.
const JOB_CHAR_QUESTION_BANK = {
  compensation: [
    { text: "Which offer would you actually sign?", options: [
      { value: 95, label: "Top-of-market pay in a demanding, high-pressure team" },
      { value: 70, label: "Clearly above-average pay with normal expectations" },
      { value: 45, label: "Average pay in a role I genuinely like" },
      { value: 20, label: "Modest pay for work that fits my life perfectly" },
    ]},
    { text: "How much does the money ceiling matter long-term?", options: [
      { value: 90, label: "I want a path to a top-percentile income" },
      { value: 60, label: "Comfortable and steadily growing is enough" },
      { value: 30, label: "Enough to not think about money — beyond that, no" },
    ]},
  ],
  work_mode: [
    { text: "Pick the working setup you'd protect the hardest:", options: [
      { value: 95, label: "Fully remote, I set my own hours" },
      { value: 70, label: "Hybrid with flexible hours" },
      { value: 40, label: "A structured office rhythm with clear boundaries" },
      { value: 15, label: "On-site and scheduled — the place is part of the job" },
    ]},
    { text: "A great job asks you in 5 days a week. You…", options: [
      { value: 90, label: "Decline — flexibility is non-negotiable" },
      { value: 55, label: "Negotiate a middle ground" },
      { value: 20, label: "Take it — presence matters less than the work" },
    ]},
  ],
  job_security: [
    { text: "Which position feels right?", options: [
      { value: 95, label: "Near-unfireable role in an institution that will outlive me" },
      { value: 65, label: "Stable industry, normal market risk" },
      { value: 35, label: "Volatile field, strong demand for good people" },
      { value: 10, label: "High-risk bets — security is not what I optimize" },
    ]},
    { text: "Your employer wobbles. What's your instinct?", options: [
      { value: 90, label: "I should have chosen somewhere safer" },
      { value: 50, label: "Uncomfortable but survivable — I keep options warm" },
      { value: 15, label: "Exciting — change creates openings" },
    ]},
  ],
  career_growth: [
    { text: "Five years in, what does success look like?", options: [
      { value: 95, label: "Two promotions up, visibly climbing" },
      { value: 65, label: "Bigger scope and pay, title secondary" },
      { value: 35, label: "Deep mastery of the craft, same seat is fine" },
      { value: 10, label: "Success isn't a ladder for me at all" },
    ]},
    { text: "A lateral move pays the same but teaches you more. You…", options: [
      { value: 85, label: "Take it only if it speeds the climb later" },
      { value: 55, label: "Take it for the learning itself" },
      { value: 25, label: "Skip it — stability beats motion" },
    ]},
  ],
  complexity: [
    { text: "The task you'd pick first from a shared board:", options: [
      { value: 95, label: "The unsolved one nobody can scope yet" },
      { value: 65, label: "A meaty problem with a known shape" },
      { value: 35, label: "A clear task done excellently" },
      { value: 10, label: "The routine one — flow over puzzle" },
    ]},
    { text: "How much novelty per week keeps you healthy?", options: [
      { value: 90, label: "New problems weekly or I go numb" },
      { value: 55, label: "A mix — some new, some familiar" },
      { value: 20, label: "Mostly familiar — repetition is calming" },
    ]},
  ],
  meaning_impact: [
    { text: "Which result would keep you going through a hard year?", options: [
      { value: 95, label: "Concrete lives or causes visibly better off" },
      { value: 65, label: "Users genuinely helped, even indirectly" },
      { value: 35, label: "A craft well practiced and well paid" },
      { value: 10, label: "The results ledger is not where I look" },
    ]},
    { text: "A cynical-but-lucrative project lands on you. You…", options: [
      { value: 90, label: "Refuse — alignment is the point of working" },
      { value: 50, label: "Do it, but negotiate what I can live with" },
      { value: 15, label: "Do it — work is work" },
    ]},
  ],
  social: [
    { text: "Your ideal day has how much people time?", options: [
      { value: 95, label: "Mostly with people — that's the work itself" },
      { value: 65, label: "Half collaboration, half solo" },
      { value: 35, label: "Mostly solo with a few good check-ins" },
      { value: 10, label: "Deep solo focus, interaction only when needed" },
    ]},
    { text: "Which meeting would you never cancel?", options: [
      { value: 90, label: "The one where I help someone directly" },
      { value: 55, label: "The team sync that keeps us close" },
      { value: 20, label: "None — I'd trade most meetings for quiet" },
    ]},
  ],
};

// count=5: one question for each of the 5 top-ranked params.
// count=10: two for the top 3, one for the remaining 4 (3*2+4=10).
function selectFallbackJobCharQuestions(ranking, count) {
  const picks = [];
  if (count === 10) {
    for (const param of ranking.slice(0, 3)) picks.push(...JOB_CHAR_QUESTION_BANK[param]);
    for (const param of ranking.slice(3)) picks.push(JOB_CHAR_QUESTION_BANK[param][0]);
  } else {
    for (const param of ranking.slice(0, 5)) picks.push(JOB_CHAR_QUESTION_BANK[param][0]);
  }
  // Bank entries don't carry `param`; attach it from the ranking walk order.
  const paramOrder =
    count === 10
      ? [...ranking.slice(0, 3).flatMap((p) => [p, p]), ...ranking.slice(3)]
      : ranking.slice(0, 5);
  return picks.map((q, index) => ({
    id: `jc_${index + 1}`,
    param: paramOrder[index],
    text: q.text,
    options: q.options,
  }));
}

const CAREER_JOURNEY_QUESTIONS = [
  { id: "cj_education", question: "What is your education so far (field and level)?", placeholder: "e.g. BSc in economics, unfinished" },
  { id: "cj_role", question: "What is your current or most recent role?", placeholder: "e.g. shift manager at a cafe; student" },
  { id: "cj_skills", question: "What are you genuinely good at — your strongest skills?", placeholder: "Name 2–4 things" },
  { id: "cj_liked", question: "In past work or study, what did you like and dislike the most?", placeholder: "One thing you loved, one that drained you" },
  { id: "cj_constraint", question: "What is the biggest real-world constraint on your next move?", placeholder: "Money, location, family, health, visa…" },
  { id: "cj_horizon", question: "How soon do you need the change to pay off?", placeholder: "e.g. within a year; I can invest 3–4 years" },
  { id: "cj_retrain", question: "How willing are you to retrain from scratch?", placeholder: "Honestly — from 'not at all' to 'fully'" },
];
const CAREER_JOURNEY_BY_ID = new Map(CAREER_JOURNEY_QUESTIONS.map((q) => [q.id, q]));
```

Update `module.exports` to export the new names and drop the values ones.

- [ ] **Step 4: Implement questionEngine.js changes.** Delete `validateValuesAnswer`, `computeValuesScores`, `serializeValueQuestion` and the values import block (`VALUES_DIMENSIONS`, `VALUES_QUESTIONS`, `VALUES_BY_ID`). Import `JOB_CHAR_PARAM_IDS`, `CAREER_JOURNEY_BY_ID` from questionPool. Add:

```js
function validateJobCharRanking(ranking) {
  const ok =
    Array.isArray(ranking) &&
    ranking.length === JOB_CHAR_PARAM_IDS.length &&
    new Set(ranking).size === ranking.length &&
    ranking.every((id) => JOB_CHAR_PARAM_IDS.includes(id));
  if (!ok) throw httpErr(400, "ranking must order all 7 job-characteristic parameters.");
  return ranking;
}

function validateJobCharAnswer(session, itemId, value) {
  const item = (session.jobCharItems || []).find((i) => i.id === itemId);
  if (!item) throw httpErr(404, "Unknown job-characteristics question.");
  const n = Number(value);
  if (!item.options.some((o) => o.value === n)) {
    throw httpErr(400, "Answer must be one of the question's option values.");
  }
  return n;
}

function computeJobCharProfile(session) {
  const items = session.jobCharItems || [];
  const answered = items.filter((i) => session.jobCharAnswers[i.id] !== undefined).length;
  if (!items.length || answered < items.length) return { profile: null, answered };

  const profile = {};
  for (const param of JOB_CHAR_PARAM_IDS) {
    const group = items.filter((i) => i.param === param);
    profile[param] = group.length
      ? Math.round(group.reduce((s, i) => s + session.jobCharAnswers[i.id], 0) / group.length)
      : 50; // unasked (low-ranked) parameters sit at the neutral midpoint
  }
  return { profile, answered };
}

function validateCareerJourneyAnswer(questionId, value) {
  if (!CAREER_JOURNEY_BY_ID.has(questionId)) throw httpErr(404, "Unknown career-journey question.");
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) throw httpErr(400, "Answer cannot be empty.");
  return s.slice(0, 400);
}

function serializeJobCharItem(item) {
  return { id: item.id, param: item.param, text: item.text, options: item.options };
}
```

Export the new functions. NOTE: `buildProgress` and `summarizeAnswersForClient` still reference values — they are rewritten in Task 5; to keep this task green, replace their values blocks now with the Task 5 versions (shown there) or temporarily delete the values lines. Do the former to avoid churn.

- [ ] **Step 5: Run the questionEngine suite**

Run: `cd backend && node --test tests/questionEngine.test.js`
Expected: PASS. (`npm test` as a whole is still RED — sessionStore/server/prompts still import deleted values exports. That is expected mid-refactor; Tasks 5–8 restore green. Do NOT commit yet if you prefer atomic green commits — instead proceed to Task 5 and commit Tasks 4+5 together IF sessionStore work is immediate; otherwise commit now with the suite scoped note.)

- [ ] **Step 6: Commit**

```bash
git add backend/questionPool.js backend/questionEngine.js backend/tests/questionEngine.test.js
git commit -m "feat(jobchar): 7-parameter banks + scoring, career-journey bank, city; drop values inventory"
```

---

### Task 5: Session shape, mutators, serialization, progress

**Files:**
- Modify: `backend/sessionStore.js`, `backend/questionEngine.js` (buildProgress/summarize rework)
- Test: `backend/tests/sessionStore.test.js`

**Interfaces:**
- Consumes: `serializeRiasecItem`, `serializeJobCharItem` (Task 2/4), `JOB_CHAR_PARAMS`, `CAREER_JOURNEY_QUESTIONS`.
- Produces (sessionStore mutators used by server routes):
  - `createSession({ entryChoice, dreamAnswer, cvIntent })`
  - `setRiasecItems(session, items)` (resets riasec answers/scores)
  - `recordRiasecAnswer(session, itemId, value)`
  - `setRiasecScores(session, scores, code, { inferred = false } = {})`
  - `setJobCharRanking(session, ranking, depth, items)` (resets jobChar answers/profile)
  - `recordJobCharAnswer(session, itemId, value)`
  - `setJobCharProfile(session, profile)`
  - `setCvAnalysis(session, cvText, analysis)`
  - `recordCareerJourneyAnswer(session, questionId, value)`
  - Removed: `recordValuesAnswer`, `setValuesScores`.
- Produces (snapshot contract, consumed by frontend Task 10):
  - static part: `demographicQuestions`, `bigFiveItems` (id+text), `riasecItems` (id+text), `jobCharParams` (=JOB_CHAR_PARAMS), `careerJourneyQuestions`, `directionCatalog`, `refineReasons` — NO `valuesQuestions`/`valuesDimensions`.
  - dynamic part adds: `cvIntent`, `cvProvided: Boolean(session.cvText)`, `cvAnalysis`, `riasecAnswers`, `riasecScores`, `riasecCode`, `riasecInferred`, `jobCharRanking`, `jobCharDepth`, `jobCharItems` (serialized), `jobCharAnswers`, `jobCharProfile`, `careerJourneyAnswers` — and drops `valuesAnswers`/`valuesScores`. `jobCharItems` sits in the DYNAMIC part (it is small and the refine panel needs it after answer-route responses).
- Produces (questionEngine): `buildProgress(session)` → `{ step, demographics, bigFive, riasec: {answered,total}, jobChar: {ranked, answered, total}, journey: {answered, total: 7, active}, done: step === "tree" }`; `summarizeAnswersForClient` returns `{ demographics, bigFive: {...}, riasec: { scores, code, inferred }, jobChar: { ranking, profile } }`.

- [ ] **Step 1: Rewrite the affected tests.** In `backend/tests/sessionStore.test.js`: update `createSession` fixture calls to include `cvIntent: "new"`; replace assertions on `valuesAnswers/valuesScores` with the new fields; extend the "serializeSessionState exposes question lists and answers for back-navigation" test:

```js
test("createSession initializes v2 fields and serialization exposes them", () => {
  const store = new SessionStore();
  const session = store.createSession({ entryChoice: "find", dreamAnswer: "x", cvIntent: "use_skills" });
  assert.equal(session.step, "demographics");
  assert.equal(session.cvIntent, "use_skills");
  assert.equal(session.riasecInferred, false);
  assert.deepEqual(session.riasecItems, []);
  assert.equal(session.jobCharProfile, null);

  const snap = store.serializeSessionState(session, {}, {}, { includeStatic: true });
  assert.ok(Array.isArray(snap.careerJourneyQuestions) && snap.careerJourneyQuestions.length === 7);
  assert.equal(snap.jobCharParams.length, 7);
  assert.equal(snap.valuesQuestions, undefined, "values bank is gone");
  assert.equal(snap.cvProvided, false);

  const trimmed = store.serializeSessionState(session, {}, {}, { includeStatic: false });
  assert.equal(trimmed.careerJourneyQuestions, undefined);
  assert.ok("riasecAnswers" in trimmed, "dynamic riasec state always travels");
  assert.ok("jobCharItems" in trimmed, "jobChar items travel on every snapshot");
});

test("riasec items serialize without the scoring type", () => {
  const store = new SessionStore();
  const session = store.createSession({ entryChoice: "find", dreamAnswer: "x", cvIntent: "new" });
  store.setRiasecItems(session, [{ id: "ri_1", type: "R", text: "Fixing things" }]);
  const snap = store.serializeSessionState(session, {}, {}, { includeStatic: true });
  assert.deepEqual(snap.riasecItems, [{ id: "ri_1", text: "Fixing things" }]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && node --test tests/sessionStore.test.js`
Expected: FAIL — cvIntent/riasec fields undefined, valuesQuestions still present.

- [ ] **Step 3: Implement sessionStore.js.** In `createSession`, replace `valuesAnswers: {}, valuesScores: null,` with:

```js
      cvIntent: cvIntent || "new",
      cvText: null,
      cvAnalysis: null,
      riasecItems: [],
      riasecAnswers: {},
      riasecScores: null,
      riasecCode: null,
      riasecInferred: false,
      jobCharRanking: null,
      jobCharDepth: null,
      jobCharItems: [],
      jobCharAnswers: {},
      jobCharProfile: null,
      careerJourneyAnswers: {},
```

(and add `cvIntent` to the destructured argument). Replace `recordValuesAnswer`/`setValuesScores` with:

```js
  setRiasecItems(session, items) {
    session.riasecItems = items;
    session.riasecAnswers = {};
    session.riasecScores = null;
    session.riasecCode = null;
    session.riasecInferred = false;
    this.touch(session);
  }

  recordRiasecAnswer(session, itemId, value) {
    session.riasecAnswers[itemId] = value;
    this.touch(session);
  }

  setRiasecScores(session, scores, code, { inferred = false } = {}) {
    session.riasecScores = scores;
    session.riasecCode = code;
    session.riasecInferred = inferred;
    this.touch(session);
  }

  setJobCharRanking(session, ranking, depth, items) {
    session.jobCharRanking = ranking;
    session.jobCharDepth = depth;
    session.jobCharItems = items;
    session.jobCharAnswers = {};
    session.jobCharProfile = null;
    this.touch(session);
  }

  recordJobCharAnswer(session, itemId, value) {
    session.jobCharAnswers[itemId] = value;
    this.touch(session);
  }

  setJobCharProfile(session, profile) {
    session.jobCharProfile = profile;
    this.touch(session);
  }

  setCvAnalysis(session, cvText, analysis) {
    session.cvText = cvText;
    session.cvAnalysis = analysis;
    this.touch(session);
  }

  recordCareerJourneyAnswer(session, questionId, value) {
    session.careerJourneyAnswers[questionId] = value;
    this.touch(session);
  }
```

Rework the module head: drop `VALUES_QUESTIONS`/`VALUES_DIMENSIONS` imports and `SERIALIZED_VALUES_QUESTIONS`; import `JOB_CHAR_PARAMS`, `CAREER_JOURNEY_QUESTIONS` from questionPool and `serializeRiasecItem`, `serializeJobCharItem` from questionEngine (alongside `serializeDemographic`). Pre-serialize `const SERIALIZED_JOURNEY_QUESTIONS = CAREER_JOURNEY_QUESTIONS.map(({ id, question, placeholder }) => ({ id, question, placeholder }));`. In `serializeSessionState`, static part becomes:

```js
    const staticPart = includeStatic
      ? {
          demographicQuestions: SERIALIZED_DEMOGRAPHIC_QUESTIONS,
          bigFiveItems: session.bigFiveItems.map((i) => ({ id: i.id, text: i.text })),
          riasecItems: session.riasecItems.map(serializeRiasecItem),
          jobCharParams: JOB_CHAR_PARAMS,
          careerJourneyQuestions: SERIALIZED_JOURNEY_QUESTIONS,
          directionCatalog: DIRECTION_CATALOG,
          refineReasons: REFINE_REASONS,
        }
      : {};
```

and in the returned object replace `valuesAnswers`/`valuesScores` with:

```js
      cvIntent: session.cvIntent,
      cvProvided: Boolean(session.cvText),
      cvAnalysis: session.cvAnalysis,
      riasecAnswers: session.riasecAnswers,
      riasecScores: session.riasecScores,
      riasecCode: session.riasecCode,
      riasecInferred: session.riasecInferred,
      jobCharRanking: session.jobCharRanking,
      jobCharDepth: session.jobCharDepth,
      jobCharItems: session.jobCharItems.map(serializeJobCharItem),
      jobCharAnswers: session.jobCharAnswers,
      jobCharProfile: session.jobCharProfile,
      careerJourneyAnswers: session.careerJourneyAnswers,
```

- [ ] **Step 4: Rework buildProgress + summarizeAnswersForClient in questionEngine.js** (this also finishes Task 4's carve-out):

```js
function buildProgress(session) {
  const demographicTotal = DEMOGRAPHIC_QUESTIONS.length;
  const demographicAnswered = session.demographics
    ? DEMOGRAPHIC_QUESTIONS.filter((q) => session.demographics[q.id] !== undefined).length
    : 0;

  const bigFiveTotal = session.bigFiveItems ? session.bigFiveItems.length : 0;
  const bigFiveAnswered = Object.keys(session.bigFiveAnswers || {}).length;

  // journey.active: the journey question flow only applies when no CV text
  // was submitted; the frontend uses it to size the overall progress bar.
  return {
    step: session.step,
    demographics: { answered: demographicAnswered, total: demographicTotal },
    bigFive: { answered: bigFiveAnswered, total: bigFiveTotal, depth: session.bigFiveDepth },
    riasec: {
      answered: Object.keys(session.riasecAnswers || {}).length,
      total: (session.riasecItems || []).length,
      inferred: session.riasecInferred,
    },
    jobChar: {
      ranked: Boolean(session.jobCharRanking),
      answered: Object.keys(session.jobCharAnswers || {}).length,
      total: (session.jobCharItems || []).length,
    },
    journey: {
      answered: Object.keys(session.careerJourneyAnswers || {}).length,
      total: CAREER_JOURNEY_QUESTIONS.length,
      active: !session.cvText,
    },
    done: session.step === "tree",
  };
}

function summarizeAnswersForClient(session) {
  return {
    demographics: session.demographics || {},
    bigFive: {
      depth: session.bigFiveDepth,
      scores: session.bigFiveScores,
      derivedTraits: session.derivedTraits,
    },
    riasec: {
      scores: session.riasecScores,
      code: session.riasecCode,
      inferred: session.riasecInferred,
    },
    jobChar: {
      ranking: session.jobCharRanking,
      profile: session.jobCharProfile,
    },
  };
}
```

(`CAREER_JOURNEY_QUESTIONS` is already imported per Task 4; also import `DEMOGRAPHIC_QUESTIONS` as before.)

- [ ] **Step 5: Run both suites**

Run: `cd backend && node --test tests/sessionStore.test.js tests/questionEngine.test.js`
Expected: PASS. (`npm test` still red on server/prompts/aiEngine — fixed in Tasks 6–8.)

- [ ] **Step 6: Commit**

```bash
git add backend/sessionStore.js backend/questionEngine.js backend/tests/sessionStore.test.js
git commit -m "feat(session): v2 session shape, mutators, snapshot and progress"
```

---

### Task 6: Prompts — BASE_SYSTEM merge, digest v2, four new builders

**Files:**
- Modify: `backend/prompts.js`
- Test: `backend/tests/prompts.test.js`

**Interfaces:**
- Produces:
  - `buildProfileDigest({ entryChoice, dreamAnswer, cvIntent, demographics, bigFiveScores, derivedTraits, riasecScores, riasecCode, riasecInferred, jobCharRanking, jobCharProfile, cvAnalysis, cvText, careerJourneyAnswers })` → string (signature change — values params removed)
  - `buildRiasecItemsPrompt(count)` → `{ system, user }`
  - `buildRiasecInferencePrompt({ bigFiveScores, dreamAnswer })` → `{ system, user }`, schema `{"scores":{"R":0-100,...,"C":0-100}}`
  - `buildJobCharQuestionsPrompt({ ranking, count })` → `{ system, user }`, schema per v2 §5.4
  - `buildCvParsePrompt(cvText)` → `{ system, user }`, schema `{"skills":[],"domains":[],"seniority":""}`
- Deleted export: none yet (direction/narrowing/professions builders stay until Phase 3).

- [ ] **Step 1: Update `backend/tests/prompts.test.js`.** Replace values-digest assertions with the new digest content and add builder tests:

```js
const {
  buildProfileDigest,
  buildRiasecItemsPrompt,
  buildRiasecInferencePrompt,
  buildJobCharQuestionsPrompt,
  buildCvParsePrompt,
} = require("../prompts");

const DIGEST_FIXTURE = {
  entryChoice: "change",
  dreamAnswer: "open a bakery",
  cvIntent: "use_skills",
  demographics: { sex: "female", age: 34, country: "Poland", city: "Kraków" },
  bigFiveScores: { O: 80, C: 55, E: 40, A: 70, N: 45 },
  derivedTraits: { behaviourTendencies: 60, decisionPriorities: 60, summary: "Balanced." },
  riasecScores: { R: 30, I: 60, A: 85, S: 70, E: 40, C: 35 },
  riasecCode: "ASI",
  riasecInferred: false,
  jobCharRanking: ["meaning_impact", "work_mode", "compensation", "social", "complexity", "career_growth", "job_security"],
  jobCharProfile: { compensation: 45, work_mode: 90, job_security: 50, career_growth: 50, complexity: 60, meaning_impact: 95, social: 65 },
  cvAnalysis: { skills: ["pastry", "team leadership"], domains: ["food service"], seniority: "mid" },
  cvText: "…",
  careerJourneyAnswers: {},
};

test("profile digest carries city, RIASEC, ranked jobChar targets, CV signal", () => {
  const digest = buildProfileDigest(DIGEST_FIXTURE);
  assert.match(digest, /City: Kraków/);
  assert.match(digest, /code ASI \(measured\)/);
  assert.match(digest, /1\. Meaning \/ Impact: 95\/100/);
  assert.match(digest, /7\. Job Security: 50\/100/);
  assert.match(digest, /skills \[pastry, team leadership\]/);
  assert.ok(!/Values inventory/.test(digest), "old values block is gone");
});

test("digest falls back to journey summary / raw excerpt without cvAnalysis", () => {
  const journey = buildProfileDigest({
    ...DIGEST_FIXTURE,
    cvAnalysis: null,
    cvText: null,
    careerJourneyAnswers: { cj_education: "BSc economics" },
  });
  assert.match(journey, /Career journey:/);
  assert.match(journey, /BSc economics/);

  const unparsed = buildProfileDigest({ ...DIGEST_FIXTURE, cvAnalysis: { skills: [], domains: [], seniority: "" } });
  assert.match(unparsed, /CV provided \(unparsed excerpt\)/);
});

test("inferred RIASEC is flagged low-confidence in the digest", () => {
  const digest = buildProfileDigest({ ...DIGEST_FIXTURE, riasecInferred: true });
  assert.match(digest, /code ASI \(inferred, low confidence\)/);
});

test("riasec items prompt pins count and JSON schema", () => {
  const { system, user } = buildRiasecItemsPrompt(12);
  assert.match(system, /exactly 12 items/);
  assert.match(system, /"type":"R\|I\|A\|S\|E\|C"/);
  assert.match(user, /12/);
});

test("jobChar questions prompt embeds ranking order and count", () => {
  const { system, user } = buildJobCharQuestionsPrompt({ ranking: DIGEST_FIXTURE.jobCharRanking, count: 5 });
  assert.match(system, /exactly 5 questions/);
  assert.match(user, /meaning_impact, work_mode, compensation/);
});

test("cv parse prompt embeds the text and the target schema", () => {
  const { system, user } = buildCvParsePrompt("10 years as a nurse");
  assert.match(system, /"skills":\[/);
  assert.match(user, /10 years as a nurse/);
});

test("riasec inference prompt includes Big Five and dream", () => {
  const { user } = buildRiasecInferencePrompt({ bigFiveScores: DIGEST_FIXTURE.bigFiveScores, dreamAnswer: "open a bakery" });
  assert.match(user, /O=80/);
  assert.match(user, /open a bakery/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && node --test tests/prompts.test.js`
Expected: FAIL — new builders undefined / digest asserts unmatched.

- [ ] **Step 3: Implement.** In `backend/prompts.js`:

**(a)** Replace `BASE_SYSTEM` with (v2 §6.1 merged with the existing de-bias lines — keep lines 3–6 of the current array verbatim):

```js
const BASE_SYSTEM = [
  "You are an elite career strategist and life-design psychologist.",
  "This is not a quiz. You are building realistic, emotionally honest, practical futures.",
  "Integrate the user's Big Five personality, RIASEC interests, ranked job-characteristic targets, demographics, and CV or career-journey signal.",
  "You know the FULL range of human work — creative and artistic fields, science, care and healthcare, skilled trades, education, hospitality, agriculture, law and public service, sports, media, business, and technology alike.",
  "Never default to technology or tech-adjacent careers because they feel safe; recommend tech only when the user's survey profile clearly points there.",
  "The survey profile (personality, interests, targets, demographics) is the primary basis for every recommendation; the user's stated dream is emotional colour, not a domain filter.",
  "Respect all constraints. Do not hallucinate impossible paths.",
  "Tone: elegant, calm, intelligent, specific.",
  "Write concise outputs and avoid buzzwords.",
].join(" ");
```

**(b)** Add at top: `const { JOB_CHAR_PARAMS, CAREER_JOURNEY_QUESTIONS } = require("./questionPool");` and a label lookup `const JOB_CHAR_LABEL = new Map(JOB_CHAR_PARAMS.map((p) => [p.id, p.label]));` plus `const JOURNEY_QUESTION_BY_ID = new Map(CAREER_JOURNEY_QUESTIONS.map((q) => [q.id, q.question]));`.

**(c)** Rewrite `buildProfileDigest` — keep the entry/dream/demographics/BigFive/derived blocks, add `City` after `Country`, delete the values block, and append:

```js
  if (riasecScores) {
    const flag = riasecInferred ? "inferred, low confidence" : "measured";
    lines.push(
      `RIASEC interests (0–100): R=${riasecScores.R} I=${riasecScores.I} A=${riasecScores.A} ` +
        `S=${riasecScores.S} E=${riasecScores.E} C=${riasecScores.C} → code ${riasecCode} (${flag})`
    );
  }

  if (jobCharRanking && jobCharProfile) {
    lines.push("Job-characteristic targets (0–100, ranked most→least important):");
    jobCharRanking.forEach((param, index) => {
      lines.push(`${index + 1}. ${JOB_CHAR_LABEL.get(param)}: ${jobCharProfile[param]}/100`);
    });
  }

  const hasParsedCv =
    cvAnalysis && (cvAnalysis.skills?.length || cvAnalysis.domains?.length || cvAnalysis.seniority);
  if (hasParsedCv) {
    lines.push(
      `CV signal: skills [${(cvAnalysis.skills || []).join(", ")}]; ` +
        `domains [${(cvAnalysis.domains || []).join(", ")}]; seniority "${cvAnalysis.seniority || "unknown"}"`
    );
  } else if (cvText) {
    lines.push(`CV provided (unparsed excerpt): "${cvText.slice(0, 300)}"`);
  } else if (careerJourneyAnswers && Object.keys(careerJourneyAnswers).length) {
    lines.push("Career journey:");
    for (const [qId, answer] of Object.entries(careerJourneyAnswers)) {
      lines.push(`- ${JOURNEY_QUESTION_BY_ID.get(qId) || qId} → ${answer}`);
    }
  }
  if (cvIntent) {
    lines.push(
      cvIntent === "use_skills"
        ? "Intent: build on existing skills and experience."
        : "Intent: open to something completely new."
    );
  }
```

**(d)** Add the four builders:

```js
function buildRiasecItemsPrompt(count) {
  const perType = count / 6;
  const system = [
    "You generate Holland Code (RIASEC) interest items.",
    "Return valid JSON only. No prose, no markdown fences.",
    'JSON schema: {"items":[{"id":"riasec_1","type":"R|I|A|S|E|C","text":"..."}]}',
    `Generate exactly ${count} items, exactly ${perType} per type, interleaved across the six types.`,
    "Each text is a concrete activity a person rates for enjoyment on a 1–5 scale.",
    "Use concrete activities, never job titles. Keep each item under 90 characters.",
    "Vary phrasing per session; do not reuse canonical inventory wordings.",
  ].join(" ");
  return { system, user: `Generate ${count} RIASEC items now.` };
}

function buildRiasecInferencePrompt({ bigFiveScores, dreamAnswer }) {
  const system = [
    "You estimate a person's Holland RIASEC interest profile from limited signal.",
    "Return valid JSON only.",
    'JSON schema: {"scores":{"R":0,"I":0,"A":0,"S":0,"E":0,"C":0}} with each value an integer 0-100.',
    "Base the estimate on established Big Five ↔ RIASEC links (Openness→Artistic/Investigative, Extraversion→Enterprising/Social, Conscientiousness→Conventional); the dream answer only nudges.",
    "Use the full range; avoid a flat all-50 profile.",
  ].join(" ");
  const user = [
    `Big Five (0–100): O=${bigFiveScores.O} C=${bigFiveScores.C} E=${bigFiveScores.E} A=${bigFiveScores.A} N=${bigFiveScores.N}`,
    `Dream answer: ${dreamAnswer}`,
    "Estimate the RIASEC scores now.",
  ].join("\n");
  return { system, user };
}

function buildJobCharQuestionsPrompt({ ranking, count }) {
  const catalog = ranking
    .map((id, i) => `${i + 1}. ${id} — ${JOB_CHAR_LABEL.get(id)}`)
    .join("\n");
  const system = [
    "You generate job-preference questions for a ranked set of career parameters.",
    "Return valid JSON only.",
    'JSON schema: {"items":[{"id":"jc_1","param":"compensation|work_mode|job_security|career_growth|complexity|meaning_impact|social","text":"...","options":[{"value":50,"label":"..."}]}]}',
    `Generate exactly ${count} questions, weighted toward the top-ranked parameters (the most important parameter comes first and gets the most questions).`,
    "Each question is a realistic tradeoff about ONE parameter; each option encodes a 0–100 target on that parameter (value = the target).",
    "3–4 options each, labels under 90 characters, concrete situations, no buzzwords.",
  ].join(" ");
  const user = [
    `Ranking (most→least important): ${ranking.join(", ")}`,
    catalog,
    `Generate ${count} questions now.`,
  ].join("\n");
  return { system, user };
}

function buildCvParsePrompt(cvText) {
  const system = [
    "You extract a structured career signal from a raw CV text.",
    "Return valid JSON only.",
    'JSON schema: {"skills":["..."],"domains":["..."],"seniority":"..."}',
    "skills: up to 12 concrete skills. domains: up to 6 industries/fields worked in.",
    'seniority: one of "student", "junior", "mid", "senior", "lead", "executive", or a short honest label.',
    "Extract only what the text supports; do not invent.",
  ].join(" ");
  return { system, user: `CV text:\n${cvText}\n\nExtract the signal now.` };
}
```

Export all four alongside the existing exports.

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && node --test tests/prompts.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/prompts.js backend/tests/prompts.test.js
git commit -m "feat(prompts): v2 base system, digest with RIASEC/jobChar/CV, four new builders"
```

---

### Task 7: aiEngine — four new generators with normalizers + Big Five default flip

**Files:**
- Modify: `backend/aiEngine.js`
- Test: `backend/tests/aiEngine.test.js`

**Interfaces:**
- Consumes: Task 1 `getFallbackRiasecItems`, Task 3 `inferRiasecScores`, Task 4 `selectFallbackJobCharQuestions`, Task 6 builders.
- Produces (engine methods used by server routes):
  - `generateRiasecItems({ depth })` → items `[{id,type,text}]` (12 short / 18 deep)
  - `inferRiasecProfile({ session })` → `{R..C}` scores only (server derives the code)
  - `generateJobCharQuestions({ session, ranking, count })` → items `[{id,param,text,options}]`
  - `analyzeCV({ cvText })` → `{ skills, domains, seniority }` (keyless fallback: `{ skills: [], domains: [], seniority: "" }` — digest then uses the raw excerpt)
- Produces (exported for tests): `normalizeRiasecItemsPayload`, `normalizeRiasecScoresPayload`, `normalizeJobCharQuestionsPayload`, `normalizeCvAnalysisPayload`.
- Changes: `generateBigFiveItems` gate becomes `if (!client || process.env.AI_BIG_FIVE_ITEMS === "false")` (AI by default when a key exists); `buildSessionDigest` passes the new digest fields.

- [ ] **Step 1: Write the failing tests** (append to `backend/tests/aiEngine.test.js`; also update any existing fixture that passes `valuesScores` into `buildSessionDigest`-dependent methods — the fields are simply gone):

```js
const {
  normalizeRiasecItemsPayload,
  normalizeRiasecScoresPayload,
  normalizeJobCharQuestionsPayload,
  normalizeCvAnalysisPayload,
} = require("../aiEngine");
const { getFallbackRiasecItems } = require("../riasecItems");

test("normalizeRiasecItemsPayload enforces count, per-type balance, unique texts", () => {
  const good = { items: getFallbackRiasecItems("short").map(({ type, text }) => ({ type, text })) };
  const items = normalizeRiasecItemsPayload(good, 12);
  assert.equal(items.length, 12);
  assert.deepEqual(items.map((i) => i.id), items.map((_, n) => `ri_${n + 1}`));

  assert.throws(() => normalizeRiasecItemsPayload({ items: good.items.slice(0, 11) }, 12), /Expected 12/);
  const lopsided = { items: good.items.map((i) => ({ ...i, type: "R" })) };
  assert.throws(() => normalizeRiasecItemsPayload(lopsided, 12), /type R/);
  const dupes = { items: good.items.map((i) => ({ ...i, text: "Same text" })) };
  assert.throws(() => normalizeRiasecItemsPayload(dupes, 12), /Duplicate/);
});

test("normalizeRiasecScoresPayload clamps and requires all six keys", () => {
  const scores = normalizeRiasecScoresPayload({ scores: { R: -5, I: 200, A: 50.6, S: 0, E: 100, C: 33 } });
  assert.deepEqual(scores, { R: 0, I: 100, A: 51, S: 0, E: 100, C: 33 });
  assert.throws(() => normalizeRiasecScoresPayload({ scores: { R: 1, I: 2, A: 3, S: 4, E: 5 } }), /missing/i);
  assert.throws(() => normalizeRiasecScoresPayload({ scores: { R: "high", I: 2, A: 3, S: 4, E: 5, C: 6 } }), /missing|number/i);
});

test("normalizeJobCharQuestionsPayload validates params, options, and sorts by ranking", () => {
  const ranking = ["social", "compensation", "work_mode", "job_security", "career_growth", "complexity", "meaning_impact"];
  const payload = {
    items: [
      { param: "compensation", text: "Money?", options: [{ value: 90, label: "Max" }, { value: 40, label: "Med" }, { value: 10, label: "Low" }] },
      { param: "social", text: "People?", options: [{ value: 80, label: "Lots" }, { value: 20, label: "Few" }, { value: 50, label: "Some" }] },
    ],
  };
  const items = normalizeJobCharQuestionsPayload(payload, { count: 2, ranking });
  assert.equal(items[0].param, "social", "items re-sorted into ranking order");
  assert.deepEqual(items.map((i) => i.id), ["jc_1", "jc_2"]);

  assert.throws(() => normalizeJobCharQuestionsPayload({ items: [payload.items[0]] }, { count: 2, ranking }), /Expected 2/);
  const badParam = { items: [{ ...payload.items[0], param: "salary" }, payload.items[1]] };
  assert.throws(() => normalizeJobCharQuestionsPayload(badParam, { count: 2, ranking }), /param/);
  const twoOptions = { items: [{ ...payload.items[0], options: payload.items[0].options.slice(0, 2) }, payload.items[1]] };
  assert.throws(() => normalizeJobCharQuestionsPayload(twoOptions, { count: 2, ranking }), /3–4 options/);
});

test("normalizeCvAnalysisPayload trims, caps, and requires at least one skill", () => {
  const parsed = normalizeCvAnalysisPayload({
    skills: ["  welding ", "", 42, "safety"],
    domains: ["construction"],
    seniority: "senior",
  });
  assert.deepEqual(parsed, { skills: ["welding", "safety"], domains: ["construction"], seniority: "senior" });
  assert.throws(() => normalizeCvAnalysisPayload({ skills: [], domains: [], seniority: "" }), /skill/);
});

test("keyless engine: riasec items fall back to the static pool, analyzeCV to empty signal", async () => {
  const { createAiEngine } = require("../aiEngine");
  const engine = createAiEngine({ apiKey: "", model: "x" });
  const items = await engine.generateRiasecItems({ depth: "deep" });
  assert.equal(items.length, 18);
  const analysis = await engine.analyzeCV({ cvText: "whatever" });
  assert.deepEqual(analysis, { skills: [], domains: [], seniority: "" });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && node --test tests/aiEngine.test.js`
Expected: FAIL — normalizers not exported.

- [ ] **Step 3: Implement in `backend/aiEngine.js`.**

**(a)** Imports: add the new prompt builders to the `require("./prompts")` list; `const { getFallbackRiasecItems } = require("./riasecItems");`; add `selectFallbackJobCharQuestions` to the questionPool require (drop `VALUES_DIMENSIONS`); riasec require per Task 3.

**(b)** `buildSessionDigest` becomes:

```js
function buildSessionDigest(session) {
  return buildProfileDigest({
    entryChoice: session.entryChoice,
    dreamAnswer: session.dreamAnswer,
    cvIntent: session.cvIntent,
    demographics: session.demographics,
    bigFiveScores: session.bigFiveScores,
    derivedTraits: session.derivedTraits,
    riasecScores: session.riasecScores,
    riasecCode: session.riasecCode,
    riasecInferred: session.riasecInferred,
    jobCharRanking: session.jobCharRanking,
    jobCharProfile: session.jobCharProfile,
    cvAnalysis: session.cvAnalysis,
    cvText: session.cvText,
    careerJourneyAnswers: session.careerJourneyAnswers,
  });
}
```

**(c)** Normalizers (place with the other normalizers):

```js
const RIASEC_TYPES = ["R", "I", "A", "S", "E", "C"];

function normalizeRiasecItemsPayload(payload, count) {
  const raw = Array.isArray(payload?.items) ? payload.items : [];
  const items = raw
    .filter((i) => i && typeof i.text === "string" && i.text.trim() && RIASEC_TYPES.includes(i.type))
    .map((i, idx) => ({ id: `ri_${idx + 1}`, type: i.type, text: i.text.trim().slice(0, 120) }));

  if (items.length !== count) throw new Error(`Expected ${count} valid items, got ${items.length}.`);

  const seen = new Set();
  for (const item of items) {
    const key = item.text.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate RIASEC item text: "${item.text}"`);
    seen.add(key);
  }
  const perType = count / RIASEC_TYPES.length;
  for (const type of RIASEC_TYPES) {
    const n = items.filter((i) => i.type === type).length;
    if (n !== perType) throw new Error(`Expected ${perType} items of type ${type}, got ${n}.`);
  }
  return items;
}

function normalizeRiasecScoresPayload(payload) {
  const raw = payload?.scores || {};
  const scores = {};
  for (const key of RIASEC_TYPES) {
    const n = Number(raw[key]);
    if (!Number.isFinite(n)) throw new Error(`RIASEC score ${key} missing or not a number.`);
    scores[key] = Math.max(0, Math.min(100, Math.round(n)));
  }
  return scores;
}

function normalizeJobCharQuestionsPayload(payload, { count, ranking }) {
  const raw = Array.isArray(payload?.items) ? payload.items : [];
  if (raw.length !== count) throw new Error(`Expected ${count} questions, got ${raw.length}.`);

  const items = raw.map((item) => {
    if (!ranking.includes(item?.param)) throw new Error(`Invalid param: ${item?.param}`);
    const text = cleanText(item?.text);
    if (!text) throw new Error("Question missing text.");
    const options = Array.isArray(item?.options) ? item.options : [];
    if (options.length < 3 || options.length > 4) {
      throw new Error(`Question needs 3–4 options, got ${options.length}.`);
    }
    return {
      param: item.param,
      text,
      options: options.map((o) => {
        const value = Number(o?.value);
        const label = cleanText(o?.label);
        if (!Number.isFinite(value) || !label) throw new Error("Option needs a numeric value and a label.");
        return { value: Math.max(0, Math.min(100, Math.round(value))), label };
      }),
    };
  });

  // Serve questions in the user's importance order regardless of AI ordering.
  items.sort((a, b) => ranking.indexOf(a.param) - ranking.indexOf(b.param));
  return items.map((item, index) => ({ id: `jc_${index + 1}`, ...item }));
}

function normalizeCvAnalysisPayload(payload) {
  const strings = (list, max) =>
    (Array.isArray(list) ? list : [])
      .filter((s) => typeof s === "string" && s.trim())
      .map((s) => s.trim().slice(0, 60))
      .slice(0, max);
  const analysis = {
    skills: strings(payload?.skills, 12),
    domains: strings(payload?.domains, 6),
    seniority: cleanText(payload?.seniority, "").slice(0, 80),
  };
  if (!analysis.skills.length) throw new Error("CV analysis produced no skills.");
  return analysis;
}
```

**(d)** Generators inside `createAiEngine` (same try/catch-into-fallback shape as the existing ones):

```js
  async function generateRiasecItems({ depth }) {
    if (!client) return getFallbackRiasecItems(depth);
    try {
      const count = depth === "deep" ? 18 : 12;
      const { system, user } = buildRiasecItemsPrompt(count);
      const parsed = await runJsonCompletion(client, { model, system, user, temperature: 0.85 });
      return normalizeRiasecItemsPayload(parsed, count);
    } catch (error) {
      console.error("[AI riasec items fallback]", error.message);
      return getFallbackRiasecItems(depth);
    }
  }

  async function inferRiasecProfile({ session }) {
    if (!client) return inferRiasecScores(session.bigFiveScores);
    try {
      const { system, user } = buildRiasecInferencePrompt({
        bigFiveScores: session.bigFiveScores,
        dreamAnswer: session.dreamAnswer,
      });
      const parsed = await runJsonCompletion(client, { model, system, user, temperature: 0.4 });
      return normalizeRiasecScoresPayload(parsed);
    } catch (error) {
      console.error("[AI riasec inference fallback]", error.message);
      return inferRiasecScores(session.bigFiveScores);
    }
  }

  async function generateJobCharQuestions({ session, ranking, count }) {
    if (!client) return selectFallbackJobCharQuestions(ranking, count);
    try {
      const { system, user } = buildJobCharQuestionsPrompt({ ranking, count });
      const parsed = await runJsonCompletion(client, { model, system, user, temperature: 0.8 });
      return normalizeJobCharQuestionsPayload(parsed, { count, ranking });
    } catch (error) {
      console.error("[AI jobChar questions fallback]", error.message);
      return selectFallbackJobCharQuestions(ranking, count);
    }
  }

  // Keyless fallback returns an EMPTY signal on purpose: the profile digest
  // then quotes a raw excerpt instead of pretending a parse happened.
  async function analyzeCV({ cvText }) {
    const empty = { skills: [], domains: [], seniority: "" };
    if (!client) return empty;
    try {
      const { system, user } = buildCvParsePrompt(cvText);
      const parsed = await runJsonCompletion(client, { model, system, user, temperature: 0.2 });
      return normalizeCvAnalysisPayload(parsed);
    } catch (error) {
      console.error("[AI cv parse fallback]", error.message);
      return empty;
    }
  }
```

Add the four methods to the returned object and the four normalizers to `module.exports`.

**(e)** Big Five default flip — in `generateBigFiveItems` replace the gate and comment:

```js
    // AI-generated items are the default instrument (v2); the validated
    // static IPIP sets remain the fallback and can be forced with
    // AI_BIG_FIVE_ITEMS=false.
    if (!client || process.env.AI_BIG_FIVE_ITEMS === "false") {
      return getFallbackItems(depth);
    }
```

Check `backend/tests/bigFiveItems.test.js` and `aiEngine.test.js` for tests pinning the old `!== "true"` gate semantics and update them (keyless behavior is unchanged: no client → static items).

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && node --test tests/aiEngine.test.js tests/bigFiveItems.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/aiEngine.js backend/tests/aiEngine.test.js backend/tests/bigFiveItems.test.js
git commit -m "feat(ai): riasec/jobchar/cv generators with fallbacks; AI Big Five by default"
```

---

### Task 8: Server routes — step-machine rewiring + 7 new endpoints

**Files:**
- Modify: `backend/server.js`
- Test: `backend/tests/server.test.js` (rewrite `completeAssessment` + values-era assertions), `backend/tests/rateLimit.test.js` (path list if asserted)

**Interfaces:**
- Consumes: every Task 2/4/5/7 export.
- Produces (HTTP contract for frontend Tasks 10–12): routes exactly as in spec §3 (Phase-1 subset): `/api/riasec/start`, `/api/riasec/answer`, `/api/riasec/skip`, `/api/job-characteristics/rank`, `/api/job-characteristics/answer`, `/api/cv` (JSON body this task), `/api/cv/journey`. `/api/values/answer` is deleted. `POST /api/session/start` requires `cvIntent`.
- Step flow: big_five completion → `riasec`; riasec completion/skip → `job_characteristics`; jobChar completion → `cv`; cv completion → `tree`. `requireCompletedAssessment` now checks `step !== "tree"`.

- [ ] **Step 1: Rewrite the shared walk in `backend/tests/server.test.js`.** Replace `completeAssessment` with:

```js
async function completeAssessment() {
  let { data } = await post("/api/session/start", {
    entryChoice: "find",
    dreamAnswer: "build useful things",
    cvIntent: "new",
  });
  const sessionId = data.sessionId;
  const { demographicQuestions, careerJourneyQuestions } = data;

  const demoValues = { sex: "female", age: 30, country: "Testland", city: "Testville" };
  for (const q of demographicQuestions) {
    ({ data } = await post("/api/session/demographics", { sessionId, questionId: q.id, value: demoValues[q.id] }));
  }
  assert.equal(data.step, "depth_choice");

  ({ data } = await post("/api/session/big-five-depth", { sessionId, depth: "short" }));
  for (const item of data.bigFiveItems) {
    ({ data } = await post("/api/big-five/answer", { sessionId, itemId: item.id, value: 3 }));
  }
  assert.equal(data.step, "riasec");

  ({ data } = await post("/api/riasec/start", { sessionId }));
  assert.equal(data.riasecItems.length, 12);
  for (const item of data.riasecItems) {
    ({ data } = await post("/api/riasec/answer", { sessionId, itemId: item.id, value: 4 }));
  }
  assert.equal(data.step, "job_characteristics");
  assert.ok(data.riasecCode, "code derived on completion");

  const ranking = ["compensation", "work_mode", "job_security", "career_growth", "complexity", "meaning_impact", "social"];
  ({ data } = await post("/api/job-characteristics/rank", { sessionId, ranking, depth: 5 }));
  assert.equal(data.jobCharItems.length, 5);
  for (const item of data.jobCharItems) {
    ({ data } = await post("/api/job-characteristics/answer", { sessionId, itemId: item.id, value: item.options[0].value }));
  }
  assert.equal(data.step, "cv");

  for (const q of careerJourneyQuestions) {
    ({ data } = await post("/api/cv/journey", { sessionId, questionId: q.id, value: "test answer" }));
  }
  assert.equal(data.step, "tree");
  return { sessionId, data };
}
```

Then sweep the rest of the file: `valuesQuestions` assertions → `careerJourneyQuestions`/`jobCharParams` (trimming test and resume test); the resume test's `valuesQuestions.length === 40` → `careerJourneyQuestions.length === 7`; every `data.step === "complete"` → `"tree"`; the resume test in App-land is untouched here. Add new tests:

```js
test("session/start requires a valid cvIntent", async () => {
  const bad = await post("/api/session/start", { entryChoice: "find", dreamAnswer: "x" });
  assert.equal(bad.status, 400);
  const good = await post("/api/session/start", { entryChoice: "find", dreamAnswer: "x", cvIntent: "use_skills" });
  assert.equal(good.status, 200);
  assert.equal(good.data.cvIntent, "use_skills");
});

test("values route is gone", async () => {
  const res = await post("/api/values/answer", {});
  assert.equal(res.status, 404);
});

test("step guards: riasec/jobchar/cv routes reject out-of-order calls", async () => {
  const { data: start } = await post("/api/session/start", { entryChoice: "find", dreamAnswer: "x", cvIntent: "new" });
  const sessionId = start.sessionId;
  for (const [path, body] of [
    ["/api/riasec/start", { sessionId }],
    ["/api/riasec/skip", { sessionId }],
    ["/api/job-characteristics/rank", { sessionId, ranking: [], depth: 5 }],
    ["/api/cv", { sessionId, cvText: "hi" }],
    ["/api/cv/journey", { sessionId, questionId: "cj_education", value: "x" }],
  ]) {
    const res = await post(path, body);
    assert.equal(res.status, 400, `${path} must reject before its step`);
  }
});

test("riasec skip infers a low-confidence profile and advances", async () => {
  // walk to the riasec step
  let { data } = await post("/api/session/start", { entryChoice: "find", dreamAnswer: "x", cvIntent: "new" });
  const sessionId = data.sessionId;
  const demoValues = { sex: "male", age: 40, country: "Testland", city: "Testville" };
  for (const q of data.demographicQuestions) {
    ({ data } = await post("/api/session/demographics", { sessionId, questionId: q.id, value: demoValues[q.id] }));
  }
  ({ data } = await post("/api/session/big-five-depth", { sessionId, depth: "short" }));
  for (const item of data.bigFiveItems) {
    ({ data } = await post("/api/big-five/answer", { sessionId, itemId: item.id, value: 4 }));
  }
  assert.equal(data.step, "riasec");

  ({ data } = await post("/api/riasec/skip", { sessionId }));
  assert.equal(data.step, "job_characteristics");
  assert.equal(data.riasecInferred, true);
  assert.ok(data.riasecCode.length === 3);
});

test("job-characteristics/rank validates ranking permutation and depth", async () => {
  const { sessionId } = await walkToJobChar(); // helper: completeAssessment stopped after riasec — extract from completeAssessment
  let res = await post("/api/job-characteristics/rank", { sessionId, ranking: ["compensation"], depth: 5 });
  assert.equal(res.status, 400);
  res = await post("/api/job-characteristics/rank", {
    sessionId,
    ranking: ["compensation", "work_mode", "job_security", "career_growth", "complexity", "meaning_impact", "social"],
    depth: 7,
  });
  assert.equal(res.status, 400, "depth must be 5 or 10");
});

test("cv with pasted text stores analysis and reaches tree", async () => {
  const { sessionId } = await walkToCv(); // helper: completeAssessment stopped before journey
  const { data } = await post("/api/cv", { sessionId, cvText: "Nurse for 10 years, ICU team lead." });
  assert.equal(data.step, "tree");
  assert.equal(data.cvProvided, true);
  // keyless: analysis is the honest empty signal
  assert.deepEqual(data.cvAnalysis, { skills: [], domains: [], seniority: "" });
});
```

Refactor `completeAssessment` into stage helpers so the new tests can stop mid-walk — each returns `{ sessionId, data }`:

```js
async function walkToJobChar() {
  // identical to completeAssessment up to and including the riasec loop,
  // ending at assert.equal(data.step, "job_characteristics")
  let { data } = await post("/api/session/start", { entryChoice: "find", dreamAnswer: "build useful things", cvIntent: "new" });
  const sessionId = data.sessionId;
  const demoValues = { sex: "female", age: 30, country: "Testland", city: "Testville" };
  for (const q of data.demographicQuestions) {
    ({ data } = await post("/api/session/demographics", { sessionId, questionId: q.id, value: demoValues[q.id] }));
  }
  ({ data } = await post("/api/session/big-five-depth", { sessionId, depth: "short" }));
  for (const item of data.bigFiveItems) {
    ({ data } = await post("/api/big-five/answer", { sessionId, itemId: item.id, value: 3 }));
  }
  ({ data } = await post("/api/riasec/start", { sessionId }));
  for (const item of data.riasecItems) {
    ({ data } = await post("/api/riasec/answer", { sessionId, itemId: item.id, value: 4 }));
  }
  assert.equal(data.step, "job_characteristics");
  return { sessionId, data };
}

async function walkToCv() {
  const walked = await walkToJobChar();
  const { sessionId } = walked;
  const ranking = ["compensation", "work_mode", "job_security", "career_growth", "complexity", "meaning_impact", "social"];
  let { data } = await post("/api/job-characteristics/rank", { sessionId, ranking, depth: 5 });
  for (const item of data.jobCharItems) {
    ({ data } = await post("/api/job-characteristics/answer", { sessionId, itemId: item.id, value: item.options[0].value }));
  }
  assert.equal(data.step, "cv");
  return { sessionId, data };
}
```

`completeAssessment` itself becomes `walkToCv()` + the journey loop (capture `careerJourneyQuestions` from the start snapshot inside `walkToJobChar` and return it through, or re-fetch via `GET /api/session/:id`).

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && node --test tests/server.test.js`
Expected: FAIL — 404 on `/api/riasec/start`, start route not requiring cvIntent, big-five advance still `values`.

- [ ] **Step 3: Implement `backend/server.js`.**

**(a)** Imports: from questionEngine drop `validateValuesAnswer`/`computeValuesScores`, add `validateRiasecAnswer, computeRiasecScores, deriveRiasecCode, validateJobCharRanking, validateJobCharAnswer, computeJobCharProfile, validateCareerJourneyAnswer`; add `const { CAREER_JOURNEY_QUESTIONS } = require("./questionPool");` alongside `DEMOGRAPHIC_QUESTIONS`.

**(b)** aiLimiter path list — replace with:

```js
for (const path of [
  "/api/session/big-five-depth",
  "/api/riasec/start",
  "/api/riasec/skip",
  "/api/job-characteristics/rank",
  "/api/cv",
  "/api/direction/question",
  "/api/direction/confirm",
  "/api/direction/refine",
  "/api/professions/narrow",
  "/api/roadmap/generate",
]) {
  app.use(path, aiLimiter);
}
```

**(c)** `session/start`: after the dream check add

```js
  if (cvIntent !== "new" && cvIntent !== "use_skills") {
    return res.status(400).json({ error: "cvIntent must be 'new' or 'use_skills'." });
  }
```

destructure `cvIntent` from the body and pass it to `store.createSession`.

**(d)** `big-five/answer`: `store.advanceStep(session, "values")` → `store.advanceStep(session, "riasec")`.

**(e)** Delete the `/api/values/answer` route. `requireCompletedAssessment`: `session.step !== "complete"` → `session.step !== "tree"` (message: "Complete the assessment before this step.").

**(f)** New routes, placed between the big-five and direction blocks:

```js
app.post("/api/riasec/start", async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "riasec") {
      return res.status(400).json({ error: "Not currently in the RIASEC step." });
    }
    if (!session.riasecItems.length) {
      const items = await aiEngine.generateRiasecItems({ depth: session.bigFiveDepth });
      store.setRiasecItems(session, items);
    }
    // riasecItems just changed — one of the static-list snapshots.
    return sendSessionSnapshot(res, session, { includeStatic: true });
  } catch (error) {
    if (!error.statusCode) console.error("[riasec/start]", error);
    return res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Failed to start the interests quiz." });
  }
});

app.post("/api/riasec/answer", (req, res) => {
  try {
    const { sessionId, itemId, value } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "riasec") {
      return res.status(400).json({ error: "Not currently in the RIASEC step." });
    }
    const normalized = validateRiasecAnswer(session, itemId, value);
    store.recordRiasecAnswer(session, itemId, normalized);

    const { scores } = computeRiasecScores(session);
    if (scores) {
      store.setRiasecScores(session, scores, deriveRiasecCode(scores));
      store.advanceStep(session, "job_characteristics");
    }
    return sendSessionSnapshot(res, session);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post("/api/riasec/skip", async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "riasec") {
      return res.status(400).json({ error: "Not currently in the RIASEC step." });
    }
    const scores = await aiEngine.inferRiasecProfile({ session });
    store.setRiasecScores(session, scores, deriveRiasecCode(scores), { inferred: true });
    store.advanceStep(session, "job_characteristics");
    return sendSessionSnapshot(res, session);
  } catch (error) {
    if (!error.statusCode) console.error("[riasec/skip]", error);
    return res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Failed to estimate your interests." });
  }
});

app.post("/api/job-characteristics/rank", async (req, res) => {
  try {
    const { sessionId, ranking, depth } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "job_characteristics") {
      return res.status(400).json({ error: "Not currently in the job-characteristics step." });
    }
    if (session.jobCharItems.length) {
      return res.status(400).json({ error: "Ranking already submitted." });
    }
    if (depth !== 5 && depth !== 10) {
      return res.status(400).json({ error: "depth must be 5 or 10." });
    }
    const validRanking = validateJobCharRanking(ranking);
    const items = await aiEngine.generateJobCharQuestions({ session, ranking: validRanking, count: depth });
    store.setJobCharRanking(session, validRanking, depth, items);
    return sendSessionSnapshot(res, session, { includeStatic: true });
  } catch (error) {
    if (!error.statusCode) console.error("[job-characteristics/rank]", error);
    return res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Failed to build your priority questions." });
  }
});

app.post("/api/job-characteristics/answer", (req, res) => {
  try {
    const { sessionId, itemId, value } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "job_characteristics") {
      return res.status(400).json({ error: "Not currently in the job-characteristics step." });
    }
    const normalized = validateJobCharAnswer(session, itemId, value);
    store.recordJobCharAnswer(session, itemId, normalized);

    const { profile } = computeJobCharProfile(session);
    if (profile) {
      store.setJobCharProfile(session, profile);
      store.advanceStep(session, "cv");
    }
    return sendSessionSnapshot(res, session);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post("/api/cv", async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "cv") {
      return res.status(400).json({ error: "Not currently in the CV step." });
    }
    const cvText = typeof req.body.cvText === "string" ? req.body.cvText.trim().slice(0, 6000) : "";
    if (!cvText) {
      return res.status(400).json({ error: "cvText is required." });
    }
    const analysis = await aiEngine.analyzeCV({ cvText });
    store.setCvAnalysis(session, cvText, analysis);
    store.advanceStep(session, "tree");
    return sendSessionSnapshot(res, session);
  } catch (error) {
    if (!error.statusCode) console.error("[cv]", error);
    return res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Failed to analyse the CV." });
  }
});

app.post("/api/cv/journey", (req, res) => {
  try {
    const { sessionId, questionId, value } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "cv") {
      return res.status(400).json({ error: "Not currently in the CV step." });
    }
    const normalized = validateCareerJourneyAnswer(questionId, value);
    store.recordCareerJourneyAnswer(session, questionId, normalized);

    const allAnswered = CAREER_JOURNEY_QUESTIONS.every(
      (q) => session.careerJourneyAnswers[q.id] !== undefined
    );
    if (allAnswered) {
      store.advanceStep(session, "tree");
    }
    return sendSessionSnapshot(res, session);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});
```

- [ ] **Step 4: Run the FULL backend suite — this is the task that must restore green**

Run: `cd backend && npm test`
Expected: ALL PASS (including the old Page 3 flow tests, which now run on top of the new assessment walk).

- [ ] **Step 5: Commit**

```bash
git add backend/server.js backend/tests/server.test.js backend/tests/rateLimit.test.js
git commit -m "feat(api): riasec/job-characteristics/cv routes, v2 step machine, drop values route"
```

---

### Task 9: CV file upload (multipart) — extraction + route branch

**Files:**
- Create: `backend/cvExtract.js`
- Modify: `backend/server.js` (`/api/cv` route), `backend/package.json` (deps)
- Test: `backend/tests/cvExtract.test.js`, `backend/tests/server.test.js` (append)

**Interfaces:**
- Produces: `extractCvText({ originalname, mimetype, buffer })` → `Promise<string>`; throws `{statusCode: 400}` on unsupported/unreadable files. Supported: `.txt` (utf8), `.pdf` (pdf-parse), `.docx` (mammoth).
- Route: `POST /api/cv` accepts EITHER JSON `{sessionId, cvText}` OR `multipart/form-data` with fields `sessionId` + `file` (2 MB cap). Both paths converge on the same analyze/advance code.

- [ ] **Step 1: Install dependencies**

```bash
cd backend && npm install multer@^2.0.1 pdf-parse@^1.1.1 mammoth@^1.8.0
```

- [ ] **Step 2: Write the failing tests**

```js
// backend/tests/cvExtract.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { extractCvText } = require("../cvExtract");

test("txt files pass through as utf8", async () => {
  const text = await extractCvText({
    originalname: "cv.txt",
    mimetype: "text/plain",
    buffer: Buffer.from("Nurse, 10 years"),
  });
  assert.equal(text, "Nurse, 10 years");
});

test("unsupported extension -> 400-coded error", async () => {
  await assert.rejects(
    extractCvText({ originalname: "cv.jpg", mimetype: "image/jpeg", buffer: Buffer.from("x") }),
    (e) => e.statusCode === 400
  );
});

test("garbage pdf bytes -> 400-coded error", async () => {
  await assert.rejects(
    extractCvText({ originalname: "cv.pdf", mimetype: "application/pdf", buffer: Buffer.from("not a pdf") }),
    (e) => e.statusCode === 400
  );
});
```

Append to `backend/tests/server.test.js`:

```js
test("cv accepts a multipart .txt upload", async () => {
  const { sessionId } = await walkToCv();
  const form = new FormData();
  form.append("sessionId", sessionId);
  form.append("file", new Blob([Buffer.from("Welder, 8 years, certified")], { type: "text/plain" }), "cv.txt");
  const res = await fetch(`${base}/api/cv`, { method: "POST", body: form });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.step, "tree");
  assert.equal(data.cvProvided, true);
});

test("cv upload rejects unsupported file types", async () => {
  const { sessionId } = await walkToCv();
  const form = new FormData();
  form.append("sessionId", sessionId);
  form.append("file", new Blob([Buffer.from("x")], { type: "image/jpeg" }), "cv.jpg");
  const res = await fetch(`${base}/api/cv`, { method: "POST", body: form });
  assert.equal(res.status, 400);
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd backend && node --test tests/cvExtract.test.js`
Expected: FAIL — `Cannot find module '../cvExtract'`

- [ ] **Step 4: Implement `backend/cvExtract.js`**

```js
// CV file → plain text. Small on purpose: three formats, hard failures
// become 400s so the route never 500s on a user's weird file.
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

function httpErr(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}

async function extractCvText({ originalname = "", mimetype = "", buffer }) {
  const name = originalname.toLowerCase();
  try {
    if (name.endsWith(".txt") || mimetype === "text/plain") {
      return buffer.toString("utf8");
    }
    if (name.endsWith(".pdf") || mimetype === "application/pdf") {
      const { text } = await pdfParse(buffer);
      return text;
    }
    if (
      name.endsWith(".docx") ||
      mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const { value } = await mammoth.extractRawText({ buffer });
      return value;
    }
  } catch (error) {
    throw httpErr(400, "Could not read the file. Try pasting the text instead.");
  }
  throw httpErr(400, "Unsupported file type. Upload .pdf, .docx, or .txt — or paste the text.");
}

module.exports = { extractCvText };
```

- [ ] **Step 5: Wire multipart into the `/api/cv` route.** In `backend/server.js`:

```js
const multer = require("multer");
const { extractCvText } = require("./cvExtract");

const cvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});
```

Change the route signature to `app.post("/api/cv", cvUpload.single("file"), async (req, res) => {` and replace the cvText extraction lines with:

```js
    let rawText = typeof req.body.cvText === "string" ? req.body.cvText : "";
    if (req.file) {
      rawText = await extractCvText(req.file);
    }
    const cvText = rawText.trim().slice(0, 6000);
    if (!cvText) {
      return res.status(400).json({ error: "Provide cvText or upload a .pdf/.docx/.txt file." });
    }
```

Add a multer error guard after the route (Express 5 error middleware) so an oversized file returns 400 not 500:

```js
app.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: "File too large (max 2 MB) or malformed upload." });
  }
  return next(error);
});
```

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && npm test`
Expected: ALL PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/cvExtract.js backend/server.js backend/package.json backend/package-lock.json backend/tests/cvExtract.test.js backend/tests/server.test.js
git commit -m "feat(cv): pdf/docx/txt upload with 2MB cap alongside pasted text"
```

---

### Task 10: Frontend — api wrappers, entry CV intent, snapshot rework, RIASEC stage UI

**Files:**
- Modify: `frontend/src/api.js`, `frontend/src/App.jsx`

**Interfaces:**
- Produces (api.js): `startRiasec`, `submitRiasecAnswer`, `skipRiasec`, `submitJobCharRanking`, `submitJobCharAnswer`, `submitCvText`, `uploadCvFile({ sessionId, file })`, `submitJourneyAnswer` — all returning the session snapshot. `submitValuesAnswer` deleted.
- Produces (App.jsx state used by Tasks 11–12): `riasecItems/riasecAnswers/riasecIndex`, `jobCharParams/jobCharRanking/jobCharItems/jobCharAnswers/jcIndex/rankDraft`, `careerJourneyQuestions/careerJourneyAnswers/journeyIndex/journeyDraft`, `cvMode/cvDraft`, `cvIntent`; `profile` now `{ bigFiveScores, derivedTraits, riasecScores, riasecCode, riasecInferred, bigFiveDepth }`.

- [ ] **Step 1: api.js.** Delete `submitValuesAnswer`. Add:

```js
export function startRiasec(payload) {
  return request("/api/riasec/start", { method: "POST", body: JSON.stringify(payload) });
}
export function submitRiasecAnswer(payload) {
  return request("/api/riasec/answer", { method: "POST", body: JSON.stringify(payload) });
}
export function skipRiasec(payload) {
  return request("/api/riasec/skip", { method: "POST", body: JSON.stringify(payload) });
}
export function submitJobCharRanking(payload) {
  return request("/api/job-characteristics/rank", { method: "POST", body: JSON.stringify(payload) });
}
export function submitJobCharAnswer(payload) {
  return request("/api/job-characteristics/answer", { method: "POST", body: JSON.stringify(payload) });
}
export function submitCvText(payload) {
  return request("/api/cv", { method: "POST", body: JSON.stringify(payload) });
}
export function submitJourneyAnswer(payload) {
  return request("/api/cv/journey", { method: "POST", body: JSON.stringify(payload) });
}
// Multipart: the browser must set its own boundary — bypass the JSON header.
export function uploadCvFile({ sessionId, file }) {
  const form = new FormData();
  form.append("sessionId", sessionId);
  form.append("file", file);
  return request("/api/cv", { method: "POST", body: form, headers: { "Content-Type": null } });
}
```

and make `request()` drop null header values:

```js
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    for (const key of Object.keys(headers)) {
      if (headers[key] === null) delete headers[key];
    }
    const response = await fetch(path, { ...options, headers, signal: controller.signal });
```

- [ ] **Step 2: Entry screen CV intent.** In App.jsx add next to `ENTRY_OPTIONS`:

```js
const CV_INTENT_OPTIONS = [
  { value: "new", label: "Something completely new" },
  { value: "use_skills", label: "Use the skills I already have" },
];
```

Add state `const [cvIntent, setCvIntent] = useState("");`. In the entry section, after the dream textarea insert:

```jsx
          <p className="entry-prompt">Where should we start from?</p>
          <div className="entry-options">
            {CV_INTENT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`entry-option ${cvIntent === option.value ? "selected" : ""}`}
                onClick={() => setCvIntent(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
```

`handleStartSession`: guard `if (!entryChoice || !cvIntent || !dreamAnswer.trim()) return;`, pass `cvIntent` in the payload, and extend the button's `disabled` with `|| !cvIntent`. In the resume effect add `setCvIntent(data.cvIntent || "");`.

- [ ] **Step 3: Snapshot + state rework.** Delete states `valuesQuestions/valuesAnswers/valuesIndex/valuesDimensionsMeta`, the `submitValuesAnswer` import, `handleSubmitValues`, `handleBackValues`, `ValuesQuestionCard` (component + render block), the `currentValuesQuestion` derived value near the other `current*` consts, and `busy.values`. Add states:

```js
  const [riasecItems, setRiasecItems] = useState([]);
  const [riasecAnswers, setRiasecAnswers] = useState({});
  const [riasecIndex, setRiasecIndex] = useState(0);
  const [jobCharParams, setJobCharParams] = useState([]);
  const [jobCharRanking, setJobCharRanking] = useState(null);
  const [jobCharItems, setJobCharItems] = useState([]);
  const [jobCharAnswers, setJobCharAnswers] = useState({});
  const [jcIndex, setJcIndex] = useState(0);
  const [rankDraft, setRankDraft] = useState([]);
  const [careerJourneyQuestions, setCareerJourneyQuestions] = useState([]);
  const [careerJourneyAnswers, setCareerJourneyAnswers] = useState({});
  const [journeyIndex, setJourneyIndex] = useState(0);
  const [journeyDraft, setJourneyDraft] = useState("");
  const [cvMode, setCvMode] = useState("choice"); // choice | paste | journey
  const [cvDraft, setCvDraft] = useState("");
```

Extend `busy` with `riasecStart: false, riasec: false, riasecSkip: false, rank: false, jobChar: false, cv: false, journey: false`. In `applySessionSnapshot` replace the values lines with:

```js
    if (data.riasecItems) setRiasecItems(data.riasecItems);
    if (data.jobCharParams) setJobCharParams(data.jobCharParams);
    if (data.careerJourneyQuestions) setCareerJourneyQuestions(data.careerJourneyQuestions);
    setRiasecAnswers(data.riasecAnswers || {});
    setJobCharRanking(data.jobCharRanking || null);
    setJobCharItems(data.jobCharItems || []);
    setJobCharAnswers(data.jobCharAnswers || {});
    setCareerJourneyAnswers(data.careerJourneyAnswers || {});
    setProfile({
      bigFiveScores: data.bigFiveScores || null,
      derivedTraits: data.derivedTraits || null,
      riasecScores: data.riasecScores || null,
      riasecCode: data.riasecCode || null,
      riasecInferred: Boolean(data.riasecInferred),
      bigFiveDepth: data.bigFiveDepth || null,
    });
```

(keep the existing direction/professions lines — old Page 3 still lives this phase). In the resume effect replace the values index line with:

```js
        setRiasecIndex(firstUnansweredIndex(data.riasecItems || [], data.riasecAnswers));
        setJcIndex(firstUnansweredIndex(data.jobCharItems || [], data.jobCharAnswers));
        setJourneyIndex(firstUnansweredIndex(data.careerJourneyQuestions || [], data.careerJourneyAnswers));
        if (Object.keys(data.careerJourneyAnswers || {}).length) setCvMode("journey");
        const inTree =
          data.step === "tree" &&
          ((data.directionQuestions || []).length > 0 || data.direction);
```

`stepHeading`/`stepProgressText`: replace the `values` cases with:

```js
    case "riasec":              return "Interests";
    case "job_characteristics": return "What matters in a job";
    case "cv":                  return "Your experience";
    case "tree":                return "Ready";
```

```js
  if (step === "riasec")
    return `${progress.riasec.answered} / ${progress.riasec.total || "…"}`;
  if (step === "job_characteristics" && progress.jobChar.ranked)
    return `${progress.jobChar.answered} / ${progress.jobChar.total}`;
  if (step === "cv" && progress.journey.answered)
    return `${progress.journey.answered} / ${progress.journey.total}`;
```

Every remaining `step === "complete"` / `"complete"` string in App.jsx becomes `"tree"` (survey completion card condition, progress-bar hide condition). In `handleChooseDepth` drop `setValuesIndex(0)`.

- [ ] **Step 4: RIASEC stage UI.** Add next to `LIKERT`:

```js
const ENJOY_LIKERT = [
  { value: 1, label: "Not at all" },
  { value: 2, label: "Not really" },
  { value: 3, label: "Maybe" },
  { value: 4, label: "Quite a bit" },
  { value: 5, label: "Very much" },
];
```

Component (place after `BigFiveQuestionCard`):

```jsx
function RiasecQuestionCard({ q, savedValue, busy, onSubmit, onBack, canGoBack, onSkip, canSkip, progress }) {
  return (
    <div className="question-card">
      <div className="question-card-top">
        {canGoBack && (
          <button type="button" className="ghost-action back-action" onClick={onBack} disabled={busy}>
            ← Back
          </button>
        )}
        <p className="question-category">
          {progress ? `Activity ${progress.index + 1} of ${progress.total}` : "Interests"}
        </p>
      </div>
      <p className="entry-prompt">How much would you enjoy…</p>
      <h3>{q.text}</h3>
      <div className="likert-row">
        {ENJOY_LIKERT.map((l) => (
          <button
            key={l.value}
            type="button"
            className={`option-button likert-button ${savedValue === l.value ? "selected" : ""}`}
            onClick={() => onSubmit(l.value)}
            disabled={busy}
          >
            <span className="likert-value">{l.value}</span>
            <span className="likert-label">{l.label}</span>
          </button>
        ))}
      </div>
      {canSkip && (
        <button type="button" className="ghost-action" onClick={onSkip} disabled={busy}>
          Skip the quiz — estimate my interests from my answers so far
        </button>
      )}
    </div>
  );
}
```

Handlers + auto-start effect:

```js
  const handleStartRiasec = async () => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, riasecStart: true }));
    try {
      const data = await startRiasec({ sessionId });
      applySessionSnapshot(data);
      setRetryAction(null);
      setRiasecIndex(0);
    } catch (e) {
      setError(e.message || "Could not load the interests quiz.");
      setRetryAction(() => handleStartRiasec);
    } finally {
      setBusy((p) => ({ ...p, riasecStart: false }));
    }
  };

  // Item generation is server-side; kick it off the moment the step arrives.
  useEffect(() => {
    if (stage !== "survey" || step !== "riasec") return;
    if (riasecItems.length || busy.riasecStart) return;
    handleStartRiasec();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, step, riasecItems.length]);

  const handleSubmitRiasec = async (value) => {
    if (!sessionId) return;
    const item = riasecItems[riasecIndex];
    if (!item) return;
    setError("");
    setBusy((p) => ({ ...p, riasec: true }));
    try {
      const data = await submitRiasecAnswer({ sessionId, itemId: item.id, value });
      applySessionSnapshot(data);
      if (riasecIndex < riasecItems.length - 1) setRiasecIndex((i) => i + 1);
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setBusy((p) => ({ ...p, riasec: false }));
    }
  };

  const handleSkipRiasec = async () => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, riasecSkip: true }));
    try {
      const data = await skipRiasec({ sessionId });
      applySessionSnapshot(data);
    } catch (e) {
      setError(e.message || "Could not estimate interests.");
    } finally {
      setBusy((p) => ({ ...p, riasecSkip: false }));
    }
  };
```

Render block (replacing the values block position):

```jsx
          {step === "riasec" && !riasecItems.length && (
            <div className="question-card"><h3>Preparing the interests quiz…</h3></div>
          )}
          {step === "riasec" && riasecItems[riasecIndex] && (
            <RiasecQuestionCard
              q={riasecItems[riasecIndex]}
              savedValue={riasecAnswers[riasecItems[riasecIndex].id] ?? null}
              busy={busy.riasec || busy.riasecSkip}
              onSubmit={handleSubmitRiasec}
              onBack={() => setRiasecIndex((i) => Math.max(0, i - 1))}
              canGoBack={riasecIndex > 0}
              onSkip={handleSkipRiasec}
              canSkip={Object.keys(riasecAnswers).length === 0}
              progress={{ index: riasecIndex, total: riasecItems.length }}
            />
          )}
```

- [ ] **Step 5: Verify.** `cd frontend && npm test -- --run` (existing suites pass) and `npm run build` (no unused-import errors). Manual: `npm run dev`, walk entry (both chip rows required) → demographics (4 questions incl. city) → Big Five → RIASEC appears automatically, answer a few, Back works, restart and use Skip.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api.js frontend/src/App.jsx
git commit -m "feat(front): CV intent on entry, RIASEC quiz stage, v2 snapshot state"
```

---

### Task 11: Frontend — job-characteristics ranking + questions UI

**Files:**
- Modify: `frontend/src/lifePath.js`, `frontend/src/lifePath.test.js`, `frontend/src/App.jsx`, `frontend/src/App.css`

**Interfaces:**
- Produces: `moveRankItem(list, index, delta)` in lifePath.js (pure, exported); `RankCard` + `JobCharQuestionCard` components; handlers `handleSubmitRanking(depth)`, `handleSubmitJobChar(value)`.

- [ ] **Step 1: Write the failing Vitest tests** (append to `frontend/src/lifePath.test.js`):

```js
import { moveRankItem } from "./lifePath";

describe("moveRankItem", () => {
  const list = ["a", "b", "c"];
  it("swaps with the neighbour in the given direction", () => {
    expect(moveRankItem(list, 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveRankItem(list, 1, 1)).toEqual(["a", "c", "b"]);
  });
  it("returns the same list at the edges and does not mutate", () => {
    expect(moveRankItem(list, 0, -1)).toBe(list);
    expect(moveRankItem(list, 2, 1)).toBe(list);
    moveRankItem(list, 1, 1);
    expect(list).toEqual(["a", "b", "c"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npm test -- --run`
Expected: FAIL — `moveRankItem` is not exported.

- [ ] **Step 3: Implement in `frontend/src/lifePath.js`** (top-level, near `firstUnansweredIndex`):

```js
// Reorder helper for the job-characteristics ranking list. Pure: returns the
// input list unchanged when the move would fall off either end.
export function moveRankItem(list, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
```

Run: `cd frontend && npm test -- --run` → PASS.

- [ ] **Step 4: App.jsx — ranking card + question card.** Components (after `RiasecQuestionCard`):

```jsx
function RankCard({ params, ranking, onMove, busy, onChooseDepth }) {
  const byId = new Map(params.map((p) => [p.id, p]));
  return (
    <div className="question-card">
      <p className="question-category">Rank what matters</p>
      <h3>Order these from most to least important in your next job.</h3>
      <ol className="rank-list">
        {ranking.map((id, index) => (
          <li key={id} className="rank-row">
            <span className="rank-pos">{index + 1}</span>
            <span className="rank-label">
              {byId.get(id)?.label}
              <span className="rank-meaning">{byId.get(id)?.meaning}</span>
            </span>
            <span className="rank-controls">
              <button type="button" className="ghost-action" onClick={() => onMove(index, -1)} disabled={busy || index === 0} aria-label={`Move ${byId.get(id)?.label} up`}>↑</button>
              <button type="button" className="ghost-action" onClick={() => onMove(index, 1)} disabled={busy || index === ranking.length - 1} aria-label={`Move ${byId.get(id)?.label} down`}>↓</button>
            </span>
          </li>
        ))}
      </ol>
      <div className="depth-options">
        <button type="button" className="depth-card" onClick={() => onChooseDepth(5)} disabled={busy}>
          <p className="depth-title">Quick</p>
          <p className="depth-meta">5 targeted questions on your top priorities</p>
        </button>
        <button type="button" className="depth-card" onClick={() => onChooseDepth(10)} disabled={busy}>
          <p className="depth-title">Thorough</p>
          <p className="depth-meta">10 questions, finer-grained targets</p>
        </button>
      </div>
      {busy && <p className="depth-loading">Building your questions…</p>}
    </div>
  );
}

function JobCharQuestionCard({ q, savedValue, busy, onSubmit, onBack, canGoBack, progress }) {
  return (
    <div className="question-card">
      <div className="question-card-top">
        {canGoBack && (
          <button type="button" className="ghost-action back-action" onClick={onBack} disabled={busy}>
            ← Back
          </button>
        )}
        <p className="question-category">
          {progress ? `Question ${progress.index + 1} of ${progress.total}` : "Priorities"}
        </p>
      </div>
      <h3>{q.text}</h3>
      <div className="option-list">
        {q.options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`option-button ${savedValue === o.value ? "selected" : ""}`}
            onClick={() => onSubmit(o.value)}
            disabled={busy}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

Handlers + draft init:

```js
  // Seed the draggable ranking with the canonical order once the step opens.
  useEffect(() => {
    if (step !== "job_characteristics" || jobCharRanking || rankDraft.length) return;
    setRankDraft(jobCharParams.map((p) => p.id));
  }, [step, jobCharRanking, rankDraft.length, jobCharParams]);

  const handleSubmitRanking = async (depth) => {
    if (!sessionId || rankDraft.length !== 7) return;
    setError("");
    setBusy((p) => ({ ...p, rank: true }));
    try {
      const data = await submitJobCharRanking({ sessionId, ranking: rankDraft, depth });
      applySessionSnapshot(data);
      setRetryAction(null);
      setJcIndex(0);
    } catch (e) {
      setError(e.message || "Could not build the questions.");
      setRetryAction(() => () => handleSubmitRanking(depth));
    } finally {
      setBusy((p) => ({ ...p, rank: false }));
    }
  };

  const handleSubmitJobChar = async (value) => {
    if (!sessionId) return;
    const item = jobCharItems[jcIndex];
    if (!item) return;
    setError("");
    setBusy((p) => ({ ...p, jobChar: true }));
    try {
      const data = await submitJobCharAnswer({ sessionId, itemId: item.id, value });
      applySessionSnapshot(data);
      if (jcIndex < jobCharItems.length - 1) setJcIndex((i) => i + 1);
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setBusy((p) => ({ ...p, jobChar: false }));
    }
  };
```

Render block after the riasec block (import `moveRankItem` from `./lifePath`):

```jsx
          {step === "job_characteristics" && !jobCharItems.length && rankDraft.length === 7 && (
            <RankCard
              params={jobCharParams}
              ranking={rankDraft}
              onMove={(index, delta) => setRankDraft((l) => moveRankItem(l, index, delta))}
              busy={busy.rank}
              onChooseDepth={handleSubmitRanking}
            />
          )}
          {step === "job_characteristics" && jobCharItems[jcIndex] && (
            <JobCharQuestionCard
              q={jobCharItems[jcIndex]}
              savedValue={jobCharAnswers[jobCharItems[jcIndex].id] ?? null}
              busy={busy.jobChar}
              onSubmit={handleSubmitJobChar}
              onBack={() => setJcIndex((i) => Math.max(0, i - 1))}
              canGoBack={jcIndex > 0}
              progress={{ index: jcIndex, total: jobCharItems.length }}
            />
          )}
```

- [ ] **Step 5: CSS** (append to `frontend/src/App.css`):

```css
.rank-list {
  list-style: none;
  margin: 0 0 20px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rank-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 10px;
}
.rank-pos { font-weight: 600; min-width: 1.5em; text-align: center; }
.rank-label { flex: 1; display: flex; flex-direction: column; }
.rank-meaning { font-size: 12px; opacity: 0.65; }
.rank-controls { display: flex; gap: 4px; }
.rank-controls .ghost-action { min-width: 40px; min-height: 40px; }
```

- [ ] **Step 6: Verify.** `cd frontend && npm test -- --run && npm run build`. Manual dev walk: after RIASEC the ranking list appears, ↑↓ reorder works, Quick → 5 questions in ranked order, answers advance to the CV step.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lifePath.js frontend/src/lifePath.test.js frontend/src/App.jsx frontend/src/App.css
git commit -m "feat(front): job-characteristics ranking and targeted questions UI"
```

---

### Task 12: Frontend — CV stage UI + progress/copy updates

**Files:**
- Modify: `frontend/src/App.jsx`, `frontend/src/App.css`

**Interfaces:**
- Produces: `CvCard` (mode choice → paste textarea / file input / 7 journey question cards); reworked `overallProgress`; honest depth-card copy.

- [ ] **Step 1: CvCard + handlers.**

```jsx
function CvCard({ mode, setMode, cvDraft, setCvDraft, busy, onSubmitText, onUploadFile, journeyAvailable }) {
  if (mode === "choice") {
    return (
      <div className="question-card">
        <p className="question-category">Your experience</p>
        <h3>Let's factor in what you already have.</h3>
        <div className="option-list">
          <button type="button" className="option-button" onClick={() => setMode("paste")} disabled={busy}>
            Paste my CV as text
          </button>
          <label className={`option-button cv-upload ${busy ? "disabled" : ""}`}>
            Upload a file (.pdf, .docx, .txt — max 2 MB)
            <input
              type="file"
              accept=".pdf,.docx,.txt"
              hidden
              disabled={busy}
              onChange={(e) => e.target.files?.[0] && onUploadFile(e.target.files[0])}
            />
          </label>
          {journeyAvailable && (
            <button type="button" className="option-button" onClick={() => setMode("journey")} disabled={busy}>
              No CV — ask me 7 quick questions instead
            </button>
          )}
        </div>
        {busy && <p className="dock-busy">Reading your CV…</p>}
      </div>
    );
  }
  if (mode === "paste") {
    return (
      <div className="question-card">
        <div className="question-card-top">
          <button type="button" className="ghost-action back-action" onClick={() => setMode("choice")} disabled={busy}>
            ← Back
          </button>
          <p className="question-category">Your experience</p>
        </div>
        <h3>Paste your CV</h3>
        <textarea
          className="dream-input cv-input"
          value={cvDraft}
          maxLength={6000}
          onChange={(e) => setCvDraft(e.target.value)}
          placeholder="Paste the text of your CV or a summary of your experience"
        />
        <div className="question-actions single">
          <button type="button" className="primary-action" onClick={onSubmitText} disabled={busy || !cvDraft.trim()}>
            {busy ? "Analysing..." : "Analyse my CV"}
          </button>
        </div>
      </div>
    );
  }
  return null; // journey mode renders the question cards below
}
```

Handlers:

```js
  const handleSubmitCvText = async () => {
    if (!sessionId || !cvDraft.trim()) return;
    setError("");
    setBusy((p) => ({ ...p, cv: true }));
    try {
      const data = await submitCvText({ sessionId, cvText: cvDraft.trim() });
      applySessionSnapshot(data);
      setRetryAction(null);
    } catch (e) {
      setError(e.message || "Could not analyse the CV.");
      setRetryAction(() => handleSubmitCvText);
    } finally {
      setBusy((p) => ({ ...p, cv: false }));
    }
  };

  const handleUploadCv = async (file) => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, cv: true }));
    try {
      const data = await uploadCvFile({ sessionId, file });
      applySessionSnapshot(data);
      setRetryAction(null);
    } catch (e) {
      setError(e.message || "Could not read the file.");
    } finally {
      setBusy((p) => ({ ...p, cv: false }));
    }
  };

  const handleSubmitJourney = async (rawValue) => {
    if (!sessionId) return;
    const q = careerJourneyQuestions[journeyIndex];
    if (!q || !String(rawValue).trim()) return;
    setError("");
    setBusy((p) => ({ ...p, journey: true }));
    try {
      const data = await submitJourneyAnswer({ sessionId, questionId: q.id, value: String(rawValue).trim() });
      applySessionSnapshot(data);
      if (journeyIndex < careerJourneyQuestions.length - 1) {
        const nextQ = careerJourneyQuestions[journeyIndex + 1];
        setJourneyDraft(data.careerJourneyAnswers?.[nextQ.id] || "");
        setJourneyIndex((i) => i + 1);
      }
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setBusy((p) => ({ ...p, journey: false }));
    }
  };
```

Render block (after job_characteristics). The journey cards reuse `DemographicQuestionCard`'s text form pattern via a thin inline card:

```jsx
          {step === "cv" && cvMode !== "journey" && (
            <CvCard
              mode={cvMode}
              setMode={setCvMode}
              cvDraft={cvDraft}
              setCvDraft={setCvDraft}
              busy={busy.cv}
              onSubmitText={handleSubmitCvText}
              onUploadFile={handleUploadCv}
              journeyAvailable
            />
          )}
          {step === "cv" && cvMode === "journey" && careerJourneyQuestions[journeyIndex] && (
            <div className="question-card">
              <div className="question-card-top">
                <button
                  type="button"
                  className="ghost-action back-action"
                  onClick={() =>
                    journeyIndex === 0
                      ? setCvMode("choice")
                      : (setJourneyDraft(careerJourneyAnswers[careerJourneyQuestions[journeyIndex - 1].id] || ""),
                        setJourneyIndex((i) => i - 1))
                  }
                  disabled={busy.journey}
                >
                  ← Back
                </button>
                <p className="question-category">
                  Question {journeyIndex + 1} of {careerJourneyQuestions.length}
                </p>
              </div>
              <h3>{careerJourneyQuestions[journeyIndex].question}</h3>
              <form
                key={careerJourneyQuestions[journeyIndex].id}
                className="question-form"
                onSubmit={(e) => { e.preventDefault(); handleSubmitJourney(journeyDraft); }}
              >
                <textarea
                  autoFocus
                  className="question-textarea"
                  value={journeyDraft}
                  maxLength={400}
                  placeholder={careerJourneyQuestions[journeyIndex].placeholder}
                  onChange={(e) => setJourneyDraft(e.target.value)}
                  disabled={busy.journey}
                />
                <div className="question-actions single">
                  <button type="submit" className="primary-action" disabled={busy.journey || !journeyDraft.trim()}>
                    {busy.journey ? "Saving..." : "Next"}
                  </button>
                </div>
              </form>
            </div>
          )}
```

- [ ] **Step 2: Progress + copy.** Replace `overallProgress`:

```js
// One journey, one bar. Unknown-yet block sizes assume the short variants so
// the bar can only get more accurate, never jump backwards. The rank step
// counts as one "question"; the CV block counts as the 7 journey questions
// until a CV text makes them moot.
function overallProgress(progress) {
  if (!progress) return null;
  const bigFiveTotal = progress.bigFive.total || 20;
  const riasecTotal = progress.riasec.total || 12;
  const jobCharTotal = progress.jobChar.total || 5;
  const journeyTotal = progress.journey.active ? progress.journey.total : 0;
  const total = progress.demographics.total + bigFiveTotal + riasecTotal + 1 + jobCharTotal + journeyTotal;
  const answered =
    progress.demographics.answered +
    progress.bigFive.answered +
    progress.riasec.answered +
    (progress.jobChar.ranked ? 1 : 0) +
    progress.jobChar.answered +
    (progress.journey.active ? progress.journey.answered : 0);
  if (!total) return null;
  return { answered, total, percent: Math.min(100, Math.round((answered / total) * 100)) };
}
```

`DepthChoiceCard` meta copy becomes: short — `"20 personality questions • 3–5 minutes"` / `"≈50 questions overall • ~12 minutes to your paths"`; deep — `"50 personality questions • 8–12 minutes"` / `"≈90 questions overall • ~22 minutes to your paths"`.

CSS append: `.cv-input { min-height: 180px; }` and `.cv-upload input { display: none; }`.

- [ ] **Step 3: Verify.** `cd frontend && npm test -- --run && npm run build`. Manual dev walk of both CV paths (paste + journey) through to the "Ready" card, then `Run Life Path Engine` — the OLD direction flow must still work end-to-end (keyless fallback questions appear, tie card, professions, roadmap).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.css
git commit -m "feat(front): CV stage (paste/upload/journey), v2 progress bar and estimates"
```

---

### Task 13: ProfileCharts — RIASEC bars replace the values panel

**Files:**
- Modify: `frontend/src/components/ProfileCharts.jsx`, `frontend/src/App.jsx` (call site)

**Interfaces:**
- Produces: `RiasecBarChart({ scores, code, inferred })`; `ProfilePanel({ profile, onClose })` — the `dimensions` prop is deleted.

- [ ] **Step 1: Implement.** In `ProfileCharts.jsx` replace `ValuesBarChart` with:

```jsx
const RIASEC_AXES = [
  { key: "R", label: "Realistic (hands-on)" },
  { key: "I", label: "Investigative (thinking)" },
  { key: "A", label: "Artistic (creating)" },
  { key: "S", label: "Social (helping)" },
  { key: "E", label: "Enterprising (leading)" },
  { key: "C", label: "Conventional (organizing)" },
];

export function RiasecBarChart({ scores, code, inferred }) {
  if (!scores) return null;

  const data = RIASEC_AXES.map((axis) => ({
    id: axis.key,
    name: axis.label,
    value: scores[axis.key] ?? 0,
  }));

  return (
    <div className="profile-chart">
      <p className="profile-chart-title">
        Interests (Holland {code ? `· ${code}` : ""}{inferred ? " · estimated" : ""})
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
          <XAxis type="number" domain={[0, 100]} tickCount={6} tick={{ fontSize: 10, fill: MUTED }} />
          <YAxis
            type="category"
            dataKey="name"
            width={158}
            interval={0}
            tick={{ fontSize: 11, fill: MUTED }}
            tickLine={false}
            axisLine={false}
          />
          <Bar dataKey="value" barSize={10} radius={[0, 2, 2, 0]} isAnimationActive={false}>
            {data.map((entry) => (
              <Cell key={entry.id} fill={entry.value >= 65 ? ACCENT : ACCENT_SOFT} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {inferred && (
        <p className="profile-panel-note">Estimated from your personality answers — take it as a sketch.</p>
      )}
    </div>
  );
}
```

`ProfilePanel`: destructure `{ bigFiveScores, derivedTraits, riasecScores, riasecCode, riasecInferred, bigFiveDepth }`; guard becomes `if (!bigFiveScores && !riasecScores) return null;`; replace `<ValuesBarChart …/>` with `<RiasecBarChart scores={riasecScores} code={riasecCode} inferred={riasecInferred} />`; drop the `dimensions` parameter.

- [ ] **Step 2: Call site.** In App.jsx the `<ProfilePanel profile={profile} dimensions={valuesDimensionsMeta} …/>` usage drops `dimensions` (the `valuesDimensionsMeta` state is already gone since Task 10 — if any reference survived, this build catches it).

- [ ] **Step 3: Verify + commit**

Run: `cd frontend && npm test -- --run && npm run build`
Manual: profile panel on Page 3 shows the radar + RIASEC bars (and "estimated" when the quiz was skipped).

```bash
git add frontend/src/components/ProfileCharts.jsx frontend/src/App.jsx
git commit -m "feat(front): RIASEC interest bars replace the values panel"
```

---

### Task 14: Docs sync + full keyless E2E verification

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `backend/.env.example`

- [ ] **Step 1: Docs.**
- `CLAUDE.md`: rewrite the "Survey flow (Pages 1–2)" section to the v2 step machine (entry gains `cvIntent`; steps `demographics(4, incl. city) → depth_choice → big_five → riasec → job_characteristics → cv → tree`); note the values inventory is gone; module list gains `riasecItems.js`, `cvExtract.js`; contracts section: RIASEC `type` never serialized, jobChar answer = one of the option values, `AI_BIG_FIVE_ITEMS=false` forces static items (AI now default); testing section: new route/scoring suites.
- `README.md`: update the API route list (add the 7 new routes, drop `/api/values/answer`).
- `backend/.env.example`: change the `AI_BIG_FIVE_ITEMS` comment to "set to false to force the static validated IPIP sets (AI-generated items are the default when a key is present)".

- [ ] **Step 2: Full verification.**

```bash
cd backend && npm test                     # expect: all suites green
cd ../frontend && npm test -- --run && npm run build
```

Then a live keyless walk (backend without `OPENAI_API_KEY`): `npm run dev`, complete entry → all Page-2 steps (try RIASEC skip on one run, quiz on another; CV paste on one, journey on another) → "Ready" → old Page 3 still generates direction questions → professions → roadmap. Also reload mid-RIASEC and mid-jobChar to confirm resume lands on the right card.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md README.md backend/.env.example
git commit -m "docs: v2 assessment flow, routes, AI_BIG_FIVE_ITEMS default flip"
```

---

## Phase boundaries (for the next plans)

- **Phase 2 plan** (next): `backend/schwartzValues.js` + `inferUserValues`/`scoreProfessionValues` generators + `userValues` computed at the `cv → tree` transition. Pure backend, no UI.
- **Phase 3 plan** (last): Oriented Field / 1st Output routes + Yes/No refinement loop + graph rework + SchwartzMap; deletes the direction/narrowing/professions flow and its tests.




