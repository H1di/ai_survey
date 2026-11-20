import { useState } from "react";
import { MODE_LABELS, formatDuration, formatEur, placeLabel, startLabel } from "../pathView";

// The visual roadmap: You today → steps → Goal. Horizontal on wide screens,
// vertical on phones (CSS). Every step is a real catalogue course and opens
// its "why" — the answers and scores it rests on.
export default function Roadmap({ steps, goal, busy, compareIds, onSwap, onMove, onRemove, onToggleCompare }) {
  return (
    <ol className="roadmap" aria-label="Your roadmap">
      <li className="road-node road-node--end">
        <span className="road-eyebrow">You today</span>
        <span className="road-end-text">Your answers</span>
      </li>
      {steps.map((step, i) => (
        <StepCard
          key={step.id}
          step={step}
          index={i}
          last={i === steps.length - 1}
          total={steps.length}
          busy={busy}
          comparing={compareIds.includes(step.courseId)}
          onSwap={onSwap}
          onMove={onMove}
          onRemove={onRemove}
          onToggleCompare={onToggleCompare}
        />
      ))}
      <li className="road-node road-node--end road-node--goal">
        <span className="road-eyebrow">Goal</span>
        <span className="road-end-text">{goal}</span>
      </li>
    </ol>
  );
}

function StepCard({ step, index, total, busy, comparing, onSwap, onMove, onRemove, onToggleCompare }) {
  const [open, setOpen] = useState(false);
  const c = step.course;
  if (!c) return null;
  return (
    <li className="road-node">
      <span className="road-eyebrow">
        Step {index + 1} · {step.slotLabel}
      </span>
      <h3 className="road-title">{c.title}</h3>
      <p className="road-provider">{c.provider}</p>
      <ul className="facts" aria-label="Course facts">
        <li>
          {c.award} · NFQ {c.nfqLevel}
        </li>
        <li>
          {placeLabel(c)} · {MODE_LABELS[c.mode]}
        </li>
        <li>
          {formatDuration(c.durationMonths)} · starts {startLabel(c.startMonth)}
        </li>
        <li>
          {formatEur(c.feeEur)}
          {c.feeEur ? " a year" : ""}
        </li>
      </ul>
      {step.why && <p className="road-why">{step.why}</p>}
      <button type="button" className="link-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? "Hide why" : "Why this step"}
      </button>
      {open && (
        <ul className="basis">
          {step.basis.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      <div className="road-actions">
        <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => onSwap(step)}>
          Swap
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm btn--icon"
          disabled={busy || index === 0}
          aria-label={`Move step ${index + 1} earlier`}
          onClick={() => onMove(step, "up")}
        >
          ↑
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm btn--icon"
          disabled={busy || index === total - 1}
          aria-label={`Move step ${index + 1} later`}
          onClick={() => onMove(step, "down")}
        >
          ↓
        </button>
        <button
          type="button"
          className={`btn btn--ghost btn--sm${comparing ? " btn--on" : ""}`}
          aria-pressed={comparing}
          onClick={() => onToggleCompare(c)}
        >
          {comparing ? "Comparing" : "Compare"}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={busy || total <= 1}
          onClick={() => onRemove(step)}
        >
          Remove
        </button>
      </div>
      {c.sample && <span className="sample-tag">sample</span>}
    </li>
  );
}
