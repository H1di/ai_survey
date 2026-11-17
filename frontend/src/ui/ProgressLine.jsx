import "./ProgressLine.css";

// Where you are inside a step: "Question 8 of 20". `variant="answered"` is for
// a step whose questions are all on one page — it counts answers instead
// ("2 of 4 answered") and the dot sits at the answered share. A one-at-a-time
// step puts the dot in the middle of the current question's stretch, so the
// first question is not drawn at zero and the last not at the end.
export default function ProgressLine({ current, total, variant = "question", label }) {
  const n = Math.max(0, total || 0);
  const c = Math.min(n, Math.max(0, current || 0));
  const answeredMode = variant === "answered";
  const fraction = n ? (answeredMode ? c / n : (c - 0.5) / n) : 0;
  const pct = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
  const text = label ?? (answeredMode ? `${c} of ${n} answered` : `Question ${c} of ${n}`);

  return (
    <div
      className="progress-line"
      role="progressbar"
      aria-label="Step progress"
      aria-valuemin={answeredMode ? 0 : 1}
      aria-valuemax={n}
      aria-valuenow={c}
      aria-valuetext={text}
    >
      <div className="progress-line-track">
        <span className="progress-line-fill" style={{ width: pct }} />
        <span className="progress-line-dot" style={{ left: pct }} />
      </div>
      <span className="progress-line-label">{text}</span>
    </div>
  );
}
