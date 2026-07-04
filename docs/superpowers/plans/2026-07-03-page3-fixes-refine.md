# Page 3 Fixes + Direction Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the five reported Page 3 problems: opaque dock cards + delayed Me intro (P1/P2), persistent multi-roadmap rendering (P3), no animation replay on clicks (P4), and a direction-refinement flow with structured reason + free text + manual picker after 2 rejections (P5).

**Architecture:** Backend swaps the single `session.roadmap` for a `roadmaps` map keyed by professionId (per-profession caching) and adds refine/choose routes on the existing fallback-safe engine pattern. Frontend renders every roadmap simultaneously with per-profession namespaced node ids (this alone removes the unmount/remount that caused both "graphs disappear" and "animation replays"), and extends the dock's card chain with refine and picker cards.

**Tech Stack:** unchanged — Express 5 CommonJS + node:test; React 19 + Vite + @xyflow/react + framer-motion. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-03-page3-fixes-refine-design.md`.

## Global Constraints

- Pages 1–2 untouched (the global `.question-card` rule in App.css is NOT modified — the background fix goes on the scoped `.graph-question-dock .question-card` rule). ConfirmModal untouched. `session.step` never advances past `"complete"`.
- Refine reason values exactly: `"environment" | "interests" | "too_technical" | "prospects"`. `feedbackText` optional, trimmed, max 500 chars.
- Manual picker appears only after **2** rejections; rejected directions are excluded from AI refinement, from `/api/direction/choose`, and from the picker list.
- Roadmap node/edge ids namespaced: `stage-${professionId}-${stage.id}`.
- All UI copy and AI content in English. Every AI call keeps a deterministic fallback (flow works with `OPENAI_API_KEY` unset).
- Gates per commit: `cd backend && npm test` green (backend tasks) and `cd frontend && npx vite build && npm run lint` green (frontend tasks). Commit messages end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## Current-State Anchors (verified @ b607d71)

- `sessionStore.js`: `roadmap: null` in createSession; `setRoadmap` assigns `session.roadmap` + `pathStage = "roadmap"`; `serializeSessionState` exposes `roadmap`.
- `server.js` roadmap route guard: `if (!session.roadmap || session.roadmap.professionId !== session.selectedProfession.id)`. Imports from `./directions`: `{ computeDirection }` only.
- `App.jsx`: state `const [roadmap, setRoadmap] = useState(null);` `buildLifePathGraph({ direction, professionOptions, selectedProfessionId, roadmap, roadmapPending, ... })` renders the chain only when `roadmap.professionId === anchor.id`, node ids `stage-${stage.id}`; focus derivation uses `roadmapVisible = Boolean(roadmap && selectedProfession && roadmap.professionId === selectedProfession.id)`; the dockCard chain's second branch is `else if (!direction && proposedDirection)` (key "proposal").
- `BranchEdge.jsx`: `const EDGE_DRAW_MS = 600;` and flow path `style={{ '--flow-delay': \`${delay + EDGE_DRAW_MS}ms\`, fill: 'none' }}`.
- `GraphPage.css`: `.graph-question-dock .question-card { box-shadow: 0 8px 40px rgba(0, 0, 0, 0.08); margin: 0; pointer-events: auto; }` (no background).
- `NodeComponent.css`: `.me-ring circle { ... animation: ring-draw 700ms cubic-bezier(0.65, 0, 0.35, 1) forwards; }` and `.node-me-label { opacity: 0; animation: me-label-fade 400ms ease-out 700ms forwards; }`.
- `server.test.js` asserts `data.roadmap.professionId` / `data.roadmap.stages[0].title` (must be updated in Task 4). `sessionStore.test.js` asserts `s.roadmap`/`setRoadmap` single-object behavior (updated in Task 2).

## File Map

| File | Tasks | Change |
|---|---|---|
| `backend/directions.js` | 1 | `computeDirection(..., excludeIds)`, `REFINE_REASON_VALUES` |
| `backend/prompts.js` | 1 | `buildDirectionRefinePrompt` |
| `backend/tests/directions.test.js`, `backend/tests/prompts.test.js` | 1 | new cases |
| `backend/sessionStore.js` | 2 | `roadmaps` map, rejection fields/method, `directionCatalog` in serialize |
| `backend/tests/sessionStore.test.js` | 2 | updated + new cases |
| `backend/aiEngine.js` | 3 | `refineDirection` + fallback + normalizer |
| `backend/tests/aiEngine.test.js` | 3 | new cases |
| `backend/server.js` | 4 | roadmap map caching, `/api/direction/refine`, `/api/direction/choose`, proposal reason |
| `backend/tests/server.test.js` | 4 | updated roadmap assertions + refine/choose tests |
| `frontend/src/components/GraphView/GraphPage.css` | 5 | dock card background, `.dock-textarea` |
| `frontend/src/components/GraphView/NodeComponent.css` | 5 | Me intro delays |
| `frontend/src/api.js` | 5 | `refineDirection`, `chooseDirection` |
| `frontend/src/App.jsx` | 6, 7 | multi-roadmap rendering + flowDelayMs; refine/picker cards + handlers |
| `frontend/src/components/GraphView/BranchEdge.jsx` | 6 | `data.flowDelayMs` |

---

### Task 1: `directions.js` exclusion + refine reasons + refine prompt

**Files:**
- Modify: `backend/directions.js`
- Modify: `backend/prompts.js`
- Modify: `backend/tests/directions.test.js`, `backend/tests/prompts.test.js` (append tests)

**Interfaces:**
- Produces: `computeDirection(questions, answers, excludeIds = [])` (backward compatible — 2-arg calls unchanged); `REFINE_REASON_VALUES = ["environment", "interests", "too_technical", "prospects"]`; `buildDirectionRefinePrompt({ profileDigest, directionDigest, rejectedDirections, reasonChoice, feedbackText }) -> { system, user }`.

- [ ] **Step 1: Append failing tests**

To `backend/tests/directions.test.js` (also add `REFINE_REASON_VALUES` to the require at the top):

```js
test("computeDirection excludeIds: excluded direction gets no votes and cannot win", () => {
  const result = computeDirection(QUESTIONS, { dir_q1: "a", dir_q2: "a", dir_q3: "b" }, ["tech"]);
  assert.notEqual(result.id, "tech");
  // remaining single votes tie -> catalog order among non-excluded voted dirs
  assert.equal(result.id, "business");
});

test("computeDirection excludeIds: no votes left falls back to first non-excluded catalog direction", () => {
  const result = computeDirection(QUESTIONS, {}, ["tech"]);
  assert.equal(result.id, "healthcare");
});

test("REFINE_REASON_VALUES is the fixed four-value list", () => {
  assert.deepEqual(REFINE_REASON_VALUES, ["environment", "interests", "too_technical", "prospects"]);
});
```

(Vote check for the first test: answers a/a/b vote tech, tech, business → excluding tech leaves business=1 → business wins.)

To `backend/tests/prompts.test.js`:

```js
test("refine prompt excludes rejected ids, includes feedback, and demands the refine schema", () => {
  const { system, user } = prompts.buildDirectionRefinePrompt({
    profileDigest: PROFILE,
    directionDigest: "Q -> A",
    rejectedDirections: [{ id: "tech", label: "Programming & Technology" }],
    reasonChoice: "interests",
    feedbackText: "I want to work with people",
  });
  assert.match(system, /"directionId"/);
  assert.match(system, /"reason"/);
  assert.match(system, /MUST NOT be any of: tech/);
  assert.doesNotMatch(system, /- tech: Programming/);
  assert.match(system, /- healthcare:/);
  assert.match(user, /I want to work with people/);
  assert.match(user, /interests/);
  assert.match(user, /Programming & Technology/);
});
```

- [ ] **Step 2: Run to verify RED**

Run: `cd backend && node --test tests/directions.test.js tests/prompts.test.js`
Expected: FAIL (excludeIds ignored / `buildDirectionRefinePrompt` undefined).

- [ ] **Step 3: Implement**

In `backend/directions.js`, replace the whole `computeDirection` function with:

```js
// Deterministic Stage A resolution: each answered option votes for its
// directionId; most votes wins; ties break by catalog order (strict > while
// iterating DIRECTIONS keeps the earliest). No answers -> first direction.
// excludeIds removes rejected directions from both voting and the fallback.
function computeDirection(questions, answers, excludeIds = []) {
  const excluded = new Set(excludeIds);
  const counts = new Map();

  for (const question of questions) {
    const chosen = answers[question.id];
    if (chosen === undefined) continue;
    const option = question.options.find((o) => o.value === chosen);
    if (!option || !option.directionId) continue;
    if (excluded.has(option.directionId)) continue;
    counts.set(option.directionId, (counts.get(option.directionId) || 0) + 1);
  }

  let best = null;
  for (const dir of DIRECTIONS) {
    if (excluded.has(dir.id)) continue;
    const count = counts.get(dir.id) || 0;
    if (count > 0 && (best === null || count > best.count)) {
      best = { id: dir.id, label: dir.label, count };
    }
  }

  if (!best) {
    const firstAvailable = DIRECTIONS.find((dir) => !excluded.has(dir.id)) || DIRECTIONS[0];
    return { id: firstAvailable.id, label: firstAvailable.label };
  }
  return { id: best.id, label: best.label };
}
```

Add above `module.exports`:

```js
// Validated server-side; display labels live in the frontend refine card.
const REFINE_REASON_VALUES = ["environment", "interests", "too_technical", "prospects"];
```

and extend `module.exports` with `REFINE_REASON_VALUES`.

In `backend/prompts.js`, add after `buildDirectionQuestionsPrompt`:

```js
function buildDirectionRefinePrompt({
  profileDigest,
  directionDigest,
  rejectedDirections,
  reasonChoice,
  feedbackText,
}) {
  const rejectedIds = rejectedDirections.map((d) => d.id);
  const allowed = DIRECTIONS.filter((d) => !rejectedIds.includes(d.id));

  const system = [
    BASE_SYSTEM,
    "The user rejected the proposed professional direction. Pick ONE different direction from the catalog that better matches their feedback.",
    "Return valid JSON only and no extra keys.",
    'JSON schema: {"directionId":"","reason":""}',
    "directionId MUST be one of:",
    allowed.map((d) => `- ${d.id}: ${d.label} (${d.examples})`).join("\n"),
    `directionId MUST NOT be any of: ${rejectedIds.join(", ") || "(none)"}.`,
    "reason: 1-2 sentences in English, addressed directly to the user, explaining why this direction fits their feedback better.",
  ].join("\n");

  const user = [
    `Rejected direction(s): ${rejectedDirections.map((d) => d.label).join(", ") || "(none)"}`,
    `What felt off (user's choice): ${reasonChoice}`,
    `What the user says they actually want: ${feedbackText || "(not provided)"}`,
    "Direction quiz answers:",
    directionDigest || "(none)",
    "Profile:",
    profileDigest,
  ].join("\n\n");

  return { system, user };
}
```

and add `buildDirectionRefinePrompt` to `module.exports`.

- [ ] **Step 4: Run to verify GREEN**

Run: `cd backend && npm test`
Expected: all suites pass (existing 28 + new 4).

- [ ] **Step 5: Commit**

```bash
git add backend/directions.js backend/prompts.js backend/tests/directions.test.js backend/tests/prompts.test.js
git commit -m "feat(backend): direction exclusion tally, refine reasons, refine prompt"
```

---

### Task 2: `sessionStore.js` — roadmaps map + rejection state

**Files:**
- Modify: `backend/sessionStore.js`
- Modify: `backend/tests/sessionStore.test.js`

**Interfaces:**
- Consumes: `DIRECTIONS` from `./directions` (new import).
- Produces: session fields `roadmaps: {}`, `rejectedDirections: []`, `refineNotes: []` (field `roadmap` REMOVED); `setRoadmap(session, roadmap)` inserts into the map by `roadmap.professionId` (preserving other entries) + `pathStage = "roadmap"`; `rejectProposedDirection(session, note)` pushes `{id,label}` of the current proposal to `rejectedDirections`, pushes `note` to `refineNotes`, nulls `proposedDirection`; `serializeSessionState` exposes `roadmaps`, `rejectedDirections`, `directionCatalog` (8×`{id,label}`) and no `roadmap` key.

- [ ] **Step 1: Update tests**

In `backend/tests/sessionStore.test.js`:

(a) In the `createSession` test, replace `assert.equal(s.roadmap, null);` with:

```js
  assert.deepEqual(s.roadmaps, {});
  assert.deepEqual(s.rejectedDirections, []);
  assert.deepEqual(s.refineNotes, []);
  assert.equal("roadmap" in s, false);
```

(b) In the "narrowing, professions, selection, roadmap setters" test, replace the `setRoadmap` block at the end with:

```js
  store.setRoadmap(s, { professionId: "prof_1", stages: [{ id: "stage_1", title: "t", description: "d", timeframe: "", milestone: "" }] });
  assert.equal(s.pathStage, "roadmap");
  assert.equal(s.roadmaps.prof_1.professionId, "prof_1");

  store.setRoadmap(s, { professionId: "prof_2", stages: [{ id: "stage_1", title: "t2", description: "d", timeframe: "", milestone: "" }] });
  assert.equal(Object.keys(s.roadmaps).length, 2, "second roadmap must not evict the first");
  assert.equal(s.roadmaps.prof_1.stages[0].title, "t");
```

(c) In the serialize test, replace `assert.equal(snapshot.roadmap, null);` with:

```js
  assert.deepEqual(snapshot.roadmaps, {});
  assert.deepEqual(snapshot.rejectedDirections, []);
  assert.equal(snapshot.directionCatalog.length, 8);
  for (const entry of snapshot.directionCatalog) {
    assert.deepEqual(Object.keys(entry).sort(), ["id", "label"]);
  }
  assert.equal("roadmap" in snapshot, false);
```

(d) Append a new test:

```js
test("rejectProposedDirection records the rejection and clears the proposal", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  store.setProposedDirection(s, { id: "tech", label: "Programming & Technology", reason: "r" });
  store.rejectProposedDirection(s, { reasonChoice: "interests", feedbackText: "people work" });
  assert.deepEqual(s.rejectedDirections, [{ id: "tech", label: "Programming & Technology" }]);
  assert.deepEqual(s.refineNotes, [{ reasonChoice: "interests", feedbackText: "people work" }]);
  assert.equal(s.proposedDirection, null);
});
```

- [ ] **Step 2: Run to verify RED** — `cd backend && node --test tests/sessionStore.test.js` → FAIL.

- [ ] **Step 3: Implement in `backend/sessionStore.js`**

(a) Top of file, after the crypto require:

```js
const { DIRECTIONS } = require("./directions");

