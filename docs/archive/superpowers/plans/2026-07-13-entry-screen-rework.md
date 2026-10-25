# Entry Screen Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The entry screen keeps only two required free-text questions ("Why are you here?" + the dream question); the use_skills/new choice moves to the CV slide behind a new `POST /api/cv/intent` route.

**Architecture:** `entryChoice` is replaced end-to-end by a free-text `whyHereAnswer` (validated like `dreamAnswer`, fed to the profile digest). `cvIntent` leaves `createSession` (starts `null`) and is set at the CV step via a dedicated step-guarded route; the CV path buttons stay disabled until the snapshot carries an intent.

**Tech Stack:** Node + Express 5 (CommonJS), node:test; React 19 + Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-13-entry-screen-rework-design.md`
**Branch:** `feat/entry-screen-rework` (already created off `main`; spec committed as `f4447a9`).

## Global Constraints

- Both entry answers are required, trimmed, capped at 500 chars; 400 on empty.
- `POST /api/cv/intent` is NOT an AI route — global rate limiter only; re-selection while on the `cv` step is allowed.
- The digest prints `Why they are here:` only when `whyHereAnswer` is present, and the `Intent:` line only when `cvIntent` is set (old Redis sessions must not break).
- `fallbackWhyThisFits` in `aiEngine.js` is untouched.
- Snapshot stays the single source of truth; `cvIntent` in the snapshot drives the CV-slide highlight and unlock.
- Test commands: `cd backend && npm test`, `cd frontend && npm test -- --run`, `cd frontend && npm run build`.
- Commit after every task, ending messages with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Backend — `whyHereAnswer` replaces `entryChoice`

**Files:**
- Modify: `backend/server.js` (start route, delete `isValidEntryChoice`)
- Modify: `backend/sessionStore.js` (`createSession`, `serializeSessionState`)
- Modify: `backend/prompts.js` (`buildProfileDigest`)
- Modify: `backend/aiEngine.js` (`buildSessionDigest`)
- Test: `backend/tests/server.test.js`, `backend/tests/rateLimit.test.js`, `backend/tests/prompts.test.js`, `backend/tests/aiEngine.test.js`, `backend/tests/sessionStore.test.js`

**Interfaces:**
- Produces: `POST /api/session/start` body `{whyHereAnswer, dreamAnswer}`; `session.whyHereAnswer` (string), `session.cvIntent` starts `null`; snapshot field `whyHereAnswer` (no `entryChoice`); `createSession({whyHereAnswer, dreamAnswer})`. Task 2 adds the intent setter; Task 3 consumes the snapshot fields.

- [ ] **Step 1: Update the tests (fail first)**

Global payload swap in `backend/tests/server.test.js` and `backend/tests/rateLimit.test.js` — every `post("/api/session/start", {...})` body replaces `entryChoice: "find", ... cvIntent: "..."` with `whyHereAnswer`:

```bash
cd backend
sed -i 's/entryChoice: "find",/whyHereAnswer: "figure out what fits me",/g; s/ cvIntent: "new" }/ }/g; s/ cvIntent: "use_skills" }/ }/g; s/,\n    cvIntent: "new",//' tests/server.test.js tests/rateLimit.test.js
```

Then fix the remaining multi-line bodies and assertions by hand:

In `tests/server.test.js` — `walkToJobChar` start body becomes:

```js
  let { data } = await post("/api/session/start", {
    whyHereAnswer: "figure out what fits me",
    dreamAnswer: "build useful things",
  });
```

(Same shape in `rateLimit.test.js` lines ~35 and ~54: drop the `cvIntent` line, swap `entryChoice` for `whyHereAnswer`.)

Replace the `"session/start requires a valid cvIntent"` test with:

```js
test("session/start requires both free-text answers and caps them at 500", async () => {
  let res = await post("/api/session/start", { dreamAnswer: "x" });
  assert.equal(res.status, 400, "whyHereAnswer required");
  res = await post("/api/session/start", { whyHereAnswer: "   ", dreamAnswer: "x" });
  assert.equal(res.status, 400, "blank whyHereAnswer rejected");
  res = await post("/api/session/start", { whyHereAnswer: "y", dreamAnswer: "" });
  assert.equal(res.status, 400, "dreamAnswer required");

  const long = "w".repeat(10_000);
  res = await post("/api/session/start", { whyHereAnswer: long, dreamAnswer: "x" });
  assert.equal(res.status, 200);
  assert.equal(res.data.whyHereAnswer.length, 500, "capped like dreamAnswer");
  assert.equal("entryChoice" in res.data, false, "entryChoice gone from the snapshot");
  assert.equal(res.data.cvIntent, null, "intent not chosen yet");
});
```

In the resume test (`GET /api/session/:id ...`): replace
`assert.equal(snapshot.entryChoice, "find");` with
`assert.equal(snapshot.whyHereAnswer, "figure out what fits me");` and
`assert.equal(snapshot.cvIntent, "use_skills");` with
`assert.equal(snapshot.cvIntent, null);`.

In `tests/prompts.test.js` — `DIGEST_FIXTURE`: replace `entryChoice: "change",` with `whyHereAnswer: "I want out of my dead-end job",`; add to the main digest test:

```js
  assert.match(digest, /Why they are here: "I want out of my dead-end job"/);
  assert.ok(!/Entry intent/.test(digest), "entryChoice line is gone");
