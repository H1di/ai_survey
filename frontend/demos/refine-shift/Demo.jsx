// Refine shift — what "No, show another" does. The backend's refine takes only
// the output id and regenerates from a field family no earlier output used, so
// each No rules out a whole field and moves to the next-best one.
//
// The scene is a pure function of the clock (shiftEngine). The in-scene button
// only drives the clock: it plays to the end of the next round and stops there.
import { useEffect, useMemo, useState } from "react";
import DemoShell from "../kit/DemoShell";
import occupations from "../data/occupations.json";
import profile from "../data/demo-profile.json";
import ShiftCanvas from "./ShiftCanvas";
import { buildModel, frameAt, parseCubicBezier, roundEnd } from "./shiftEngine";
import "./refine-shift.css";

const ease = parseCubicBezier(getComputedStyle(document.documentElement).getPropertyValue("--ease-out"));
const MODEL = buildModel(occupations, profile, ease ? { ease } : {});
const { families, rounds } = MODEL;

const fields = (n) => `${n} field${n === 1 ? "" : "s"} ruled out`;
const ARIA = `Occupations on the RIASEC hexagon, grouped into field families. The first pick, ${families[0].pick.title}, comes from ${families[0].label}. Each No rules out that whole family and moves to the next-best one: ${families
  .slice(1)
  .map((f, i) => `${families[i].label} ruled out, then ${f.pick.title} from ${f.label}`)
  .join("; ")}. ${fields(rounds)}.`;

function Scene({ clock }) {
  const { T } = clock;
  const frame = useMemo(() => frameAt(T, MODEL), [T]);
  const [stopAt, setStopAt] = useState(null);
  const done = frame.settled >= rounds;

  useEffect(() => {
    if (stopAt === null) return;
    if (T >= stopAt - 1e-6) {
      clock.pause();
      clock.seek(stopAt);
      setStopAt(null);
    } else if (!clock.playing) {
      setStopAt(null); // paused or scrubbed by hand: the viewer took over
    }
  }, [T, stopAt, clock]);

  const next = () => {
    const target = roundEnd(MODEL, Math.min(rounds, frame.settled + 1));
    if (clock.reducedMotion) {
      clock.seek(target);
      return;
    }
    setStopAt(target);
    clock.play();
  };

  const reset = () => {
    setStopAt(null);
    clock.pause();
    clock.seek(roundEnd(MODEL, 0));
  };

  return (
    <div className="shift-wrap">
      <ShiftCanvas
        frame={frame}
        stateKey={frame.settled}
        crossfade={clock.reducedMotion}
        ariaLabel={ARIA}
      />
      <div className="shift-bar">
        {done ? (
          <button type="button" className="demo-btn" onClick={reset}>
            Reset
          </button>
        ) : (
          <button type="button" className="demo-btn demo-btn-primary" onClick={next}>
            No, show another
          </button>
        )}
        <span className="shift-count" aria-live="polite">
          {frame.ruledOut.length ? fields(frame.ruledOut.length) : ""}
        </span>
      </div>
    </div>
  );
}

export default function Demo() {
  return (
    <DemoShell
      slug="refine-shift"
      title="No rules out a whole field"
      explains="Saying no to a pick doesn't swap one job for its neighbour: the whole field family is set aside and the next-best family takes its place, so every answer narrows the search."
      stages={MODEL.stages}
      footnote={profile.onetAttribution}
    >
      {(clock) => <Scene clock={clock} />}
    </DemoShell>
  );
}
