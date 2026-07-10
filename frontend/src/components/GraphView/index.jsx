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
import { MeNode, OutputNode, AdviceNode, RoadmapNode, LoadingNode } from './NodeComponent';
import BranchEdge from './BranchEdge';
import './GraphView.css';

const nodeTypes = {
  me: MeNode,
  output: OutputNode,
  advice: AdviceNode,
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

  // Sync the ref after every commit (not during render, which the
  // react-hooks/refs rule forbids) so the effect below always reads the
  // latest focusNodeIds without depending on it.
  useEffect(() => {
    idsRef.current = focusNodeIds;
  });

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
