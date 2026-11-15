// One settleEngine frame as a whole scene: the hexagon figure, its legend and
// the code readout. Presentational — the caller owns the clock (DemoShell's
// scrubber in the demo, a play-once clock in RiasecSettle).
import { Fragment } from "react";
import SettleFigure from "./SettleFigure";
import { RIASEC_NAMES } from "./settleEngine";
import "./riasec-settle.css";

const names = (code) => code.split("").map((k) => RIASEC_NAMES[k]);

function settleAria(p) {
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

export default function SettleScene({ profile, frame, children }) {
  return (
    <div className="rset">
      <div className="rset-figure">
        <SettleFigure profile={profile} frame={frame} ariaLabel={settleAria(profile)} />
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

      {children}
    </div>
  );
}
