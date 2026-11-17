# Light redesign — "one path, white page"

Status: **plan, not started**. Nothing here is implemented.

## Question

Move the shipped app from the dark/gold Invector look to the concept approved on
2026-11-16: white page, thin ink-black lines, a single turquoise accent, a bird
logo above the wordmark, one path as the guide.

Approved references (untracked, in `design-concepts/`): `logo.svg`, `hero.png`,
`roadmap.png`, `assessment.png`, `mobile.png`, `intro.mp4`. Source references
are in `references/`.

## What the code looks like today

- Colour is already token-driven: `frontend/src/theme/tokens.css` (68 lines) is
  the only place a colour is written, apart from ~12 literals
  (`ui/BranchCanvas.jsx`, `ui/branchEngine.js`, `screens/screens.css`,
  `ui/ui.css`, `ProfileCharts.css`, `NodeComponent.css`).
- The gold ramp does two jobs at once: `--gold` (58 uses) is both the accent and
  the main line/text colour; `--gold-NN` (≈100 uses) is the hairline system.
- Canvases and recharts read tokens at runtime (`theme/chartPalette.js`, the
  `motion/*` canvases), so they follow the tokens — but several were tuned for
  light-on-black (glows, `shadowColor`, additive alpha).
- The logo is `ui/Wordmark.jsx` (a glowing dot + "invector") and
  `public/favicon.svg` (a gold branch on black).
- The O*NET badge (`assets/onet-in-it.svg`) was recoloured for the dark theme.

## Approach

Considered:

1. **Re-value the tokens in place** — keep `--gold` names, give them ink/teal
   values. Smallest diff, but `--gold` meaning "black" is a trap for every later
   change. Rejected.
2. **Rename to semantic tokens, then re-value** (chosen). `--line`, `--line-NN`
   (hairlines), `--accent` (turquoise, used only for "now" / the chosen path /
   focus), `--surface-*`, `--text-*`. The rename is mechanical; the one part
   that needs judgement is splitting the 58 `--gold` uses into "line/ink" vs
   "accent".
3. **Light and dark side by side** behind `data-theme`. Doubles every visual
   check and every canvas tuning for a look the product is leaving. Rejected
   unless a dark mode is wanted later — approach 2 leaves that door open.

## Steps

Each step ends green on `cd frontend && npm test -- --run` and is checked in a
real browser on every screen via the dev stage switcher (`?dev=<token>`), both
at desktop and phone width, with `prefers-reduced-motion` on and off.

1. **Tokens.** Rename the ramp to semantic names across `src/` (no value
   change, no visual change — screenshots must match before/after). Update
   `chartPalette.js` + its test.
2. **Light values.** Re-value the tokens: page `#fff` / warm off-white surface,
   ink `#111`, accent `#2FB8A6`; remove `--glow-*`; split `--gold` uses into
   line vs accent. Check text contrast (WCAG AA) for every text token on the
   new surfaces — turquoise on white fails AA for body text, so the accent is
   never a text colour.
3. **Canvases.** Retune the scenes that assumed black: `BranchCanvas` /
   `branchEngine` (hardcoded `#000`, white sparks, glow), the `motion/*`
   canvases, the React Flow graph (`GraphView/*.css`, `BranchEdge`), the
   archetype emblem + its PNG export.
4. **Logo.** `Wordmark.jsx` renders the bird-above-wordmark lockup from
   `design-concepts/logo.svg` (cleaned: the generated SVG has stray
   anti-alias paths); a bird-only mark for the favicon and for small sizes
   where the stacked lockup is too tall for the header.
5. **O*NET badge.** Restore a dark-on-light version of the official badge —
   shapes and the attribution sentence unchanged (license condition).
6. **Type.** Decide whether Archivo/Manrope/IBM Plex Mono stay. The concept
   uses a light grotesque + mono; Manrope + Plex Mono already fit. Proposal:
   keep the fonts, lighten display weights.
7. **Entry screen** to match `hero.png`: pale branching field, one bold line,
   the bird at its tip. `BranchCanvas` already draws a branching field, so this
   is a retune plus one emphasised path, not a new scene.

## Not in this plan — needs its own decision

- **The life-line roadmap (`roadmap.png`).** Today the roadmap is a React Flow
  graph of steps for the accepted job. The concept shows a different thing: a
  life line over an age axis with the user's own dated life events, a "now"
  point, and a side panel of test scores. The scores exist (Big Five, RIASEC);
  **life events do not** — nothing in the assessment collects them and the
  session has no place to store them. That is a new feature (data model, input
  UI, backend), not a restyle.
- The intro animation (`intro.mp4`) as a shipped scene.
- Regenerating the concept images.

## Decisions (2026-11-16)

1. White replaces the dark theme outright; no theme switch.
2. Roadmap: restyle only. The life-line with personal events is not being
   built; `roadmap.png` is a style reference for the existing step roadmap.
3. Header: the bird mark (with the wordmark beside it) in step headers; the
   stacked bird-above-wordmark lockup on the entry and sign-in screens.
