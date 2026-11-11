# Animation demos — prompts for Opus 5.5

Порядок: **Промпт 0 первым** (общий стенд + данные + правила). Потом 1–9 в любом порядке,
можно параллельно в разных сессиях — каждая сцена пишет только в свою папку
`frontend/demos/<slug>/` и свой `frontend/demos/<slug>.html`. Коммиты — нет, сначала смотришь сам.

Смотреть: `npm run dev:frontend` → `http://localhost:5173/demos/` (список всех демо).

Приоритет: 1 → 3 → 2 → 7 → 4 → 5 → 8 → 6 → 9.

---

## Промпт 0 — стенд, данные, правила (запустить первым)

```
Task: set up an isolated animation-demo harness in this repo (Life Path Explorer). Demos are
dev-only playgrounds; they must not change the production app or its build.

Read first: CLAUDE.md, frontend/src/theme/tokens.css, frontend/src/ui/branchEngine.js +
frontend/src/ui/BranchCanvas.jsx (the house pattern: pure engine module + thin canvas renderer,
engine unit-tested), backend/core/devSeed.js (DEV_PROFILE), backend/engine/{onet,riasec,workValues}.js,
backend/assessment/valuesTournament.js, and the /api/output/first + /api/output/refine handlers in
backend/server.js.

Build:

1. backend/scripts/build-demo-data.js (CommonJS, run with node, no new deps). It writes:
   a) frontend/demos/data/occupations.json — all 923 snapshot occupations, only
      {soc, title, riasec, directionId, workValues}.
   b) frontend/demos/data/demo-profile.json — DEV_PROFILE scored through the SAME scoring
      functions devSeed.js uses (never reimplement scoring): bigFiveScores, riasecScores,
      riasecCode, valuesOrder, valuesScores (rankToWorkValueScores), topDirections
      (rankDirections, top 5 with scores), shortlist (rankOccupations within those 5, limit 15,
      with Pearson r per item), chosen (shortlist[0]), valuesFit (valuesFit(user, chosen.workValues)),
      tournamentTrace (replay valuesTournament.js with an oracle that answers by valuesOrder; per
      step {a, b, winner, partialOrder}), refineTrace (3 refine rounds mirroring the server's refine
      path: excluded directionIds so far, next topDirections, chosen occupation), roadmap (the
      keyless fallback roadmap aiEngine.js would produce for `chosen`; if the fallback is not
      reachable without the server, hand-write 5 steps in the exact same shape and say so),
      onetAttribution (ONET_ATTRIBUTION from onet.js, verbatim).
   Add an npm script "demo:data" in backend/package.json. Run it; commit nothing.

2. Shared demo kit in frontend/demos/kit/:
   - timeline.js (pure): lerp, clamp, smoothstep, easeOutCubic, mulberry32(seed),
     stageAt(T, stages) where stages = [{id, label, dur}], stageProgress(T, stages, id) → 0..1.
   - riasecPlane.js (pure): projectRiasec(riasec) → {x, y} in a unit hexagon with vertices
     R,I,A,S,E,C at fixed angles (R at top, clockwise), using min-subtracted, sum-normalised
     weights; HEX_VERTICES export. Used by several demos — keep it the single source.
   - useSceneClock.js (React hook): one requestAnimationFrame loop, returns {T, playing, ...controls};
     pauses when the element is off-screen (IntersectionObserver) or the tab is hidden
     (visibilitychange); prefers-reduced-motion → T jumps to the end of the current stage, no loop.
   - setupCanvas.js: size a canvas to its CSS box × devicePixelRatio (cap DPR at 2), return ctx.
   - DemoShell.jsx + demo.css: dark page using tokens.css, title + one-line "what this explains",
     stage label (from the scene's stages), controls: Play/Pause, Restart, scrubber over T,
     speed 0.5/1/2, "reduced motion" toggle, width toggle 360/768/1280 (constrains the stage box).
     URL params for deterministic screenshots: ?t=<sec>&paused=1&w=<px>&rm=1.
   - Vitest tests for timeline.js and riasecPlane.js (smallest checks that fail if the math breaks).

3. frontend/demos/index.html — list of the 9 demo slugs (links; missing ones show "not built yet"):
   occupation-funnel, occupation-map, values-fit, values-insertion, riasec-settle,
   archetype-emblem, refine-shift, roadmap-draw, micro-interactions.
   Plus frontend/demos/_template.html + frontend/demos/_template/Demo.jsx showing how a scene
   plugs into DemoShell.

4. frontend/demos/README.md — the binding rules every demo session reads first. Put in it,
   verbatim in substance:

   DESIGN BAR: think like a senior product designer (Apple / Stripe / Linear / Notion calibre).
   The product is evidence-based career guidance; it must feel handcrafted, scientific, calm,
   mature, premium, and earn trust in 3 seconds. AI stays in the background — never say "AI" in
   scene copy. Every animation explains a real mechanism of the product with real data; nothing is
   decoration. No glow, neon, purple, rainbow gradients, emoji, bouncy springs, or particle
   confetti. Thin lines, lots of black, gold (--gold ramp) as the only accent, bone/white text,
   IBM Plex Mono for data labels, Manrope for prose. Motion: --ease-out, 140–600 ms for UI,
   scenes ≤ 12 s, calm.

   TECH: canvas 2D or SVG; Three.js only if explicitly asked. framer-motion is already installed —
   use it only for DOM layout animations. No new dependencies. Engine = pure module
   (state of frame = f(T, data), no accumulation), renderer = thin component; engine has a vitest
   test. Seeded randomness only. prefers-reduced-motion → meaningful static final frame. Pause
   off-screen and on hidden tab. 60 fps at 360 px on a mid phone; no layout shift. Text in canvas is
   crisp (DPR). Accessible: canvas gets role="img" + aria-label describing the outcome; controls
   are real buttons.

   O*NET: any scene that shows O*NET-derived data renders demo-profile.json → onetAttribution as a
   small footnote. Salary/outlook never appear in demos.

   SCOPE: touch only frontend/demos/<slug>/ and frontend/demos/<slug>.html. Do not edit App.jsx,
   screens/, ui/, components/, tokens.css, backend, or shared kit (if the kit is missing something,
   add it locally in your folder and say so in the summary). No commits.

   DONE = vitest green (cd frontend && npm test -- --run), `npm run build` still succeeds and does
   not include demos, Playwright screenshots at each stage boundary at w=360 and w=1280 plus one
   rm=1 frame, looked at by you, issues fixed. Report: what it shows, files, screenshot paths,
   known gaps.

Verify: dev server serves /demos/ and /demos/_template.html; production build output unchanged
in composition (only index.html entry). Report the files created and the numbers from
demo-profile.json (riasecCode, top 5 families, chosen title, valuesFit).
```

