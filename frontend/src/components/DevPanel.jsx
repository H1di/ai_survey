import { useState } from "react";
import "./DevPanel.css";

// Deliberately utilitarian: monospace, dark plate, none of the product's
// styling. This must never read as part of the application.
const TARGETS = [
  { id: "demographics", label: "demographics" },
  { id: "big_five", label: "big_five" },
  { id: "riasec", label: "riasec" },
  { id: "values", label: "values" },
  { id: "cv", label: "cv" },
  { id: "summary", label: "summary" },
  { id: "tree", label: "tree (empty)" },
  { id: "tree+output", label: "tree + 1st output" },
  { id: "detail", label: "detail (accepted)" },
];

export default function DevPanel({ step, pathStage, sessionId, busy, onJump }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="dev-panel-pill" onClick={() => setOpen(true)}>
        DEV
      </button>
    );
  }

  return (
    <div className="dev-panel">
      <div className="dev-panel-head">
        <span>dev stage jump</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close dev panel">
          ×
        </button>
      </div>

      <dl className="dev-panel-state">
        <dt>step</dt>
        <dd>{step || "—"}</dd>
        <dt>pathStage</dt>
        <dd>{pathStage || "—"}</dd>
        <dt>session</dt>
        <dd>{sessionId ? sessionId.slice(0, 8) : "—"}</dd>
      </dl>

      <div className="dev-panel-targets">
        {TARGETS.map((target) => (
          <button key={target.id} type="button" disabled={busy} onClick={() => onJump(target.id)}>
            {target.label}
          </button>
        ))}
      </div>

      {busy && <p className="dev-panel-busy">seeding…</p>}
    </div>
  );
}