const DIRECTION_CATALOG = DIRECTIONS.map(({ id, label }) => ({ id, label }));
```

(b) In `createSession`, replace `roadmap: null,` with:

```js
      roadmaps: {},
      rejectedDirections: [],
      refineNotes: [],
```

(c) Replace the `setRoadmap` method with:

```js
  setRoadmap(session, roadmap) {
    session.roadmaps[roadmap.professionId] = roadmap;
    session.pathStage = "roadmap";
    this.touch(session);
  }
```

and add after `setProposedDirection`:

```js
  rejectProposedDirection(session, note) {
    if (session.proposedDirection) {
      session.rejectedDirections.push({
        id: session.proposedDirection.id,
        label: session.proposedDirection.label,
      });
    }
    session.refineNotes.push(note);
    session.proposedDirection = null;
    this.touch(session);
  }
```

(d) In `serializeSessionState`, replace `roadmap: session.roadmap,` with:

```js
      roadmaps: session.roadmaps,
      rejectedDirections: session.rejectedDirections,
      directionCatalog: DIRECTION_CATALOG,
```

- [ ] **Step 4: Run tests** — `cd backend && node --test tests/sessionStore.test.js` → PASS. (Full `npm test` fails in `server.test.js` until Task 4 — expected mid-refactor, same pattern as previous plans.)

- [ ] **Step 5: Commit**

```bash
git add backend/sessionStore.js backend/tests/sessionStore.test.js
git commit -m "feat(backend): per-profession roadmaps map and direction rejection state"
```

---

### Task 3: `aiEngine.js` — refineDirection

**Files:**
- Modify: `backend/aiEngine.js`
- Modify: `backend/tests/aiEngine.test.js` (append)

**Interfaces:**
- Consumes: Task 1 (`computeDirection` with excludeIds, `buildDirectionRefinePrompt`), Task 2 session fields (`rejectedDirections`, `directionQuestions`, `directionAnswers`).
- Produces: engine method `refineDirection({ session, reasonChoice, feedbackText }) -> { id, label, reason }` — never a rejected id; fallback reason exactly "Based on your quiz answers, this is your next strongest match."

- [ ] **Step 1: Append failing tests to `backend/tests/aiEngine.test.js`**

```js
test("refineDirection fallback: excludes rejected ids and carries a reason", async () => {
  const session = fakeSession({
    directionQuestions: [
      { id: "dir_q1", text: "q", options: [
        { value: "a", label: "A", directionId: "tech" },
        { value: "b", label: "B", directionId: "design" },
      ]},
    ],
    directionAnswers: { dir_q1: "a" },
    rejectedDirections: [{ id: "tech", label: "Programming & Technology" }],
  });
  const refined = await engine.refineDirection({ session, reasonChoice: "interests", feedbackText: "" });
  assert.notEqual(refined.id, "tech");
  assert.ok(DIRECTION_IDS.includes(refined.id));
  assert.equal(refined.reason, "Based on your quiz answers, this is your next strongest match.");
});