```

In `tests/aiEngine.test.js` — `fakeSession`: replace `entryChoice: "find",` with `whyHereAnswer: "find my direction",` (keep `cvIntent: "new"` — the session field still exists and `fallbackWhyThisFits` reads it).

In `tests/sessionStore.test.js` — `makeSession` becomes:

```js
function makeSession(store) {
  return store.createSession({ whyHereAnswer: "figure out what fits me", dreamAnswer: "build things" });
}
```

In the first `createSession` test: replace `assert.equal(s.entryChoice, "find");` with `assert.equal(s.whyHereAnswer, "figure out what fits me");` and `assert.equal(s.cvIntent, "new");` with `assert.equal(s.cvIntent, null);`. In the `"createSession initializes v2 fields..."` test: the call becomes `store.createSession({ whyHereAnswer: "x", dreamAnswer: "x" })` and `assert.equal(session.cvIntent, "use_skills");` becomes `assert.equal(session.cvIntent, null);`.

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npm test 2>&1 | grep -E "fail [0-9]"`
Expected: several failures (start route still demands `entryChoice`/`cvIntent`).

- [ ] **Step 3: Implement**

`backend/server.js` — delete the `isValidEntryChoice` function; replace the start route body:

```js
app.post("/api/session/start", (req, res) => {
  const { whyHereAnswer, dreamAnswer } = req.body || {};

  // Both free-text answers are quoted inside AI prompts — cap like feedback.
  const normalizedWhyHere =
    typeof whyHereAnswer === "string" ? whyHereAnswer.trim().slice(0, 500) : "";
  if (!normalizedWhyHere) {
    return res.status(400).json({ error: "whyHereAnswer is required." });
  }

  const normalizedDream =
    typeof dreamAnswer === "string" ? dreamAnswer.trim().slice(0, 500) : "";
  if (!normalizedDream) {
    return res.status(400).json({ error: "dreamAnswer is required." });
  }

  const session = store.createSession({
    whyHereAnswer: normalizedWhyHere,
    dreamAnswer: normalizedDream,
  });

  return sendSessionSnapshot(res, session, { includeStatic: true });
});
```

`backend/sessionStore.js` — `createSession({ whyHereAnswer, dreamAnswer })`; in the session object replace `entryChoice,` with `whyHereAnswer,` and `cvIntent: cvIntent || "new",` with `cvIntent: null,`. In `serializeSessionState` replace `entryChoice: session.entryChoice,` with `whyHereAnswer: session.whyHereAnswer,`.

`backend/prompts.js` — in `buildProfileDigest`: rename the `entryChoice` parameter to `whyHereAnswer` and replace `lines.push(`Entry intent: ${entryChoice}`);` with:

```js
  if (whyHereAnswer) lines.push(`Why they are here: "${whyHereAnswer}"`);
```

`backend/aiEngine.js` — in `buildSessionDigest` replace `entryChoice: session.entryChoice,` with `whyHereAnswer: session.whyHereAnswer,`.

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && npm test 2>&1 | grep -E "(pass|fail) [0-9]"`
Expected: 0 failures.

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat(backend): free-text whyHereAnswer replaces the change/find entry choice

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Backend — `POST /api/cv/intent`

**Files:**
- Modify: `backend/server.js` (new route, before `/api/cv`)
- Modify: `backend/sessionStore.js` (new `setCvIntent`)
- Test: `backend/tests/server.test.js`, `backend/tests/sessionStore.test.js`

**Interfaces:**
- Consumes: `session.cvIntent === null` from Task 1.
- Produces: `POST /api/cv/intent {sessionId, cvIntent: "new"|"use_skills"}` → snapshot; `store.setCvIntent(session, cvIntent)`. Task 3 calls the route.

- [ ] **Step 1: Write the failing tests**

`backend/tests/server.test.js` — add after the `"cv with pasted text..."` test:

```js
test("cv/intent: step guard, value validation, re-selection, snapshot carry", async () => {
  const { data: start } = await post("/api/session/start", { whyHereAnswer: "x", dreamAnswer: "x" });
  let res = await post("/api/cv/intent", { sessionId: start.sessionId, cvIntent: "new" });
  assert.equal(res.status, 400, "rejected before the cv step");

  const { sessionId } = await walkToCv();
  res = await post("/api/cv/intent", { sessionId, cvIntent: "later" });
  assert.equal(res.status, 400, "invalid value rejected");

  res = await post("/api/cv/intent", { sessionId, cvIntent: "use_skills" });
  assert.equal(res.status, 200);
  assert.equal(res.data.cvIntent, "use_skills");

  res = await post("/api/cv/intent", { sessionId, cvIntent: "new" });
  assert.equal(res.status, 200, "re-selection allowed while on cv");
  assert.equal(res.data.cvIntent, "new");
});
```

Also in the `"cv with pasted text stores analysis and reaches tree"` test, right after `walkToCv()` add:

```js
  await post("/api/cv/intent", { sessionId, cvIntent: "use_skills" });
