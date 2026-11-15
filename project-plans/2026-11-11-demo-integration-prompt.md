# Prompt for Fable 5.2 — integrate the animation demos into the site

```
Task: the nine animation demos in frontend/demos/ are built and approved as playgrounds. Turn them
into real, production features of Life Path Explorer: finish every demo to shipping quality and
wire each one into the screen where its mechanism actually happens. Do the whole job end to end —
no "left as follow-up", no stubs.

Read first (all of it): CLAUDE.md, frontend/demos/README.md (design bar + tech rules — they bind
the shipped versions too), frontend/demos/catalog.js, every frontend/demos/<slug>/ folder
(engine + test + Demo.jsx), frontend/demos/kit/, frontend/src/App.jsx, frontend/src/screens/*,
frontend/src/ui/*, frontend/src/components/GraphView/, frontend/src/theme/tokens.css,
frontend/src/lifePath.js.

Demo → placement (confirm against the code, deviate only with a reason you state):
- riasec-settle        → RiasecScreen result moment (profile settling on the hexagon).
- values-insertion     → ValuesTournamentScreen (each A/B answer inserts into the ranking) and
                         ValuesHierarchyScreen (final order).
- archetype-emblem     → SummaryScreen (the character conclusion).
- occupation-funnel    → "Building your first life path…" pulse on step `tree` (923 → 5 families
                         → 15 shortlist → 1 pick), real data from the response, not demo JSON.
- occupation-map       → OutputDecision / first-output view (where the chosen job sits among
                         the shortlist).
- values-fit           → the valuesFit display on the output (user hierarchy vs the job's O*NET
                         work values).
- refine-shift         → the "No" regeneration transition (different field family).
- roadmap-draw         → the roadmap node/graph reveal after accept.
- micro-interactions   → apply across screens: buttons, Likert, rank list, step rail, dock.

How:
1. Production versions take REAL data from the session snapshot / API responses, never from
   frontend/demos/data/*.json. Demos keep working on the fixture; shipped components get props.
   Shared engines move to frontend/src/ui/ (or a feature folder), pure engine + thin renderer, vitest
   per engine. The demo page then imports the shipped component, so there is one implementation.
2. Keep every rule from demos/README.md: Canvas/SVG, no new dependencies, seeded randomness,
   `prefers-reduced-motion` → meaningful static final frame, pause off-screen/hidden tab, 60 fps at
   360 px, zero layout shift, crisp DPR canvas text, role="img" + outcome aria-label, colours from
   tokens.css only. No "AI" in copy.
3. Animations must never block the flow: the user can always answer/continue immediately; an
   animation that finishes late cannot delay a click or change execution order. Respect the
   existing step machine, rail navigation, and single-flight locks.
4. Keyless mode and slow/failed API must still render a sensible state (the funnel and refine
   transition wait on real responses — loop calmly, never fake results).
5. O*NET: any scene showing O*NET-derived data keeps the OnetAttribution requirements from
   CLAUDE.md. Salary/outlook never inside animations.
6. Don't touch backend contracts. If an engine needs data the snapshot lacks (e.g. Pearson r for
   the shortlist, tournament partial order), derive it client-side from what exists; only if truly
   impossible, add a field to the snapshot additively, update serializeSessionState + tests, and say so.
7. Existing tests keep passing; update the ones your changes legitimately affect. Add tests for
   each new engine and for each screen's reduced-motion/static state.

Done when (verify, don't assert):
- `cd backend && npm test` and `cd frontend && npm test -- --run` green; `npm run build` succeeds
  and bundle growth is reported (flag anything > ~60 kB gzip).
- Run the app (`npm run dev`, use ?dev=<token> DevPanel to jump steps) and walk the full journey
  entry → detail at 360 px and 1280 px, with and without reduced motion, keyless. Screenshot each
  integrated moment with Playwright, LOOK at them, fix what's off (overflow, jank, clipped canvas
  text, layout shift).
- Demo index still works and shows the shipped components.
- Report: per demo — where it landed, files, screenshots paths, bundle delta, anything deliberately
  cut and why. No commits; leave the working tree for my review.
```
