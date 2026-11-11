// Values insertion — why ten quick choices are enough. Each answer places a
// value relative to an ordered list instead of pitting every value against
// every other (15 pairs). Replays the real tournament answers in
// demo-profile.json → tournamentTrace.
//
// Manual mode is off on purpose: backend/assessment/valuesTournament.js is
// CommonJS and sits outside the Vite dev server's file root (/@fs → 403), so
// it does not run in the browser unchanged. The vitest suite still checks the
// trace against that engine.
import DemoShell from "../kit/DemoShell";
import { WORK_VALUE_ORDER } from "../../src/lifePath";
import profile from "../data/demo-profile.json";
import InsertionDemo from "./InsertionDemo";
import { MAX_CHOICES, buildStages, frameAt, layoutAt } from "./insertionModel";

const trace = profile.tournamentTrace;
const STAGES = buildStages(trace);

function Scene({ clock }) {
  const frame = frameAt(clock.T, trace, STAGES);
  const layout = layoutAt(trace, WORK_VALUE_ORDER, frame.applied);

  return (
    <div className="vins">
      <div className="vins-top">
        <p className="vins-counter">
          {frame.confirmed ? `${trace.length} choices` : `Choice ${frame.choice}`} · at most {MAX_CHOICES}
        </p>
        <div className="demo-group" role="group" aria-label="Mode">
          <button type="button" className="demo-btn demo-seg" aria-pressed="true">
            Auto
          </button>
          <button
            type="button"
            className="demo-btn demo-seg"
            aria-pressed="false"
            disabled
            aria-describedby="vins-manual-note"
          >
            Manual
          </button>
        </div>
      </div>

      <InsertionDemo
        layout={layout}
        frame={frame}
        reducedMotion={clock.reducedMotion}
        maxChoices={MAX_CHOICES}
      />

      <p className="vins-note" id="vins-manual-note">
        Manual is off: the tournament engine is server-side CommonJS and does not run here
        unchanged, so this replays the recorded answers.
      </p>
    </div>
  );
}

export default function Demo() {
  return (
    <DemoShell
      slug="values-insertion"
      title="Why ten choices are enough"
      explains="Six work values make 15 possible pairs. Each answer slots a value into a growing ordered list, so at most 10 are ever asked."
      stages={STAGES}
    >
      {(clock) => <Scene clock={clock} />}
    </DemoShell>
  );
}
