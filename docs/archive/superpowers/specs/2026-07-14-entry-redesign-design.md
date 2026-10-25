# Entry Flow Redesign — Stepped Dialog, Ink-on-Paper Tokens

**Date:** 2026-07-14
**Follows:** `2026-07-13-entry-screen-rework-design.md` (two-question entry contract)

First screen of the app redesigned under the product design philosophy:
handcrafted-feeling, trust within 3 seconds, scientific/calm/mature/premium,
nothing that reads as an AI template. Frontend-only; the backend contract
(`POST /api/session/start` with `{ whyHereAnswer, dreamAnswer }`) is untouched.

## Decisions made with the user

1. **Scope: restyle + trust framing.** Same two entry questions and the same
   single session-start call; the screen gains a product frame (wordmark,
   methodology line). No multi-screen onboarding/landing.
2. **Design tokens change globally** (`frontend/src/index.css` `:root`), not
   entry-locally. The purple accent `#863bff` leaves the whole app at once;
   the full redesign of survey/tree screens comes later on top of these tokens.
3. **Palette: "ink on warm paper"** (Notion-like). Near-black CTA on warm
   white; effectively no accent hue — maximum calm and maturity.
4. **Layout: stepped dialog** — one question per screen ("Question 1 of 2" →
   "Question 2 of 2"), maximum focus on the honest answer.
5. **Trust framing: compact header on both question screens** (no intro
   screen). The post-submit "Career Discovery Journey" rail card stays as the
   five-step preview, inheriting the new tokens.

## 1. Design tokens (`frontend/src/index.css`)

```css
:root {
  --color-bg: #FAFAF8;            /* warm paper */
  --color-text: #1A1915;          /* ink */
  --color-text-muted: #6F6B63;
  --color-text-faint: #A6A29A;
  --color-border: #E8E6E1;
  --color-border-strong: #C9C5BD;
  --color-surface: #F3F2EE;
  --color-locked: #D6D3CC;
  --color-accent: #1A1915;        /* accent = ink */
  --color-accent-strong: #000000;
  --color-accent-soft: rgba(26, 25, 21, 0.06);
  --radius: 12px;                 /* app-wide corner radius, 10–14px band */
}
```

- Every `border-radius: 999px` pill in `App.css` (`.entry-option`,
  `.option-button`, `.primary-action`, `.ghost-action`) moves to
  `var(--radius)`. Other rounded elements keep their values if already within
  10–14px; anything larger (e.g. `.dream-input` 24px) tightens to the token.
- Inter stays the app font.
- Survey/tree screens are not restyled beyond what the tokens cascade into
  (progress bar, selected states, buttons go ink automatically). Verify
  nothing becomes unreadable, fix only regressions.

## 2. Entry screens (frontend only)

Two sequential views inside `stage === "entry"`, driven by a new local view
state `entryQuestion: 0 | 1` in `App.jsx`. Both answers still submit together
via the existing `handleStartSession` at the end of question 2.

**Persistent frame (both screens):**

- Top-left header: wordmark `LIFE PATH EXPLORER` — small caps, letterspaced
  (~0.1em), 12px, ink; below it, muted 13px:
  `Evidence-based career self-assessment · about 10 minutes`.
- Bottom center, faint 12px: `An exploratory self-reflection tool — not
  professional career counseling or a psychological assessment.` (existing
  copy, unchanged).
- Content column: max-width 620px, horizontally centered, vertically centered
  between header and footer (flex column, `justify-content: center`).

**Question block (per screen):**

- Faint step line: `Question 1 of 2` / `Question 2 of 2`.
- Question heading, weight 600, letter-spacing −0.025em, line-height ≤1.15:
  - Q1: `Why are you here?` — ~40px desktop (clamp for mobile).
  - Q2: `What would you do if you knew you would definitely succeed?` —
    ~34px desktop (longer string, one size down).
- Muted helper line under the heading:
  - Q1: `A sentence or two is enough — write it the way you'd say it.`
  - Q2: `Dream freely — this shapes where we start looking.`
- Textarea: white card on the paper background — `#fff`, 1px
  `var(--color-border)`, `var(--radius)`, padding ~16–18px, min-height 140px,
  16px text, shadow `0 1px 2px rgba(26,25,21,0.04)`; focus = ink border, no
  glow. `maxLength=500` stays. Placeholder: `Write your honest answer…`.
- Character counter `N / 500`, faint, bottom-right of the textarea; rendered
  only once length ≥ 400.

**Actions:**

- Q1: primary button `Continue` — ink bg, white text, `var(--radius)`,
  ~12px×28px padding; disabled while the trimmed answer is empty. Advances to
  Q2 (no network).
- Q2: primary button `Start my assessment` (busy label `Starting…`), disabled
  while trimmed answer empty or `busy.start`; quiet text button `← Back`
  returns to Q1 keeping both answers in state. API error renders under the
  action row (existing `error` state).

**Motion:** question switch = ~200ms fade + slight upward slide, wrapped in
`@media (prefers-reduced-motion: reduce)` to disable.

## 3. What this removes/replaces

- The current single-screen entry markup (both textareas stacked under one
  giant `Why are you here?` h1) and its CSS (`.entry-screen h1` 5.5rem clamp,
  24px-radius `.dream-input`, pill `.primary-action`).
- CTA copy `Help to explore my career` → `Start my assessment`.

## 4. Explicitly out of scope

- Backend: routes, session, validation, tests — no changes.
- Full restyle of survey/tree/graph screens (tokens cascade only).
- Dark theme; new mobile layouts (the column already stacks).
- The post-submit Journey rail card keeps its structure (tokens restyle it).

## 5. Files touched

- `frontend/src/index.css` — token block.
- `frontend/src/App.css` — entry styles rewritten; pill radii → token; spot
  fixes for token regressions elsewhere.
- `frontend/src/App.jsx` — entry section markup, `entryQuestion` view state.
- No `frontend/src/lifePath.js` changes; existing Vitest suite unaffected.

## 6. Acceptance checklist

- Keyless dev run: entry → Q1 → Q2 → submit lands on the journey rail card,
  then demographics, exactly as before the redesign.
- Back from Q2 preserves both drafts; refresh mid-entry loses drafts (same as
  today — drafts were never persisted).
- No purple anywhere in the app; no pill buttons; radii within 10–14px.
- Counter invisible below 400 chars, visible 400–500.
- `npm test` (backend) and `npm test -- --run` (frontend) both green.
