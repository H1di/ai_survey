# Entry Flow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the entry screen as a two-step question dialog with a compact trust header, and move the whole app onto "ink on warm paper" design tokens (purple gone everywhere).

**Architecture:** Frontend-only. Global CSS custom properties in `frontend/src/index.css` restyle the app wholesale; hardcoded purple accents in component CSS/JSX are re-pointed at the tokens; the entry screen inside `App.jsx` gains a local `entryQuestion: 0|1` view state — both answers still leave in the single existing `POST /api/session/start`.

**Tech Stack:** React 19 + Vite, plain CSS custom properties, Vitest (`frontend/src/lifePath.test.js`), recharts (chart color constants).

**Spec:** `docs/superpowers/specs/2026-07-14-entry-redesign-design.md`

## Global Constraints

- Backend: routes, session, validation, backend tests — **no changes**.
- Palette (exact values): bg `#FAFAF8`, text `#1A1915`, muted `#6F6B63`, faint `#A6A29A`, border `#E8E6E1`, border-strong `#C9C5BD`, surface `#F3F2EE`, locked `#D6D3CC`, accent `#1A1915`, accent-strong `#000000`, accent-soft `rgba(26, 25, 21, 0.06)`.
- Corner radii stay in the 10–14px band; the app-wide token is `--radius: 12px`. No pill (999px) buttons. Circular numeric badges (`.likert-value`, `.ab-tag`) and the 4px `.overall-progress` bar keep `border-radius: 999px` — they are circles/hairlines, not pills.
- Copy (exact strings, English):
  - Wordmark `Life Path Explorer`; tagline `Evidence-based career self-assessment · about 10 minutes`.
  - Step lines `Question 1 of 2` / `Question 2 of 2`.
  - Q1 `Why are you here?`, helper `A sentence or two is enough — write it the way you'd say it.`
  - Q2 `What would you do if you knew you would definitely succeed?`, helper `Dream freely — this shapes where we start looking.`
  - Buttons: `Continue`, `Start my assessment` (busy `Starting…`), `← Back`.
  - Placeholder `Write your honest answer…`; disclaimer unchanged: `An exploratory self-reflection tool — not professional career counseling or a psychological assessment.`
- Textareas keep `maxLength={500}`; counter `N / 500` renders only when length ≥ 400.
- The app must keep working keyless (no `OPENAI_API_KEY`).
- Commit messages follow the repo's conventional style (`feat(front): …`, `fix(front): …`, `test: …`).

**Verification commands used throughout:**

- Frontend tests: `cd /home/eugene/ai_survey_2/frontend && npm test -- --run`
- Backend tests (must stay green, untouched): `cd /home/eugene/ai_survey_2/backend && npm test`
- Purple scan (expect no output when done):
  `grep -rn -i "863bff\|7326e6\|rgba(134" /home/eugene/ai_survey_2/frontend/src /home/eugene/ai_survey_2/frontend/index.html`

---

### Task 1: Ink-on-paper tokens + radius sweep

**Files:**
- Modify: `frontend/src/index.css:9-23` (the `:root` block)
- Modify: `frontend/src/App.css` (radius literals: lines 114, 160-172, 209-217, 244-248, 250-260, 285-289, 346-357, 412-432)

**Interfaces:**
- Produces: CSS custom property `--radius` (12px) — later tasks reference it as `var(--radius)`. All existing `--color-*` token names keep their names, only values change.

- [ ] **Step 1: Replace the `:root` token block in `frontend/src/index.css`**

Replace lines 9–23 with:

```css
:root {
  --color-bg: #fafaf8;
  --color-text: #1a1915;
  --color-text-muted: #6f6b63;
  --color-text-faint: #a6a29a;
  --color-border: #e8e6e1;
  --color-border-strong: #c9c5bd;
  --color-surface: #f3f2ee;
  --color-locked: #d6d3cc;
  --color-accent: #1a1915;
  --color-accent-strong: #000000;
  --color-accent-soft: rgba(26, 25, 21, 0.06);
  --radius: 12px;
  --transition: 0.2s ease;
  --transition-slow: 0.5s ease;
}
```

- [ ] **Step 2: Radius sweep in `frontend/src/App.css`**

Exact replacements (one property line each; surrounding rules unchanged):

