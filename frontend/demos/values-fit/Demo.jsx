// Values fit — where the "fit %" on the output card comes from. Your
// work-value priorities and the occupation's measured O*NET work values as two
// shapes on one radar; the number is the backend's precomputed valuesFit (a
// centered cosine — shape, not size). The poor-fit preset overlaps almost as
// much area and still scores low, which is the point.
import { useMemo, useState } from "react";
import DemoShell from "../kit/DemoShell";
import occupations from "../data/occupations.json";
import profile from "../data/demo-profile.json";
import FitFigure from "./FitFigure";
import { AXES, STAGES, buildPresets, frameAt } from "./fitEngine";
import "./values-fit.css";

const PRESETS = buildPresets(profile, occupations);
// ?preset=poor opens on the poor-fit occupation (for screenshots).
const START = new URLSearchParams(window.location.search).get("preset") === "poor" ? "poor" : "chosen";

const label = (key) => AXES.find((a) => a.key === key).label;
const topTwo = (values) =>
  AXES.map((a) => a.key)
    .sort((a, b) => values[b] - values[a])
    .slice(0, 2)
    .map(label)
    .join(" and ");

function ariaFor(p) {
  const agree = p.agree.length
    ? `The shapes lean the same way most on ${p.agree.map(label).join(" and ")}.`
    : "No value where both shapes lean the same way.";
  return `Your work-value priorities (highest: ${topTwo(p.user)}) against the O*NET work values of ${p.title} (highest: ${topTwo(p.job)}). ${agree} Values fit ${p.fit}%.`;
}

function Swatch({ cls }) {
  return (
    <svg className="vfit-swatch" viewBox="0 0 18 10" aria-hidden="true">
      {cls === "vfit-region" ? <rect className={cls} x="1" y="1" width="16" height="8" /> : null}
      {cls === "vfit-tick" ? <path className={cls} d="M5.5 5L8 7.6L13 2.2" /> : null}
      {cls === "vfit-user" || cls === "vfit-job" ? <line className={cls} x1="1" y1="5" x2="17" y2="5" /> : null}
    </svg>
  );
}

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
    <div className="vfit">
      <div className="vfit-grid-layout">
        <div className="vfit-figure">
          <FitFigure preset={preset} frame={frame} ariaLabel={ariaFor(preset)} />
        </div>

        <div className="vfit-readout" aria-hidden="true">
          <p className="vfit-eyebrow">Values fit</p>
          <p className="vfit-number" style={{ opacity: frame.readoutAlpha }}>
            <span className="vfit-num">{frame.count}</span>
            <span className="vfit-pct">%</span>
          </p>
          <p className="vfit-caption" style={{ opacity: frame.readoutAlpha }}>
            Fit compares the shape of your priorities, not their size.
          </p>
          <ul className="vfit-legend">
            <li>
              <Swatch cls="vfit-user" />
              You
            </li>
            <li>
              <Swatch cls="vfit-job" />
              {preset.title}
            </li>
            <li>
              <Swatch cls="vfit-region" />
              Where they overlap
            </li>
            <li style={{ opacity: frame.tickAlpha }}>
              <Swatch cls={preset.agree.length ? "vfit-tick" : null} />
              {preset.agree.length ? "Where both lean the same way" : "No value where both lean the same way"}
            </li>
          </ul>
        </div>
      </div>

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
    </div>
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
