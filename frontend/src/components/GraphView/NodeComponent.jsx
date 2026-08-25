import { Handle, Position } from '@xyflow/react';
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
      {/* Spec 5.11 composes the field tag and the fit as one header row, with
          a gold interpunct between them — not as two stacked lines. */}
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
      {/* Spec 5.11's advice cell is a title over the count — no eyebrow. */}
      <h3 className="node-title">{label}</h3>
      <span className="node-advice-count">{count} suggestions</span>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </button>
  );
}

export function RoadmapNode({ data }) {
  const { index, title, timeframe, last, onOpen } = data;

  return (
    <button
      type="button"
      className={`node node--roadmap ${last ? 'node--roadmap-last' : ''}`}
      onClick={onOpen}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <span className="node-roadmap-index">{index}</span>
      <span className="node-roadmap-body">
        <span className="node-roadmap-title">{title}</span>
        {timeframe && <span className="node-roadmap-timeframe">{timeframe}</span>}
      </span>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </button>
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

export function DetailPanel({ data }) {
  const { path, onClose } = data;
  if (!path) return null;

  return (
    <div className="detail-panel">
      <button className="detail-close" onClick={onClose}>×</button>
      <p className="detail-archetype">{path.archetype}</p>
      <h2 className="detail-title">{path.title}</h2>
      <p className="detail-desc">{path.description}</p>

      {path.lifestyle && (
        <div className="detail-section">
          <h4>Clarity gain</h4>
          <p>{path.lifestyle}</p>
        </div>
      )}
      {path.careerTrajectory && (
        <div className="detail-section">
          <h4>Milestone</h4>
          <p>{path.careerTrajectory}</p>
        </div>
      )}
      {path.financialOutlook && (
        <div className="detail-section">
          <h4>Constraints</h4>
          <p>{path.financialOutlook}</p>
        </div>
      )}
      {path.risks && (
        <div className="detail-section">
          <h4>Risks</h4>
          <ul>{path.risks.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
