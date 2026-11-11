// RIASEC settle — what the three-letter interest code means and where it
// comes from. Product placement: after the RIASEC quiz is finished, never
// while answering (live scores would bias the answers).
import { Fragment, useMemo, useState } from "react";
import DemoShell from "../kit/DemoShell";
import profile from "../data/demo-profile.json";
import SettleFigure from "./SettleFigure";
import { RIASEC_NAMES, STAGES, buildProfiles, frameAt } from "./settleEngine";
import "./riasec-settle.css";

const PROFILES = buildProfiles(profile);
// ?profile=rci|sea opens on a synthetic profile (for screenshots).
const requested = new URLSearchParams(window.location.search).get("profile");
const START = PROFILES.some((p) => p.id === requested) ? requested : "persona";

const names = (code) => code.split("").map((k) => RIASEC_NAMES[k]);

function ariaFor(p) {
  const scores = Object.entries(p.scores)
    .map(([k, v]) => `${RIASEC_NAMES[k]} ${v}`)
    .join(", ");
  const [a, b, c] = names(p.code);
  return `Interest scores (${scores}) on Holland's six-type hexagon. Their balance sits toward ${a} and ${b}. Interest code ${p.code}: ${a}, ${b}, ${c} — the three highest types, strongest first.`;
}

function Swatch({ kind }) {
  return (
    <svg className="rset-swatch" viewBox="0 0 18 10" aria-hidden="true">
      {kind === "spoke" ? <line className="rset-spoke" x1="1" y1="5" x2="17" y2="5" /> : null}
      {kind === "point" ? <circle className="rset-point" cx="9" cy="5" r="3.5" /> : null}
      {kind === "lit" ? (
        <>
          <line className="rset-spoke is-lit" x1="1" y1="5" x2="14" y2="5" />
          <circle className="rset-vertex is-lit" cx="14.5" cy="5" r="2.5" />
        </>
      ) : null}
    </svg>
  );
}

function Scene({ clock, profileId, setProfileId }) {
  const p = PROFILES.find((x) => x.id === profileId);
  const frame = useMemo(() => frameAt(clock.T, p), [clock.T, p]);

  const choose = (id) => {
    if (id === profileId) return;
    setProfileId(id);
    // Reduced motion keeps the parked frame; otherwise replay from the start.
    if (!clock.reducedMotion) clock.restart();
  };

  return (
    <div className="rset">
      <div className="rset-figure">
        <SettleFigure profile={p} frame={frame} ariaLabel={ariaFor(p)} />
      </div>

      <ul className="rset-legend" aria-hidden="true">
        <li>
          <Swatch kind="spoke" />
          Spoke: score for that type
        </li>
        <li>
          <Swatch kind="point" />
          Point: the balance of all six
        </li>
        <li>
          <Swatch kind="lit" />
          Code: the three highest types
        </li>
      </ul>

      <div className="rset-readout" aria-hidden="true">
        <p className="rset-eyebrow">Interest code</p>
        <div className="rset-code">
          {frame.letters.map((l, k) => (
            <Fragment key={l.key}>
              {k > 0 && (
                <span className="rset-sep" style={{ opacity: l.alpha }}>
                  ·
                </span>
              )}
              <div className="rset-cell">
                <span className="rset-letter" style={{ opacity: l.alpha }}>
                  {l.key}
                </span>
                <span className="rset-cell-name">{l.name.slice(0, l.chars)}</span>
              </div>
            </Fragment>
          ))}
        </div>
        <p className="rset-caption" style={{ opacity: frame.captionAlpha }}>
          The three highest-scoring types, strongest first.
        </p>
      </div>

      <div className="rset-profiles" role="group" aria-label="Sample profile">
        {PROFILES.map((x) => (
          <button
            key={x.id}
            type="button"
            className="demo-btn"
            aria-pressed={x.id === profileId}
            onClick={() => choose(x.id)}
          >
            {x.code} · {x.tag}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Demo() {
  const [profileId, setProfileId] = useState(START);
  return (
    <DemoShell
      slug="riasec-settle"
      title="What your interest code means"
      explains="Your six interest scores, where their balance sits on Holland's hexagon, and the three highest types that make up your code."
      stages={STAGES}
    >
      {(clock) => <Scene clock={clock} profileId={profileId} setProfileId={setProfileId} />}
    </DemoShell>
  );
}
