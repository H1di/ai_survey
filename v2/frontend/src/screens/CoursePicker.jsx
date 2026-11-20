import { useEffect, useState } from "react";
import { searchCourses } from "../api";
import { CITY_LABELS, KIND_LABELS, MODE_LABELS, formatDuration, formatEur, placeLabel } from "../pathView";

// The catalogue browser behind "Add a course" and "Swap". Plain filters, no
// ranking: the user is choosing, so nothing is hidden by fit.
export default function CoursePicker({
  title,
  fields,
  onPathIds,
  compareIds,
  onPick,
  pickLabel,
  onToggleCompare,
  onClose,
  initialField = "",
}) {
  const [filters, setFilters] = useState({ q: "", field: initialField, city: "", mode: "", kind: "", maxFee: "" });
  const [courses, setCourses] = useState([]);
  const [state, setState] = useState("loading");

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      searchCourses(filters)
        .then((data) => {
          if (!live) return;
          setCourses(data.courses);
          setState("ready");
        })
        .catch(() => live && setState("error"));
    }, 180);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [filters]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <h2 className="drawer-title">{title}</h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="filters">
          <input className="field" placeholder="Search title, provider or skill" value={filters.q} onChange={set("q")} aria-label="Search" />
          <select className="field" value={filters.field} onChange={set("field")} aria-label="Field">
            <option value="">All fields</option>
            {fields.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <select className="field" value={filters.kind} onChange={set("kind")} aria-label="Course type">
            <option value="">All types</option>
            {Object.entries(KIND_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select className="field" value={filters.city} onChange={set("city")} aria-label="Location">
            <option value="">Anywhere</option>
            {Object.entries(CITY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select className="field" value={filters.mode} onChange={set("mode")} aria-label="Mode">
            <option value="">Any mode</option>
            {Object.entries(MODE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select className="field" value={filters.maxFee} onChange={set("maxFee")} aria-label="Maximum fee per year">
            <option value="">Any fee</option>
            <option value="0">Free only</option>
            <option value="1000">Up to €1,000/yr</option>
            <option value="5000">Up to €5,000/yr</option>
          </select>
        </div>

        <div className="drawer-list" aria-live="polite">
          {state === "loading" && <p className="muted">Loading courses…</p>}
          {state === "error" && <p className="form-error">Could not load the catalogue. Try again.</p>}
          {state === "ready" && !courses.length && <p className="muted">No course matches these filters.</p>}
          {state === "ready" &&
            courses.map((c) => {
              const onPath = onPathIds.includes(c.id);
              const comparing = compareIds.includes(c.id);
              return (
                <article key={c.id} className="pick-row">
                  <div className="pick-main">
                    <h3 className="pick-title">{c.title}</h3>
                    <p className="pick-meta">
                      {c.provider} · {c.award} (NFQ {c.nfqLevel})
                    </p>
                    <p className="pick-meta">
                      {placeLabel(c)} · {MODE_LABELS[c.mode]} · {formatDuration(c.durationMonths)} · {formatEur(c.feeEur)}
                      {c.feeEur ? "/yr" : ""}
                    </p>
                  </div>
                  <div className="pick-actions">
                    <button
                      type="button"
                      className={`btn btn--ghost btn--sm${comparing ? " btn--on" : ""}`}
                      aria-pressed={comparing}
                      onClick={() => onToggleCompare(c)}
                    >
                      {comparing ? "Comparing" : "Compare"}
                    </button>
                    <button type="button" className="btn btn--primary btn--sm" disabled={onPath} onClick={() => onPick(c.id)}>
                      {onPath ? "On your path" : pickLabel}
                    </button>
                  </div>
                </article>
              );
            })}
        </div>
      </aside>
    </div>
  );
}
