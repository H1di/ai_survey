import "./ui.css";

// Two halves of one decision, bounded by hairlines and split by a ruled
// divider carrying a small label. Used by the values tournament and the
// experience step.
export default function SplitChoice({ a, b, onChoose, disabled = false, divider = "or" }) {
  return (
    <div className="split">
      <button
        type="button"
        className="split-half"
        onClick={() => onChoose(a.key)}
        disabled={disabled}
      >
        <span className="split-title">{a.title}</span>
        <span className="split-body">{a.body}</span>
      </button>

      <div className="split-rule">
        <span className="split-rule-label">{divider}</span>
      </div>

      <button
        type="button"
        className="split-half"
        onClick={() => onChoose(b.key)}
        disabled={disabled}
      >
        <span className="split-title">{b.title}</span>
        <span className="split-body">{b.body}</span>
      </button>
    </div>
  );
}