---

## Промпт 1 — `occupation-funnel` (экран «Building your first life path…»)

```
Read frontend/demos/README.md first; its rules are binding. Then CLAUDE.md (Life Path Engine
section), frontend/demos/kit/*, demo-profile.json, occupations.json.

Build demo "occupation-funnel": frontend/demos/occupation-funnel.html +
frontend/demos/occupation-funnel/{funnelEngine.js, funnelEngine.test.js, FunnelCanvas.jsx, Demo.jsx}.

What it explains: while the first result is being prepared, the user watches the real selection
path the backend takes — 923 O*NET occupations → 5 field families that fit their interests →
15 closest by interest profile → one pick. Waiting becomes evidence of method.

Layout: all 923 occupations as small dots (r≈1.6px) placed by projectRiasec(occupation.riasec)
inside a faint hexagon (R I A S E C letters, mono, --text-30), plus deterministic seeded jitter so
clusters read as clouds. A "You" marker (gold ring) at projectRiasec(profile.riasecScores).

Stages (seconds):
 1 "923 occupations from O*NET" (0–2.4): dots fade in, staggered by distance from centre.
 2 "Five field families that match your interests" (2.4–5.0): dots outside topDirections dim to
   ~8%; the 5 families tint toward --gold-60, each gets a small mono label at its centroid.
 3 "The 15 closest profiles" (5.0–8.0): shortlist dots grow to r≈3.5, thin lines from You to each,
   r value (2 decimals, mono) beside the 5 nearest; the rest of the families dim.
 4 "One pick" (8.0–10.5): chosen dot travels to centre, scales up, its title types in under it;
   everything else fades to ~4%.
 5 "Ready" (10.5–12.0): the chosen dot morphs into a rounded pill (radius 14px) with the title —
   the shape of the output node it hands off to.

Loading mode (critical for real use — the AI call has unknown latency): toggle "simulate waiting".
When on, the scene plays 1–3 then holds stage 3 with a slow breathing of the shortlist lines
(no looping back), until a "Response arrived" button is pressed → stages 4–5 play. Engine must
model this as data (holdUntil), not as a branch in the renderer.

Copy uses no "AI". Footnote: onetAttribution. reduced motion → final stage 5 frame.
Engine test: stage boundaries, that the dot set at stage 3 equals the shortlist SOCs, determinism
for the same seed.
```

