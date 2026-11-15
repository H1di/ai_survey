# Animation demos — binding rules

Dev-only playgrounds. Each demo explains one real mechanism of Life Path
Explorer with real data. The demo *pages* never ship: `vite build` only follows
the root `index.html`, and nothing there imports `demos/`. Read this whole file
before starting a demo session.

**All nine scenes are shipped.** Their engines and renderers live in
`frontend/src/motion/` and are mounted in the app (table below); a demo page
here is a harness around the same component — a scrubbable clock, fixture data,
a few demo-only controls. There is one implementation: change a scene in
`src/motion/`, and both the app and its demo change. The design bar and tech
rules below bind the shipped scenes exactly as they bind a demo.

| Demo | Shipped as (`src/motion/…`) | Where in the app |
| --- | --- | --- |
| occupation-funnel | `funnel/OccupationFunnel` | `screens/FirstPathScreen` — the `tree` step while the first result is prepared |
| occupation-map | `map/OccupationMap` (figure variant; `?view=hero` here keeps the original hero study) | result card (`OutputDecision` → `OutputFieldFigure`), settled state |
| refine-shift | `shift/FieldShift` | same figure box: while a "No" is in flight and when its answer lands |
| values-fit | `fit/ValuesFit` | output details panel, work-values section |
| values-insertion | `insertion/InsertionBoard` | `ValuesTournamentScreen` (the cards are the answer buttons) |
| riasec-settle | `settle/RiasecSettle` | `screens/RiasecResultScreen`, once after the quiz closes |
| archetype-emblem | `emblem/ArchetypeEmblem` | `SummaryScreen` |
| roadmap-draw | `roadmap/RoadmapReveal` + `revealContext` | `GraphView` (roadmap nodes and edges read the clock) |
| micro-interactions | plain CSS in `ui/ui.css` + `screens/screens.css`, `viewTransition.js`, `ui/RankList.jsx` | every assessment screen |

In the app a scene gets its data from the session snapshot, never from
`demos/data/`. What the snapshot does not carry (the shortlist, Pearson r, the
five families) is re-derived by `src/motion/onetField.js` from
`src/motion/data/onet-field.json` — regenerate that with
`node frontend/scripts/build-onet-field.cjs`; `onetField.test.js` fails on drift.
A scene must never block the flow: buttons stay live, and anything that waits
on a response holds calmly without showing a result it does not have.

Open them with `npm run dev:frontend` → <http://localhost:5173/demos/>.

## Design bar

Think like a senior product designer (Apple / Stripe / Linear / Notion calibre).
The product is evidence-based career guidance; it must feel handcrafted,
scientific, calm, mature, premium, and earn trust in 3 seconds.

- AI stays in the background — never say "AI" in scene copy.
- Every animation explains a real mechanism of the product with real data;
  nothing is decoration.
- No glow, neon, purple, rainbow gradients, emoji, bouncy springs, or particle
  confetti. (Note: `--glow-*` tokens and the purple `branchHue` in
  `ui/branchEngine.js` exist in the app — demos do not use them.)
- Thin lines, lots of black, gold (`--gold` ramp) as the only accent,
  bone/white text, IBM Plex Mono for data labels, Manrope for prose.
- Motion: `--ease-out`, 140–600 ms for UI, scenes ≤ 12 s, calm.

## Tech

- Canvas 2D or SVG. Three.js only if explicitly asked. framer-motion is
  already installed — use it only for DOM layout animations. **No new
  dependencies.**
- Engine = pure module (state of frame = f(T, data), no accumulation);
  renderer = thin component. The engine has a vitest test. Same split as
  `ui/branchEngine.js` + `ui/BranchCanvas.jsx`, but stricter: no tick state.
- Seeded randomness only (`mulberry32` from the kit).
- `prefers-reduced-motion` → a meaningful static final frame (the clock already
  parks T at a stage end; make sure that frame tells the whole story).
- Pause off-screen and on a hidden tab (the clock does it — do not run your own
  rAF loop). Two clocks exist: `useSceneClock` (loops, scrubbable — demo pages
  and ambient scenes) and `usePlayOnce` (runs once and stops — shipped scenes).
- 60 fps at 360 px on a mid phone; no layout shift (fix the stage box's
  height with `aspect-ratio` / `min-height`, never size it from content that
  animates).
- Text in canvas is crisp: always draw through `setupCanvas` (DPR-scaled).
  Wait for `document.fonts.ready` before trusting canvas text metrics.
- Accessible: the canvas gets `role="img"` + an `aria-label` describing the
  outcome (not the animation); controls are real buttons.
- Colours in canvas: read the CSS custom properties from `tokens.css` at draw
  time (see `_template/Demo.jsx`), never retype hex values.

## O*NET

