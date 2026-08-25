import ScreenShell from "../ui/ScreenShell";
import { JOURNEY_RAIL } from "../lifePath";
import "./screens.css";

// Not in the mockup, but a real screen: what the assessment is about to ask,
// and how long each part takes.
export default function JourneyIntroScreen({ onBegin }) {
  return (
    <ScreenShell
      eyebrow="career discovery journey"
      title="Six short steps"
      sub="Each one feeds the final picture."
    >
      <ol className="journey-list">
        {JOURNEY_RAIL.map((entry, index) => (
          <li key={entry.step}>
            <span className="journey-number">{String(index + 1).padStart(2, "0")}</span>
            <span className="journey-label">{entry.label}</span>
            <span className="journey-time">{entry.time}</span>
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn--gold journey-begin" onClick={onBegin}>
        Start
      </button>
    </ScreenShell>
  );
}