---

## Промпт 2 — `occupation-map` (фон главного экрана)

```
Read frontend/demos/README.md first; its rules are binding. Then frontend/src/screens/EntryScreen.jsx
(only to see the hero layout you will sit behind — do not edit it), kit/*, occupations.json.

Build demo "occupation-map": frontend/demos/occupation-map.html +
frontend/demos/occupation-map/{mapEngine.js, mapEngine.test.js, MapCanvas.jsx, Demo.jsx}.

What it explains, without words: the space of work is real and measured. 923 real occupations
placed by their O*NET interest profile — the honest equivalent of a decorative particle field.

Ambient scene, no stages:
- Dots at projectRiasec(riasec) with seeded jitter; each drifts on its own tiny seeded orbit
  (radius 1.5–3 px, period 20–40 s) — a position that is a pure function of T.
- Faint hexagon outline and R I A S E C letters (mono, --text-30).
- Every ~4 s one occupation (seeded sequence) brightens to --gold, its title fades in beside it in
  mono 11px, holds 2 s, fades. Never two at once.
- Desktop hover: nearest dot within 12px shows its title; touch: no hover behaviour.
- A soft radial mask keeps the area under the hero copy (left 45% on desktop, top 55% on mobile)
  at ≤25% dot opacity so text stays readable — show a mock hero headline + paragraph in the demo
  to prove legibility; check contrast of the text against the busiest frame.
- Footnote: onetAttribution.
- reduced motion: static field, no highlights.
Perf: draw 923 dots in one path per opacity bucket; measure and report ms/frame at 360 px.
Engine test: position(i, T) deterministic; highlight schedule never overlaps.
```

---

## Промпт 3 — `values-fit` (совпадение по ценностям)

```
Read frontend/demos/README.md first; its rules are binding. Then backend/engine/workValues.js
(WORK_VALUES_ORDER, WORK_VALUES_META labels, valuesFit — understand that it is a CENTERED COSINE,
not an area overlap), frontend/src/components/ProfileCharts.jsx (existing work-values radar look),
kit/*, demo-profile.json.

Build demo "values-fit": frontend/demos/values-fit.html +
frontend/demos/values-fit/{fitEngine.js, fitEngine.test.js, FitFigure.jsx, Demo.jsx}. SVG.

What it explains: where the "fit %" on the output card comes from.

Six-axis radar (axes in WORK_VALUES_ORDER, human labels from WORK_VALUES_META).
Stages:
 1 "Your priorities" (0–1.5): user polygon (valuesScores) draws from centre outward, stroke --bone.
 2 "This occupation" (1.5–3.0): chosen.workValues polygon draws, stroke --gold.
 3 "Where they agree" (3.0–4.5): fill the intersection region with --gold-25. Compute it by
   angular ray sampling (≥360 rays, min radius of the two polygons along each ray, polygons
   interpolated along their edges) — not by per-vertex min.
 4 "Fit" (3.6–5.5): the number valuesFit.overall counts up (easeOutCubic) in large display type,
   with caption "Fit compares the shape of your priorities, not their size." The two values the
   profiles share most get a small gold tick on their axis labels.
The number shown must be the precomputed valuesFit from demo-profile.json — never derived from
the drawn area. Add a second preset (a deliberately poor-fit occupation from occupations.json,
chosen by computing valuesFit in the engine test fixture) toggleable in the demo, to show a low
score looks honest too.
Footnote: onetAttribution. reduced motion → final frame.
Engine test: intersection radius ≤ both radii on every ray; count-up ends exactly at the value.
```

---

## Промпт 4 — `values-insertion` (турнир ценностей)

