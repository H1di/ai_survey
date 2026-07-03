# Page 3 Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved visual-polish spec for Page 3 — synchronized "line draws → node pops" cascades, purple flowing chosen-path edges, a camera director, animated dock-card transitions, and brand-purple UI accents.

**Architecture:** All timing stays declarative: `buildLifePathGraph` (App.jsx) computes per-edge `data.delay` / per-node `--appear-delay` CSS vars; CSS keyframes do the animation. Active-path highlighting is a `data.active` flag rendered by `BranchEdge` as a second flowing SVG path. Camera is a `useReactFlow().fitView` effect keyed on a `focusKey` prop. Dock cards animate via framer-motion `AnimatePresence` (already a dependency).

**Tech Stack:** React 19 + Vite, `@xyflow/react`, framer-motion, plain CSS. No new dependencies. No test runner in frontend — every task's gate is `vite build` + `eslint` green, plus stated visual checks; Task 6 is a full Playwright verification sweep.

**Spec:** `docs/superpowers/specs/2026-07-03-page3-visual-polish-design.md` — the authoritative design. Exact values below are copied from it.

## Global Constraints

- Frontend only (`frontend/src` + `frontend/src/index.css`). **No backend changes. No changes to Pages 1–2 visuals**: the entry/survey JSX in App.jsx and all styles they use keep rendering identically — accent overrides must be scoped under `.graph-page`, `.graph-question-dock`, `.confirm-*`, or `.node-*` selectors only.
- Accent tokens exactly: `--color-accent: #863bff`, `--color-accent-strong: #7326e6`, `--color-accent-soft: rgba(134, 59, 255, 0.12)`.
- Timing constants exactly: `EDGE_DRAW_MS = 600`, `PROFESSION_STAGGER_MS = 180`, `ROADMAP_STEP_MS = 600`; node pop 180ms ease-out; camera 900ms; flow cycle 2.5s linear; dock enter 350ms `[0.22,1,0.36,1]` / exit 250ms.
- **Hard rule:** a node appears exactly when its edge finishes drawing (node delay = edge delay + `EDGE_DRAW_MS`); the pop itself is fast.
- Nodes stay monochrome (no purple fills/text in node bodies; only borders/index-circles per spec §5 table).
- `prefers-reduced-motion: reduce` disables draw/pop/flow animations and camera/dock motion.
- Every commit keeps `cd frontend && npx vite build` and `npm run lint` green. Commit messages end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## Current-State Anchors (verified)

- `App.jsx` layout constants block starts `const ME_NODE = ...` followed by `DIRECTION_Y/PROFESSION_Y/PROFESSION_GAP/ROADMAP_START_Y/ROADMAP_GAP` and `buildLifePathGraph` (edge delays today: professions `index * 180`, roadmap `index * 120`; nodes have no style/delay).
- `App.css:43-76` — `.primary-action` is a pill (`border-radius: 999px`) with `#111111` background; the hover group selector `.primary-action:hover:enabled` has specificity (0,3,0), so scoped overrides MUST include `:hover:enabled` to win. `.question-category` color is `#555555` (App.css:167-173).
- `BranchEdge.jsx` renders a single path with `pathLength="1"` + `animationDelay` from `data.delay`.
- `GraphView.css` — `.branch-edge` draw animation is 800ms; `NodeComponent.css` — `.node--direction/--profession/--roadmap` use `node-appear 450ms ... 200ms both`.
- Dock in App.jsx is four separate `{condition && <div className="graph-question-dock">...}` blocks.
- `GraphView/index.jsx` exports `GraphView({ nodes, edges })` with `fitView` prop on `<ReactFlow>`.

## File Map

