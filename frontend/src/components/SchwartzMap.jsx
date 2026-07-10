import "./SchwartzMap.css";

// Schwartz circumplex plane: Openness↔Conservation on X, Transcendence↔
// Enhancement on Y. Both axes arrive pre-derived from the backend as
// −100..+100 points; visual proximity between the user's point and a job's
// point IS the values fit. Self-contained SVG — no chart library.

const SIZE = 260;
const R = SIZE / 2 - 24;
const CX = SIZE / 2;
const CY = SIZE / 2;

function project(point) {
  // x grows rightward (Openness), y grows upward (Transcendence).
  const x = CX + (point.x_open_vs_conserv / 100) * R;
  const y = CY - (point.y_transc_vs_enhance / 100) * R;
  return { x, y };
}

export default function SchwartzMap({ userPoint, jobs = [] }) {
  if (!userPoint) return null;
  const user = project(userPoint);

  return (
    <div className="profile-chart schwartz-map">
      <p className="profile-chart-title">Values map (Schwartz circumplex)</p>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Schwartz values map">
        <circle className="schwartz-circle" cx={CX} cy={CY} r={R} />
        <circle className="schwartz-circle schwartz-circle-inner" cx={CX} cy={CY} r={R / 2} />
        <line className="schwartz-axis" x1={CX - R} y1={CY} x2={CX + R} y2={CY} />
        <line className="schwartz-axis" x1={CX} y1={CY - R} x2={CX} y2={CY + R} />

        <text className="schwartz-axis-label" x={CX} y={CY - R - 8} textAnchor="middle">
          Self-Transcendence
        </text>
        <text className="schwartz-axis-label" x={CX} y={CY + R + 16} textAnchor="middle">
          Self-Enhancement
        </text>
        <text
          className="schwartz-axis-label"
          x={CX - R - 6}
          y={CY}
          textAnchor="middle"
          transform={`rotate(-90 ${CX - R - 6} ${CY})`}
        >
          Conservation
        </text>
        <text
          className="schwartz-axis-label"
          x={CX + R + 6}
          y={CY}
          textAnchor="middle"
          transform={`rotate(90 ${CX + R + 6} ${CY})`}
        >
          Openness to Change
        </text>

        {jobs.map((job) => {
          const p = project(job.point);
          return (
            <g key={job.id} className={`schwartz-job ${job.accepted ? "accepted" : ""}`}>
              <line
                className="schwartz-link"
                x1={user.x}
                y1={user.y}
                x2={p.x}
                y2={p.y}
              />
              <circle className="schwartz-job-dot" cx={p.x} cy={p.y} r={job.accepted ? 6 : 4.5} />
              <text className="schwartz-job-label" x={p.x} y={p.y - 9} textAnchor="middle">
                {job.label}
                {typeof job.fit === "number" ? ` · ${job.fit}%` : ""}
              </text>
            </g>
          );
        })}

        <g className="schwartz-user">
          <circle className="schwartz-user-dot" cx={user.x} cy={user.y} r={6} />
          <text className="schwartz-job-label schwartz-user-label" x={user.x} y={user.y + 18} textAnchor="middle">
            You
          </text>
        </g>
      </svg>
      <p className="profile-panel-note">
        Closer to “You” = closer values fit. Your point is inferred from the assessment
        (low confidence), not measured directly.
      </p>
    </div>
  );
}
