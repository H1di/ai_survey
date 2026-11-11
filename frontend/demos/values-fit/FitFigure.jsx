// Thin SVG painter for one fitEngine frame: grid, the two work-value polygons,
// the swept intersection, axis labels with values, and the agreement ticks.
// Colours come from tokens.css via classes in values-fit.css.
import { AXES, RAYS, axisAngle } from "./fitEngine";

const W = 400;
const H = 352;
const CX = 200;
const CY = 176;
const R = 100;
const LABEL_R = R + 22;
const TICK_R = R + 10;
const LINE_H = 13;
const RINGS = [0.25, 0.5, 0.75, 1];

const at = (r, a) => [CX + Math.cos(a) * r * R, CY + Math.sin(a) * r * R];
const fmt = (n) => n.toFixed(2);

function polyPath(radii, scale) {
  return `${radii
    .map((r, i) => {
      const [x, y] = at(r * scale, axisAngle(i));
      return `${i ? "L" : "M"}${fmt(x)} ${fmt(y)}`;
    })
    .join("")}Z`;
}

// The first `sweep` of the rays, closed through the centre until complete.
function regionPath(region, sweep) {
  const n = sweep >= 1 ? RAYS : Math.floor(sweep * RAYS) + 1;
  if (sweep <= 0) return null;
  const pts = region.slice(0, n).map(({ angle, r }) => at(r, angle));
  const body = pts.map(([x, y], i) => `${i ? "L" : "M"}${fmt(x)} ${fmt(y)}`).join("");
  return sweep >= 1 ? `${body}Z` : `M${CX} ${CY}${body.replace(/^M/, "L")}Z`;
}

const LABEL_LINES = { working_conditions: ["Working", "Conditions"] };

function AxisLabel({ axis, i, user, job, frame }) {
  const a = axisAngle(i);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const x = CX + cos * LABEL_R;
  const y = CY + sin * LABEL_R;
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
function Tick({ i, alpha }) {
  const [x, y] = at(TICK_R / R, axisAngle(i));
  return (
    <path
      className="vfit-tick"
      d={`M${fmt(x - 3.5)} ${fmt(y)}L${fmt(x - 1)} ${fmt(y + 2.6)}L${fmt(x + 4)} ${fmt(y - 2.8)}`}
      opacity={alpha}
    />
  );
}

export default function FitFigure({ preset, frame, ariaLabel }) {
  const region = regionPath(preset.region, frame.sweep);
  const dots = (radii, scale, cls) =>
    scale > 0 &&
    radii.map((r, i) => {
      const [x, y] = at(r * scale, axisAngle(i));
      return <circle key={i} className={cls} cx={x} cy={y} r={2.2} />;
    });

  return (
    <svg className="vfit-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      <g className="vfit-grid">
        {RINGS.map((r) => (
          <path key={r} d={polyPath(AXES.map(() => r), 1)} />
        ))}
        {AXES.map((axis, i) => {
          const [x, y] = at(1, axisAngle(i));
          return <line key={axis.key} x1={CX} y1={CY} x2={x} y2={y} />;
        })}
      </g>

      {region && <path className="vfit-region" d={region} />}
      {frame.userScale > 0 && <path className="vfit-user" d={polyPath(preset.userRadii, frame.userScale)} />}
      {frame.jobScale > 0 && <path className="vfit-job" d={polyPath(preset.jobRadii, frame.jobScale)} />}
      {dots(preset.userRadii, frame.userScale, "vfit-dot-user")}
      {dots(preset.jobRadii, frame.jobScale, "vfit-dot-job")}

      {AXES.map((axis, i) => (
        <AxisLabel key={axis.key} axis={axis} i={i} user={preset.user} job={preset.job} frame={frame} />
      ))}
      {AXES.map((axis, i) =>
        preset.agree.includes(axis.key) ? <Tick key={axis.key} i={i} alpha={frame.tickAlpha} /> : null
      )}
    </svg>
  );
}
