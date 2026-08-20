import ScreenShell from "../ui/ScreenShell";
import LikertScale from "../ui/LikertScale";
import "./screens.css";

// The mockup shows no rating scale for this step, so its enjoyment anchors
// stay as the product already words them.
// Not exported: nothing outside this file consumes it, and exporting a
// constant alongside a default-exported component breaks fast refresh.
const ENJOYMENT_ANCHORS = [
  { value: 1, label: "Not at all" },
  { value: 2, label: "Not really" },
  { value: 3, label: "Maybe" },
  { value: 4, label: "Quite a bit" },
  { value: 5, label: "Very much" },
];

export default function RiasecScreen({
  item,
  savedValue,
  index,
  total,
  busy,
  onAnswer,
  onBack,
  canGoBack,
  onSkip,
  canSkip,
  footer,
}) {
  return (
    <ScreenShell
      eyebrow={`step 3 · riasec interests · item ${index + 1} of ${total}`}
      title="How much would you enjoy this?"
      sub="Twelve fixed activity statements, rated for enjoyment — never job titles — scored to a Holland code. You can skip to infer interests from personality instead."
      footer={footer}
      headerSlot={
        canGoBack ? (
          <button type="button" className="screen-back" onClick={onBack} disabled={busy}>
            ← Back
          </button>
        ) : null
      }
    >
      <div className="instrument instrument--wide">
        <p className="item-statement item-statement--sm">&quot;{item.text}.&quot;</p>
        <LikertScale
          anchors={ENJOYMENT_ANCHORS}
          value={savedValue}
          onSelect={onAnswer}
          disabled={busy}
        />
        {canSkip && (
          <button type="button" className="btn btn--ghost skip-action" onClick={onSkip} disabled={busy}>
            Skip — infer from personality
          </button>
        )}
      </div>
    </ScreenShell>
  );
}