| File | Tasks | Responsibility |
|---|---|---|
| `frontend/src/index.css` | 1 | three accent tokens (additive) |
| `frontend/src/components/GraphView/GraphPage.css` | 1, 5 | scoped button/heading accents; dock pointer-events |
| `frontend/src/components/GraphView/ConfirmModal.css` | 1 | accent "Yes" button |
| `frontend/src/components/GraphView/NodeComponent.css` | 1, 2 | accent borders/index; `node-pop` keyframe + delays |
| `frontend/src/App.jsx` | 2, 3, 4, 5 | timing constants, `--appear-delay`, `data.active`, focus derivation, dockCard + AnimatePresence |
| `frontend/src/components/GraphView/GraphView.css` | 2, 3 | 600ms draw; active/flow styles; reduced-motion |
| `frontend/src/components/GraphView/BranchEdge.jsx` | 3 | active styling + flow path |
| `frontend/src/components/GraphView/index.jsx` | 4 | `focusKey`/`focusNodeIds` props + `CameraDirector` |

---

### Task 1: Accent tokens + static purple UI

**Files:**
- Modify: `frontend/src/index.css` (`:root` block)
- Modify: `frontend/src/components/GraphView/GraphPage.css` (append)
- Modify: `frontend/src/components/GraphView/ConfirmModal.css` (`.confirm-yes` rules)
- Modify: `frontend/src/components/GraphView/NodeComponent.css` (three selector color changes)

**Interfaces:**
- Consumes: existing CSS vars/classes.
- Produces: `--color-accent`, `--color-accent-strong`, `--color-accent-soft` tokens used by Tasks 2–3.

- [ ] **Step 1: Add tokens to `frontend/src/index.css`**

In the `:root` block, after the line `--color-locked: #d0d0d0;`, insert:

```css
  --color-accent: #863bff;
  --color-accent-strong: #7326e6;
  --color-accent-soft: rgba(134, 59, 255, 0.12);
```

- [ ] **Step 2: Scoped button + heading accents in `GraphPage.css`**

Append at end of file:

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

.graph-question-dock .question-category {
  color: var(--color-accent);
}
```

(The `:hover:enabled` variant is required: App.css's hover group has specificity (0,3,0) and would otherwise win.)

- [ ] **Step 3: Accent "Yes" button in `ConfirmModal.css`**

Replace:

```css
.confirm-yes {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-bg);
  background: var(--color-text);
  padding: 12px 20px;
  border-radius: 2px;
  transition: opacity var(--transition);
}

.confirm-yes:hover:not(:disabled) { opacity: 0.85; }
```

with:

```css
.confirm-yes {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-bg);
  background: var(--color-accent);
  padding: 12px 20px;
  border-radius: 2px;
  transition: background var(--transition);
}

.confirm-yes:hover:not(:disabled) { background: var(--color-accent-strong); }
```

(`.confirm-yes:disabled { opacity: 0.5; cursor: default; }` stays unchanged.)

- [ ] **Step 4: Accent borders/index in `NodeComponent.css`**

Three replacements:

```css
.node--profession-selected {
  border-color: var(--color-text);
}
```
→
```css
.node--profession-selected {
  border-color: var(--color-accent);
  box-shadow: 0 2px 16px var(--color-accent-soft);
}
```

```css
.node--roadmap-last {
  border-color: var(--color-text);
}
```
→
```css
.node--roadmap-last {
  border-color: var(--color-accent);
}
```

In `.node-roadmap-index`, change the two lines
`color: var(--color-text-faint);` → `color: var(--color-accent);`
and `border: 1px solid var(--color-border);` → `border: 1px solid var(--color-accent);`
(all other declarations in that rule unchanged).

- [ ] **Step 5: Verify build + lint + Pages 1–2 isolation**

Run: `cd frontend && npx vite build 2>&1 | tail -3 && npm run lint`
Expected: build green, lint exits 0.
Isolation check (grep — accent must appear only in graph-scoped files):
`grep -rn "color-accent" frontend/src --include="*.css" | grep -v "index.css" | grep -v "GraphView/"`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/index.css frontend/src/components/GraphView/GraphPage.css frontend/src/components/GraphView/ConfirmModal.css frontend/src/components/GraphView/NodeComponent.css
git commit -m "feat(frontend): brand purple accent tokens and Page 3 UI accents"
```

