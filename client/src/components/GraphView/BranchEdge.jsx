import React from 'react';
import { getBezierPath } from '@xyflow/react';

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

  return (
    <path
      id={id}
      d={edgePath}
      className="branch-edge"
      pathLength="1"
      markerEnd={markerEnd}
      style={{ ...style, animationDelay: `${delay}ms`, fill: 'none' }}
    />
  );
}