test("refineDirection fallback: all quiz votes rejected -> first non-rejected catalog direction", async () => {
  const session = fakeSession({
    directionQuestions: [],
    directionAnswers: {},
    rejectedDirections: [
      { id: "tech", label: "x" },
      { id: "healthcare", label: "y" },
    ],
  });
  const refined = await engine.refineDirection({ session, reasonChoice: "environment", feedbackText: "" });
  assert.equal(refined.id, "design");
});
```

(`fakeSession` already exists in the file; it spreads `overrides`, so passing `rejectedDirections` just works.)

- [ ] **Step 2: RED** — `cd backend && node --test tests/aiEngine.test.js` → FAIL (`refineDirection` not a function).

- [ ] **Step 3: Implement in `backend/aiEngine.js`**

(a) Imports: add `buildDirectionRefinePrompt` to the `./prompts` require and `computeDirection` to the `./directions` require.

(b) Module-level, after `fallbackRoadmap`:

```js
function fallbackRefineDirection(session) {
  const rejectedIds = session.rejectedDirections.map((d) => d.id);
  const next = computeDirection(session.directionQuestions, session.directionAnswers, rejectedIds);
  return {
    ...next,
    reason: "Based on your quiz answers, this is your next strongest match.",
  };
}
```

(c) Module-level, after `normalizeRoadmapPayload`:

```js
function normalizeRefinePayload(payload, rejectedIds) {
  const directionId = payload?.directionId;
  if (!DIRECTION_IDS.includes(directionId) || rejectedIds.includes(directionId)) {
    throw new Error(`Invalid refined directionId: ${directionId}`);
  }
  const dir = getDirection(directionId);
  return {
    id: dir.id,
    label: dir.label,
    reason: cleanText(payload?.reason, "This direction better matches what you described."),
  };
}
```

(d) Inside `createAiEngine`, after `generateRoadmap`:

```js
  async function refineDirection({ session, reasonChoice, feedbackText }) {
    if (!client) {
      return fallbackRefineDirection(session);
    }

    try {
      const prompts = buildDirectionRefinePrompt({
        profileDigest: buildSessionDigest(session),
        directionDigest: buildAnswersDigest(session.directionQuestions, session.directionAnswers),
        rejectedDirections: session.rejectedDirections,
        reasonChoice,
        feedbackText,
      });
      const parsed = await runJsonCompletion(client, {
        model,
        system: prompts.system,
        user: prompts.user,
        temperature: 0.7,
      });
      return normalizeRefinePayload(parsed, session.rejectedDirections.map((d) => d.id));
    } catch (error) {
      console.error("[AI refine direction fallback]", error.message);
      return fallbackRefineDirection(session);
    }
  }
