import ScreenShell from "../ui/ScreenShell";
import LikertScale from "../ui/LikertScale";
import MindGraph from "../motion/mind/MindGraph";
import "./screens.css";

// The canonical IPIP anchors: each ring's accessible name, and the caption
// shown under the scale for the ring in hand. The ends on screen keep the
// instrument's accuracy wording (the design drew "disagree … agree", but
// Mini-IPIP is validated as an accuracy rating, not an agreement one).
// Not exported: nothing outside this file consumes it, and exporting a
// constant alongside a default-exported component breaks fast refresh.
const ACCURACY_ANCHORS = [
  { value: 1, label: "Very inaccurate" },
  { value: 2, label: "Moderately inaccurate" },
  { value: 3, label: "Neither" },
  { value: 4, label: "Moderately accurate" },
  { value: 5, label: "Very accurate" },
];
const ACCURACY_ENDS = { low: "inaccurate", high: "accurate" };

// One Mini-IPIP-20 item, as the assessment design draws it: the header row,
// the statement alone in the middle of the page, the scale under it. The
// instrument's question is the scale's group name, so it is still announced.
export default function BigFiveScreen({
  item,
  savedValue,
  index,
  total,
  busy,
  onAnswer,
  onBack,
  canGoBack,
  reducedMotion,
}) {
  return (
    <ScreenShell
      question
      progress={{ current: index + 1, total }}
      backdrop={<MindGraph seed="big_five" total={total} answered={index} reducedMotion={reducedMotion} />}
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
          <h2 className="item-statement">{item.text}</h2>
        </div>
        <LikertScale
          itemKey={item.id}
          anchors={ACCURACY_ANCHORS}
          ends={ACCURACY_ENDS}
          label="How accurately does this describe you?"
          value={savedValue}
          onSelect={onAnswer}
          disabled={busy}
        />
      </div>
    </ScreenShell>
  );
}
