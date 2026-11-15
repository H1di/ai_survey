// Values insertion — why ten quick choices are enough. Shipped as the body of
// ValuesTournamentScreen (InsertionBoard, fed by the live tournament state). Each answer places a
// value relative to an ordered list instead of pitting every value against
// every other (15 pairs). Replays the real tournament answers in
// demo-profile.json → tournamentTrace.
//
// Manual mode stays off here: the interactive version is the product itself
// (the tournament screen answers through the real backend engine). This page
// replays the recorded answers; the vitest suite checks them against that
// engine.
import DemoShell from "../kit/DemoShell";
import { WORK_VALUE_ORDER } from "../../src/lifePath";
import profile from "../data/demo-profile.json";
import "./insertion-demo.css";
import InsertionBoard from "../../src/motion/insertion/InsertionBoard";
import { MAX_CHOICES, buildStages, frameAt, layoutAt } from "../../src/motion/insertion/insertionModel";

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

      <InsertionBoard
        layout={layout}
        applied={frame.applied}
        chosen={frame.chosen}
        confirmed={frame.confirmed}
        reducedMotion={clock.reducedMotion}
        maxChoices={MAX_CHOICES}
      />

      <p className="vins-note" id="vins-manual-note">
        Manual is off here: this page replays the recorded answers. The interactive version is
        the values step of the assessment itself.
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
