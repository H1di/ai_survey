import { Handle, Position } from '@xyflow/react';
import './NodeComponent.css';

export function MeNode() {
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

export function DirectionNode({ data }) {
  const { label } = data;

  return (
    <div className="node node--direction">
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <p className="node-archetype">Your direction</p>
      <h3 className="node-title">{label}</h3>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

export function ProfessionNode({ data }) {
  const { title, summary, selected, onOpen } = data;

  return (
    <button
      type="button"
      className={`node node--profession ${selected ? 'node--profession-selected' : ''}`}
      onClick={onOpen}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <p className="node-archetype">Profession</p>
      <h3 className="node-title">{title}</h3>
      <p className="node-profession-summary">{summary}</p>
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
      {path.whyItFits && (
        <div className="detail-section">
          <h4>Why this fits you</h4>
          <p>{path.whyItFits}</p>
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
