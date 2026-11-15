// Thin SVG painter for one fitEngine frame: grid, the two work-value polygons,
// the swept intersection, axis labels with values, and the agreement ticks.
// Colours come from tokens.css via classes in values-fit.css.
import { AXES, RAYS, axisAngle } from "./fitEngine";

// Two fixed geometries (SVG user units). "compact" is for a column around
// 300 px wide — the details panel — where the regular one would scale its
// labels below 10 px.
const GEOMETRY = {
  regular: { W: 400, H: 352, CX: 200, CY: 176, R: 100 },
  compact: { W: 328, H: 300, CX: 164, CY: 150, R: 74 },
};
const LINE_H = 13;
const RINGS = [0.25, 0.5, 0.75, 1];
const LABEL_LINES = { working_conditions: ["Working", "Conditions"] };

const fmt = (n) => n.toFixed(2);
const at = (g, r, a) => [g.CX + Math.cos(a) * r * g.R, g.CY + Math.sin(a) * r * g.R];

function polyPath(g, radii, scale) {
  return `${radii
    .map((r, i) => {
      const [x, y] = at(g, r * scale, axisAngle(i));
      return `${i ? "L" : "M"}${fmt(x)} ${fmt(y)}`;
    })
    .join("")}Z`;
}

// The first `sweep` of the rays, closed through the centre until complete.
function regionPath(g, region, sweep) {
  if (sweep <= 0) return null;
  const n = sweep >= 1 ? RAYS : Math.floor(sweep * RAYS) + 1;
  const pts = region.slice(0, n).map(({ angle, r }) => at(g, r, angle));
  const body = pts.map(([x, y], i) => `${i ? "L" : "M"}${fmt(x)} ${fmt(y)}`).join("");
  return sweep >= 1 ? `${body}Z` : `M${g.CX} ${g.CY}${body.replace(/^M/, "L")}Z`;
}

function AxisLabel({ g, axis, i, user, job, frame }) {
  const a = axisAngle(i);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const x = g.CX + cos * (g.R + 22);
  const y = g.CY + sin * (g.R + 22);
  const anchor = Math.abs(cos) < 0.1 ? "middle" : cos > 0 ? "start" : "end";
  const lines = LABEL_LINES[axis.key] ?? [axis.label];
  const h = (lines.length + 1) * LINE_H;
  // First baseline: block sits above the anchor at the top, below it at the
  // bottom, centred on it at the sides.
  const y0 = sin < -0.5 ? y - h + LINE_H - 3 : sin > 0.5 ? y + LINE_H - 2 : y - h / 2 + LINE_H - 3;

  return (
    <text className="vfit-label" x={x} y={y0} textAnchor={anchor}>
      {lines.map((line, k) => (
        <tspan key={line} x={x} dy={k ? LINE_H : 0}>
          {line}
        </tspan>
      ))}
      <tspan className="vfit-val" x={x} dy={LINE_H}>
        <tspan className="vfit-val-user" fillOpacity={frame.userValuesAlpha}>
          {user[axis.key]}
        </tspan>
        <tspan className="vfit-val-sep" fillOpacity={frame.jobValuesAlpha}>
          {" · "}
        </tspan>
        <tspan className="vfit-val-job" fillOpacity={frame.jobValuesAlpha}>
          {job[axis.key]}
        </tspan>
      </tspan>
    </text>
  );
}

// A small check mark on the axis, between the outer ring and the label.
function Tick({ g, i, alpha }) {
  const [x, y] = at(g, (g.R + 10) / g.R, axisAngle(i));
  return (
    <path
      className="vfit-tick"
      d={`M${fmt(x - 3.5)} ${fmt(y)}L${fmt(x - 1)} ${fmt(y + 2.6)}L${fmt(x + 4)} ${fmt(y - 2.8)}`}
      opacity={alpha}
    />
  );
}

export default function FitFigure({ preset, frame, ariaLabel, compact = false }) {
  const g = compact ? GEOMETRY.compact : GEOMETRY.regular;
  const region = regionPath(g, preset.region, frame.sweep);
  const dots = (radii, scale, cls) =>
    scale > 0 &&
    radii.map((r, i) => {
      const [x, y] = at(g, r * scale, axisAngle(i));
      return <circle key={i} className={cls} cx={x} cy={y} r={2.2} />;
    });

  return (
    <svg
      className="vfit-svg"
      style={{ aspectRatio: `${g.W} / ${g.H}` }}
      viewBox={`0 0 ${g.W} ${g.H}`}
      role="img"
      aria-label={ariaLabel}
    >
      <g className="vfit-grid">
        {RINGS.map((r) => (
          <path key={r} d={polyPath(g, AXES.map(() => r), 1)} />
        ))}
        {AXES.map((axis, i) => {
          const [x, y] = at(g, 1, axisAngle(i));
          return <line key={axis.key} x1={g.CX} y1={g.CY} x2={x} y2={y} />;
        })}
      </g>

      {region && <path className="vfit-region" d={region} />}
      {frame.userScale > 0 && <path className="vfit-user" d={polyPath(g, preset.userRadii, frame.userScale)} />}
      {frame.jobScale > 0 && <path className="vfit-job" d={polyPath(g, preset.jobRadii, frame.jobScale)} />}
      {dots(preset.userRadii, frame.userScale, "vfit-dot-user")}
      {dots(preset.jobRadii, frame.jobScale, "vfit-dot-job")}

      {AXES.map((axis, i) => (
        <AxisLabel key={axis.key} g={g} axis={axis} i={i} user={preset.user} job={preset.job} frame={frame} />
      ))}
      {AXES.map((axis, i) =>
        preset.agree.includes(axis.key) ? <Tick key={axis.key} g={g} i={i} alpha={frame.tickAlpha} /> : null
      )}
    </svg>
  );
}