```
Read frontend/demos/README.md first; its rules are binding. Then
backend/assessment/valuesTournament.js (Ford–Johnson merge-insertion, ≤10 comparisons for 6),
frontend/src/screens/ValuesTournamentScreen.jsx + frontend/src/ui/RankList.jsx (current visuals —
reuse their CSS classes by import, do not edit those files), kit/*, demo-profile.json
(tournamentTrace).

Build demo "values-insertion": frontend/demos/values-insertion.html +
frontend/demos/values-insertion/{insertionModel.js, insertionModel.test.js, InsertionDemo.jsx, Demo.jsx}.
DOM + framer-motion `layout` (FLIP). No canvas.

What it explains: why ten quick choices are enough — each answer slots a value into a growing
ordered list instead of comparing everything with everything.

Left: the current A/B pair as two cards (same look as the tournament screen). Right: the ordered
column built so far. After each answer: the winner card glides into its exact slot in the column
(layout animation 420 ms --ease-out), the other card stays or slots in according to partialOrder
from the trace; the column reflows smoothly. Counter in mono: "Choice 4 · at most 10".
Modes: Auto (replays tournamentTrace, 1.3 s per step) and Manual (you click A or B; the model
must then use the REAL engine logic — import valuesTournament.js only if it runs in the browser
unchanged; otherwise replay the trace and disable Manual, and say so).
End state: full 6-item ranking, a quiet "Confirmed order" label.
reduced motion: no gliding; 120 ms opacity swap only.
Model test: after replaying the trace, final order equals demo-profile.valuesOrder; step count ≤10.
```

---

## Промпт 5 — `riasec-settle` (результат RIASEC)

```
Read frontend/demos/README.md first; its rules are binding. Then frontend/src/screens/RiasecScreen.jsx
(context only), frontend/src/components/ProfileCharts.jsx (interest bars), kit/riasecPlane.js,
demo-profile.json.

Build demo "riasec-settle": frontend/demos/riasec-settle.html +
frontend/demos/riasec-settle/{settleEngine.js, settleEngine.test.js, SettleFigure.jsx, Demo.jsx}. SVG.

Shown only AFTER the quiz is finished (never during answering — live scores would bias answers).
What it explains: what the three-letter interest code means and where it comes from.

Hexagon with six labelled vertices (letter + full name: Realistic, Investigative, Artistic,
Social, Enterprising, Conventional).
Stages:
 1 "Your answers" (0–1.2): six thin spokes grow to length ∝ riasecScores[type].
 2 "Where you sit" (1.2–3.0): a gold point leaves the centre and eases to
   projectRiasec(riasecScores), leaving a faint trail that fades.
 3 "Your code" (3.0–5.0): the three vertices of riasecCode light up in order (gold), and the code
   letters type in large mono beneath: I · A · E, each with its full name.
 4 hold (5.0–6.0).
Toggle 3 sample profiles (dev profile + two synthetic contrasting ones defined in the demo) to show
the point really moves. reduced motion → final frame.
Engine test: point at stage-2 end equals projectRiasec(scores); lit vertices equal riasecCode.
```

---

## Промпт 6 — `archetype-emblem` (эмблема архетипа на Summary)

```
Read frontend/demos/README.md first; its rules are binding. Then frontend/src/lifePath.js
(deriveArchetype, bigFiveTakeaways — Neuroticism is displayed as Emotional Steadiness = 100−N),
frontend/src/screens/SummaryScreen.jsx (context only), kit/*, demo-profile.json.

Build demo "archetype-emblem": frontend/demos/archetype-emblem.html +
frontend/demos/archetype-emblem/{emblemEngine.js, emblemEngine.test.js, EmblemCanvas.jsx, Demo.jsx}.

What it explains: the summary is one person built from three measured layers — a personal,
deterministic mark (same profile → same emblem), worth saving and sharing.

Emblem geometry (pure function of the profile, seeded by a hash of the scores):
- inner layer: 5 Big Five lobes (Steadiness used instead of N), radius ∝ score;
- middle ring: 6 RIASEC arc segments, thickness ∝ score, the riasecCode segments in --gold;
- outer ring: 6 work-value ticks, length by rank (rank 1 longest).
Thin strokes, bone + gold only; it must read like a scientific instrument mark, not a logo toy.
Stages:
 1 "Personality" (0–2): inner lobes draw.
 2 "Interests" (2–4): ring segments sweep in.
 3 "Priorities" (4–5.5): ticks extend.
 4 "You" (5.5–7): deriveArchetype name + one-line descriptor fade in under the emblem.
Controls: 3 profiles (dev + 2 synthetic) to prove variety; "Save PNG" (canvas.toBlob, 1080×1350,
emblem + archetype name + small wordmark text "Invector").
reduced motion → final frame.
Engine test: same profile → identical geometry (deep equal); two different profiles → different.
```

---

## Промпт 7 — `refine-shift` (ответ «Нет» в цикле выдачи)

