# Page 1–2 Restyle in Page 3's Visual Language — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the entry screen and survey steps (Pages 1–2) to Page 3's light token-based visual language: thin gray borders, purple accent, soft selected/hover states, a thin step progress bar, and dock-style card transitions.

**Architecture:** Pure reskin in place. `frontend/src/App.css` swaps hardcoded monochrome values for the CSS variables already defined in `frontend/src/index.css`; `frontend/src/App.jsx` gains a progress bar element and a framer-motion wrapper around the active survey card; two now-redundant overrides are deleted from `frontend/src/components/GraphView/GraphPage.css`. No new files, no layout changes.

**Tech Stack:** React 19 + Vite (port 5173, proxies `/api` to backend on 3001), framer-motion (already imported in App.jsx), plain CSS with variables.

**Spec:** `docs/superpowers/specs/2026-07-06-page12-restyle-design.md` (approved).

## Global Constraints

- Use only existing tokens from `frontend/src/index.css` (`--color-border`, `--color-text`, `--color-text-muted`, `--color-text-faint`, `--color-bg`, `--color-accent: #863bff`, `--color-accent-strong: #7326e6`, `--color-accent-soft: rgba(134, 59, 255, 0.12)`, `--transition`). Define no new tokens.
- Do NOT change any `border-radius`, padding, sizing, or layout values. Pills stay 999px, cards stay 26px, Likert stays a vertical list.
- Do NOT touch the dead legacy CSS blocks in App.css (`.premium-*`, `.tree-*`, `.flow-panel`, `.side-*`, `.theme-*`, `.tradeoff-*`, `.root-node`, `.path-node`, `.node-*` and their media-query entries). They are unused by any JSX; leaving them is deliberate (tracked cleanup debt).
- Respect `prefers-reduced-motion`: framer-motion durations 0 via the existing `REDUCED_MOTION` constant in App.jsx; CSS transitions disabled with `!important` (established repo pattern).
- UI strings stay English.
- There is no frontend unit-test infrastructure. Each task's test cycle = `npm run build` (catches syntax) + visual verification in the running app via Playwright browser tools. Backend tests (`cd backend && npm test`, 39 passing) guard against accidental backend drift in the final task.
- Dev environment: run `npm run dev` from the repo root in the background (starts backend :3001 — works keyless via deterministic fallbacks — and Vite :5173). App URL: `http://localhost:5173`.

---

### Task 1: App.css token swap, accent, and interaction states

**Files:**
- Modify: `frontend/src/App.css`

**Interfaces:**
- Consumes: tokens from `frontend/src/index.css` (see Global Constraints).
- Produces: global `.primary-action` accent styling and `.question-category` accent color that Task 4 relies on when deleting the GraphPage.css overrides. Class names are unchanged — no JSX edits in this task.

Apply the following exact edits (old → new). Everything not listed stays byte-identical.

- [ ] **Step 1: Base shell and grouped button rule**

```css
/* OLD */
.app-shell {
  min-height: 100vh;
  padding: 48px 24px;
  color: #111111;
  background: #ffffff;
}
/* NEW */
.app-shell {
  min-height: 100vh;
  padding: 48px 24px;
  color: var(--color-text);
  background: var(--color-bg);
}
```

In the grouped base button rule, drop `.toggle-button` and `.secondary-action` (both classes appear in no JSX — verified via grep; delete their selector lines here and in every group below) and swap colors:

```css
/* OLD */
.entry-option,
.option-button,
.primary-action,
.secondary-action,
.ghost-action,
.toggle-button {
  appearance: none;
  border: 1px solid #111111;
  background: #ffffff;
  color: #111111;
/* NEW */
.entry-option,
.option-button,
.primary-action,
.ghost-action {
  appearance: none;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
```
(the rest of the declaration block — font, radius, padding, transition — unchanged)

- [ ] **Step 2: Selected state and primary action**

```css
/* OLD */
.entry-option.selected,
.option-button.selected,
.primary-action,
.toggle-button.active {
  background: #111111;
  color: #ffffff;
}
/* NEW */
.entry-option.selected,
.option-button.selected {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
  color: var(--color-text);
}

.primary-action {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #ffffff;
}
```

