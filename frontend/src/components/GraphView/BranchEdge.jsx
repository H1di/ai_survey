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
