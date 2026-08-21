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
  const active = Boolean(data?.active);
  const flowDelay = data?.flowDelayMs ?? 600;

  return (
    <g>
      <path
        id={id}
        d={edgePath}
        className={`branch-edge ${active ? 'branch-edge--active' : ''}`}
        pathLength="1"
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: 'var(--gold-40)',
          strokeWidth: 1.5,
          animationDelay: `${delay}ms`,
          fill: 'none',
        }}
      />
      {active && (
        <path
          d={edgePath}
          className="branch-edge-flow"
          style={{ '--flow-delay': `${flowDelay}ms`, fill: 'none' }}
        />
      )}
    </g>
  );
}