| Selector (current line) | Current | New |
|---|---|---|
| `.entry-option, .option-button, .primary-action, .ghost-action` (114) | `border-radius: 999px;` | `border-radius: var(--radius);` |
| `.dream-input` (164) | `border-radius: 24px;` | `border-radius: var(--radius);` |
| `.question-card` (211) | `border-radius: 26px;` | `border-radius: var(--radius);` |
| `.option-button` (245) | `border-radius: 16px;` | `border-radius: var(--radius);` |
| `.question-textarea` (254) | `border-radius: 16px;` | `border-radius: var(--radius);` |
| `.back-action` (288) | `border-radius: 999px;` | `border-radius: var(--radius);` |
| `.depth-card` (351) | `border-radius: 20px;` | `border-radius: var(--radius);` |
| `.ab-option` (417) | `border-radius: 20px;` | `border-radius: var(--radius);` |

Do **not** touch `.overall-progress` (28), `.likert-value` (392), `.ab-tag` (437) — hairline bar and circular badges.

- [ ] **Step 3: Verify no pill buttons remain and tests still pass**

Run: `grep -n "999px" /home/eugene/ai_survey_2/frontend/src/App.css`
Expected: exactly three hits — lines for `.overall-progress`, `.likert-value`, `.ab-tag`.

