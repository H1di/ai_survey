import ScreenShell from "../ui/ScreenShell";
import LikertScale from "../ui/LikertScale";
import MindGraph from "../motion/mind/MindGraph";
import "./screens.css";

// Each ring's accessible name and caption; the ends on screen are the scale's
// honest extremes, "not at all … very much".
// Not exported: a constant next to a default-exported component breaks fast refresh.
const ENJOYMENT_ANCHORS = [
  { value: 1, label: "Not at all" },
  { value: 2, label: "Not really" },
  { value: 3, label: "Maybe" },
  { value: 4, label: "Quite a bit" },
  { value: 5, label: "Very much" },
];
const ENJOYMENT_ENDS = { low: "not at all", high: "very much" };

// One RIASEC activity, laid out like a Big Five item. The instrument's
// question ("How much would you enjoy this?") is the scale's group name.
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
  reducedMotion,
}) {
  return (
    <ScreenShell
      question
      progress={{ current: index + 1, total }}
      backdrop={<MindGraph seed="riasec" total={total} answered={index} reducedMotion={reducedMotion} />}
      headerSlot={
        canGoBack ? (
          <button type="button" className="screen-back" onClick={onBack} disabled={busy}>
            ← Back
          </button>
        ) : null
      }
    >
      <div className="instrument">
        <div className="instrument-stage">
          <h2 className="item-statement item-statement--sm">{item.text}.</h2>
        </div>
        <LikertScale
          itemKey={item.id}
          anchors={ENJOYMENT_ANCHORS}
          ends={ENJOYMENT_ENDS}
          label="How much would you enjoy this?"
          value={savedValue}
          onSelect={onAnswer}
          disabled={busy}
        />
        {canSkip && (
          <button type="button" className="skip-action" onClick={onSkip} disabled={busy}>
            Skip — infer from personality
          </button>
        )}
      </div>
    </ScreenShell>
  );
}