```
Read frontend/demos/README.md first; its rules are binding. Then the /api/output/refine handler
in backend/server.js and CLAUDE.md "Refine payload" contract (No = regenerate from an unused field
family; no per-parameter tweaks), kit/*, occupations.json, demo-profile.json (refineTrace).
If frontend/demos/occupation-funnel exists, read its engine for the map look and match it
visually — but do not import from it; copy what you need into your folder.

Build demo "refine-shift": frontend/demos/refine-shift.html +
frontend/demos/refine-shift/{shiftEngine.js, shiftEngine.test.js, ShiftCanvas.jsx, Demo.jsx}.

What it explains: "No" doesn't just swap one job — it rules out a whole field and moves you to the
next-best one, so every answer narrows the search.

Map: the same RIASEC-plane dot field (occupations.json, projectRiasec), field families as faint clouds.
State 0: current family bright, chosen occupation as a gold pill with its title.
On "No, show another" (one refine round of refineTrace, ~2.2 s):
 - the current family dims to ~6% and gets a thin dashed outline + mono label "ruled out";
 - the view pans/zooms (2D transform, --ease-out) to the next family from the trace, which brightens;
 - its chosen occupation becomes the new gold pill; a small counter "2 fields ruled out".
Up to 3 rounds, then "Reset". Ruled-out families stay visibly ruled out.
Footnote: onetAttribution. reduced motion → crossfade between states, no pan.
Engine test: after k rounds the ruled-out set equals refineTrace[k].excluded; camera transform at
round end centres the new family centroid.
```

---

## Промпт 8 — `roadmap-draw` (прорисовка дорожной карты)

```
Read frontend/demos/README.md first; its rules are binding. Then
frontend/src/components/GraphView/{index.jsx, BranchEdge.jsx, NodeComponent.jsx, *.css} (current
graph look — reuse classes by import, do not edit), kit/*, demo-profile.json (roadmap, chosen).

Build demo "roadmap-draw": frontend/demos/roadmap-draw.html +
frontend/demos/roadmap-draw/{roadmapTimeline.js, roadmapTimeline.test.js, RoadmapDemo.jsx, Demo.jsx}.
Use @xyflow/react (already installed) with a demo-local custom edge.

What it explains: the plan is a sequence you walk, not a wall of text.

Layout: chosen occupation node on top, roadmap steps below as a vertical chain (mobile) / gentle
zig-zag (≥768 px). Each step: the edge from the previous node draws with stroke-dashoffset
(getTotalLength, 600 ms --ease-out), then the step node fades + rises 6px (220 ms), then its
timeframe label appears in mono. Steps are sequenced from a pure timeline (roadmapTimeline.js:
step i → {edgeStart, edgeEnd, nodeIn}). Camera does one fitView at start and none mid-sequence
(no jumpy panning). "Replay" button.
reduced motion → full roadmap shown at once.
Timeline test: no overlaps, monotonic, total ≤ 6 s for 5–7 steps.
```

---

## Промпт 9 — `micro-interactions` (переходы, Likert, rail)

```
Read frontend/demos/README.md first; its rules are binding. Then frontend/src/ui/LikertScale.jsx,
frontend/src/screens/StepRail.jsx, frontend/src/ui/ScreenShell.jsx and their CSS (ui.css,
screens.css), tokens.css (--t-fast, --t-base, --ease-out). Note the CSS cascade order
ui.css → screens.css → App.css.

Build demo "micro-interactions": frontend/demos/micro-interactions.html +
frontend/demos/micro-interactions/{Demo.jsx, micro.css}. CSS first; JS only where CSS can't.
Do NOT edit the real components — render them as-is and layer the proposed styles from micro.css
scoped under a .demo-micro wrapper, so the diff to adopt later is obvious.

Three panels, each with "current" vs "proposed" side by side:
 a) Slide change: two mock question slides; proposed uses document.startViewTransition (feature-
    detected, plain swap fallback) — outgoing fades + moves 12px left, incoming from 12px right,
    --t-base, --ease-out; the shared header stays still (view-transition-name).
 b) Likert: press feedback (scale .97 on :active, --t-fast), selected fill transition, focus ring
    visible on keyboard only (:focus-visible). No bounce.
 c) Journey rail: the progress line fills with transform: scaleX (not width) when a step completes;
    completed dot gets a 1-frame-cheap gold fill transition.
reduced motion: all transitions → opacity only, ≤120 ms.
At the end of the page write a short "Adoption" list: per panel, the exact selectors and properties
that would move into ui.css / screens.css.
Done = screenshots of each panel before/after + one rm=1 frame; no vitest needed (no logic) unless
you add JS logic.
```
