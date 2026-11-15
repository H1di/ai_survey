// Where the fit % comes from, as one scene: your work-value priorities and the
// occupation's work values as two shapes on one radar, the region they share,
// and the number — which is always the backend's valuesFit, never derived from
// the drawing. Presentational: the caller owns the clock.
import { useMemo, useRef } from "react";
import { usePlayOnce } from "../usePlayOnce";
import FitFigure from "./FitFigure";
import { AXES, DURATION, buildPreset, frameAt } from "./fitEngine";
import "./values-fit.css";

const label = (key) => AXES.find((a) => a.key === key).label;
const topTwo = (values) =>
  AXES.map((a) => a.key)
    .sort((a, b) => (values[b] ?? 0) - (values[a] ?? 0))
    .slice(0, 2)
    .map(label)
    .join(" and ");

function fitAria(p) {
  const agree = p.agree.length
    ? `The shapes lean the same way most on ${p.agree.map(label).join(" and ")}.`
    : "No value where both shapes lean the same way.";
  return `Your work-value priorities (highest: ${topTwo(p.user)}) against the work values of ${p.title} (highest: ${topTwo(p.job)}). ${agree} Values fit ${p.fit}%.`;
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

export function FitScene({ preset, frame, compact = false, children }) {
  return (
    <div className={`vfit${compact ? " vfit--compact" : ""}`}>
      <div className="vfit-grid-layout">
        <div className="vfit-figure">
          <FitFigure preset={preset} frame={frame} ariaLabel={fitAria(preset)} compact={compact} />
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
      {children}
    </div>
  );
}

// The shipped scene: plays once when it appears; reduced motion paints the
// finished comparison with the number already in place.
export default function ValuesFit({ title, user, job, fit, compact = false, reducedMotion }) {
  const ref = useRef(null);
  const preset = useMemo(() => buildPreset({ title, user, job, fit }), [title, user, job, fit]);
  const { T } = usePlayOnce(DURATION, { targetRef: ref, reducedMotion });
  const frame = useMemo(() => frameAt(T, preset), [T, preset]);
  return (
    <div ref={ref}>
      <FitScene preset={preset} frame={frame} compact={compact} />
    </div>
  );
}
