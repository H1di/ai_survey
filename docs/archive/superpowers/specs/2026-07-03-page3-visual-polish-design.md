# Page 3 Visual Polish — Design

**Date:** 2026-07-03
**Scope:** Frontend only (`frontend/src`). No backend changes. Pages 1–2 visually untouched.
**Base:** branch `feat/page3-roadmap` (direction → professions → confirm → roadmap flow, monochrome minimal style).

## Goal

Make the Page 3 graph feel alive while keeping the premium-minimal language: coordinated "line draws → node appears" cascades, a directed camera, a continuously flowing purple highlight along the chosen path, smooth dock-card transitions, and brand-purple accents on interactive UI — without recoloring the nodes or touching Pages 1–2.

## Decisions (from user interview)

1. **Direction:** living minimalism + brand purple accents (combination), nodes stay monochrome.
2. **Motion elements:** camera-director, flowing edges, cascading appearances. No idle "breathing" node pulse.
3. **Purple (#863bff) applies to:** chosen-path edges + interactive UI (primary buttons, roadmap stage indices, dock category headings, selected/final node borders). NOT node fills, NOT background glow, NOT per-depth color progression.
4. **Layout:** unchanged (vertical: Me → Direction → 3 professions → vertical roadmap chain).
5. **Tempo:** calm premium (soft easing, unhurried), with one hard rule: **a node appears immediately at the moment its edge finishes drawing** — the node pop itself is fast (180ms), only the line travel is slow.

## 1. Cascade timing model

All timing is computed in `buildLifePathGraph` (App.jsx) and passed declaratively; no JS orchestrator, no timers.

**Constants** (module-level in App.jsx):
```js
const EDGE_DRAW_MS = 600;      // line travel time, all edges
const PROFESSION_STAGGER_MS = 180;
const ROADMAP_STEP_MS = 600;   // sequential step for roadmap chain
```

**Per-wave schedule** (delays are relative to the wave's render, i.e. when the nodes/edges first mount):

| Wave | Edge start | Node appears |
|---|---|---|
| Direction | me→direction at 0 | direction at `EDGE_DRAW_MS` |
| Professions | edge *i* at `i * PROFESSION_STAGGER_MS` | profession *i* at `i * PROFESSION_STAGGER_MS + EDGE_DRAW_MS` |
| Roadmap | edge to stage *k* (0-based) at `k * ROADMAP_STEP_MS` | stage *k* at `k * ROADMAP_STEP_MS + EDGE_DRAW_MS` |

With `ROADMAP_STEP_MS == EDGE_DRAW_MS` the roadmap reads as strictly sequential: each line starts the moment the previous node has popped. Full 6-stage reveal ≈ 3.8s under camera movement.

**Mechanism:**
- Edges: existing `data.delay` → `animationDelay` in `BranchEdge` (unchanged mechanism); draw animation duration becomes 600ms.
- Nodes: `buildLifePathGraph` sets React Flow node `style: { '--appear-delay': '<ms>ms' }` (CSS var on the wrapper). `NodeComponent.css` replaces the current 450ms/200ms `node-appear` on graph nodes with:
```css
animation: node-pop 180ms ease-out both;
animation-delay: var(--appear-delay, 0ms);
```
`@keyframes node-pop { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }`
- Applies to `.node--direction`, `.node--profession`, `.node--roadmap`. `MeNode` keeps its ring-draw intro. Already-mounted nodes never re-animate (React Flow preserves mounted node DOM; keys/ids are stable across snapshot re-renders).

## 2. Active path: purple + continuous flow

**Active-edge computation** (in `buildLifePathGraph`): an edge gets `data.active = true` when it lies on the confirmed chain:
- `me → direction` — once `direction` is confirmed;
- `direction → profession` — only for `selectedProfession`;
- all roadmap chain edges — when the rendered roadmap belongs to `selectedProfession`.

Everything else keeps `data.active = false` (gray, static, exactly as today).

**Rendering** (`BranchEdge.jsx`, two stacked paths):
1. **Base path** — the existing draw-in path. When `data.active`: `stroke: var(--color-accent)`, `stroke-width: 1.5`; otherwise current gray 1px.
2. **Flow path** (rendered only when `data.active`) — same geometry, `stroke: var(--color-accent)`, `opacity: 0.45`, `stroke-dasharray: 6 10`, infinite linear `stroke-dashoffset` animation (~2.5s per cycle, direction: from source to target, i.e. downward). It fades in (`opacity 0→0.45`, 300ms) with `animation-delay = data.delay + EDGE_DRAW_MS` so flow never precedes the draw-in.

Two paths are required because the draw-in effect and the flow effect both use `stroke-dasharray`/`dashoffset` and cannot share one path.

**State transitions:** when an inactive edge becomes active (e.g. profession selected), only its color/flow change — no re-draw animation (the draw-in keyframe is `both`-filled and its delay has long passed; React Flow keeps the same edge element since the id is stable).

## 3. Camera director

- `GraphView` gets a new prop `focusKey: string` and internally renders a tiny `<CameraDirector focusKey nodeIds>` child (inside `ReactFlow`) using `useReactFlow()`.
- On `focusKey` change (in a `useEffect`), it calls `fitView({ nodes: nodeIds.map(id => ({ id })), duration: 900, padding: 0.25 })`.
- App.jsx derives both from state:
  - no direction → `focusKey="start"`, nodes `["me"]`
  - direction, no professions → `"direction"`, `["me", "direction"]`
  - professions, no roadmap → `"professions"`, `["direction", ...professionIds]`
  - roadmap rendered → `` `roadmap-${roadmap.professionId}` ``, `[selectedProfession.id, ...stageNodeIds]`
- The camera fires at wave start so the drawing happens in frame. Manual pan/zoom is never hijacked between waves (effect runs only on `focusKey` change).
- `fitView` gracefully zooms out for the 6-node chain (minZoom 0.3 already configured).

## 4. Dock transitions (framer-motion)

- The dock's inner card is wrapped in `<AnimatePresence mode="wait">` + `motion.div`, keyed by card identity: `dir-<questionId>` / `"proposal"` / `"narrow-prompt"` / `nar-<questionId>`.
- Exit: `y: 12, opacity: 0`, 250ms. Enter: `y: 12 → 0, opacity: 0 → 1`, 350ms, ease `[0.22, 1, 0.36, 1]` (same curve as the modals).
- The dock wrapper (`.graph-question-dock`) itself stays static; only cards animate. When the dock disappears entirely (professions shown), the last card exits through the same `AnimatePresence`.

## 5. Purple accent scope (Page 3 only)

**New global tokens** in `frontend/src/index.css` (additive only — changes nothing visually by itself):
```css
--color-accent: #863bff;
--color-accent-strong: #7326e6; /* hover */
--color-accent-soft: rgba(134, 59, 255, 0.12); /* shadows/backgrounds */
```

**Scoped applications** (no selector may leak into Pages 1–2):
| Element | Selector | Change |
|---|---|---|
| Dock primary buttons | `.graph-page .primary-action` | background → accent; hover → accent-strong |
| Confirm modal "Yes" | `.confirm-yes` | background → accent; hover → accent-strong |
| Dock category headings | `.graph-question-dock .question-category` | color → accent |
| Roadmap stage index circles | `.node-roadmap-index` | border + text → accent |
| Selected profession | `.node--profession-selected` | border → accent; `box-shadow: 0 2px 16px var(--color-accent-soft)` |
| Final roadmap stage | `.node--roadmap-last` | border → accent |
| Active edges + flow | `.branch-edge--active`, `.branch-edge-flow` | stroke → accent (see §2) |

Nodes' backgrounds, text, and all Page 1–2 styles remain untouched. `.primary-action` outside `.graph-page` (survey/entry) keeps its current black.

## 6. Accessibility & guardrails

```css
@media (prefers-reduced-motion: reduce) {
  .branch-edge, .branch-edge-flow, .node--direction, .node--profession, .node--roadmap { animation: none !important; }
}
```
plus `CameraDirector` uses `duration: 0` when `window.matchMedia('(prefers-reduced-motion: reduce)')` matches. Dock motion.div transitions drop to `duration: 0` under the same check.

## Files touched

| File | Change |
|---|---|
| `frontend/src/App.jsx` | timing constants, per-node `--appear-delay`, `data.active` on edges, `focusKey`/`focusNodeIds` derivation, dock `AnimatePresence` |
| `frontend/src/components/GraphView/index.jsx` | `focusKey`/`focusNodeIds` props, `CameraDirector` child |
| `frontend/src/components/GraphView/BranchEdge.jsx` | active styling + second flow path |
| `frontend/src/components/GraphView/GraphView.css` | 600ms draw, `--active` stroke, flow keyframes, reduced-motion |
| `frontend/src/components/GraphView/NodeComponent.css` | `node-pop` keyframe + per-type delays, accent borders/shadows |
| `frontend/src/components/GraphView/GraphPage.css` | dock heading accent |
| `frontend/src/components/GraphView/ConfirmModal.css` | accent button |
| `frontend/src/index.css` | three accent tokens (additive) |

## Verification

- `vite build` + `eslint` green.
- Playwright smoke of the full Page 3 flow (existing checkpoint script): cascade order observable (direction node absent until ~600ms after wave start), flow path present only on active edges, purple applied per the table, dock cards animate, camera recenters per wave, no purple anywhere on Pages 1–2.

## Out of scope

Backend, Pages 1–2, graph layout changes, node recoloring, background effects, dark theme, sounds.
