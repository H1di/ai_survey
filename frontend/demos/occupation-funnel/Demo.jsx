// Occupation funnel — the selection path the backend takes while the first
// result is being prepared: 923 O*NET occupations → 5 field families → the 15
// closest interest profiles → one pick, handed off as the output pill.
//
// "Simulate waiting" models the real, unknown latency: the scene holds stage 3
// until "Response arrived", then plays the pick. The hold is data
// (holdUntil → funnelEngine), so this file only wires state to the clock.
import { useEffect, useMemo, useState } from "react";
import DemoShell from "../kit/DemoShell";
import occupations from "../data/occupations.json";
import profile from "../data/demo-profile.json";
import FunnelCanvas from "./FunnelCanvas";
import { HOLD_AT, buildModel, frameAt, stagesFor } from "./funnelEngine";
import "./funnel.css";

const MODEL = buildModel(occupations, profile);

// While the response is outstanding the hold has no known end; the clock's
// timeline is extended in steps ahead of T so it never reaches the end (and
// loops) while still waiting.
const HORIZON_STEP = 4;
const HORIZON_MARGIN = 1;

// ?wait=1 opens in waiting mode (for screenshots of the hold).
const START_WAITING = new URLSearchParams(window.location.search).get("wait") === "1";

const families = profile.topDirections.map((d) => d.label).join(", ");
const ARIA = `${occupations.length} O*NET occupations placed on the RIASEC hexagon, narrowed to five field families that match the ${profile.riasecCode} interest profile (${families}), then to the 15 occupations with the closest interest profiles. The pick is ${profile.chosen.title}, Pearson r ${profile.chosen.r.toFixed(2)}.`;

function Scene({ clock, waiting, setWaiting, pressedAt, setPressedAt, horizon, setHorizon, holdUntil }) {
  const { T } = clock;
  const frame = useMemo(() => frameAt(T, MODEL, holdUntil), [T, holdUntil]);
  const open = waiting && pressedAt === null;

  useEffect(() => {
    // The clock moved back past the press (loop, restart, scrub): the response
    // has not arrived at that point any more.
    if (pressedAt !== null && T < pressedAt - 1e-3) setPressedAt(null);
    if (open && T > HOLD_AT + horizon - HORIZON_MARGIN) setHorizon((h) => h + HORIZON_STEP);
    if (open && T < HOLD_AT && horizon !== HORIZON_STEP) setHorizon(HORIZON_STEP);
  }, [T, open, pressedAt, horizon, setPressedAt, setHorizon]);

  const toggleWaiting = () => {
    setWaiting(!waiting);
    setPressedAt(null);
    setHorizon(HORIZON_STEP);
    clock.restart();
  };

  let note = "";
  if (waiting && T > HOLD_AT) {
    note = open
      ? `waiting ${(T - HOLD_AT).toFixed(1)} s`
      : `arrived after ${Math.max(0, holdUntil - HOLD_AT).toFixed(1)} s`;
  }

  return (
    <div className="funnel-wrap">
      <FunnelCanvas frame={frame} ariaLabel={ARIA} />
      <div className="funnel-wait" role="group" aria-label="Response timing">
        <button type="button" className="demo-btn" aria-pressed={waiting} onClick={toggleWaiting}>
          Simulate waiting
        </button>
        <button
          type="button"
          className="demo-btn demo-btn-primary"
          disabled={!open}
          onClick={() => setPressedAt(T)}
        >
          Response arrived
        </button>
        <span className="funnel-wait-note" aria-live="polite">
          {note}
        </span>
      </div>
    </div>
  );
}

export default function Demo() {
  const [waiting, setWaiting] = useState(START_WAITING);
  const [pressedAt, setPressedAt] = useState(null);
  const [horizon, setHorizon] = useState(HORIZON_STEP);

  // HOLD_AT = no hold; null = still waiting; else the clock time it arrived.
  const holdUntil = waiting ? (pressedAt === null ? null : Math.max(HOLD_AT, pressedAt)) : HOLD_AT;
  const stages = useMemo(() => stagesFor(holdUntil ?? HOLD_AT + horizon), [holdUntil, horizon]);

  return (
    <DemoShell
      slug="occupation-funnel"
      title="From 923 occupations to one"
      explains="While your first result is prepared, the path it is chosen by: every O*NET occupation, the five field families your interests point to, the 15 closest profiles, one pick."
      stages={stages}
      footnote={profile.onetAttribution}
    >
      {(clock) => (
        <Scene
          clock={clock}
          waiting={waiting}
          setWaiting={setWaiting}
          pressedAt={pressedAt}
          setPressedAt={setPressedAt}
          horizon={horizon}
          setHorizon={setHorizon}
          holdUntil={holdUntil}
        />
      )}
    </DemoShell>
  );
}