Run: `cd /home/eugene/ai_survey_2/frontend && npm test -- --run`
Expected: all Vitest tests PASS (they don't touch CSS; this catches accidental syntax damage via Vite import).

- [ ] **Step 4: Visual smoke check**

Run `npm run dev` from the repo root, open `http://localhost:5173`. Expected: warm off-white background, ink-black button on the entry screen, no purple on the entry screen. (Survey/graph screens still have hardcoded purple — that's Task 2.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/index.css frontend/src/App.css
git commit -m "feat(front): ink-on-paper design tokens, 12px radius sweep"
```

---

### Task 2: Replace hardcoded purple + stale gray literals in components

**Files:**
- Modify: `frontend/src/App.css:491-499` (`.fit-badge`), `:509-514` (`.refine-param`), `:522-530` (`.refine-reason`), `:540-549` (`.journey-rail-list li`, `.journey-rail-time`), `:560-562` (`.journey-rail-step`), `:472-479` (`.rank-row`)
- Modify: `frontend/src/components/GraphView/NodeComponent.css:340-366`
- Modify: `frontend/src/components/SchwartzMap.css:23-33`
- Modify: `frontend/src/components/ProfileCharts.jsx:18-20`

**Interfaces:**
- Consumes: `--radius` and the ink token values from Task 1.
- Produces: nothing new — pure value replacement; class names unchanged.

- [ ] **Step 1: `frontend/src/App.css` accent/gray literals**

Exact edits:

```css
/* .fit-badge (491): */
.fit-badge {
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: var(--radius);
  background: var(--color-accent-soft);
  color: var(--color-text);
  font-weight: 600;
  font-size: 12px;
}

/* .refine-param (509): border #e0e0e0 → token */
.refine-param {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 8px 10px;
}
.refine-param.checked { border-color: var(--color-accent); }

/* .refine-reason (522): border #e0e0e0 → token (radius 8px stays, < band is fine for an inner input) */
  border: 1px solid var(--color-border);

/* .rank-row (472): border #e0e0e0 → token */
  border: 1px solid var(--color-border);

/* journey rail (540-562): */
.journey-rail-list li {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 14px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
}
.journey-rail-time { color: var(--color-text-muted); white-space: nowrap; }
.journey-rail-step { font-size: 12px; color: var(--color-text-faint); }
.journey-rail-step.done { color: var(--color-text-muted); }
.journey-rail-step.active { color: var(--color-accent); font-weight: 600; }
```

- [ ] **Step 2: `frontend/src/components/GraphView/NodeComponent.css`**

```css
.node--output-latest { box-shadow: 0 0 0 2px rgba(26, 25, 21, 0.3); }
.node--output-accepted { box-shadow: 0 0 0 2px var(--color-accent); }
.node-fit-badge {
  display: inline-block;
  margin-top: 6px;
  padding: 2px 8px;
  border-radius: var(--radius);
  background: var(--color-accent-soft);
  color: var(--color-text);
  font-weight: 600;
  font-size: 11px;
}
/* .node-accepted-tag color: */
  color: var(--color-accent);
```

- [ ] **Step 3: `frontend/src/components/SchwartzMap.css`**

```css
.schwartz-link {
  stroke: rgba(26, 25, 21, 0.28);
  stroke-width: 1;
  stroke-dasharray: 2 3;
}
.schwartz-job-dot {
  fill: rgba(26, 25, 21, 0.45);
}
.schwartz-job.accepted .schwartz-job-dot {
  fill: #1a1915;
}
```

- [ ] **Step 4: `frontend/src/components/ProfileCharts.jsx` chart constants**

recharts writes these as SVG attributes, so they stay literal hex (not `var()`):

```js
const ACCENT = "#1a1915";
const ACCENT_SOFT = "rgba(26, 25, 21, 0.22)";
const MUTED = "#6f6b63";
```

- [ ] **Step 5: Verify purple is gone app-wide**

Run: `grep -rn -i "863bff\|7326e6\|rgba(134" /home/eugene/ai_survey_2/frontend/src /home/eugene/ai_survey_2/frontend/index.html`
Expected: no output.

Run: `cd /home/eugene/ai_survey_2/frontend && npm test -- --run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.css frontend/src/components/GraphView/NodeComponent.css frontend/src/components/SchwartzMap.css frontend/src/components/ProfileCharts.jsx
git commit -m "feat(front): re-point hardcoded purple accents at ink tokens"
```

---

### Task 3: `entryCharCounter` helper (TDD)

**Files:**
- Modify: `frontend/src/lifePath.js` (append export next to the other pure helpers)
- Test: `frontend/src/lifePath.test.js` (append a `describe` block; extend the import list)

**Interfaces:**
- Produces: `entryCharCounter(text: string) => string | null` and `ENTRY_MAX_CHARS = 500`, both exported from `frontend/src/lifePath.js`. Task 4 imports both in `App.jsx`.

- [ ] **Step 1: Write the failing test**

In `frontend/src/lifePath.test.js`, add `entryCharCounter` to the existing `from "./lifePath"` import list, then append:

```js
describe("entryCharCounter", () => {
  it("stays hidden below 400 chars", () => {
    expect(entryCharCounter("")).toBeNull();
    expect(entryCharCounter("a".repeat(399))).toBeNull();
  });

  it("shows the count from 400 chars up to the cap", () => {
    expect(entryCharCounter("a".repeat(400))).toBe("400 / 500");
    expect(entryCharCounter("a".repeat(500))).toBe("500 / 500");
  });

  it("tolerates null/undefined input", () => {
    expect(entryCharCounter(null)).toBeNull();
    expect(entryCharCounter(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/eugene/ai_survey_2/frontend && npm test -- --run`
Expected: FAIL — `entryCharCounter` is not exported (SyntaxError/undefined).

- [ ] **Step 3: Implement the helper**

Append to `frontend/src/lifePath.js`:

```js
// Entry textarea counter: invisible until the writer approaches the 500-char
// cap, so the limit never nags before it matters.
export const ENTRY_MAX_CHARS = 500;

export function entryCharCounter(text) {
  const length = (text || "").length;
  return length >= 400 ? `${length} / ${ENTRY_MAX_CHARS}` : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/eugene/ai_survey_2/frontend && npm test -- --run`
Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lifePath.js frontend/src/lifePath.test.js
git commit -m "test: entryCharCounter helper for the 500-char entry cap"
```

---

### Task 4: Stepped entry screen (App.jsx + entry CSS)

**Files:**
- Modify: `frontend/src/App.jsx` — imports; new const near the top-level constants; state near line 463; `resetAll` near line 1037 (fixes a latent `setEntryChoice` ReferenceError); the `stage === "entry"` section (currently lines 1275–1315)
- Modify: `frontend/src/App.css` — replace the `.entry-screen` block (lines 78–94), replace `.entry-disclaimer` (456), add new `entry-*` rules + reduced-motion guard; `.entry-prompt`/`.dream-input` (152–178) stay untouched for the RIASEC/CV slides

**Interfaces:**
- Consumes: `entryCharCounter`, `ENTRY_MAX_CHARS` from Task 3; `--radius` + ink tokens from Task 1.
- Produces: nothing consumed later — terminal UI task. Existing `.entry-prompt`, `.entry-options`, `.entry-option`, `.dream-input` classes are still used by the RIASEC/CV slides and MUST keep working.

- [ ] **Step 1: Add the question config and view state in `App.jsx`**

Extend the `./lifePath` import with `entryCharCounter, ENTRY_MAX_CHARS`. Next to the other top-level constants (near `SESSION_STORAGE_KEY`, line 455), add:

```jsx
const ENTRY_QUESTIONS = [
  {
    heading: "Why are you here?",
    helper: "A sentence or two is enough — write it the way you'd say it.",
  },
  {
    heading: "What would you do if you knew you would definitely succeed?",
    helper: "Dream freely — this shapes where we start looking.",
  },
];
```

Below `const [dreamAnswer, setDreamAnswer] = useState("");` (line 464), add:

```jsx
const [entryQuestion, setEntryQuestion] = useState(0);
```

- [ ] **Step 2: Fix `resetAll` (latent bug) and reset the new state**

In `resetAll` (line 1037), replace the broken `setEntryChoice("");` (the setter no longer exists — calling `resetAll` today throws a ReferenceError) with:

```jsx
    setWhyHereAnswer("");
    setDreamAnswer("");
    setEntryQuestion(0);
```

(`setDreamAnswer("")` already exists on the next line — keep exactly one call.)

- [ ] **Step 3: Replace the `stage === "entry"` section**

Replace the whole current block (lines 1275–1315) with:

```jsx
      {stage === "entry" && (() => {
        const q = ENTRY_QUESTIONS[entryQuestion];
        const isLast = entryQuestion === ENTRY_QUESTIONS.length - 1;
        const value = entryQuestion === 0 ? whyHereAnswer : dreamAnswer;
        const setValue = entryQuestion === 0 ? setWhyHereAnswer : setDreamAnswer;
        const counter = entryCharCounter(value);
        return (
          <section className="entry-screen">
            <header className="entry-brand">
              <p className="entry-wordmark">Life Path Explorer</p>
              <p className="entry-tagline">
                Evidence-based career self-assessment · about 10 minutes
              </p>
            </header>

            <div className="entry-question" key={entryQuestion}>
              <p className="entry-step">
                Question {entryQuestion + 1} of {ENTRY_QUESTIONS.length}
              </p>
              <h1 className={isLast ? "long" : ""}>{q.heading}</h1>
              <p className="entry-helper">{q.helper}</p>
              <textarea
                className="entry-textarea"
                value={value}
                maxLength={ENTRY_MAX_CHARS}
                onChange={(event) => setValue(event.target.value)}
                placeholder="Write your honest answer…"
                autoFocus
              />
              {counter && <p className="entry-counter">{counter}</p>}
              <div className="entry-actions">
                {isLast ? (
                  <>
                    <button
                      type="button"
                      className="primary-action"
                      onClick={handleStartSession}
                      disabled={busy.start || !whyHereAnswer.trim() || !dreamAnswer.trim()}
                    >
                      {busy.start ? "Starting…" : "Start my assessment"}
                    </button>
                    <button
                      type="button"
                      className="entry-back"
                      onClick={() => setEntryQuestion(0)}
                      disabled={busy.start}
                    >
                      ← Back
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="primary-action"
                    onClick={() => setEntryQuestion(1)}
                    disabled={!whyHereAnswer.trim()}
                  >
                    Continue
                  </button>
                )}
              </div>
              {error && <p className="error-text">{error}</p>}
            </div>

            <p className="entry-disclaimer">
              An exploratory self-reflection tool — not professional career
              counseling or a psychological assessment.
            </p>
          </section>
        );
      })()}
```

- [ ] **Step 4: Rewrite the entry styles in `App.css`**

Replace the current `.entry-screen` block (lines 78–94) with the rules below. Keep `.entry-options`, `.entry-option`, `.entry-prompt`, `.dream-input` rules and the `.entry-options` line inside the 760px media query — the RIASEC/CV slides still use them (verified: `App.jsx:247,284,303-309`). Replace the `.entry-disclaimer` rule (line 456).

```css
.entry-screen {
  min-height: calc(100vh - 96px);
  display: flex;
  flex-direction: column;
}

.entry-brand p {
  margin: 0;
}

.entry-wordmark {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.entry-tagline {
  margin-top: 4px;
  font-size: 0.82rem;
  color: var(--color-text-muted);
}

.entry-question {
  flex: 1;
  width: min(620px, 100%);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  animation: fade-in 200ms ease;
}

.entry-step {
  margin: 0 0 10px;
  font-size: 0.82rem;
  color: var(--color-text-faint);
}

.entry-question h1 {
  margin: 0;
  font-size: clamp(1.8rem, 4.5vw, 2.5rem);
  font-weight: 600;
  letter-spacing: -0.025em;
  line-height: 1.1;
}

.entry-question h1.long {
  font-size: clamp(1.6rem, 4vw, 2.125rem);
  line-height: 1.15;
}

.entry-helper {
  margin: 12px 0 24px;
  font-size: 0.95rem;
  line-height: 1.55;
  color: var(--color-text-muted);
}

.entry-textarea {
  width: 100%;
  min-height: 140px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 16px 18px;
  font-family: inherit;
  font-size: 1rem;
  line-height: 1.5;
  resize: vertical;
  color: var(--color-text);
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(26, 25, 21, 0.04);
}

.entry-textarea:focus {
  outline: none;
  border-color: var(--color-accent);
}

.entry-counter {
  margin: 6px 0 0;
  text-align: right;
  font-size: 0.75rem;
  color: var(--color-border-strong);
}

.entry-actions {
  margin-top: 20px;
  display: flex;
  align-items: center;
  gap: 18px;
}

.entry-back {
  font-size: 0.88rem;
  color: var(--color-text-muted);
  padding: 6px 4px;
}

.entry-back:hover:enabled {
  color: var(--color-text);
}

.entry-disclaimer {
  margin: 24px auto 0;
  font-size: 0.78rem;
  color: var(--color-text-faint);
  max-width: 60ch;
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .entry-screen,
  .entry-question,
  .questions-screen,
  .tree-screen {
    animation: none;
  }
}
```

Also delete the now-unused `.entry-screen h1 { … }` rule (old lines 88–94) — the new `.entry-question h1` replaces it.

- [ ] **Step 5: Run tests and walk the flow manually**

Run: `cd /home/eugene/ai_survey_2/frontend && npm test -- --run` → PASS.

Run `npm run dev` from the repo root (keyless is fine), open `http://localhost:5173`, verify:
1. Q1: wordmark + tagline top-left, "Question 1 of 2", heading, helper, white textarea, Continue disabled until text; disclaimer bottom-center.
2. Continue → Q2 fades in; ← Back returns with the Q1 draft intact; retyping past 400 chars shows `N / 500`.
3. `Start my assessment` → journey rail card appears, then demographics (step order unchanged).
4. RIASEC and CV slides still render their `.entry-prompt` / `.entry-options` / `.dream-input` blocks correctly.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.css
git commit -m "feat(front): stepped two-question entry with trust header, ink styling"
```

---

### Task 5: Full-flow verification sweep

**Files:**
- Modify: none expected; spot-fix only if a check below fails.

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Test suites**

Run: `cd /home/eugene/ai_survey_2/backend && npm test` → all PASS (backend untouched).
Run: `cd /home/eugene/ai_survey_2/frontend && npm test -- --run` → all PASS.

- [ ] **Step 2: Acceptance greps**

Run: `grep -rn -i "863bff\|7326e6\|rgba(134" /home/eugene/ai_survey_2/frontend/src` → no output.
Run: `grep -n "999px" /home/eugene/ai_survey_2/frontend/src/App.css` → only `.overall-progress`, `.likert-value`, `.ab-tag`.

- [ ] **Step 3: Keyless end-to-end walk**

With no `OPENAI_API_KEY`, `npm run dev`, then walk: entry Q1 → Q2 → submit → journey card → demographics (4) → Big Five (a few answers) → check the ink progress bar, selected-option states (soft gray bg + ink border) are readable → jump ahead via RIASEC skip if convenient → confirm the graph screen's node badges/rings render in ink. Fix only real readability regressions; anything cosmetic beyond that is the later screens-redesign project.

- [ ] **Step 4: Commit (only if spot fixes were needed)**

```bash
git add -A frontend/src
git commit -m "fix(front): token cascade regressions from ink restyle"
```
