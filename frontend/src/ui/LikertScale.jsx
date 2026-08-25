import "./ui.css";

// Five ringed options under a hairline. Picking one is the answer — there is
// no separate Continue, because twelve or twenty items make that a click tax.
export default function LikertScale({ anchors, value = null, onSelect, disabled = false }) {
  return (
    <div className="likert">
      {anchors.map((anchor) => (
        <button
          key={anchor.value}
          type="button"
          className={`likert-option ${value === anchor.value ? "likert-option--on" : ""}`}
          aria-pressed={value === anchor.value}
          disabled={disabled}
          onClick={() => onSelect(anchor.value)}
        >
          <span className="likert-ring" aria-hidden="true" />
          <span className="likert-label">{anchor.label}</span>
        </button>
      ))}
    </div>
  );
}
