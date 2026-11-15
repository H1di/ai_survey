// Values fit — where the "fit %" on the output comes from. Shipped in the
// output details panel (App.jsx → handleOutputOpen → ValuesFit). Your
// work-value priorities and the occupation's measured O*NET work values as two
// shapes on one radar; the number is the backend's precomputed valuesFit (a
// centered cosine — shape, not size). The poor-fit preset overlaps almost as
// much area and still scores low, which is the point.
import { useMemo, useState } from "react";
import DemoShell from "../kit/DemoShell";
import occupations from "../data/occupations.json";
import profile from "../data/demo-profile.json";
import "./fit-demo.css";
import { FitScene } from "../../src/motion/fit/ValuesFit";
import { STAGES, buildPresets, frameAt } from "../../src/motion/fit/fitEngine";

const PRESETS = buildPresets(profile, occupations);
const query = new URLSearchParams(window.location.search);
// ?preset=poor opens on the poor-fit occupation; ?compact=1 shows the panel
// geometry (both for screenshots).
const START = query.get("preset") === "poor" ? "poor" : "chosen";
const COMPACT = query.get("compact") === "1";

function Scene({ clock, presetId, setPresetId }) {
  const preset = PRESETS.find((p) => p.id === presetId);
  const frame = useMemo(() => frameAt(clock.T, preset), [clock.T, preset]);

  const choose = (id) => {
    if (id === presetId) return;
    setPresetId(id);
    // Reduced motion keeps the parked frame; otherwise replay from the start.
    if (!clock.reducedMotion) clock.restart();
  };

  return (
    <FitScene preset={preset} frame={frame} compact={COMPACT}>
      <div className="vfit-presets" role="group" aria-label="Occupation">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="demo-btn"
            aria-pressed={p.id === presetId}
            onClick={() => choose(p.id)}
          >
            {p.kind}: {p.title}
          </button>
        ))}
      </div>
    </FitScene>
  );
}

export default function Demo() {
  const [presetId, setPresetId] = useState(START);
  return (
    <DemoShell
      slug="values-fit"
      title="Where the fit % comes from"
      explains="Your ranked work values and the occupation's measured O*NET work values, compared as shapes — the number on the result card."
      stages={STAGES}
      footnote={profile.onetAttribution}
    >
      {(clock) => <Scene clock={clock} presetId={presetId} setPresetId={setPresetId} />}
    </DemoShell>
  );
}