```

and add `refineDirection` to the returned object.

- [ ] **Step 4: GREEN** — `cd backend && node --test tests/aiEngine.test.js` → PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/aiEngine.js backend/tests/aiEngine.test.js
git commit -m "feat(backend): direction refinement engine with exclusion-aware fallback"
```

---

### Task 4: `server.js` — roadmap map caching + refine/choose routes

**Files:**
- Modify: `backend/server.js`
- Modify: `backend/tests/server.test.js`

**Interfaces:**
- Consumes: Tasks 1–3 (`getDirection`, `REFINE_REASON_VALUES`, `rejectProposedDirection`, `refineDirection`, `roadmaps` map).
- Produces HTTP contract: snapshot now carries `roadmaps` (map), `rejectedDirections`, `directionCatalog`; `POST /api/direction/refine {sessionId, reasonChoice, feedbackText}` and `POST /api/direction/choose {sessionId, directionId}`; `/api/roadmap/generate` caches per profession and never discards other professions' roadmaps; the tally proposal carries `reason`.

- [ ] **Step 1: Update + append integration tests in `backend/tests/server.test.js`**

(a) In the full-flow test, replace the Stage D block (from `// Stage D: roadmap` through the cached-repeat assertion) with:

```js
  // Stage D: roadmap (map keyed by professionId)
  ({ status, data } = await post("/api/roadmap/generate", { sessionId }));
  assert.equal(status, 200);
  assert.equal(data.pathStage, "roadmap");
  assert.ok(data.roadmaps[chosen.id], "roadmap stored under its professionId");
  assert.ok(data.roadmaps[chosen.id].stages.length >= 4);

  // cached: repeat call returns the same stages
  const firstStageTitle = data.roadmaps[chosen.id].stages[0].title;
  ({ data } = await post("/api/roadmap/generate", { sessionId }));
  assert.equal(data.roadmaps[chosen.id].stages[0].title, firstStageTitle);

  // second profession: selecting + generating keeps the first roadmap
  const other = data.professionOptions.find((p) => p.id !== chosen.id);
  ({ data } = await post("/api/professions/select", { sessionId, professionId: other.id }));
  assert.ok(data.roadmaps[chosen.id], "first roadmap survives selecting another profession");
  ({ data } = await post("/api/roadmap/generate", { sessionId }));
  assert.ok(data.roadmaps[other.id], "second roadmap generated");
  assert.ok(data.roadmaps[chosen.id], "first roadmap still present");
  assert.equal(Object.keys(data.roadmaps).length, 2);
```

