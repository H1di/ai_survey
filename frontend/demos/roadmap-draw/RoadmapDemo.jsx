// Roadmap-draw harness. The step nodes and edges are the app's own
// (GraphView's RoadmapNode + BranchEdge); this page only lays them out on a
// small stage and feeds the reveal a scrubbable clock through RevealContext —
// in the product, GraphView's RoadmapReveal plays the same timeline once.
import { useEffect, useMemo, useRef, useState } from "react";
import { Background, Handle, Position, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "../../src/components/GraphView/GraphView.css";
import { RoadmapNode } from "../../src/components/GraphView/NodeComponent";
import BranchEdge from "../../src/components/GraphView/BranchEdge";
import { RevealContext } from "../../src/motion/roadmap/revealContext";
import { timelineDuration } from "../../src/motion/roadmap/roadmapTimeline";
import "./roadmap-draw.css";

// Flow-space geometry. Chain below 768 px of stage width, gentle zig-zag above.
const LAYOUTS = {
  chain: { chosenW: 300, stepW: 300, top: 170, pitch: 104, zig: 0 },
  zigzag: { chosenW: 480, stepW: 360, top: 190, pitch: 110, zig: 110 },
};
const ZIGZAG_MIN_PX = 768;
// The flow box sits inside .demo-stage's 1 px border; the breakpoint is the stage's width.
const STAGE_BORDER_PX = 2;

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
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </>
  );
}

const nodeTypes = { chosen: ChosenNode, roadmap: RoadmapNode };
const edgeTypes = { branch: BranchEdge };

function buildGraph(layout, chosen, steps) {
  const g = LAYOUTS[layout];
  const nodes = [
    { id: "chosen", type: "chosen", position: { x: -g.chosenW / 2, y: 0 }, data: chosen },
    ...steps.map((s, i) => ({
      id: s.id,
      type: "roadmap",
      position: { x: -g.stepW / 2 + (i % 2 ? g.zig : -g.zig), y: g.top + i * g.pitch },
      data: {
        index: i + 1,
        revealIndex: i,
        title: s.title,
        timeframe: s.timeframe,
        last: i === steps.length - 1,
      },
    })),
  ];
  const edges = steps.map((s, i) => ({
    id: `e-${s.id}`,
    type: "branch",
    source: i ? steps[i - 1].id : "chosen",
    target: s.id,
    data: { revealIndex: i },
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
  const reveal = useMemo(
    () => ({ T: reducedMotion ? timelineDuration(timeline) : T, timeline }),
    [T, reducedMotion, timeline]
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
          <RevealContext.Provider value={reveal}>
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
          </RevealContext.Provider>
        ) : null}
      </div>
      <button type="button" className="demo-btn rd-replay" onClick={onReplay}>
        Replay
      </button>
    </div>
  );
}
