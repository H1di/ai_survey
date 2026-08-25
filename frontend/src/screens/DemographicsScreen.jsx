import ScreenShell from "../ui/ScreenShell";
import { demographicsComplete } from "../lifePath";
import "./screens.css";

// Radios are real radios: one native input per option, hidden behind the
// ring so keyboard and screen-reader users get the grouping for free.
function ChoiceField({ question, value, onChange, busy }) {
  return (
    <div className="demo-choices" role="group" aria-label={question.question}>
      {question.options.map((option) => (
        <label key={option.value} className="demo-choice">
          <input
            type="radio"
            name={question.id}
            value={option.value}
            checked={value === option.value}
            disabled={busy}
            onChange={() => onChange(question.id, option.value)}
          />
          <span className="demo-choice-ring" aria-hidden="true" />
          <span className="demo-choice-label">{option.label}</span>
        </label>
      ))}
    </div>
  );
}

export default function DemographicsScreen({
  questions,
  drafts,
  onDraftChange,
  busy,
  onSubmit,
  footer,
}) {
  const ready = demographicsComplete(questions, drafts) && !busy;

  return (
    <ScreenShell
      eyebrow="step 1 · demographics"
      title="A little about you"
      sub="Four quick questions — sex, age, country, city."
      footer={footer}
    >
      <div className="demo-grid">
        {questions.map((question) => (
          <div className="demo-field" key={question.id}>
            <div className="demo-question">{question.question}</div>
            {question.kind === "single" ? (
              <ChoiceField
                question={question}
                value={drafts[question.id] ?? null}
                onChange={onDraftChange}
                busy={busy}
              />
            ) : (
              <input
                className="demo-input"
                type={question.kind === "number" ? "number" : "text"}
                min={question.min}
                max={question.max}
                placeholder={question.placeholder}
                value={drafts[question.id] ?? ""}
                disabled={busy}
                onChange={(event) => onDraftChange(question.id, event.target.value)}
              />
            )}
          </div>
        ))}
      </div>

      <button type="button" className="btn btn--gold demo-submit" onClick={onSubmit} disabled={!ready}>
        {busy ? "Saving…" : "Continue"}
      </button>
    </ScreenShell>
  );
}