- [ ] **Step 3: Hover states**

```css
/* OLD */
.entry-option:hover:enabled,
.option-button:hover:enabled,
.primary-action:hover:enabled,
.secondary-action:hover:enabled,
.ghost-action:hover:enabled,
.toggle-button:hover:enabled {
  background: #111111;
  color: #ffffff;
}
/* NEW */
.entry-option:hover:enabled,
.option-button:hover:enabled {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
  color: var(--color-text);
}

.primary-action:hover:enabled {
  background: var(--color-accent-strong);
  border-color: var(--color-accent-strong);
  color: #ffffff;
}

.ghost-action:hover:enabled {
  background: var(--color-bg);
  border-color: var(--color-accent);
  color: var(--color-accent);
}
```

- [ ] **Step 4: Muted texts, inputs, focus**

```css
/* OLD */ .entry-prompt { ... color: #333333; }
/* NEW */ .entry-prompt { ... color: var(--color-text-muted); }

/* OLD */ .dream-input { ... border: 1px solid #111111; ... }
/* NEW */ .dream-input { ... border: 1px solid var(--color-border); ... }

/* OLD */
.dream-input:focus,
.question-textarea:focus {
  outline: none;
  box-shadow: 0 0 0 2px #1111111f;
}
/* NEW */
.dream-input:focus,
.question-textarea:focus {
  outline: none;
  border-color: var(--color-accent);
}

/* OLD (disabled group) — remove the two dead selector lines */
.primary-action:disabled,
.secondary-action:disabled,
.entry-option:disabled,
.option-button:disabled,
.toggle-button:disabled {
/* NEW */
.primary-action:disabled,
.entry-option:disabled,
.option-button:disabled {

/* OLD */
.screen-header p {
  margin: 0;
  color: #444444;
}
/* NEW */
.screen-header p {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted);
}
```

- [ ] **Step 5: Question card, micro-label, textarea, ghost, error**

```css
/* OLD */ .question-card { border: 1px solid #111111; ... }
/* NEW */ .question-card { border: 1px solid var(--color-border); ... }

/* OLD */ .question-category { ... color: #555555; }
/* NEW */ .question-category { ... color: var(--color-accent); }

/* OLD */ .question-textarea { ... border: 1px solid #111111; ... }
/* NEW */ .question-textarea { ... border: 1px solid var(--color-border); ... }

/* OLD */
.secondary-action,
.ghost-action {
  background: #ffffff;
}
/* NEW */
.ghost-action {
  background: var(--color-bg);
  color: var(--color-text-muted);
}

/* OLD */
.error-text {
  margin: 12px 0 0;
  color: #000000;
  border-left: 2px solid #111111;
  padding-left: 10px;
  font-size: 0.95rem;
}
/* NEW */
.error-text {
  margin: 12px 0 0;
  color: var(--color-text);
  border-left: 2px solid var(--color-accent);
  padding-left: 10px;
  font-size: 0.95rem;
}
```

- [ ] **Step 6: Depth cards, dimension counter, A/B options**

```css
/* OLD */ .depth-card { ... border: 1px solid #111111; ... }
/* NEW */ .depth-card { ... border: 1px solid var(--color-border); ... }

/* OLD */
.depth-card:hover:enabled {
  background: #111111;
  color: #ffffff;
}
/* NEW */
.depth-card:hover:enabled {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
}

/* OLD */ .depth-meta { margin: 0; color: #555555; }
/* NEW */ .depth-meta { margin: 0; color: var(--color-text-muted); }

/* OLD */ .depth-loading { ... color: #444444; ... }
/* NEW */ .depth-loading { ... color: var(--color-text-faint); ... }

/* OLD */ .dimension-counter { color: #777777; ... }
/* NEW */ .dimension-counter { color: var(--color-text-faint); ... }

/* OLD */ .ab-option { ... border: 1px solid #111111; background: #ffffff; color: #111111; ... }
/* NEW */ .ab-option { ... border: 1px solid var(--color-border); background: var(--color-bg); color: var(--color-text); ... }

/* OLD */
.ab-option:hover:enabled {
  background: #111111;
  color: #ffffff;
}
.ab-option.selected {
  background: #111111;
  color: #ffffff;
}
/* NEW */
.ab-option:hover:enabled,
.ab-option.selected {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
  color: var(--color-text);
}
```