---

### Task 2: Cascade timing — line draws, node pops on arrival

**Files:**
- Modify: `frontend/src/App.jsx` (constants + `buildLifePathGraph`)
- Modify: `frontend/src/components/GraphView/NodeComponent.css` (keyframes + animation lines)
- Modify: `frontend/src/components/GraphView/GraphView.css` (draw duration, reduced-motion for nodes lives in NodeComponent.css)

**Interfaces:**
- Consumes: nothing new.
- Produces: `EDGE_DRAW_MS = 600`, `PROFESSION_STAGGER_MS = 180`, `ROADMAP_STEP_MS = 600` module constants in App.jsx (Task 3's flow delay and Task 6's checks reference them); node wrapper `style: { "--appear-delay": "<ms>ms" }` convention.

- [ ] **Step 1: Add timing constants in `App.jsx`**

After the line `const ROADMAP_GAP = 200;` insert:

```jsx
// Cascade timing: a node appears exactly when its edge finishes drawing.
const EDGE_DRAW_MS = 600;
const PROFESSION_STAGGER_MS = 180;
const ROADMAP_STEP_MS = 600;
```

- [ ] **Step 2: Wire delays through `buildLifePathGraph`**

Four edits inside `buildLifePathGraph`:

(a) Direction node — add `style`:

```jsx
  nodes.push({
    id: "direction",
    type: "direction",
    position: { x: 0, y: DIRECTION_Y },
    draggable: true,
    style: { "--appear-delay": `${EDGE_DRAW_MS}ms` },
    data: { label: direction.label },
  });
```

(b) Profession nodes/edges — stagger constants and arrival sync:

```jsx
  professionOptions.forEach((profession, index) => {
    const edgeDelay = index * PROFESSION_STAGGER_MS;
    nodes.push({
      id: profession.id,
      type: "profession",
      position: { x: professionX(index, professionOptions.length), y: PROFESSION_Y },
      draggable: true,
      style: { "--appear-delay": `${edgeDelay + EDGE_DRAW_MS}ms` },
      data: {
        title: profession.title,
        summary: profession.summary,
        selected: profession.id === selectedProfessionId,
        onOpen: () => onProfessionOpen(profession),
      },
    });
    edges.push({
      id: `direction-${profession.id}`,
      source: "direction",
      target: profession.id,
      type: "branch",
      data: { delay: edgeDelay },
    });
  });
```

(c) Roadmap stages — sequential chain (replaces `delay: index * 120`):

```jsx
    roadmap.stages.forEach((stage, index) => {
      const nodeId = `stage-${stage.id}`;
      const parentId = index === 0 ? anchor.id : `stage-${roadmap.stages[index - 1].id}`;
      const edgeDelay = index * ROADMAP_STEP_MS;
      nodes.push({
        id: nodeId,
        type: "roadmap",
        position: { x: anchorX, y: ROADMAP_START_Y + index * ROADMAP_GAP },
        draggable: true,
        style: { "--appear-delay": `${edgeDelay + EDGE_DRAW_MS}ms` },
        data: {
          index: index + 1,
          title: stage.title,
          timeframe: stage.timeframe,
          last: index === roadmap.stages.length - 1,
          onOpen: () => onStageOpen(stage, index),
        },
      });
      edges.push({
        id: `${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
        type: "branch",
        data: { delay: edgeDelay },
      });
    });
```

(d) The `me → direction` edge keeps `data: { delay: 0 }` — unchanged.

- [ ] **Step 3: Replace node entrance animation in `NodeComponent.css`**

Replace the `node-appear` keyframes block and the three per-type animation declarations. Delete:

```css
@keyframes node-appear {
  from { opacity: 0; transform: scale(0.94); }
  to   { opacity: 1; transform: scale(1); }
}
```

and in each of `.node--direction`, `.node--profession`, `.node--roadmap` replace the line

```css
  animation: node-appear 450ms cubic-bezier(0.22, 1, 0.36, 1) 200ms both;
