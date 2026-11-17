import { Handle, Position } from '@xyflow/react';
import RoadmapPath from '../../motion/path/RoadmapPath';
import { useNarrowViewport } from '../../motion/path/useNarrowViewport';
import './NodeComponent.css';

export function MeNode() {
  return (
    <div className="node node--me">
      <svg className="me-ring" viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="40" r="39" pathLength="1" />
      </svg>
      <div className="node-me-label">Me</div>
      <div className="node-me-caption">invector · life path model</div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

export function OutputNode({ data }) {
  const { jobTitle, orientedField, fit, thesis, market, accepted, latest, onOpen } = data;
  const hasFit = fit !== null && fit !== undefined;

  return (
    <button
      type="button"
      className={`node node--output ${accepted ? 'node--output-accepted' : ''} ${
        latest && !accepted ? 'node--output-latest' : ''
      }`}
      onClick={onOpen}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      {/* Field tag and fit share one header row, split by an interpunct. */}
      <span className="node-output-head">
        <span className="node-archetype">{orientedField}</span>
        {hasFit && (
          <>
            <span className="node-head-dot" aria-hidden="true">·</span>
            <span className="node-fit">{fit}% values fit</span>
          </>
        )}
      </span>
      <h3 className="node-title">{jobTitle}</h3>
      {thesis && <p className="node-thesis">{thesis}</p>}
      {(market || accepted) && (
        <span className="node-meta">
          {market && <span className="node-market">{market}</span>}
          {market && accepted && (
            <span className="node-meta-dot" aria-hidden="true">·</span>
          )}
          {accepted && <span className="node-accepted-tag">Accepted</span>}
        </span>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </button>
  );
}

export function AdviceNode({ data }) {
  const { label, count, onOpen } = data;

  return (
    <button type="button" className="node node--advice" onClick={onOpen}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <h3 className="node-title">{label}</h3>
      <span className="node-advice-count">{count} suggestions</span>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </button>
  );
}

// The roadmap: one wide node holding the whole path through months from now
// (motion/path). It reads the roadmap clock itself, so the reveal plays inside
// the node and React Flow never re-lays-out. On a phone the path turns vertical.
export function RoadmapPathNode({ data }) {
  const compact = useNarrowViewport();
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <RoadmapPath
        stages={data.stages}
        jobTitle={data.jobTitle}
        bigFive={data.bigFive}
        riasec={data.riasec}
        compact={compact}
      />
    </>
  );
}

export function LoadingNode() {
  return (
    <div className="node node--loading">
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="node-loading-dots">
        <span /><span /><span />
      </div>
    </div>
  );
}