- [ ] **Step 7: Build check**

Run: `cd frontend && npm run build`
Expected: vite build succeeds with no CSS errors.

- [ ] **Step 8: Visual verification**

With `npm run dev` running (repo root, background), use the Playwright browser tools:
1. Navigate to `http://localhost:5173`. Screenshot the entry screen. Expect: thin gray pill borders, purple "Help to explore my career" CTA (disabled → 0.4 opacity), selecting "Change my career" shows soft purple fill + purple border (NOT black).
2. Fill the dream textarea (focus shows purple border, no black glow), start the session. On "About you": micro-label "QUESTION 1 OF 3" is purple; option buttons thin gray; hover soft purple.
3. Answer the sex question, then click "← Back": the saved answer shows the soft purple selected state.
Expect at every screen: zero solid-black button fills.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/App.css
git commit -m "style(frontend): reskin Pages 1-2 in Page 3 tokens — thin borders, accent, soft states"
```

---

### Task 2: Thin accent progress bar for survey steps

**Files:**
- Modify: `frontend/src/App.jsx` (helper after `stepProgressText`, render inside the `questions-screen` section)
- Modify: `frontend/src/App.css` (new rules after the `.screen-header p` block)

**Interfaces:**
- Consumes: existing `progress` state shape `{ demographics: {answered,total}, bigFive: {answered,total}, values: {answered,total} }`; existing `step` state.
- Produces: `stepProgressRatio(step, progress) → number | null` (module-level helper in App.jsx); CSS classes `.step-progress`, `.step-progress-fill`.

- [ ] **Step 1: Add the helper in App.jsx, directly below `stepProgressText`**

```jsx
function stepProgressRatio(step, progress) {
  if (!progress) return null;
  const bucket =
    step === "demographics" ? progress.demographics
    : step === "big_five" ? progress.bigFive
    : step === "values" ? progress.values
    : null;
  if (!bucket || !bucket.total) return null;
  return Math.min(1, bucket.answered / bucket.total);
}
```

Returns `null` on `depth_choice` and `complete` — the bar is hidden there per spec.

- [ ] **Step 2: Render the bar under the survey header**

In the `stage === "survey"` section, immediately after `</header>` insert:

```jsx
{(() => {
  const ratio = stepProgressRatio(step, progress);
  return ratio === null ? null : (
    <div
      className="step-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
    >
      <div
        className="step-progress-fill"
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
})()}
```

- [ ] **Step 3: CSS — bar styles and header spacing**

In App.css change `.screen-header { margin-bottom: 22px; }` to `margin-bottom: 12px;` and add after the `.screen-header p` rule:

```css
.step-progress {
  height: 2px;
  margin: 0 0 22px;
  border-radius: 999px;
  background: var(--color-border);
  overflow: hidden;
}

.step-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--color-accent);
  transition: width var(--transition);
}

@media (prefers-reduced-motion: reduce) {
  .step-progress-fill {
    transition: none !important;
  }
}
```

(On `depth_choice`/`complete` the header→card gap tightens to 12px — intentional.)

- [ ] **Step 4: Lint and build**

Run: `cd frontend && npm run lint && npm run build`
Expected: no new eslint errors; build succeeds.

- [ ] **Step 5: Visual verification**

In the running app: start a session, answer demographics questions and watch the 2px purple bar advance under the header (1/3 → 2/3 → 3/3, animated width); on "Choose depth" the bar disappears; after choosing Short it reappears at 0% for Personality and advances per answer.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.css
git commit -m "feat(frontend): thin accent progress bar for survey steps"
```

---

### Task 3: Dock-style framer-motion transitions between survey cards

**Files:**
- Modify: `frontend/src/App.jsx` (the `stage === "survey"` section only)

**Interfaces:**
- Consumes: `AnimatePresence`, `Motion` (already imported), `REDUCED_MOTION` constant (already defined at module level).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Wrap the active survey card**

