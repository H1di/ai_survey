import { useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useStoreApi,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { MeNode, OutputNode, AdviceNode, RoadmapPathNode, LoadingNode } from './NodeComponent';
import BranchEdge from './BranchEdge';
import { RoadmapReveal } from '../../motion/roadmap/RoadmapReveal';
import { NARROW_QUERY } from '../../motion/path/useNarrowViewport';
import './GraphView.css';

// Gutter around the roadmap path when it is fitted by width on a phone.
const TOP_FIT_MARGIN = 12;

const nodeTypes = {
  me: MeNode,
  output: OutputNode,
  advice: AdviceNode,
  roadmapPath: RoadmapPathNode,
  loading: LoadingNode,
};

const edgeTypes = {
  branch: BranchEdge,
};

const defaultEdgeOptions = {
  style: { stroke: 'var(--line-40)', strokeWidth: 1.5 },
  type: 'branch',
};

// Smoothly recenters the viewport on the newest wave of nodes whenever
// focusKey changes. focusNodeIds is read through a ref so the effect fires
// on focusKey transitions only, not on every parent render.
function CameraDirector({ focusKey, focusNodeIds }) {
  const { fitView, getInternalNode, setViewport } = useReactFlow();
  const store = useStoreApi();
  const idsRef = useRef(focusNodeIds);

  // Sync the ref after every commit (not during render, which the
  // react-hooks/refs rule forbids) so the effect below always reads the
  // latest focusNodeIds without depending on it.
  useEffect(() => {
    idsRef.current = focusNodeIds;
  });

  useEffect(() => {
    if (!focusKey || !idsRef.current?.length) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reduced ? 0 : 900;
    let raf = 0;
    // On a phone the roadmap path is a tall column: fitting all of it would
    // shrink it past reading. Fit its width instead and start at its top —
    // the rest is a drag away. The node may need a frame or two to be measured.
    const place = (attempt) => {
      const ids = idsRef.current;
      const only = ids.length === 1 ? getInternalNode(ids[0]) : null;
      const topFit =
        only?.type === 'roadmapPath' && window.matchMedia(NARROW_QUERY).matches;
      if (topFit && !only.measured?.width && attempt < 30) {
        raf = requestAnimationFrame(() => place(attempt + 1));
        return;
      }
      if (topFit && only.measured?.width) {
        const paneW = store.getState().width;
        const { x, y } = only.internals.positionAbsolute;
        const { width } = only.measured;
        const zoom = Math.min(1, (paneW - TOP_FIT_MARGIN * 2) / width);
        setViewport(
          { x: (paneW - width * zoom) / 2 - x * zoom, y: TOP_FIT_MARGIN * 3 - y * zoom, zoom },
          { duration }
        );
        return;
      }
      fitView({ nodes: ids.map((id) => ({ id })), duration, padding: 0.25 });
    };
    raf = requestAnimationFrame(() => place(0));
    return () => cancelAnimationFrame(raf);
  }, [focusKey, fitView, getInternalNode, setViewport, store]);

  return null;
}

// roadmapKey / roadmapSteps start the roadmap's reveal clock: a new key (the
// accepted output's id) replays it, zero steps means there is nothing to reveal.
export default function GraphView({
  nodes: externalNodes,
  edges: externalEdges,
  focusKey,
  focusNodeIds,
  roadmapKey = null,
  roadmapSteps = 0,
}) {
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
      <RoadmapReveal stepCount={roadmapSteps} revealKey={roadmapKey}>
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
        <Background color="var(--line-15)" gap={32} size={1} />
        <Controls showInteractive={false} className="graph-controls" />
        <CameraDirector focusKey={focusKey} focusNodeIds={focusNodeIds} />
      </ReactFlow>
      </RoadmapReveal>
    </div>
  );
}