```

with

```css
  animation: node-pop 180ms ease-out both;
  animation-delay: var(--appear-delay, 0ms);
```

Then append at end of file:

```css
/* Fast pop at the moment the edge's line arrives (delay set per-node via --appear-delay) */
@keyframes node-pop {
  from { opacity: 0; transform: scale(0.85); }
  to   { opacity: 1; transform: scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .node--direction,
  .node--profession,
  .node--roadmap {
    animation: none;
  }
}
```

(React Flow puts the node `style` on the wrapper div; `var(--appear-delay)` inherits into `.node`. `animation: none` shows nodes immediately because base styles never set opacity 0.)

- [ ] **Step 4: Edge draw duration 600ms in `GraphView.css`**

Replace:

```css
  animation: branch-draw 800ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
```

with:

```css
  /* duration must equal EDGE_DRAW_MS in App.jsx */
  animation: branch-draw 600ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
```

- [ ] **Step 5: Verify build + lint + cascade visually**

Run: `cd frontend && npx vite build 2>&1 | tail -3 && npm run lint`
Expected: green/clean.
Visual (dev servers on :5173/:3001, blank-key fallback): walk to Page 3; confirm the direction node pops only after the line reaches it (~600ms), professions arrive staggered left-to-right, roadmap reveals strictly one step at a time (~600ms/step, full chain ≈ 3.8s).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/GraphView/NodeComponent.css frontend/src/components/GraphView/GraphView.css
git commit -m "feat(frontend): synchronized line-draw -> node-pop cascade timing"
```

---

### Task 3: Active path — purple edges with continuous flow

**Files:**
- Modify: `frontend/src/App.jsx` (`buildLifePathGraph` — `data.active`)
- Rewrite: `frontend/src/components/GraphView/BranchEdge.jsx`
- Modify: `frontend/src/components/GraphView/GraphView.css` (append active/flow styles + reduced-motion)

**Interfaces:**
- Consumes: Task 1 accent tokens; Task 2's `EDGE_DRAW_MS` convention (flow must not start before draw-in completes).
- Produces: edge `data.active: boolean` contract; CSS classes `.branch-edge--active`, `.branch-edge-flow`.

- [ ] **Step 1: Mark active edges in `buildLifePathGraph` (App.jsx)**

Three edits:

(a) `me → direction` edge (exists only after confirmation, so always active):

```jsx
  edges.push({
    id: "me-direction",
    source: "me",
    target: "direction",
    type: "branch",
    data: { delay: 0, active: true },
  });
```

(b) In the professions loop, the edge push becomes:

```jsx
    edges.push({
      id: `direction-${profession.id}`,
      source: "direction",
      target: profession.id,
      type: "branch",
      data: { delay: edgeDelay, active: profession.id === selectedProfessionId },
    });
```

(c) In the roadmap loop (chain renders only for the selected profession, so always active):

```jsx
      edges.push({
        id: `${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
        type: "branch",
        data: { delay: edgeDelay, active: true },
      });
```

The `roadmap-loading` edge keeps no `active` flag (stays gray).

- [ ] **Step 2: Rewrite `BranchEdge.jsx` with the flow path**

Full new file content:

```jsx
import { getBezierPath } from '@xyflow/react';

// Keep in sync with EDGE_DRAW_MS (App.jsx) and .branch-edge duration (GraphView.css).
const EDGE_DRAW_MS = 600;

