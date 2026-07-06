# Page 1–2 Restyle in Page 3's Visual Language — Design

**Date:** 2026-07-06
**Status:** Approved by Eugene (design interview, 8 questions, 2 rounds)
**Scope:** Frontend only — `frontend/src/App.css`, `frontend/src/App.jsx`, small redundant-override cleanup in `frontend/src/components/GraphView/GraphPage.css`.

## Context

Pages 1–2 (entry screen, About you, Choose depth, Personality, Values) use a
heavy monochrome style: `#111111` borders, pill buttons, solid-black
selected/hover fills, no accent color. Page 3 (the graph) uses a light minimal
language driven by tokens in `index.css`: thin `#e0e0e0` borders, muted grays,
uppercase micro-labels, purple accent `#863bff`, framer-motion card
transitions. This spec restyles Pages 1–2 to match Page 3.

## Decisions (from the design interview)

| Topic | Decision |
|---|---|
| Entry screen | Tokens only — composition (big h1, two options, dream textarea, CTA) unchanged |
| Depth of restructure | Reskin in place — current layout stays; no Page 3 top bar |
| Accent `#863bff` | Yes, adopted on Pages 1–2 like on Page 3 |
| Selected answer | Soft fill `--color-accent-soft` + `--color-accent` border; text stays dark |
| Shape | Pills and card radii stay exactly as they are |
| Likert layout | Vertical 5-button list stays |
| Question transitions | framer-motion, same parameters as the Page 3 dock |
| Progress | Thin accent progress bar under the step header + accent micro-label in card |
| Hover (Claude's proposal, confirmed) | Soft accent fill (same as selected), replacing black inversion |

## Visual Spec

### Tokens (App.css)

Replace hardcoded values with the existing variables from `index.css` — no new
tokens needed:

- All `border: 1px solid #111111` → `var(--color-border)` (#e0e0e0).
- Muted text `#333/#444/#555` → `var(--color-text-muted)`; `#666/#777` →
  `var(--color-text-faint)`; body text stays `var(--color-text)`.
- Backgrounds stay `var(--color-bg)`.
- Border-radius values are untouched (pills 999px, cards 26px, options 16px,
  etc.).

### Accent

- `.primary-action`: background/border `var(--color-accent)`, white text;
  hover `var(--color-accent-strong)`. This makes the
  `.graph-page .primary-action` override in `GraphPage.css` redundant —
  delete it along with the "Pages 1-2 buttons stay monochrome" comment.
- `.question-category` (micro-labels like "ITEM 3 OF 20"): color
  `var(--color-accent)`, keeping uppercase/letter-spacing. The
  `.graph-question-dock .question-category` override in `GraphPage.css`
  becomes redundant — delete it.
- Focus rings on `dream-input` / `question-textarea`: accent border instead of
  the current black glow (same treatment as `.dock-textarea:focus`).

### Selected and hover states

Applies to `.entry-option`, `.option-button` (incl. Likert), `.ab-option`,
`.depth-card`. (`.toggle-button` is referenced only in App.css, not in any
JSX — delete it from the grouped selectors while touching them.)

- **Selected:** background `var(--color-accent-soft)`, border
  `var(--color-accent)`, text `var(--color-text)` (no white-on-black
  inversion). Likert value circles and A/B tags keep `currentColor` borders
  and therefore stay dark.
- **Hover (enabled):** same soft treatment — background
  `var(--color-accent-soft)`, border `var(--color-accent)`.
- **Disabled:** unchanged (`opacity: 0.4`).

Secondary/ghost buttons (`.ghost-action`, "← Back", "Restart"):
`var(--color-text-muted)` text, `var(--color-border)` border; hover → accent
text + accent border (mirrors `.graph-profile-toggle`).

Error text: keep dark text, switch the left border to `var(--color-accent)`.

### Progress bar

- A 2px full-width bar directly under `.screen-header` on the survey screen.
- Track `var(--color-border)`, fill `var(--color-accent)`,
  `width: answered/total * 100%` for the **current step only** (demographics,
  big_five, values — data already available from `progress`).
- Hidden on `depth_choice` and `complete` (no meaningful total).
- Fill animates via `transition: width var(--transition)`; instant under
  `prefers-reduced-motion`.
- The header counter ("3 / 20") shrinks to 13px `var(--color-text-muted)`.

### Motion

Wrap the current question card on the survey screen in
`<AnimatePresence mode="wait">` keyed by `step` + current index, with the
dock's exact parameters: initial `{ y: 12, opacity: 0 }`, animate
`{ y: 0, opacity: 1 }`, exit `{ y: 12, opacity: 0, duration: 0.25 }`,
transition `{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }`, all durations 0
when `REDUCED_MOTION` (reuse the existing App.jsx constant; framer-motion is
already imported).

The entry screen keeps its CSS `fade-in` (no motion change — tokens only).

## Implementation Approach

Minimal diff, no new files:

1. **App.css** — token swap plus ~5 new/changed rules (selected, hover, ghost
   hover, progress bar, focus). No selector restructuring.
2. **App.jsx** — add the progress-bar element to the survey screen header area;
   wrap the active question card in `AnimatePresence`/`Motion.div`.
3. **GraphPage.css** — delete the two now-redundant overrides.

Rejected alternative: extracting a shared `survey.css`/design-system layer —
overkill for a reskin; the token variables in `index.css` already are the
shared layer.

## Out of Scope

- Page 3 top bar on Pages 1–2, dock-style floating cards, canvas background.
- Any layout, shape, or interaction changes (single-click/back flow is already
  merged as `dfa2987`).
- Backend, tests other than visual verification.

## Acceptance

- Playwright walkthrough of entry → demographics → depth → Big Five → values →
  complete: no black-filled buttons remain; selected answers show soft accent;
  progress bar advances; card transitions animate (and don't under reduced
  motion).
- Page 3 dock visually unchanged after the `GraphPage.css` cleanup.
- `cd backend && npm test` still 39/39 (no backend changes expected).