```

and in `completeAssessment()` after `walkToCv()` add:

```js
  await post("/api/cv/intent", { sessionId, cvIntent: "new" });
```

`backend/tests/sessionStore.test.js` — extend the `"v2 mutators..."` test with:

```js
  store.setCvIntent(s, "use_skills");
  assert.equal(s.cvIntent, "use_skills");
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npm test 2>&1 | grep -E "fail [0-9]"`
Expected: failures — route 404, `setCvIntent` undefined.

- [ ] **Step 3: Implement**

`backend/sessionStore.js` — add after `setCvAnalysis`:

```js
  setCvIntent(session, cvIntent) {
    session.cvIntent = cvIntent;
    this.touch(session);
  }
```

`backend/server.js` — add directly above the `/api/cv` route:

```js
// The "where should we start from" choice, made on the CV slide. Re-selection
// while still on the cv step is allowed; not an AI route.
app.post("/api/cv/intent", (req, res) => {
  try {
    const { sessionId, cvIntent } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "cv") {
      return res.status(400).json({ error: "Not currently in the CV step." });
    }
    if (cvIntent !== "new" && cvIntent !== "use_skills") {
      return res.status(400).json({ error: "cvIntent must be 'new' or 'use_skills'." });
    }
    store.setCvIntent(session, cvIntent);
    return sendSessionSnapshot(res, session);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && npm test 2>&1 | grep -E "(pass|fail) [0-9]"`
Expected: 0 failures.

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat(backend): cv-intent route — the use_skills/new choice moves to the CV step

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Frontend — entry screen + CV-slide intent

**Files:**
- Modify: `frontend/src/api.js` (new `postCvIntent`)
- Modify: `frontend/src/App.jsx` (entry JSX, state, `handleStartSession`, `CvCard`, resume)

**Interfaces:**
- Consumes: `POST /api/session/start {whyHereAnswer, dreamAnswer}` (Task 1), `POST /api/cv/intent` (Task 2), snapshot `cvIntent`.

- [ ] **Step 1: Implement**

`frontend/src/api.js` — add next to `submitCvText`:

```js
export function postCvIntent(payload) {
  return request("/api/cv/intent", { method: "POST", body: JSON.stringify(payload) });
}
```

`frontend/src/App.jsx`:

1. Delete the `ENTRY_OPTIONS` const. Keep `CV_INTENT_OPTIONS` (now used by `CvCard`).
2. State: replace `const [entryChoice, setEntryChoice] = useState("");` with `const [whyHereAnswer, setWhyHereAnswer] = useState("");`. The `cvIntent` state and its snapshot sync stay.
3. Resume effect: delete `setEntryChoice(data.entryChoice || "");`.
4. `handleStartSession`:

```js
  const handleStartSession = async () => {
    if (!whyHereAnswer.trim() || !dreamAnswer.trim()) {
      return;
    }
    setError("");
    setBusy((p) => ({ ...p, start: true }));
    try {
      const data = await startSession({
        whyHereAnswer: whyHereAnswer.trim(),
        dreamAnswer: dreamAnswer.trim(),
      });
      ...unchanged...
```

(import list: drop nothing — `startSession` stays; add `postCvIntent`.)

5. Entry JSX — the `entry-screen` section becomes:

```jsx
        <section className="entry-screen">
          <h1>Why are you here?</h1>

          <textarea
            className="dream-input"
            value={whyHereAnswer}
            maxLength={500}
            onChange={(event) => setWhyHereAnswer(event.target.value)}
            placeholder="Write your honest answer"
          />

          <p className="entry-prompt">
            What would you do if you knew you would definitely succeed?
          </p>

          <textarea
            className="dream-input"
            value={dreamAnswer}
            maxLength={500}
            onChange={(event) => setDreamAnswer(event.target.value)}
            placeholder="Write your honest answer"
          />

          <button
            type="button"
            className="primary-action"
            onClick={handleStartSession}
            disabled={busy.start || !whyHereAnswer.trim() || !dreamAnswer.trim()}
          >
            {busy.start ? "Entering..." : "Help to explore my career"}
          </button>

          <p className="entry-disclaimer">
            An exploratory self-reflection tool — not professional career
            counseling or a psychological assessment.
          </p>

          {error && <p className="error-text">{error}</p>}
        </section>
```

6. `CvCard` — signature becomes
`function CvCard({ mode, setMode, cvDraft, setCvDraft, busy, intent, intentBusy, onSelectIntent, onSubmitText, onUploadFile })`.
In the choice-screen return, insert above the `option-list` div:

```jsx
      <p className="entry-prompt">Where should we start from?</p>
      <div className="entry-options">
        {CV_INTENT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`entry-option ${intent === option.value ? "selected" : ""}`}
            onClick={() => onSelectIntent(option.value)}
            disabled={busy || intentBusy}
          >
            {option.label}
          </button>
        ))}
      </div>
```

and disable the three path buttons until an intent exists: each gets `disabled={busy || !intent}` (the upload `<input>` too).

7. Handler + busy flag: add `cvIntent: false` to both `busy` initializers; add:

```js
  const handleSelectCvIntent = async (value) => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, cvIntent: true }));
    try {
      const data = await postCvIntent({ sessionId, cvIntent: value });
      applySessionSnapshot(data);
    } catch (e) {
      setError(e.message || "Could not save your choice.");
    } finally {
      setBusy((p) => ({ ...p, cvIntent: false }));
    }
  };
