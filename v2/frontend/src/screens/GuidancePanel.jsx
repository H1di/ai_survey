import { deltaLabel, formatDuration, formatEur } from "../pathView";

const BREAK_LABELS = { budget: "your budget", location: "your location", time: "your time" };

// Deeper AI guidance: why the path fits, real occupations it leads to,
// scenarios to compare, and what to add. Numbers are computed by fixed rules;
// only the prose may come from the AI.
export default function GuidancePanel({ guidance, courseById, busy, onApplyScenario, onAddCourse, onPathIds }) {
  return (
    <section className="guidance" aria-label="Your guidance">
      <header className="section-head">
        <h2 className="section-title">Why this path fits you</h2>
        <p className="section-sub">{guidance.source === "ai" ? "Written by AI from your scored tests." : "Written by fixed rules from your scored tests."}</p>
      </header>
      <p className="guidance-text">{guidance.explanation}</p>
      {guidance.points?.length > 0 && (
        <ul className="basis">
          {guidance.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {guidance.occupations?.length > 0 && (
        <>
          <h3 className="sub-title">Where it can lead</h3>
          <ul className="occupations">
            {guidance.occupations.map((o) => (
              <li key={o.soc}>
                <span className="occ-title">{o.title}</span>
                <span className="occ-meta">
                  interest fit {o.interestFit}/100{o.valuesFit !== null ? ` · values fit ${o.valuesFit}/100` : ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="attribution">{guidance.attribution}</p>
        </>
      )}

      <h3 className="sub-title">Scenarios</h3>
      {guidance.scenarios?.length ? (
        <div className="scenario-grid">
          {guidance.scenarios.map((s) => (
            <article key={s.id} className="scenario">
              <h4 className="scenario-title">{s.label}</h4>
              <p className="scenario-note">{guidance.scenarioNotes?.[s.id]}</p>
              <ol className="scenario-steps">
                {s.steps.map((st) => (
                  <li key={st.courseId}>{courseById(st.courseId)?.title || st.courseId}</li>
                ))}
              </ol>
              <p className="scenario-totals">
                {formatDuration(s.totals.months)} · {formatEur(s.totals.fees)} total
                <br />
                <span className="muted">
                  vs your path: {deltaLabel(s.versusCurrent.months, "months")}, {deltaLabel(s.versusCurrent.fees, "fees")}
                </span>
              </p>
              {s.breaks?.length > 0 && (
                <p className="scenario-breaks">Goes outside {s.breaks.map((b) => BREAK_LABELS[b] || b).join(" and ")}.</p>
              )}
              <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => onApplyScenario(s.id)}>
                Use this scenario
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">No other combination of courses fits your field in the catalogue yet.</p>
      )}

      {guidance.additions?.length > 0 && (
        <>
          <h3 className="sub-title">Worth adding</h3>
          <ul className="additions">
            {guidance.additions.map((a) => {
              const c = courseById(a.courseId);
              const on = onPathIds.includes(a.courseId);
              return (
                <li key={a.courseId}>
                  <div>
                    <span className="occ-title">{c?.title || a.courseId}</span>
                    <span className="occ-meta">builds {a.buildsSkills.join(", ")}</span>
                  </div>
                  <button type="button" className="btn btn--ghost btn--sm" disabled={busy || on} onClick={() => onAddCourse(a.courseId)}>
                    {on ? "On your path" : "Add to path"}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
