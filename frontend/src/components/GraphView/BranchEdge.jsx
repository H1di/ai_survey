import { getBezierPath } from '@xyflow/react';
import { useStepReveal } from '../../motion/roadmap/revealContext';

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

  // A roadmap edge inside a running reveal is drawn by the clock (same
  // pathLength="1" dash trick, offset computed instead of keyframed).
  const reveal = useStepReveal(data?.revealIndex);
  const delay = data?.delay ?? 0;
  const active = Boolean(data?.active);
  const flowDelay = data?.flowDelayMs ?? 600;

  return (
    <g>
      <path
        id={id}
        d={edgePath}
        className="branch-edge"
        pathLength="1"
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: 'var(--gold-40)',
          strokeWidth: 1.5,
          animationDelay: `${delay}ms`,
          fill: 'none',
          ...(reveal
            ? { animation: 'none', strokeDasharray: 1, strokeDashoffset: 1 - reveal.edge }
            : null),
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