```

8. `CvCard` call site gains the new props:

```jsx
            <CvCard
              mode={cvMode}
              setMode={setCvMode}
              cvDraft={cvDraft}
              setCvDraft={setCvDraft}
              busy={busy.cv}
              intent={cvIntent}
              intentBusy={busy.cvIntent}
              onSelectIntent={handleSelectCvIntent}
              onSubmitText={handleSubmitCvText}
              onUploadFile={handleUploadCv}
            />
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npm test -- --run && npm run build`
Expected: 19 tests pass, clean build (no unused-vars from removed `entryChoice`).
Run: `cd backend && npm test 2>&1 | grep -E "(pass|fail) [0-9]"`
Expected: still 0 failures.

- [ ] **Step 3: Commit**

```bash
git add frontend/
git commit -m "feat(front): two-question entry screen; intent choice moves to the CV slide

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Docs sync + full verification

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `PROJECT_STATUS.md`, `ARCHITECTURE.md`

- [ ] **Step 1: Find and fix stale references**

Run: `grep -rn "entryChoice\|Entry intent\|change.*find my career\|Change my career" CLAUDE.md README.md PROJECT_STATUS.md ARCHITECTURE.md | grep -vi superpowers`

- `CLAUDE.md`: the **Entry** bullet becomes: required free-text `whyHereAnswer` + `dreamAnswer` (both capped 500) → `POST /api/session/start`; `cvIntent` (`new` | `use_skills`) is chosen on the CV slide via `POST /api/cv/intent` (step-guarded, re-selectable). Update the **CV** bullet to mention the intent gate. Contracts section: remove any `entryChoice` mention.
- `README.md`: product-flow step 1 (entry) → two open questions; API list: `POST /api/session/start` body `{ "whyHereAnswer": "...", "dreamAnswer": "..." }`; add `POST /api/cv/intent` with body `{ "sessionId": "...", "cvIntent": "new|use_skills" }` before `POST /api/cv`.
- `ARCHITECTURE.md`: route count 16 → 17 in the `server.js` row; payload-contract table: update the session-start row and add a cv-intent row.
- `PROJECT_STATUS.md`: bump the header date; add a dated «Сделано 2026-07-13 (entry rework)» entry (Russian, matching style): двухвопросный entry (`whyHereAnswer` вместо change/find), `cvIntent` переехал на CV-слайд (`POST /api/cv/intent`), дайджест печатает `Why they are here`; update the Entry line in «Готово» and the test counts.

- [ ] **Step 2: Full verification**

Run: `cd backend && npm test 2>&1 | tail -3 && cd ../frontend && npm test -- --run 2>&1 | grep Tests && npm run build 2>&1 | grep built`
Expected: all green.

Keyed smoke (optional, needs `backend/.env` key): boot `PORT=3101 node backend/server.js`, then start a session with the new payload and confirm the digest path works end-to-end:

```bash
curl -s -X POST localhost:3101/api/session/start -H 'Content-Type: application/json' \
  -d '{"whyHereAnswer":"stuck in retail, want a trade","dreamAnswer":"run my own workshop"}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['whyHereAnswer'], '| cvIntent:', d['cvIntent'], '| entryChoice' in d)"
```

Expected: the trimmed text, `cvIntent: None`, `False`. Kill the server afterwards.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md README.md PROJECT_STATUS.md ARCHITECTURE.md
git commit -m "docs: sync entry contract and cv-intent route

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