Any scene that shows O*NET-derived data (occupations, their RIASEC profiles,
work values, the shortlist, Pearson r, `valuesFit`, the refine picks) passes
`demo-profile.json → onetAttribution` to `DemoShell` as `footnote`. It renders
as a small line under the stage. Salary / outlook never appear in demos.

## Scope

- A *new* demo (not shipped yet): touch only `frontend/demos/<slug>/` and
  `frontend/demos/<slug>.html`; do not edit `App.jsx`, `screens/`, `ui/`,
  `components/`, `tokens.css`, the backend, or the shared kit. If the kit is
  missing something, add it locally in your folder and say so in the summary.
- A shipped scene: its code is in `src/motion/<name>/`; the demo folder holds
  only `Demo.jsx` and demo-only CSS. Changing it changes the product — run the
  whole frontend suite and look at the screen it is mounted in.
- No commits.

## Done

1. Vitest green: `cd frontend && npm test -- --run`.
2. `npm run build` still succeeds and `dist/` contains no demo code (only the
   `index.html` entry).
3. Playwright screenshots at each stage boundary (`?t=<boundary>&paused=1`) at
   `w=360` and `w=1280`, plus one `rm=1` frame — looked at by you, issues fixed.
4. Report: what it shows, files, screenshot paths, known gaps.

## The kit (`demos/kit/` + `src/motion/`)

`timeline.js`, `riasecPlane.js`, `setupCanvas.js` and `useSceneClock.js` moved
to `src/motion/` with the scenes; the files of the same name in `demos/kit/`
re-export them, so `../kit/…` imports keep working. `src/motion/` also has
`usePlayOnce.js`, `useCanvasBox.js` (canvas size + fonts-ready + `readTokens`)
and `viewTransition.js`.

| File | What |
| --- | --- |
| `timeline.js` | Pure: `lerp`, `clamp`, `smoothstep`, `easeOutCubic`, `mulberry32(seed)`, `totalDuration`, `stageAt(T, stages)`, `stageProgress(T, stages, id)`. Stage *i* covers `(start, end]` — T at a boundary shows the earlier stage finished. |
| `riasecPlane.js` | Pure: `HEX_VERTICES` (unit hexagon, R on top, clockwise R I A S E C, screen y-down) and `projectRiasec(riasec)` (min-subtracted, sum-normalised). The single source for the hexagon — never re-derive it. |
| `useSceneClock.js` | One rAF loop → `{T, duration, playing, running, speed, reducedMotion, current, play, pause, toggle, restart, seek, setSpeed, setReducedMotion}`. DemoShell owns it; scenes receive it. |
| `setupCanvas.js` | `setupCanvas(canvas)` → `{ctx, width, height, dpr}`, DPR capped at 2, drawing in CSS px; `null` where there is no 2D context (jsdom) — painters return early. |
| `DemoShell.jsx` | Page chrome + controls. Props: `slug`, `title`, `explains` (one line), `stages`, `footnote?`, `children(clock)`. |
| `params.js` | URL params: `?t=<sec>&paused=1&w=<px>&rm=1` (and `rm=0` to force motion on). |
| `mount.jsx` | `mountDemo(Demo)` for the `.html` entry. |

## Data (`demos/data/`, generated)

Regenerate with `node frontend/demos/scripts/build-demo-data.cjs`. It seeds the fixed dev
persona (`backend/core/devSeed.js` → `DEV_PROFILE`) through the real scoring
and ranking code — never hand-edit these files.

- `occupations.json` — all 923 snapshot occupations: `{soc, title, riasec,
  directionId, workValues}` (`workValues` is `null` for the 40 SOCs O*NET has
  no measurement for).
- `demo-profile.json` — `bigFiveScores`, `riasecScores`, `riasecCode`,
  `valuesOrder`, `valuesScores`, `topDirections` (top 5 families + score),
  `shortlist` (15, each with Pearson `r` and `workValues`), `chosen`
  (`shortlist[0]`), `valuesFit`, `tournamentTrace` (per comparison: `a`, `b`,
  `winner`, `partialOrder` = every `[better, worse]` pair known so far,
  transitively closed), `refineTrace` (3 rounds: `excludedDirectionIds`,
  `topDirections`, `chosen`, `valuesFit`), `roadmap` (the keyless fallback
  roadmap for `chosen`), `onetAttribution`.

## Adding a demo

1. Copy `demos/_template/` to `demos/<slug>/` and
   `demos/_template.html` to `demos/<slug>.html`; point the import at your
   `Demo.jsx`. The index page lists it as built once `Demo.jsx` exists.
2. Define `STAGES` in your engine; one stage per idea the viewer should get.
3. Keep `engine.js` pure and tested; keep `Demo.jsx` a painter.
