// Roadmap-draw painter. Nodes and edges are static per layout; the clock T
// reaches them through context, so a frame only changes opacity, a 6 px rise
// and a stroke-dashoffset — React Flow never re-lays-out mid-sequence and the
// camera fits exactly once per layout.
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Background, Handle, Position, ReactFlow, getBezierPath } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
// The app's graph look, imported as-is (not edited): node classes + flow chrome.
import "../../src/components/GraphView/GraphView.css";
import "../../src/components/GraphView/NodeComponent.css";
import { NODE_RISE_PX, stepFrame, timelineDuration } from "./roadmapTimeline";
import "./roadmap-draw.css";

const FrameContext = createContext(null);

// Flow-space geometry. Chain below 768 px of stage width, gentle zig-zag above.
// Edges run along a spine: the chosen card's 2 px rule (x = 1) continues into
// the step-number column (x = 12), so step nodes sit 11 px left of the card
// and odd steps step `zig` px right on wide stages.
const LAYOUTS = {
  chain: { chosenW: 300, top: 160, pitch: 94, zig: 0 },
  zigzag: { chosenW: 480, top: 180, pitch: 100, zig: 220 },
};
const RULE_X = 1;
const INDEX_X = 12;
const ZIGZAG_MIN_PX = 768;
// The flow box sits inside .demo-stage's 1 px border; the breakpoint is the stage's width.
const STAGE_BORDER_PX = 2;

// Handles sit outside the animated box: React Flow measures handle bounds
// once, so they must not ride the 6 px rise.
function ChosenNode({ data }) {
  return (
    <>
      <div className="node node--output node--output-accepted rd-chosen">
        <span className="node-output-head">
          <span className="node-archetype">{data.field}</span>
          <span className="node-head-dot" aria-hidden="true">·</span>
          <span className="node-fit">{data.fit}% values fit</span>
        </span>
        <h3 className="node-title">{data.title}</h3>
        <span className="node-meta">Roadmap · {data.stepCount} steps</span>
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={false} style={{ left: RULE_X }} />
    </>
  );
}

function StepNode({ data }) {
  const { T, timeline, steps } = useContext(FrameContext);
  const f = stepFrame(T, timeline[data.i]);
  const step = steps[data.i];
  const last = data.i === steps.length - 1;
  return (
    <>
      <Handle type="target" position={Position.Top} isConnectable={false} style={{ left: INDEX_X }} />
      <div
        className={`node node--roadmap rd-step ${last ? "node--roadmap-last" : ""}`}
        style={{ opacity: f.node, transform: `translateY(${(1 - f.node) * NODE_RISE_PX}px)` }}
      >
        <span className="node-roadmap-index">{data.i + 1}</span>
        <span className="node-roadmap-body">
          <span className="node-roadmap-title">{step.title}</span>
          <span className="node-roadmap-timeframe" style={{ opacity: f.label }}>
            {step.timeframe}
          </span>
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={false} style={{ left: INDEX_X }} />
    </>
  );
}

// Demo-local edge: the app's branch curve, drawn by stroke-dashoffset against
// the path's measured length instead of a CSS keyframe.
function DrawEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }) {
  const { T, timeline } = useContext(FrameContext);
  const ref = useRef(null);
  const [len, setLen] = useState(0);
  const [d] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.45 });

  useLayoutEffect(() => {
    setLen(ref.current.getTotalLength());
  }, [d]);

  const p = stepFrame(T, timeline[data.i]).edge;
  const style = len
    ? { strokeDasharray: `${len} ${len}`, strokeDashoffset: len * (1 - p), opacity: p > 0 ? 1 : 0 }
    : { opacity: p >= 1 ? 1 : 0 };
  return <path ref={ref} d={d} className="rd-edge" style={style} />;
}

const nodeTypes = { chosen: ChosenNode, step: StepNode };
const edgeTypes = { draw: DrawEdge };

function buildGraph(layout, chosen, steps) {
  const g = LAYOUTS[layout];
  const nodes = [
    { id: "chosen", type: "chosen", position: { x: -g.chosenW / 2, y: 0 }, data: chosen },
    ...steps.map((s, i) => ({
      id: s.id,
      type: "step",
      position: { x: -g.chosenW / 2 + RULE_X - INDEX_X + (i % 2 ? g.zig : 0), y: g.top + i * g.pitch },
      data: { i },
    })),
  ];
  const edges = steps.map((s, i) => ({
    id: `e-${s.id}`,
    type: "draw",
    source: i ? steps[i - 1].id : "chosen",
    target: s.id,
    data: { i },
  }));
  return { nodes, edges };
}

export default function RoadmapDemo({ T, reducedMotion, onReplay, chosen, steps, timeline }) {
  const boxRef = useRef(null);
  const [width, setWidth] = useState(null);

  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, []);

  const layout = width + STAGE_BORDER_PX >= ZIGZAG_MIN_PX ? "zigzag" : "chain";
  const { nodes, edges } = useMemo(() => buildGraph(layout, chosen, steps), [layout, chosen, steps]);
  // Reduced motion: the whole roadmap at once, whatever stage the clock parks on.
  const frame = useMemo(
    () => ({ T: reducedMotion ? timelineDuration(timeline) : T, timeline, steps }),
    [T, reducedMotion, timeline, steps]
  );

  const summary = steps.map((s, i) => `${i + 1}. ${s.title} (${s.timeframe})`).join("; ");

  return (
    <div className={`rd-stage rd-stage--${layout}`}>
      <div
        ref={boxRef}
        className="rd-flow"
        role="img"
        aria-label={`Roadmap to ${chosen.title} in ${steps.length} steps, walked in order: ${summary}.`}
      >
        {width ? (
          <FrameContext.Provider value={frame}>
            {/* Keyed on layout + width: a resize remounts, which is the one
                fitView. Nothing pans while the sequence plays. */}
            <ReactFlow
              key={`${layout}:${width}`}
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              fitViewOptions={{ padding: 0.06, maxZoom: 1 }}
              minZoom={0.3}
              maxZoom={1}
              nodesDraggable={false}
              nodesConnectable={false}
              nodesFocusable={false}
              edgesFocusable={false}
              elementsSelectable={false}
              panOnDrag={false}
              zoomOnScroll={false}
              zoomOnPinch={false}
              zoomOnDoubleClick={false}
              preventScrolling={false}
              attributionPosition="bottom-left"
            >
              <Background color="var(--gold-15)" gap={32} size={1} />
            </ReactFlow>
          </FrameContext.Provider>
        ) : null}
      </div>
      <button type="button" className="demo-btn rd-replay" onClick={onReplay}>
        Replay
      </button>
    </div>
  );
}