export default function BranchEdge({
  id,
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition, targetPosition,
  style,
  data,
  markerEnd,
}) {
  const [edgePath] = getBezierPath({
    sourceX, sourceY,
    targetX, targetY,
    sourcePosition, targetPosition,
    curvature: 0.45,
  });

  const delay = data?.delay ?? 0;
  const active = Boolean(data?.active);

  return (
    <g>
      <path
        id={id}
        d={edgePath}
        className={`branch-edge ${active ? 'branch-edge--active' : ''}`}
        pathLength="1"
        markerEnd={markerEnd}
        style={{ ...style, animationDelay: `${delay}ms`, fill: 'none' }}
      />
      {active && (
        <path
          d={edgePath}
          className="branch-edge-flow"
          style={{ '--flow-delay': `${delay + EDGE_DRAW_MS}ms`, fill: 'none' }}
        />
      )}
    </g>
  );
}
```

Note: the flow path deliberately has **no** `pathLength="1"` — its dashes are in px so they look uniform on short and long edges; the draw-in path keeps `pathLength="1"` for the normalized dash trick.

- [ ] **Step 3: Append active/flow styles to `GraphView.css`**

```css
/* Chosen-path highlight */
.branch-edge--active {
  stroke: var(--color-accent);
  stroke-width: 1.5;
}

/* Continuous downstream pulse on the chosen path; fades in only after the
   draw-in completes (--flow-delay = edge delay + EDGE_DRAW_MS). */
.branch-edge-flow {
  stroke: var(--color-accent);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-dasharray: 6 10;
  opacity: 0;
  animation:
    flow-fade 300ms ease-out forwards,
    edge-flow 2.5s linear infinite;
  animation-delay: var(--flow-delay, 600ms), var(--flow-delay, 600ms);
}

@keyframes flow-fade {
  to { opacity: 0.45; }
}

/* -16 = -(6 + 10): one full dash period per cycle, moving source -> target */
@keyframes edge-flow {
  from { stroke-dashoffset: 0; }
  to   { stroke-dashoffset: -16; }
}

@media (prefers-reduced-motion: reduce) {
  .branch-edge {
    animation: none;
    stroke-dasharray: none;
  }
  .branch-edge-flow {
    display: none;
  }
}
```

(`stroke-dasharray: none` matters: without the draw animation the base path would otherwise sit at `dashoffset: 1` and stay invisible.)

- [ ] **Step 4: Verify build + lint + flow visually**

Run: `cd frontend && npx vite build 2>&1 | tail -3 && npm run lint`
Expected: green/clean.
Visual: me→direction edge turns purple with a slow downward pulse after drawing; the three profession edges stay gray until one is selected — then only that edge goes purple/flowing; roadmap chain edges all flow; the flow never appears before its line finishes drawing.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/GraphView/BranchEdge.jsx frontend/src/components/GraphView/GraphView.css
git commit -m "feat(frontend): purple flowing highlight along the chosen path"
```

---

### Task 4: Camera director

**Files:**
- Modify: `frontend/src/components/GraphView/index.jsx`
- Modify: `frontend/src/App.jsx` (focus derivation + `treeHint` refactor + GraphView props)

**Interfaces:**
- Consumes: React Flow `useReactFlow().fitView`.
- Produces: `GraphView({ nodes, edges, focusKey, focusNodeIds })` signature; App.jsx `roadmapVisible` boolean reused by Task 5's dock logic if needed.

- [ ] **Step 1: Add `CameraDirector` to `GraphView/index.jsx`**

Full new file content:

```jsx
import { useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { MeNode, DirectionNode, ProfessionNode, RoadmapNode, LoadingNode } from './NodeComponent';
import BranchEdge from './BranchEdge';
import './GraphView.css';

const nodeTypes = {
  me: MeNode,
  direction: DirectionNode,
  profession: ProfessionNode,
  roadmap: RoadmapNode,
  loading: LoadingNode,
};

const edgeTypes = {
  branch: BranchEdge,
};

const defaultEdgeOptions = {
  style: { stroke: '#999', strokeWidth: 1 },
  type: 'branch',
};

// Smoothly recenters the viewport on the newest wave of nodes whenever
// focusKey changes. focusNodeIds is read through a ref so the effect fires
// on focusKey transitions only, not on every parent render.
function CameraDirector({ focusKey, focusNodeIds }) {
  const { fitView } = useReactFlow();
  const idsRef = useRef(focusNodeIds);
  idsRef.current = focusNodeIds;

  useEffect(() => {
    if (!focusKey || !idsRef.current?.length) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const raf = requestAnimationFrame(() => {
      fitView({
        nodes: idsRef.current.map((id) => ({ id })),
        duration: reduced ? 0 : 900,
        padding: 0.25,
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [focusKey, fitView]);

  return null;
}

export default function GraphView({ nodes: externalNodes, edges: externalEdges, focusKey, focusNodeIds }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(externalNodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(externalEdges || []);

  useEffect(() => {
    if (externalNodes) setNodes(externalNodes);
  }, [externalNodes, setNodes]);

  useEffect(() => {
    if (externalEdges) setEdges(externalEdges);
  }, [externalEdges, setEdges]);

  return (
    <div className="graph-view">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={2}
        attributionPosition="bottom-left"
      >
        <Background color="#f0f0f0" gap={32} size={1} />
        <Controls showInteractive={false} className="graph-controls" />
        <CameraDirector focusKey={focusKey} focusNodeIds={focusNodeIds} />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 2: Derive focus state in `App.jsx`**

Replace the current `treeHint` block (which reads:)

```jsx
  const treeHint = !direction
    ? "Answer the questions to find your direction"
    : professionOptions.length === 0
      ? "Direction locked — now narrow it down"
      : roadmap && selectedProfession && roadmap.professionId === selectedProfession.id
        ? "Your roadmap — click any step for details"
        : "Click a profession to continue";
```

with:

```jsx
  const roadmapVisible = Boolean(
    roadmap && selectedProfession && roadmap.professionId === selectedProfession.id
  );

  const treeHint = !direction
    ? "Answer the questions to find your direction"
    : professionOptions.length === 0
      ? "Direction locked — now narrow it down"
      : roadmapVisible
        ? "Your roadmap — click any step for details"
        : "Click a profession to continue";

  let focusKey = "start";
  let focusNodeIds = ["me"];
  if (roadmapVisible) {
    focusKey = `roadmap-${roadmap.professionId}`;
    focusNodeIds = [selectedProfession.id, ...roadmap.stages.map((s) => `stage-${s.id}`)];
  } else if (professionOptions.length > 0) {
    focusKey = "professions";
    focusNodeIds = ["direction", ...professionOptions.map((p) => p.id)];
  } else if (direction) {
    focusKey = "direction";
    focusNodeIds = ["me", "direction"];
  }
```

- [ ] **Step 3: Pass the props in the tree JSX (App.jsx)**

```jsx
          <div className="graph-canvas">
            <GraphView
              nodes={graph.nodes}
              edges={graph.edges}
              focusKey={focusKey}
              focusNodeIds={focusNodeIds}
            />
          </div>
```

- [ ] **Step 4: Verify build + lint + camera visually**

Run: `cd frontend && npx vite build 2>&1 | tail -3 && npm run lint`
Expected: green/clean.
Visual: after confirming the direction, the camera glides (~0.9s) to frame Me+Direction; when professions appear it reframes the fork; on roadmap generation it pans down to fit the profession + all 6 stages. Manual pan/zoom between waves is never hijacked.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/GraphView/index.jsx frontend/src/App.jsx
git commit -m "feat(frontend): camera director recenters each graph wave"
```

---

### Task 5: Dock card transitions (framer-motion)

**Files:**
- Modify: `frontend/src/App.jsx` (dockCard computation + single AnimatePresence dock)
- Modify: `frontend/src/components/GraphView/GraphPage.css` (dock pointer-events)

**Interfaces:**
- Consumes: framer-motion `AnimatePresence`/`Motion` (already imported in App.jsx), Task 4's derivation block position.
- Produces: nothing consumed later.