(b) Append a new test at the end of the file:

```js
test("direction refinement: reject twice, then manual choose", async () => {
  const { sessionId } = await completeAssessment();
  let { data } = await post("/api/direction/question", { sessionId });
  for (const q of data.directionQuestions) {
    ({ data } = await post("/api/direction/answer", { sessionId, questionId: q.id, value: q.options[0].value }));
  }
  assert.ok(data.proposedDirection.reason, "tally proposal carries a reason");
  const first = data.proposedDirection.id;

  // guards
  let res = await post("/api/direction/refine", { sessionId, reasonChoice: "nope", feedbackText: "" });
  assert.equal(res.status, 400, "invalid reason rejected");

  // reject #1
  ({ data } = await post("/api/direction/refine", { sessionId, reasonChoice: "interests", feedbackText: "I want to work with people" }));
  assert.equal(data.rejectedDirections.length, 1);
  assert.equal(data.rejectedDirections[0].id, first);
  assert.notEqual(data.proposedDirection.id, first);
  assert.ok(data.proposedDirection.reason);
  const second = data.proposedDirection.id;

  // reject #2
  ({ data } = await post("/api/direction/refine", { sessionId, reasonChoice: "environment", feedbackText: "" }));
  assert.equal(data.rejectedDirections.length, 2);
  assert.notEqual(data.proposedDirection.id, first);
  assert.notEqual(data.proposedDirection.id, second);

  // choose: rejected id -> 400; valid -> proposal "Chosen by you."
  res = await post("/api/direction/choose", { sessionId, directionId: first });
  assert.equal(res.status, 400);
  const pick = data.directionCatalog.find(
    (d) => ![first, second].includes(d.id)
  );
  ({ data } = await post("/api/direction/choose", { sessionId, directionId: pick.id }));
  assert.equal(data.proposedDirection.id, pick.id);
  assert.equal(data.proposedDirection.reason, "Chosen by you.");

  // confirm still works after choose
  ({ data } = await post("/api/direction/confirm", { sessionId }));
  assert.equal(data.direction.id, pick.id);
});

test("refine guards: no proposal and confirmed direction", async () => {
  const { sessionId } = await completeAssessment();
  // no proposal yet
  let res = await post("/api/direction/refine", { sessionId, reasonChoice: "interests", feedbackText: "" });
  assert.equal(res.status, 400);

  // confirm a direction, then refine/choose must 400
  let { data } = await post("/api/direction/question", { sessionId });
  for (const q of data.directionQuestions) {
    ({ data } = await post("/api/direction/answer", { sessionId, questionId: q.id, value: q.options[0].value }));
  }
  await post("/api/direction/confirm", { sessionId });
  res = await post("/api/direction/refine", { sessionId, reasonChoice: "interests", feedbackText: "" });
  assert.equal(res.status, 400);
  res = await post("/api/direction/choose", { sessionId, directionId: "media" });
  assert.equal(res.status, 400);
});
```

- [ ] **Step 2: RED** — `cd backend && node --test tests/server.test.js` → FAIL.

- [ ] **Step 3: Implement in `backend/server.js`**

(a) Extend the directions import:

```js
const { computeDirection, getDirection, REFINE_REASON_VALUES } = require("./directions");
```

(b) In `/api/direction/answer`, replace the `store.setProposedDirection(...)` call inside `if (allAnswered)` with:

```js
      store.setProposedDirection(session, {
        ...computeDirection(session.directionQuestions, session.directionAnswers),
        reason: "Your answers across the quiz point most strongly to this direction.",
      });
```

(c) In `/api/roadmap/generate`, replace the cache guard with:

```js
    if (!session.roadmaps[session.selectedProfession.id]) {
      const roadmap = await aiEngine.generateRoadmap({ session });
      store.setRoadmap(session, roadmap);
    }
```

(d) Insert two routes after `/api/direction/confirm`:

```js
app.post("/api/direction/refine", async (req, res) => {
  try {
    const { sessionId, reasonChoice, feedbackText } = req.body || {};
    const session = store.require(sessionId);
    requireCompletedAssessment(session);

    if (session.direction) {
      return res.status(400).json({ error: "Direction already confirmed." });
    }
    if (!session.proposedDirection) {
      return res.status(400).json({ error: "No proposed direction to refine." });
    }
    if (!REFINE_REASON_VALUES.includes(reasonChoice)) {
      return res.status(400).json({ error: "Invalid reason." });
    }

    const note = {
      reasonChoice,
      feedbackText: typeof feedbackText === "string" ? feedbackText.trim().slice(0, 500) : "",
    };

    store.rejectProposedDirection(session, note);

    const refined = await aiEngine.refineDirection({
      session,
      reasonChoice: note.reasonChoice,
      feedbackText: note.feedbackText,
    });
    store.setProposedDirection(session, refined);

    return sendSessionSnapshot(res, session);
  } catch (error) {
    console.error("[direction/refine]", error);
    return res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Failed to refine direction." });
  }
});

app.post("/api/direction/choose", (req, res) => {
  try {
    const { sessionId, directionId } = req.body || {};
    const session = store.require(sessionId);
    requireCompletedAssessment(session);

    if (session.direction) {
      return res.status(400).json({ error: "Direction already confirmed." });
    }
    const chosen = getDirection(directionId);
    if (!chosen) {
      return res.status(400).json({ error: "Unknown direction." });
    }
    if (session.rejectedDirections.some((d) => d.id === directionId)) {
      return res.status(400).json({ error: "You already rejected this direction." });
    }

    store.setProposedDirection(session, {
      id: chosen.id,
      label: chosen.label,
      reason: "Chosen by you.",
    });

    return sendSessionSnapshot(res, session);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});
```

