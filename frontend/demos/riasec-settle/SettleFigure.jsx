// Thin SVG painter for one settleEngine frame: hexagon, score spokes, labelled
// vertices, the travelling point with its trail, and the lit code vertices.
// Colours come from tokens.css via classes in riasec-settle.css.
import { HEX_VERTICES } from "../kit/riasecPlane";
import { RIASEC_NAMES } from "./settleEngine";

const W = 400;
const H = 330;
const CX = 200;
const CY = 165;
const R = 94;
const LABEL_R = R + 14;
const LINE_H = 14;

const fmt = (n) => n.toFixed(2);
const px = (p) => [CX + p.x * R, CY + p.y * R];
const hexPath = (scale) =>
  `${HEX_VERTICES.map((v, i) => `${i ? "L" : "M"}${fmt(CX + v.x * R * scale)} ${fmt(CY + v.y * R * scale)}`).join("")}Z`;

// Two-line block per vertex: "I Investigative" over the score. The lit copy
// repeats line one in gold at identical metrics and crossfades over it.
function VertexLabel({ v, score, scoreAlpha, lit }) {
  const x = CX + v.x * LABEL_R;
  const y = CY + v.y * LABEL_R;
  const anchor = Math.abs(v.x) < 0.1 ? "middle" : v.x > 0 ? "start" : "end";
  const h = 2 * LINE_H;
  const y0 = v.y < -0.5 ? y - h + LINE_H - 4 : v.y > 0.5 ? y + LINE_H - 1 : y - h / 2 + LINE_H - 4;
  const line1 = (cls) => (
    <>
      <tspan className={`rset-key ${cls}`}>{v.key}</tspan>
      <tspan className={`rset-name ${cls}`} dx={5}>
        {RIASEC_NAMES[v.key]}
      </tspan>
    </>
  );
  return (
    <g>
      <text className="rset-label" x={x} y={y0} textAnchor={anchor}>
        <tspan fillOpacity={1 - lit}>{line1("is-base")}</tspan>
        <tspan className="rset-score" x={x} dy={LINE_H} fillOpacity={scoreAlpha}>
          {score}
        </tspan>
      </text>
      {lit > 0 && (
        <text className="rset-label" x={x} y={y0} textAnchor={anchor} opacity={lit}>
          {line1("is-lit")}
        </text>
      )}
    </g>
  );
}

export default function SettleFigure({ profile, frame, ariaLabel }) {
  const [hx, hy] = px(frame.point);
  const [tx, ty] = px(frame.trail.from);
  const trailLen = Math.hypot(hx - tx, hy - ty);

  return (
    <svg className="rset-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      <g className="rset-grid">
        <path d={hexPath(1)} />
        <path className="rset-mid" d={hexPath(0.5)} />
        {HEX_VERTICES.map((v) => (
          <line key={v.key} x1={CX} y1={CY} x2={CX + v.x * R} y2={CY + v.y * R} />
        ))}
      </g>

      {frame.spokes.map((s, i) => {
        if (s.len <= 0) return null;
        const v = HEX_VERTICES[i];
        const end = { x2: fmt(CX + v.x * R * s.len), y2: fmt(CY + v.y * R * s.len) };
        return (
          <g key={s.key}>
            <line className="rset-spoke" x1={CX} y1={CY} {...end} opacity={s.alpha} />
            {frame.lit[s.key] > 0 && (
              <line className="rset-spoke is-lit" x1={CX} y1={CY} {...end} opacity={frame.lit[s.key]} />
            )}
          </g>
        );
      })}

      {HEX_VERTICES.map((v) => (
        <g key={v.key}>
          <circle className="rset-vertex" cx={CX + v.x * R} cy={CY + v.y * R} r={2} />
          {frame.lit[v.key] > 0 && (
            <circle className="rset-vertex is-lit" cx={CX + v.x * R} cy={CY + v.y * R} r={3.5} opacity={frame.lit[v.key]} />
          )}
        </g>
      ))}

      {HEX_VERTICES.map((v, i) => (
        <VertexLabel
          key={v.key}
          v={v}
          score={profile.scores[v.key]}
          scoreAlpha={frame.spokes[i].alpha}
          lit={frame.lit[v.key]}
        />
      ))}

      {frame.trail.alpha > 0 && trailLen > 0.5 && (
        <>
          <defs>
            <linearGradient id="rset-trail" gradientUnits="userSpaceOnUse" x1={tx} y1={ty} x2={hx} y2={hy}>
              <stop className="rset-trail-stop" offset="0" stopOpacity="0" />
              <stop className="rset-trail-stop" offset="1" stopOpacity="1" />
            </linearGradient>
          </defs>
          <line className="rset-trail" x1={tx} y1={ty} x2={hx} y2={hy} opacity={frame.trail.alpha} />
        </>
      )}
      {frame.pointAlpha > 0 && (
        <g opacity={frame.pointAlpha}>
          <circle className="rset-ring" cx={hx} cy={hy} r={8.5} opacity={frame.settled} />
          <circle className="rset-point" cx={hx} cy={hy} r={4.5} />
        </g>
      )}
    </svg>
  );
}
