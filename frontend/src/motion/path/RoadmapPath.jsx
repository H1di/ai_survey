// The accepted occupation's roadmap as one path through time — a thin
// renderer over pathLayout.js. The line, axis and leaders are SVG; markers and
// their pills are real buttons laid over it 1:1, so every stage stays
// reachable by keyboard and its description + milestone open in place.
//
// Motion comes from the roadmap clock (motion/roadmap: RoadmapReveal in
// GraphView provides it). Stage i's edge window draws the line into marker i,
// then the marker and its pill come in. Outside a reveal, or with reduced
// motion (the clock parks at its end), the path is simply drawn.
import { useContext, useId, useMemo, useState } from "react";
import { RevealContext } from "../roadmap/revealContext";
import { stepFrame } from "../roadmap/roadmapTimeline";
import {
  approxMonths,
  layoutPath,
  revealExtent,
  stageWindow,
  testScoreRows,
  topInterestRows,
  wavePath,
} from "./pathLayout";
import "./roadmap-path.css";

const DONE = { edge: 1, node: 1, label: 1 };

function ScorePanel({ bigFive, riasec }) {
  const scores = testScoreRows(bigFive);
  const interests = topInterestRows(riasec);
  return (
    <>
      {scores.length > 0 && (
        <section className="rp-panel-block" aria-label="Test scores">
          <h4 className="rp-panel-heading">Test scores</h4>
          <dl className="rp-scores">
            {scores.map((row) => (
              <div key={row.key} className="rp-score">
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {interests.length > 0 && (
        <section className="rp-panel-block" aria-label="Top interests">
          <h4 className="rp-panel-heading">Top interests</h4>
          <ol className="rp-interests">
            {interests.map((row, i) => (
              <li key={row.key} className={`rp-interest ${i === 0 ? "rp-interest--top" : ""}`}>
                <span className="rp-interest-name">
                  {i + 1}. {row.label}
                </span>
                <span className="rp-interest-bar" aria-hidden="true">
                  <span style={{ width: `${Math.max(2, Math.min(100, row.value))}%` }} />
                </span>
                <span className="rp-interest-value">{row.value}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

export default function RoadmapPath({ stages = [], jobTitle, bigFive, riasec, compact = false }) {
  const orientation = compact ? "vertical" : "horizontal";
  const layout = useMemo(() => layoutPath(stages, { orientation }), [stages, orientation]);
  const reveal = useContext(RevealContext);
  const frames = reveal
    ? stages.map((_, i) => (reveal.timeline[i] ? stepFrame(reveal.T, reveal.timeline[i]) : DONE))
    : null;
  const frame = (i) => (frames ? frames[i] : DONE);
  const settled = !frames || !frames.length || frames[frames.length - 1].label >= 1;

  const [selected, setSelected] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const clipId = `rp-clip-${uid}`;
  const detailId = `rp-detail-${uid}`;

  const vertical = orientation === "vertical";
  const along = revealExtent(layout, frames);
  const firstEnd = layout.track[1] ?? layout.track[0];
  const lineEnd = layout.track[layout.track.length - 1];
  const solid = wavePath(layout, layout.track[0], firstEnd);
  const dashed = wavePath(layout, firstEnd, lineEnd);
  const clip = vertical
    ? { x: -20, y: -20, width: layout.width + 40, height: Math.max(0, along + 20) + 2 }
    : { x: -20, y: -20, width: Math.max(0, along + 20) + 2, height: layout.height + 40 };

  const current = layout.markers[Math.min(selected, layout.markers.length - 1)];
  const currentStage = current ? stages[current.index] : null;
  const hasPanel = Boolean(bigFive || riasec);

  const summary = layout.markers
    .map((m) => `${m.index + 1}. ${m.title} (${stageWindow(m)})`)
    .join("; ");

  return (
    <div className={`rp rp--${orientation}`}>
      <header className="rp-head">
        <div className="rp-head-title">
          <span className="rp-kicker">Roadmap</span>
          {jobTitle && <h3 className="rp-title">{jobTitle}</h3>}
        </div>
        <span className="rp-axis-note">
          Months from now · 0–{layout.axisEnd}
        </span>
      </header>

      <div className="rp-body">
        <div className="rp-main">
          <div className="rp-plot" style={{ width: layout.width, height: layout.height }}>
            <svg
              className="rp-svg"
              width={layout.width}
              height={layout.height}
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              role="img"
              aria-label={`Roadmap over about ${Math.round(layout.totalMonths)} months from now: ${summary}.`}
            >
              <defs>
                <clipPath id={clipId}>
                  <rect {...clip} />
                </clipPath>
              </defs>

              {!vertical &&
                layout.ticks.map((t) => (
                  <line
                    key={`g${t.month}`}
                    className="rp-grid"
                    x1={t.x}
                    y1={0}
                    x2={t.x}
                    y2={t.y}
                  />
                ))}
              <line className="rp-axis" {...layout.axis} />
              {layout.ticks.map((t) =>
                vertical ? (
                  <g key={t.month}>
                    <line className="rp-tick" x1={t.x - 5} y1={t.y} x2={t.x + 5} y2={t.y} />
                    <text
                      className={`rp-tick-label ${t.month === 0 ? "rp-tick-label--now" : ""}`}
                      x={t.x - 12}
                      y={t.y}
                      textAnchor="end"
                      dominantBaseline="central"
                    >
                      {t.label}
                    </text>
                  </g>
                ) : (
                  <g key={t.month}>
                    <line className="rp-tick" x1={t.x} y1={t.y} x2={t.x} y2={t.y + 6} />
                    <text
                      className={`rp-tick-label ${t.month === 0 ? "rp-tick-label--now" : ""}`}
                      x={t.x}
                      y={t.y + 22}
                      textAnchor="middle"
                    >
                      {t.label}
                    </text>
                  </g>
                )
              )}

              {!vertical && (
                <line
                  className="rp-now-drop"
                  x1={layout.now.x}
                  y1={layout.now.y + layout.nowR + 3}
                  x2={layout.now.x}
                  y2={layout.axis.y1}
                />
              )}

              <g clipPath={`url(#${clipId})`}>
                <path className="rp-line" d={solid} />
                <path className="rp-line rp-line--future" d={dashed} />
              </g>

              {layout.labels.map((l) => (
                <line
                  key={`l${l.index}`}
                  className="rp-leader"
                  {...l.leader}
                  style={frames ? { opacity: frame(l.index).label } : undefined}
                />
              ))}

              <circle className="rp-now" cx={layout.now.x} cy={layout.now.y} r={layout.nowR} />
            </svg>

            {layout.markers.map((m) => {
              const f = frame(m.index);
              const isSelected = current === m;
              return (
                <button
                  key={m.id ?? m.index}
                  type="button"
                  className={`rp-marker nodrag ${isSelected ? "rp-marker--selected" : ""}`}
                  style={{
                    left: m.x - layout.r,
                    top: m.y - layout.r,
                    width: layout.r * 2,
                    height: layout.r * 2,
                    ...(frames
                      ? {
                          opacity: f.node,
                          transform: `scale(${0.6 + 0.4 * f.node})`,
                          pointerEvents: f.node > 0 ? undefined : "none",
                        }
                      : null),
                  }}
                  aria-label={`Stage ${m.index + 1} of ${layout.markers.length}: ${m.title}, ${stageWindow(m)}`}
                  aria-pressed={isSelected}
                  aria-controls={detailId}
                  onClick={() => setSelected(m.index)}
                >
                  {m.initials}
                </button>
              );
            })}

            {layout.labels.map((l) => {
              const f = frame(l.index);
              const isSelected = current?.index === l.index;
              return (
                <button
                  key={`p${l.index}`}
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  className={`rp-pill nodrag ${l.index === 0 ? "rp-pill--current" : ""} ${
                    isSelected ? "rp-pill--selected" : ""
                  }`}
                  style={{
                    left: l.x,
                    top: l.y,
                    // Vertical pills sit in their own rows: let the text set
                    // the width, capped at the column.
                    ...(vertical ? { maxWidth: layout.width - l.x } : { width: l.w }),
                    height: l.h,
                    ...(frames
                      ? { opacity: f.label, pointerEvents: f.label > 0 ? undefined : "none" }
                      : null),
                  }}
                  onClick={() => setSelected(l.index)}
                >
                  {l.text}
                </button>
              );
            })}
          </div>

          {currentStage && (
            <div
              id={detailId}
              className="rp-detail nodrag"
              aria-live="polite"
              style={settled ? undefined : { opacity: 0, visibility: "hidden" }}
            >
              <p className="rp-detail-kicker">
                Stage {current.index + 1} / {layout.markers.length} · {stageWindow(current)}
                {currentStage.timeframe ? ` · ${currentStage.timeframe}` : ""}
              </p>
              <h4 className="rp-detail-title">{currentStage.title}</h4>
              {currentStage.description && <p className="rp-detail-desc">{currentStage.description}</p>}
              {currentStage.milestone && (
                <p className="rp-detail-milestone">
                  <span className="rp-detail-label">Milestone · {approxMonths(current.end)}</span>
                  {currentStage.milestone}
                </p>
              )}
            </div>
          )}
        </div>

        {hasPanel &&
          (vertical ? (
            <div className="rp-panel rp-panel--compact">
              <button
                type="button"
                className="rp-panel-toggle nodrag"
                aria-expanded={panelOpen}
                onClick={() => setPanelOpen((open) => !open)}
              >
                <span>Test scores · Top interests</span>
                <svg className="rp-chevron" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 6l5 5 5-5" />
                </svg>
              </button>
              {panelOpen && (
                <div className="rp-panel-body">
                  <ScorePanel bigFive={bigFive} riasec={riasec} />
                </div>
              )}
            </div>
          ) : (
            <aside className="rp-panel">
              <ScorePanel bigFive={bigFive} riasec={riasec} />
            </aside>
          ))}
      </div>
    </div>
  );
}