- [ ] **Step 4: Full suite GREEN** — `cd backend && npm test` → every file passes; this closes the Task 2 mid-refactor note.

- [ ] **Step 5: Commit**

```bash
git add backend/server.js backend/tests/server.test.js
git commit -m "feat(backend): refine/choose direction routes and per-profession roadmap caching"
```

---

### Task 5: CSS fixes (P1/P2) + api client

**Files:**
- Modify: `frontend/src/components/GraphView/GraphPage.css`
- Modify: `frontend/src/components/GraphView/NodeComponent.css`
- Modify: `frontend/src/api.js` (append)

**Interfaces:**
- Produces: opaque dock cards; delayed Me intro; `.dock-textarea` style (used by Task 7); `refineDirection({sessionId, reasonChoice, feedbackText})`, `chooseDirection({sessionId, directionId})`.

- [ ] **Step 1: `GraphPage.css`** — in the `.graph-question-dock .question-card` rule add `background: var(--color-bg);` as the first declaration:

```css
.graph-question-dock .question-card {
  background: var(--color-bg);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.08);
  margin: 0;
  pointer-events: auto;
}
```

Append at end of file:

```css
.dock-card .dock-textarea {
  width: 100%;
  min-height: 72px;
  resize: vertical;
  border: 1px solid var(--color-border);
  border-radius: 2px;
  padding: 10px 12px;
  font-family: inherit;
  font-size: 13px;
  color: var(--color-text);
  background: var(--color-bg);
}

.dock-card .dock-textarea:focus {
  outline: none;
  border-color: var(--color-accent);
}
```

- [ ] **Step 2: `NodeComponent.css`** — delay the Me intro so the dock card (350ms enter) lands first. Replace:

```css
  animation: ring-draw 700ms cubic-bezier(0.65, 0, 0.35, 1) forwards;
```
with
```css
  animation: ring-draw 700ms cubic-bezier(0.65, 0, 0.35, 1) 450ms forwards;
```

and in `.node-me-label` replace:

```css
  animation: me-label-fade 400ms ease-out 700ms forwards;
```
with
```css
  animation: me-label-fade 400ms ease-out 1150ms forwards;
```

- [ ] **Step 3: `frontend/src/api.js`** — append:

```js
export function refineDirection(payload) {
  return request("/api/direction/refine", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function chooseDirection(payload) {
  return request("/api/direction/choose", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
```

- [ ] **Step 4: Verify** — `cd frontend && npx vite build 2>&1 | tail -3 && npm run lint` → green/clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/GraphView/GraphPage.css frontend/src/components/GraphView/NodeComponent.css frontend/src/api.js
git commit -m "fix(frontend): opaque dock cards, delayed Me intro, refine/choose api client"
```

---

### Task 6: `App.jsx` multi-roadmap rendering + `BranchEdge` flowDelayMs (P3/P4)

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/GraphView/BranchEdge.jsx`

**Interfaces:**
- Consumes: snapshot `roadmaps` (Task 4), existing timing constants.
- Produces: `buildLifePathGraph({ direction, professionOptions, selectedProfessionId, roadmaps, roadmapPending, onProfessionOpen, onStageOpen })`; edge `data.flowDelayMs` contract (BranchEdge no longer hardcodes `+600`); roadmap ids `stage-${professionId}-${stage.id}`; state `roadmaps` (object) replaces `roadmap`.

- [ ] **Step 1: `buildLifePathGraph` edits (App.jsx)**

(a) Signature: rename the `roadmap` param to `roadmaps`.

(b) `me → direction` edge — add `flowDelayMs`:

```jsx
  edges.push({
    id: "me-direction",
    source: "me",
    target: "direction",
    type: "branch",
    data: { delay: 0, active: true, flowDelayMs: EDGE_DRAW_MS },
  });
```

(c) Profession edge — active when selected OR when its roadmap exists; flow catches up fast (these edges only ever activate long after their line drew):

```jsx
    edges.push({
      id: `direction-${profession.id}`,
      source: "direction",
      target: profession.id,
      type: "branch",
      data: {
        delay: edgeDelay,
        active: profession.id === selectedProfessionId || Boolean(roadmaps[profession.id]),
        flowDelayMs: 150,
      },
    });
```

(d) Replace everything from `const anchorIndex = ...` to the end of the roadmap `if` block (the loading-node block and the single-roadmap chain) with:

```jsx
  const selectedIndex = professionOptions.findIndex((p) => p.id === selectedProfessionId);

  if (roadmapPending && selectedIndex !== -1) {
    const anchor = professionOptions[selectedIndex];
    const anchorX = professionX(selectedIndex, professionOptions.length);
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

  // Every built roadmap stays on the graph, each under its own profession.
  Object.entries(roadmaps).forEach(([professionId, professionRoadmap]) => {
    const profIndex = professionOptions.findIndex((p) => p.id === professionId);
    if (profIndex === -1) return;
    const chainX = professionX(profIndex, professionOptions.length);

    professionRoadmap.stages.forEach((stage, index) => {
      const nodeId = `stage-${professionId}-${stage.id}`;
      const parentId =
        index === 0
          ? professionId
          : `stage-${professionId}-${professionRoadmap.stages[index - 1].id}`;
      const edgeDelay = index * ROADMAP_STEP_MS;
      nodes.push({
        id: nodeId,
        type: "roadmap",
        position: { x: chainX, y: ROADMAP_START_Y + index * ROADMAP_GAP },
        draggable: true,
        style: { "--appear-delay": `${edgeDelay + EDGE_DRAW_MS}ms` },
        data: {
          index: index + 1,
          title: stage.title,
          timeframe: stage.timeframe,
          last: index === professionRoadmap.stages.length - 1,
          onOpen: () => onStageOpen(stage, index),
        },
      });
      edges.push({
        id: `${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
        type: "branch",
        data: { delay: edgeDelay, active: true, flowDelayMs: edgeDelay + EDGE_DRAW_MS },
      });
    });
  });
