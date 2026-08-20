import ScreenShell from "../ui/ScreenShell";
import LikertScale from "../ui/LikertScale";
import "./screens.css";

// The canonical IPIP anchors, which is also what the design draws.
// Not exported: nothing outside this file consumes it, and exporting a
// constant alongside a default-exported component breaks fast refresh.
const ACCURACY_ANCHORS = [
  { value: 1, label: "Very inaccurate" },
  { value: 2, label: "Moderately inaccurate" },
  { value: 3, label: "Neither" },
  { value: 4, label: "Moderately accurate" },
  { value: 5, label: "Very accurate" },
];

export default function BigFiveScreen({
  item,
  savedValue,
  index,
  total,
  busy,
  onAnswer,
  onBack,
  canGoBack,
  footer,
}) {
  return (
    <ScreenShell
      eyebrow={`step 2 · big five · item ${index + 1} of ${total}`}
      title="Mini-IPIP-20"
      sub="The fixed public-domain Mini-IPIP-20, rated 1–5, scored to OCEAN 0–100 plus Stability/Plasticity."
      footer={footer}
      headerSlot={
        canGoBack ? (
          <button type="button" className="screen-back" onClick={onBack} disabled={busy}>
            ← Back
          </button>
        ) : null
      }
    >
      <div className="instrument">
        <p className="item-statement item-statement--italic">&quot;{item.text}&quot;</p>
        <LikertScale
          anchors={ACCURACY_ANCHORS}
          value={savedValue}
          onSelect={onAnswer}
          disabled={busy}
        />
      </div>
    </ScreenShell>
  );
}
