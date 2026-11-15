# Hand-off — animation demos → production (2026-11-11)

Task prompt: `project-plans/2026-11-11-demo-integration-prompt.md`. No commits; everything is in the working tree. **The work is complete; this file is the review guide.**

## Verified at the end

- `cd backend && npm test` — 200/200 (one new test).
- `cd frontend && npm test -- --run` — 279/279 in 38 files (baseline 220 in 33).
- `npx eslint src demos` — clean.
- `npm run build` — succeeds; `dist/` holds no demo code.
- Browser, keyless backend, real UI from the RIASEC quiz to the roadmap, at 1280 px and 360 px, each with and without reduced motion, with the first-output and refine responses slowed (11 s / 4 s) so the waiting states show. No console errors. Every demo page and the index open at both widths.

## Bundle

| | before | after | delta (gzip) |
| --- | --- | --- | --- |
| main JS | 878.16 kB / 269.45 gz | 946.05 kB / 293.38 gz | +23.9 kB |
| CSS | 48.49 kB / 9.13 gz | 63.99 kB / 11.99 gz | +2.9 kB |
| `onet-field` (new, lazy) | — | 66.62 kB / 21.19 gz | +21.2 kB |

Total +48 kB gzip, of which 21 kB loads only from the summary step on. Under the 60 kB flag.

## Where each demo landed

All engines + renderers moved from `frontend/demos/<slug>/` to `frontend/src/motion/` (demo pages import from there; `demos/kit/{timeline,riasecPlane,setupCanvas,useSceneClock}.js` are re-export shims).

| Demo | Shipped component (`src/motion/…`) | Mounted in |
| --- | --- | --- |
| riasec-settle | `settle/RiasecSettle` | new `screens/RiasecResultScreen` — a view over step `values`, shown once after the quiz closes (`riasecReveal` in App) |
| values-insertion | `insertion/InsertionBoard` | `ValuesTournamentScreen` body (the cards are the real answer buttons); `ValuesHierarchyScreen` gets the "N answers placed all six" line |
| archetype-emblem | `emblem/ArchetypeEmblem` (+ `savePng`, `drawEmblem`) | `SummaryScreen`, above the archetype name |
| occupation-funnel | `funnel/OccupationFunnel` | new `screens/FirstPathScreen` (step `tree`) |
| occupation-map | `map/OccupationMap` (figure variant) | `OutputDecision` job column via `OutputFieldFigure`, settled state |
| refine-shift | `shift/FieldShift` | same figure box: `leaving` while `busy.refine`, `arriving` on the new card |
| values-fit | `fit/ValuesFit` (compact) | output details panel (`handleOutputOpen` → section `figure`; panel gets `detail-panel--wide`) |
| roadmap-draw | `roadmap/{RoadmapReveal,revealContext,roadmapTimeline}` | `GraphView` wraps ReactFlow; `RoadmapNode` / `BranchEdge` read the clock; `lifePath.js` takes its delays from the timeline |
| micro-interactions | CSS in `ui/ui.css` (slide change via view transitions, Likert press/fill/focus) and `screens/screens.css` (rail line + dots, button press), `viewTransition.js`, `ui/RankList.jsx` (reorder glide, WAAPI) | all assessment screens |

Shared: `usePlayOnce.js`, `useCanvasBox.js`, `onetField.js` + `data/onet-field.json`, `frontend/scripts/build-onet-field.cjs`.

## Decisions worth a look in review

- **One additive backend field**: `valuesDecided` in `serializeSessionState` (`[{a,b,winner}]`, null outside a running tournament) + a test. After a reload the partial order cannot be derived from anything else in the snapshot.
- **Shortlist / Pearson r / top-5 families** are re-derived client-side from `onet-field.json`; `onetField.test.js` pins both the data and the ranking to the backend modules and fails on drift.
- **Flow change on `tree`**: `handleEnterLifePath` only applies the snapshot; `FirstPathScreen.onDone` moves to the graph (scene end, "See your path", or at once with reduced motion / no field / a resumed session). With motion on, a fast response means up to ~12 s of scene unless the user clicks the button, which is enabled the moment the result exists. Side effect: returning to `tree` with outputs already present no longer sticks on the loading screen.
- **New interstitial**: the interest result sits between the last RIASEC answer and the values step. It adds one click; the step machine is untouched.
- **occupation-map deviation**: the demo was an ambient hero background; per the prompt it ships as a figure on the result card. The hero study is kept in the demo behind `?view=hero`.
- **Cut**: the cross-screen glide of rows from the tournament column into the confirm list (`RankList` uses native HTML5 drag, which framer-motion elements swallow). Reorder inside the list does glide.
- **Left alone**: existing copy containing "AI" (`SummaryScreen` sub, "AI Recommendations", the demo-mode notice) — pinned by existing tests, not part of the scenes.

## Known, not fixed

- **Graph header overflows 47 px at 360 px in keyless mode** ("Demo mode" notice + "My profile" do not fit). Existing code, untouched by this work.
- **The result card is taller than the canvas at 1280×820** with the verbose keyless bullets and scrolls inside the dock. Also existing; the figure was sized (300×225) so it adds no height beyond the attribution line.
- In the refine "ruled out" frame the family label can touch the hexagon's `R` letter when the family sits at the top of the map.
- Not exercised in a browser: a real-key (slow, AI) run, and a failed `/api/output/first` on the funnel screen (covered by reasoning and the unit tests only: the scene keeps holding and the existing error row offers "Try again").

## Screenshots

`/tmp/claude-1000/-home-eugene-ai-survey-2/4acccc1f-fb24-465d-b521-2ac3b6f8e08f/scratchpad/shots/` — `<width>[-rm]-NN-<moment>.png` for the journey (e.g. `1280-13-funnel-waiting-10s.png`, `360-18-fit-settled.png`, `1280-rm-19b-refine-waiting.png`), `demo-<width>-<slug>.png` for the demo pages. The folder is session scratch — copy what you want to keep.

Re-running the walk: start a keyless backend from a directory without `.env` (`DEV_TOOLS_TOKEN=devtest PORT=3001 node backend/server.js` — an empty `OPENAI_API_KEY` is deleted and `.env` is loaded, so the cwd is what makes it keyless), `npx vite` in `frontend/`, then `node walk.mjs <width> <rm 0|1>` from the scratchpad's `pw/`. Many runs in a row trip the backend rate limit (429).

Both dev servers started in this session are stopped.