```

- [ ] **Step 2: State + snapshot + call-site edits (App.jsx)**

(a) Replace `const [roadmap, setRoadmap] = useState(null);` with `const [roadmaps, setRoadmaps] = useState({});`

(b) In `applySessionSnapshot`, replace `setRoadmap(data.roadmap || null);` with `setRoadmaps(data.roadmaps || {});`

(c) In `resetAll`, replace `setRoadmap(null);` with `setRoadmaps({});`

(d) In the `buildLifePathGraph` call, replace the `roadmap,` argument with `roadmaps,`.

(e) Replace the focus/hint derivation block:

```jsx
  const selectedRoadmap = selectedProfession ? roadmaps[selectedProfession.id] : null;
  const roadmapVisible = Boolean(selectedRoadmap);

  const treeHint = !direction
    ? "Answer the questions to find your direction"
    : professionOptions.length === 0
      ? "Direction locked — now narrow it down"
      : roadmapVisible
        ? "Your roadmap — click any step for details"
        : "Click a profession to continue";

  let focusKey = "start";
  let focusNodeIds = ["me"];
  if (roadmapVisible) {
    focusKey = `roadmap-${selectedProfession.id}`;
    focusNodeIds = [
      selectedProfession.id,
      ...selectedRoadmap.stages.map((s) => `stage-${selectedProfession.id}-${s.id}`),
    ];
  } else if (professionOptions.length > 0) {
    focusKey = "professions";
    focusNodeIds = ["direction", ...professionOptions.map((p) => p.id)];
  } else if (direction) {
    focusKey = "direction";
    focusNodeIds = ["me", "direction"];
  }
```

- [ ] **Step 3: `BranchEdge.jsx`** — delete the module constant `const EDGE_DRAW_MS = 600;` (and its comment) and replace the two data reads + flow style:

```jsx
  const delay = data?.delay ?? 0;
  const active = Boolean(data?.active);
  const flowDelay = data?.flowDelayMs ?? 600;
```

and the flow path becomes:

```jsx
      {active && (
        <path
          d={edgePath}
          className="branch-edge-flow"
          style={{ '--flow-delay': `${flowDelay}ms`, fill: 'none' }}
        />
      )}
```

- [ ] **Step 4: Verify** — `cd frontend && npx vite build 2>&1 | tail -3 && npm run lint` → green/clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/GraphView/BranchEdge.jsx
git commit -m "fix(frontend): persistent multi-roadmap rendering without animation replay"
```

---

### Task 7: `App.jsx` refine + picker dock cards (P5)

**Files:**
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: Task 5 api functions + `.dock-textarea` style, Task 4 snapshot fields (`rejectedDirections`, `directionCatalog`, `proposedDirection.reason`).
- Produces: the refine UX; no interfaces consumed later.

- [ ] **Step 1: Imports + module const**

Add `chooseDirection` and `refineDirection` to the `./api` import list (alphabetical position). After the `REDUCED_MOTION` const add:

```jsx
// Values must match REFINE_REASON_VALUES on the backend.
const REFINE_REASONS = [
  { value: "environment", label: "Wrong day-to-day environment" },
  { value: "interests", label: "Doesn't match my real interests" },
  { value: "too_technical", label: "Too technical / not my style" },
  { value: "prospects", label: "Worried about pay & prospects" },
];
```

- [ ] **Step 2: State (inside `App()`)**

After the `selectedProfession`/`roadmaps` state block add:

```jsx
  const [rejectedDirections, setRejectedDirections] = useState([]);
  const [directionCatalog, setDirectionCatalog] = useState([]);
  const [refineMode, setRefineMode] = useState(false);
  const [refineReason, setRefineReason] = useState("");
  const [refineText, setRefineText] = useState("");
```

Add `refine: false,` to the `busy` initial object AND to `resetAll`'s reset object. In `applySessionSnapshot` add:

```jsx
    setRejectedDirections(data.rejectedDirections || []);
    setDirectionCatalog(data.directionCatalog || []);
```

In `resetAll` add:

```jsx
    setRejectedDirections([]);
    setDirectionCatalog([]);
    setRefineMode(false);
    setRefineReason("");
    setRefineText("");
```

- [ ] **Step 3: Handlers** — insert after `handleConfirmDirection`:

```jsx
  const handleOpenRefine = () => {
    setRefineMode(true);
    setRefineReason("");
    setRefineText("");
  };

  const handleRefineDirection = async () => {
    if (!sessionId || !refineReason) return;
    setError("");
    setBusy((p) => ({ ...p, refine: true }));
    try {
      const data = await refineDirection({
        sessionId,
        reasonChoice: refineReason,
        feedbackText: refineText.trim(),
      });
      applySessionSnapshot(data);
      setRefineMode(false);
      setRefineReason("");
      setRefineText("");
    } catch (e) {
      setError(e.message || "Could not refine direction.");
    } finally {
      setBusy((p) => ({ ...p, refine: false }));
    }
  };

  const handleChooseDirection = async (directionId) => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, refine: true }));
    try {
      const data = await chooseDirection({ sessionId, directionId });
      applySessionSnapshot(data);
      setRefineMode(false);
    } catch (e) {
      setError(e.message || "Could not choose direction.");
    } finally {
      setBusy((p) => ({ ...p, refine: false }));
    }
  };
```

- [ ] **Step 4: dockCard chain** — replace the single `else if (!direction && proposedDirection) { ... key: "proposal" ... }` branch with these three branches (order matters):

