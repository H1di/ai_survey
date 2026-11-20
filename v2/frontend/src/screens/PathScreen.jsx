import { useState } from "react";
import Roadmap from "./Roadmap";
import CoursePicker from "./CoursePicker";
import CompareTable from "./CompareTable";
import AddonsPanel from "./AddonsPanel";
import GuidancePanel from "./GuidancePanel";
import AboutYouScreen from "./AboutYouScreen";
import { formatDuration, formatEur, rebuildState, toggleCompare, CITY_LABELS } from "../pathView";

// 4 · You manage it — the roadmap plus every free control (add, swap, move,
// remove, compare, rebuild, undo, edit answers) and, below, the add-ons.
export default function PathScreen({ snapshot, meta, busy, error, actions }) {
  const [picker, setPicker] = useState(null); // {mode: "add"} | {mode: "swap", step}
  const [compare, setCompare] = useState([]);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);

  const { path, rebuilds, tests, guidance, entitlements } = snapshot;
  const onPathIds = path.steps.map((s) => s.courseId);
  const fieldOptions = meta.personalQuestions.find((q) => q.id === "field").options.filter((o) => o.value !== "unsure");
  const rebuild = rebuildState(rebuilds);

  const toggle = (course) =>
    setCompare((list) => {
      const ids = toggleCompare(list.map((c) => c.id), course.id);
      const pool = new Map([...list, course].map((c) => [c.id, c]));
      return ids.map((id) => pool.get(id));
    });

  const pick = async (courseId) => {
    const ok =
      picker.mode === "swap"
        ? await actions.swap(picker.step.id, courseId)
        : await actions.add(courseId);
    if (ok) setPicker(null);
  };

  const courseById = (id) => guidance?.courses?.[id] || path.steps.find((s) => s.courseId === id)?.course || null;

  if (editing) {
    return (
      <section className="page">
        <h1 className="page-title">Your answers</h1>
        <p className="page-sub">Change any answer. Your path stays as it is until you rebuild it.</p>
        <AboutYouScreen
          questions={meta.personalQuestions}
          initial={snapshot.profile}
          digitalAgeOfConsent={meta.digitalAgeOfConsent}
          mode="edit"
          busy={busy}
          error={error}
          onCancel={() => setEditing(false)}
          onSubmit={async (answers, consent) => {
            if (await actions.updateProfile(answers, consent)) setEditing(false);
          }}
        />
      </section>
    );
  }

  return (
    <section className="page">
      <p className="case-pill">{snapshot.case.label}</p>
      <h1 className="page-title">Your roadmap</h1>
      {path.summary && <p className="page-sub">{path.summary}</p>}
      <p className="totals">
        <span>{formatDuration(path.totals.months)}</span>
        <span>{formatEur(path.totals.fees)} in fees</span>
        <span>{path.totals.cities.length ? path.totals.cities.map((c) => CITY_LABELS[c] || c).join(", ") : "Online"}</span>
        <span className="muted">{path.source === "ai" ? "built by AI from the catalogue" : path.source === "rules" ? "built by fixed rules from the catalogue" : path.edited ? "edited by you" : ""}</span>
      </p>

      {snapshot.profileChanged && (
        <div className="banner" role="status">
          Your answers changed since this path was built.
          <button type="button" className="btn btn--primary btn--sm" disabled={busy || rebuild.disabled} onClick={() => actions.rebuild("")}>
            Rebuild for my new answers
          </button>
        </div>
      )}

      <Roadmap
        steps={path.steps}
        goal={snapshot.profile.goal}
        busy={busy}
        compareIds={compare.map((c) => c.id)}
        onSwap={(step) => setPicker({ mode: "swap", step })}
        onMove={(step, dir) => actions.move(step.id, dir)}
        onRemove={(step) => actions.remove(step.id)}
        onToggleCompare={toggle}
      />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="controls">
        <div className="control-group">
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setPicker({ mode: "add" })}>
            Add a course
          </button>
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setEditing(true)}>
            Edit my answers
          </button>
          {snapshot.previousPaths > 0 && (
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={actions.restore}>
              Undo last rebuild
            </button>
          )}
        </div>
        <form
          className="rebuild"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await actions.rebuild(note)) setNote("");
          }}
        >
          <label className="rebuild-label" htmlFor="rebuild-note">
            Ask the AI for a different path
          </label>
          <input
            id="rebuild-note"
            className="field"
            maxLength={200}
            placeholder="Optional: e.g. cheaper, closer to Cork, more hands-on"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="rebuild-row">
            <button type="submit" className="btn btn--primary" disabled={busy || rebuild.disabled}>
              {busy ? "Working…" : rebuild.label}
            </button>
            <span className="muted">{rebuild.hint}</span>
          </div>
        </form>
      </div>

      <CompareTable courses={compare} onRemove={(id) => setCompare((l) => l.filter((c) => c.id !== id))} onClear={() => setCompare([])} />

      {entitlements.tests && (
        <section className="tests-cta">
          {!tests || tests.step !== "done" ? (
            <>
              <h2 className="section-title">Your tests</h2>
              <p className="section-sub">About 10 minutes: personality, interests, work values and experience.</p>
              <button type="button" className="btn btn--primary" disabled={busy} onClick={actions.openTests}>
                {tests ? "Continue the tests" : "Start the tests"}
              </button>
            </>
          ) : !guidance ? (
            <>
              <h2 className="section-title">Tests done</h2>
              <p className="section-sub">See why this path fits, where it leads, and two or three ways to get there.</p>
              <button type="button" className="btn btn--primary" disabled={busy} onClick={actions.generateGuidance}>
                {busy ? "Preparing…" : "Show my guidance"}
              </button>
            </>
          ) : null}
        </section>
      )}

      {guidance && (
        <GuidancePanel guidance={guidance} courseById={courseById} busy={busy} onPathIds={onPathIds} onApplyScenario={actions.applyScenario} onAddCourse={actions.add} />
      )}

      <AddonsPanel addons={snapshot.addons} mockPayments={meta.mockPayments} busy={busy} onUnlock={actions.unlock} />

      {picker && (
        <CoursePicker
          title={picker.mode === "swap" ? `Swap “${picker.step.course.title}”` : "Add a course"}
          fields={fieldOptions}
          initialField={snapshot.profile.field !== "unsure" ? snapshot.profile.field : ""}
          onPathIds={onPathIds}
          compareIds={compare.map((c) => c.id)}
          pickLabel={picker.mode === "swap" ? "Use for this step" : "Add to path"}
          onPick={pick}
          onToggleCompare={toggle}
          onClose={() => setPicker(null)}
        />
      )}
    </section>
  );
}
