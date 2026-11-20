import { useState } from "react";
import { formToAnswers, missingAnswers, profileToForm } from "../pathView";

// 1 · About you — the personal questions, all on one page. Also used to edit
// the answers later ("the user sets the variables"), with `mode="edit"`.
export default function AboutYouScreen({
  questions,
  initial = null,
  digitalAgeOfConsent = 16,
  mode = "start",
  busy = false,
  error = "",
  onSubmit,
  onCancel,
}) {
  const [form, setForm] = useState(() => profileToForm(initial));
  const [consent, setConsent] = useState(false);
  const [triedSubmit, setTriedSubmit] = useState(false);

  const missing = missingAnswers(questions, form);
  const age = Number(form.age);
  const needsConsent = Number.isFinite(age) && form.age !== "" && age < digitalAgeOfConsent;
  const set = (id, value) => setForm((f) => ({ ...f, [id]: value }));

  const submit = (event) => {
    event.preventDefault();
    setTriedSubmit(true);
    if (missing.length || (needsConsent && !consent)) return;
    onSubmit(formToAnswers(form), needsConsent ? consent : false);
  };

  return (
    <form className="about" onSubmit={submit} noValidate>
      {questions.map((q) => {
        const showMissing = triedSubmit && missing.includes(q.id);
        return (
          <fieldset key={q.id} className={`about-q${showMissing ? " about-q--missing" : ""}`}>
            <legend className="about-q-title">{q.question}</legend>
            {q.kind === "single" && (
              <div className="chips" role="radiogroup" aria-label={q.question}>
                {q.options.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={form[q.id] === o.value}
                    className={`chip${form[q.id] === o.value ? " chip--on" : ""}`}
                    onClick={() => set(q.id, o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            {q.kind === "number" && (
              <input
                className="field field--short"
                type="number"
                inputMode="numeric"
                min={q.min}
                max={q.max}
                aria-label={q.question}
                value={form[q.id] ?? ""}
                onChange={(e) => set(q.id, e.target.value)}
              />
            )}
            {q.kind === "text" && (
              <textarea
                className="field"
                rows={2}
                maxLength={q.maxLength}
                placeholder={q.placeholder}
                aria-label={q.question}
                value={form[q.id] ?? ""}
                onChange={(e) => set(q.id, e.target.value)}
              />
            )}
            {showMissing && <p className="about-q-hint">Please answer this one.</p>}
          </fieldset>
        );
      })}

      {needsConsent && (
        <label className="consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            I'm under {digitalAgeOfConsent}, and a parent or guardian agrees to Invector saving these answers to
            build my path.
          </span>
        </label>
      )}
      {triedSubmit && needsConsent && !consent && (
        <p className="form-error">Under {digitalAgeOfConsent}, a parent or guardian needs to agree first.</p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="about-actions">
        {onCancel && (
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? "Saving…" : mode === "edit" ? "Save answers" : "Build my free path"}
        </button>
      </div>
    </form>
  );
}