- [ ] **Step 1: Add a module-level reduced-motion flag in `App.jsx`**

After the timing constants (below `const ROADMAP_STEP_MS = 600;`):

```jsx
const REDUCED_MOTION =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
```

- [ ] **Step 2: Compute `dockCard` in the component body (App.jsx)**

Insert directly after the `focusKey`/`focusNodeIds` block from Task 4:

```jsx
  let dockCard = null;
  if (stage === "tree") {
    if (!direction && currentDirectionQuestion) {
      dockCard = {
        key: `dir-${currentDirectionQuestion.id}`,
        content: (
          <GraphQuestionCard
            heading={`Direction · Question ${Object.keys(directionAnswers).length + 1} of ${directionQuestions.length}`}
            question={currentDirectionQuestion}
            busy={busy.direction}
            busyLabel="Reading your answer…"
            onChoose={handleAnswerDirection}
          />
        ),
      };
    } else if (!direction && proposedDirection) {
      dockCard = {
        key: "proposal",
        content: (
          <div className="question-card dock-card">
            <p className="question-category">Direction found</p>
            <h3>{proposedDirection.label}</h3>
            <p className="dock-subtext">
              Based on your profile and answers, this is your strongest broad direction.
            </p>
            <div className="question-actions single">
              <button
                type="button"
                className="primary-action"
                onClick={handleConfirmDirection}
                disabled={busy.confirmDirection}
              >
                {busy.confirmDirection ? "Confirming…" : "Confirm this direction"}
              </button>
            </div>
          </div>
        ),
      };
    } else if (direction && professionOptions.length === 0 && !narrowIntent) {
      dockCard = {
        key: "narrow-prompt",
        content: (
          <div className="question-card dock-card">
            <p className="question-category">Direction confirmed</p>
            <h3>{direction.label}</h3>
            <p className="dock-subtext">
              Want to narrow it down to specific professions?
            </p>
            <div className="question-actions single">
              <button
                type="button"
                className="primary-action"
                onClick={() => setNarrowIntent(true)}
              >
                Yes, narrow it down
              </button>
            </div>
          </div>
        ),
      };
    } else if (direction && professionOptions.length === 0 && narrowIntent && currentNarrowingQuestion) {
      dockCard = {
        key: `nar-${currentNarrowingQuestion.id}`,
        content: (
          <GraphQuestionCard
            heading={`Narrowing · Question ${Object.keys(narrowingAnswers).length + 1} of ${narrowingQuestions.length}`}
            question={currentNarrowingQuestion}
            busy={busy.narrowing}
            busyLabel="Finding your professions…"
            onChoose={handleAnswerNarrowing}
          />
        ),
      };
    }
  }
```

- [ ] **Step 3: Replace the four dock JSX blocks with one animated dock**

Inside `{stage === "tree" && (...)}`, delete all four `{... && (<div className="graph-question-dock"> ... </div>)}` blocks (the direction-question block, the proposal block, the narrow-prompt block, and the narrowing-question block) and put in their place:

```jsx
          <div className="graph-question-dock">
            <AnimatePresence mode="wait">
              {dockCard && (
                <Motion.div
                  key={dockCard.key}
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
                  {dockCard.content}
                </Motion.div>
              )}
            </AnimatePresence>
          </div>
```

- [ ] **Step 4: Dock pointer-events in `GraphPage.css`**

The dock wrapper is now always mounted; make sure an empty dock never blocks graph clicks. In the `.graph-question-dock` rule add one line, and add an auto rule for the card:

```css
.graph-question-dock {
  position: absolute;
  left: 50%;
  bottom: 32px;
  transform: translateX(-50%);
  z-index: 150;
  width: min(560px, calc(100vw - 48px));
  pointer-events: none;
}

.graph-question-dock .question-card {
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.08);
  margin: 0;
  pointer-events: auto;
}
```

- [ ] **Step 5: Verify build + lint + transitions visually**

