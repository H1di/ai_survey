import { useState } from "react";
import LikertScale from "../ui/LikertScale";
import ProgressLine from "../ui/ProgressLine";

const STEP_LABELS = {
  big_five: "Personality",
  riasec: "Interests",
  values: "Work values",
  experience: "Experience",
};

const ACCURACY = [
  { value: 1, label: "Very inaccurate" },
  { value: 2, label: "Moderately inaccurate" },
  { value: 3, label: "Neither accurate nor inaccurate" },
  { value: 4, label: "Moderately accurate" },
  { value: 5, label: "Very accurate" },
];

const ENJOYMENT = [
  { value: 1, label: "Strongly dislike" },
  { value: 2, label: "Dislike" },
  { value: 3, label: "Unsure" },
  { value: 4, label: "Like" },
  { value: 5, label: "Strongly like" },
];

const MIN_EXPERIENCE = 3;

// The paid psychological tests: Mini-IPIP (20), RIASEC (12), the work-values
// tournament (≤10 pairs) and experience (7 questions, at least 3 answered).
// Scoring happens on the server by fixed rules.
export default function TestsScreen({ tests, busy, error, onBigFive, onRiasec, onValues, onExperience, onBack }) {
  const stepIndex = ["big_five", "riasec", "values", "experience"].indexOf(tests.step);
  return (
    <section className="tests">
      <header className="tests-head">
        <button type="button" className="link-btn" onClick={onBack}>
          ← Back to my path
        </button>
        <ol className="test-rail" aria-label="Tests">
          {Object.entries(STEP_LABELS).map(([id, label], i) => (
            <li key={id} className={i === stepIndex ? "on" : i < stepIndex ? "done" : ""}>
              {label}
            </li>
          ))}
        </ol>
      </header>
      {tests.step === "big_five" && (
        <LikertItems key="big_five" items={tests.items} answers={tests.answers} anchors={ACCURACY} ends={{ low: "Not me", high: "Me" }} busy={busy} onAnswer={onBigFive} prompt="How well does this describe you?" />
      )}
      {tests.step === "riasec" && (
        <LikertItems key="riasec" items={tests.items} answers={tests.answers} anchors={ENJOYMENT} ends={{ low: "Dislike", high: "Like" }} busy={busy} onAnswer={onRiasec} prompt="How much would you enjoy this?" />
      )}
      {tests.step === "values" && tests.comparison && <ValuesPair tests={tests} busy={busy} onPick={onValues} />}
      {tests.step === "experience" && <ExperienceForm questions={tests.questions} busy={busy} onSubmit={onExperience} />}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function LikertItems({ items, answers, anchors, ends, busy, onAnswer, prompt }) {
  const index = Math.max(0, items.findIndex((i) => answers[i.id] === undefined));
  const item = items[index];
  if (!item) return null;
  return (
    <div className="test-item">
      <ProgressLine current={index + 1} total={items.length} />
      <p className="eyebrow">{prompt}</p>
      <p className="item-statement">{item.text}</p>
      <LikertScale anchors={anchors} ends={ends} label={item.text} itemKey={item.id} value={answers[item.id] ?? null} disabled={busy} onSelect={(v) => onAnswer(item.id, v)} />
    </div>
  );
}

function ValuesPair({ tests, busy, onPick }) {
  const { comparison } = tests;
  return (
    <div className="test-item">
      <ProgressLine current={tests.decided + 1} total={tests.maxComparisons} label={`Choice ${tests.decided + 1} of at most ${tests.maxComparisons}`} />
      <p className="eyebrow">In your future work, which matters more?</p>
      <div className="pair">
        {[
          [comparison.a, comparison.aLabel],
          [comparison.b, comparison.bLabel],
        ].map(([id, label]) => (
          <button key={id} type="button" className="pair-btn" disabled={busy} onClick={() => onPick(comparison.comparisonId, id)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ExperienceForm({ questions, busy, onSubmit }) {
  const [answers, setAnswers] = useState({});
  const filled = Object.values(answers).filter((v) => v && v.trim()).length;
  return (
    <form
      className="test-item about"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(answers);
      }}
    >
      <p className="eyebrow">Your experience · answer at least {MIN_EXPERIENCE}</p>
      {questions.map((q) => (
        <label key={q.id} className="about-q">
          <span className="about-q-title">{q.question}</span>
          <textarea className="field" rows={2} maxLength={400} placeholder={q.placeholder} value={answers[q.id] || ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
        </label>
      ))}
      <div className="about-actions">
        <button type="submit" className="btn btn--primary" disabled={busy || filled < MIN_EXPERIENCE}>
          {filled < MIN_EXPERIENCE ? `${MIN_EXPERIENCE - filled} more to go` : "Finish the tests"}
        </button>
      </div>
    </form>
  );
}