Inside the `stage === "survey"` section, wrap the five existing conditional card blocks (`step === "demographics"`, `"depth_choice"`, `"big_five"`, `"values"`, `"complete"` — move them unchanged) like this:

```jsx
<AnimatePresence mode="wait">
  <Motion.div
    key={`${step}-${
      step === "demographics" ? demoIndex
      : step === "big_five" ? bigFiveIndex
      : step === "values" ? valuesIndex
      : 0
    }`}
    initial={{ y: 12, opacity: 0 }}
    animate={{ y: 0, opacity: 1 }}
    exit={{
      y: 12,
      opacity: 0,
      transition: { duration: REDUCED_MOTION ? 0 : 0.25 },
    }}
    transition={
      REDUCED_MOTION
        ? { duration: 0 }
        : { duration: 0.35, ease: [0.22, 1, 0.36, 1] }
    }
  >
    {/* the five existing step blocks, moved here unchanged */}
  </Motion.div>
</AnimatePresence>
```

These are the exact parameters of the Page 3 dock (`graph-question-dock` wrapper in the same file) — keep them identical. The key changes on every step/index change, so `mode="wait"` plays exit → enter per question; unrelated re-renders (e.g. `busy` flips) keep the same key and do not replay the animation.

- [ ] **Step 2: Lint and build**

Run: `cd frontend && npm run lint && npm run build`
Expected: no new eslint errors; build succeeds.

- [ ] **Step 3: Visual verification**

In the running app: answering a demographics/Big Five/Values question slides the old card down-and-out and the new one up-and-in (like the Page 3 dock). "← Back" animates the same way. Emulate reduced motion (Playwright: `browser_run_code_unsafe` with `page.emulateMedia({ reducedMotion: 'reduce' })`, or DevTools rendering emulation) and confirm the swap is instant.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(frontend): dock-style framer-motion transitions between survey cards"
```

---

### Task 4: GraphPage.css cleanup + full-flow verification

**Files:**
- Modify: `frontend/src/components/GraphView/GraphPage.css`

**Interfaces:**
- Consumes: Task 1's global `.primary-action` accent rules and `.question-category` accent color (must be merged first — deleting the overrides before Task 1 would turn Page 3's dock monochrome).
- Produces: final state; nothing downstream.

- [ ] **Step 1: Delete the three redundant rules**

Remove from GraphPage.css (global App.css rules from Task 1 are now identical):

```css
/* Page 3 accent — scoped so Pages 1-2 buttons stay monochrome */
.graph-page .primary-action {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #ffffff;
}

.graph-page .primary-action:hover:enabled {
  background: var(--color-accent-strong);
  border-color: var(--color-accent-strong);
  color: #ffffff;
}
```

and

```css
.graph-question-dock .question-category {
  color: var(--color-accent);
}
```

- [ ] **Step 2: Build**

Run: `cd frontend && npm run build`
Expected: success.

- [ ] **Step 3: Full-flow visual verification**

Walk the whole app with Playwright (backend is deterministic/keyless, so this is scriptable):
1. Entry: select "Change my career", dream = "Build products that help people grow", submit.
2. Demographics (3): click the first sex option; age = 30 + Next; country = "Germany" + Next.
3. Depth: click "Short" (20 items).
4. Big Five: click the "3 Neutral" Likert button 20 times (after each click wait for the item text to change — each answer POSTs before advancing).
5. Values: click option "A" 40 times (same waiting rule).
6. Complete: click "Run Life Path Engine".
7. Page 3: answer direction questions by clicking the first option until the "Direction found" card appears.

Check on Page 3: dock micro-label ("Direction · Question …") still purple; "Confirm this direction" button still purple with accent-strong hover; dock option buttons now thin-gray/soft-accent (inherited from Task 1 — intended, closer to Page 3's own language). Screenshot the dock and one survey screen for the record.

- [ ] **Step 4: Backend regression guard**

Run: `cd backend && npm test`
Expected: 39/39 pass (no backend files touched).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/GraphView/GraphPage.css
git commit -m "chore(frontend): drop GraphPage.css overrides made redundant by global accent"
```