Run: `cd frontend && npx vite build 2>&1 | tail -3 && npm run lint`
Expected: green/clean.
Visual: answering a direction question slides the old card down/out and the next one up/in (~0.6s total, `mode="wait"`); the proposal card and narrow prompt transition the same way; after the last narrowing answer the final card exits and the dock area is empty and click-transparent.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/GraphView/GraphPage.css
git commit -m "feat(frontend): animated dock card transitions"
```

---

### Task 6: Full verification sweep

**Files:** none (verification only; fix regressions in-place if found).

**Interfaces:** consumes everything above.

- [ ] **Step 1: Build + lint**

Run: `cd frontend && npx vite build 2>&1 | tail -3 && npm run lint`
Expected: build green, lint exits 0.

- [ ] **Step 2: Pages 1–2 isolation**

With dev servers running (frontend :5173, backend :3001 blank-key fallback), open the app: the entry screen's "Help to explore my career" button and every survey button must still be black/white pill style — zero purple anywhere before Page 3. Also re-run the grep from Task 1 Step 5.

- [ ] **Step 3: Playwright flow checklist (Page 3)**

Drive the full flow (Page 1 → 63 survey answers → Page 3) and verify each spec bullet:
1. **Cascade:** direction node absent immediately after the wave starts, present after ~600ms (`.node--direction` count 0 → 1); professions pop left-to-right; roadmap reveals sequentially (~600ms/step).
2. **Flow:** `.branch-edge-flow` exists only on active edges — 1 after confirm (me→direction), 0 on unselected profession edges, +6 roadmap edges + 1 selected-profession edge after roadmap.
3. **Purple UI:** dock `question-category` and `.primary-action` inside `.graph-page` are `#863bff`; `.confirm-yes` accent; `.node-roadmap-index` accent; selected profession border accent.
4. **Camera:** viewport transform changes after direction confirm, professions reveal, and roadmap generation (compare `.react-flow__viewport` transform before/after each wave).
5. **Dock transitions:** during a question change a `motion` wrapper with both old and new card is observable (or at minimum no instant swap — old card animates out).
6. **Reduced motion:** `page.emulateMedia({ reducedMotion: 'reduce' })`, reload, re-drive to Page 3: nodes/edges appear instantly, no `.branch-edge-flow` visible (display:none), camera snaps without animation.

- [ ] **Step 4: Commit any fixes; otherwise nothing to commit**

If checklist items failed and required code fixes, commit them:

```bash
git add -A frontend/src
git commit -m "fix(frontend): visual polish verification fixes"
```

---

## Self-Review Notes (already applied)

1. **Spec coverage:** §1 cascade → Task 2; §2 active/flow → Task 3; §3 camera → Task 4; §4 dock → Task 5; §5 accents → Task 1; §6 reduced-motion → split into Tasks 2 (nodes), 3 (edges), 4 (camera duration 0), 5 (dock duration 0); Verification section → Task 6. No gaps.
2. **Deviation from spec, intentional:** spec §2 sketched the flow path with `pathLength=1` + px dashes together; that combination is contradictory (pathLength normalizes dash units), so Task 3 drops `pathLength` from the flow path and keeps px dashes `6 10` with a `-16` offset cycle — visually identical to the spec's intent (uniform dashes on all edge lengths).
3. **Type consistency:** `data.active` (Task 3) read as `data?.active` in BranchEdge; `--appear-delay` set in Task 2, consumed in Task 2's CSS; `focusKey`/`focusNodeIds` prop names identical in Task 4's two files; `roadmapVisible` defined in Task 4, referenced nowhere earlier; `EDGE_DRAW_MS = 600` duplicated by design in three sync-commented places (App.jsx, BranchEdge.jsx, GraphView.css comment).
4. **Boundary check:** every accent selector is scoped (`.graph-page`, `.graph-question-dock`, `.confirm-yes`, `.node-*`); index.css change is token-additive only; no backend files touched.


