import { JOURNEY_RAIL, railIndexForStep, railStepReachable } from "../lifePath";
import "./screens.css";

// The pill row. Reachability is the backend's rule, not the rail's: an entry
// is a button only when the user has already been there.
export default function StepRail({ step, furthestStep, busy = false, onNavigate }) {
  const active = railIndexForStep(step);
  if (active === -1) return null;

  return (
    <ol className="step-rail" aria-label="Assessment progress">
      {JOURNEY_RAIL.map((entry, index) => {
        const clickable = index !== active && railStepReachable(entry.step, furthestStep);
        return (
          <li
            key={entry.step}
            className={[
              "step-rail-item",
              index === active ? "step-rail-item--active" : "",
              index < active ? "step-rail-item--done" : "",
              clickable ? "" : "step-rail-item--inert",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {clickable ? (
              <button type="button" disabled={busy} onClick={() => onNavigate(entry.step)}>
                {entry.label}
              </button>
            ) : (
              entry.label
            )}
          </li>
        );
      })}
    </ol>
  );
}
