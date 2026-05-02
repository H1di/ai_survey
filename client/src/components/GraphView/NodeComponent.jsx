import React from 'react';
import { Handle, Position } from '@xyflow/react';
import './NodeComponent.css';

export function MeNode({ data }) {
  return (
    <div className="node node--me">
      <svg className="me-ring" viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="40" r="39" pathLength="1" />
      </svg>
      <div className="node-me-label">Me</div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

export function PathNode({ data }) {
  const { title, archetype, locked, loading, onExpand, isExpanding } = data;

  return (
    <div className={`node node--path ${locked ? 'node--locked' : ''} ${isExpanding ? 'node--expanding' : ''}`}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Right} style={{ opacity: 0 }} />

      {locked ? (
        <div className="node-locked-content">
          <span className="node-lock">○</span>
          <span className="node-locked-label">Unlock path</span>
        </div>
      ) : (
        <>
          <p className="node-archetype">{archetype}</p>
          <h3 className="node-title">{title}</h3>
          {!isExpanding && (
            <button className="node-expand-btn" onClick={onExpand}>
              Explore deeper →
            </button>
          )}
          {isExpanding && <p className="node-expanding-label">Exploring...</p>}
        </>
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

export function VariationNode({ data }) {
  const { title, difference, onExpand } = data;

  return (
    <div className="node node--variation">
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Right} style={{ opacity: 0 }} />

      <h4 className="node-var-title">{title}</h4>
      <p className="node-var-diff">{difference}</p>
      {onExpand && (
        <button className="node-expand-btn node-expand-btn--sm" onClick={onExpand}>
          Go deeper →
        </button>
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

export function LoadingNode({ data }) {
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

      <div className="detail-section">
        <h4>Lifestyle</h4>
        <p>{path.lifestyle}</p>
      </div>
      <div className="detail-section">
        <h4>Career trajectory</h4>
        <p>{path.careerTrajectory || path.timeToReality}</p>
      </div>
      <div className="detail-section">
        <h4>Financial outlook</h4>
        <p>{path.financialOutlook}</p>
      </div>
      {path.risks && (
        <div className="detail-section">
          <h4>Risks</h4>
          <ul>{path.risks.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}
      {path.opportunities && (
        <div className="detail-section">
          <h4>Opportunities</h4>
          <ul>{path.opportunities.map((o, i) => <li key={i}>{o}</li>)}</ul>
        </div>
      )}
      {path.whyItFits && (
        <div className="detail-section">
          <h4>Why this fits you</h4>
          <p>{path.whyItFits}</p>
        </div>
      )}
      {path.tradeoffs && (
        <div className="detail-section">
          <h4>Tradeoffs</h4>
          <ul>{path.tradeoffs.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
