import React from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { MeNode, PathNode, VariationNode, LoadingNode } from './NodeComponent';
import BranchEdge from './BranchEdge';
import './GraphView.css';

const nodeTypes = {
  me: MeNode,
  path: PathNode,
  variation: VariationNode,
  loading: LoadingNode,
};

const edgeTypes = {
  branch: BranchEdge,
};

const defaultEdgeOptions = {
  style: { stroke: '#999', strokeWidth: 1 },
  type: 'branch',
};

export default function GraphView({ nodes: externalNodes, edges: externalEdges }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(externalNodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(externalEdges || []);

  React.useEffect(() => {
    if (externalNodes) setNodes(externalNodes);
  }, [externalNodes, setNodes]);

  React.useEffect(() => {
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
      </ReactFlow>
    </div>
  );
}