```jsx
    } else if (!direction && refineMode && rejectedDirections.length < 2) {
      dockCard = {
        key: "refine",
        content: (
          <div className="question-card dock-card">
            <p className="question-category">Let's get this right</p>
            <h3>
              What feels off about {proposedDirection ? proposedDirection.label : "this direction"}?
            </h3>
            <div className="option-list">
              {REFINE_REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  className={`option-button ${refineReason === r.value ? "selected" : ""}`}
                  onClick={() => setRefineReason(r.value)}
                  disabled={busy.refine}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <textarea
              className="dock-textarea"
              value={refineText}
              placeholder="Tell me what you actually want — interests, environment, anything…"
              onChange={(e) => setRefineText(e.target.value)}
              disabled={busy.refine}
            />
            <div className="question-actions single">
              <button
                type="button"
                className="primary-action"
                onClick={handleRefineDirection}
                disabled={busy.refine || !refineReason}
              >
                {busy.refine ? "Thinking…" : "Suggest another direction"}
              </button>
            </div>
          </div>
        ),
      };
    } else if (!direction && refineMode && rejectedDirections.length >= 2) {
      dockCard = {
        key: "direction-pick",
        content: (
          <div className="question-card dock-card">
            <p className="question-category">Pick your direction</p>
            <h3>Choose the one that feels right</h3>
            <p className="dock-subtext">Your roadmap will build from whichever you pick.</p>
            <div className="option-list">
              {directionCatalog
                .filter((d) => !rejectedDirections.some((r) => r.id === d.id))
                .map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className="option-button"
                    onClick={() => handleChooseDirection(d.id)}
                    disabled={busy.refine}
                  >
                    {d.label}
                  </button>
                ))}
            </div>
          </div>
        ),
      };
    } else if (!direction && proposedDirection) {
      dockCard = {
        key: "proposal",
        content: (
          <div className="question-card dock-card">
            <p className="question-category">Direction found</p>
            <h3>{proposedDirection.label}</h3>
            <p className="dock-subtext">
              {proposedDirection.reason ||
                "Based on your profile and answers, this is your strongest broad direction."}
            </p>
            <div className="question-actions">
              <button
                type="button"
                className="primary-action"
                onClick={handleConfirmDirection}
                disabled={busy.confirmDirection}
              >
                {busy.confirmDirection ? "Confirming…" : "Confirm this direction"}
              </button>
              <button
                type="button"
                className="ghost-action"
                onClick={handleOpenRefine}
                disabled={busy.confirmDirection}
              >
                Not quite right
              </button>
            </div>
          </div>
        ),
      };
    }
```

(The refine/picker branches come BEFORE the proposal branch so `refineMode` wins while a proposal is still present. The proposal card's actions div drops the `single` modifier because it now holds two buttons.)

- [ ] **Step 5: Verify** — `cd frontend && npx vite build 2>&1 | tail -3 && npm run lint` → green/clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(frontend): direction refinement flow with reason, free text, and manual picker"
```

---

### Task 8: Full verification sweep

**Files:** none (verification only; fix regressions in place if found).

- [ ] **Step 1:** `cd backend && npm test` — all suites green. `cd frontend && npx vite build 2>&1 | tail -3 && npm run lint` — green/clean.

- [ ] **Step 2: Playwright checklist** (dev servers, blank-key fallback; drive Page 1 → 63 answers → Page 3):
1. **P1/P2:** dock `.question-card` computed `background-color` is `rgb(255,255,255)` on all three DIRECTION questions; Me ring animation has a 450ms delay (node label invisible at t<1.1s); ConfirmModal unchanged (own overlay).
2. **P5:** proposal card shows a reason line + "Not quite right"; refine card has 4 reason options + textarea; submit returns a different direction with a new reason; second reject → third proposal; "Not quite right" again → picker excludes both rejected; choose → "Chosen by you." proposal → confirm works.
3. **P3:** build roadmap for profession A; click profession B → A's chain still on the graph ("Not now" too); generate for B → both chains visible side by side (12 roadmap nodes), each under its own profession.
4. **P4:** while doing (3): A's chain must NOT re-animate when B generates (sample `.node--roadmap` opacity of A's nodes = 1 throughout); clicking a roadmap step (DetailPanel) restarts nothing; only B's new chain cascades.
5. Flow paths: after both roadmaps exist — `.branch-edge-flow` count = 1 (me→dir) + 2 (both profession edges) + 12 (two chains) = 15; profession-edge flow appears fast (~150ms) after activation.

- [ ] **Step 3:** Commit any fixes (`fix(frontend): verification fixes` / `fix(backend): ...`); otherwise nothing to commit.

---

## Self-Review Notes (already applied)

1. **Problem coverage:** P1/P2 → Task 5 (+8.1); P3 → Tasks 2, 4, 6 (+8.3); P4 → Task 6 (persistent rendering + flowDelayMs) (+8.4); P5 → Tasks 1–4, 7 (+8.2).
2. **Contract consistency:** `roadmaps` map shape identical across sessionStore (T2), server tests (T4), App state/build (T6); refine reason values identical in directions.js (T1), server guard (T4), frontend card (T7); namespaced stage ids identical in build (T6) and focus derivation (T6); `flowDelayMs` produced (T6a-c) and consumed (T6 Step 3) with default 600 preserving me→direction/chain semantics.
3. **Order-of-branches bug avoided:** refine/picker dockCard branches precede the proposal branch, else `refineMode` could never show while a proposal exists.
4. **Test updates included** for every asserting file whose contract changes (sessionStore, server); aiEngine roadmap tests unchanged because `generateRoadmap`'s return shape is untouched (the map lives in the store).
5. **Known cosmetic tradeoff (accepted):** `.question-actions` without `single` for the two-button proposal card relies on App.css's default flex layout for that class — verified visually in Task 8.2.


