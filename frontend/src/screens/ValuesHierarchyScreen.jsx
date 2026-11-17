import ScreenShell from "../ui/ScreenShell";
import RankList from "../ui/RankList";
import { WORK_VALUE_META } from "../lifePath";
import "./screens.css";

const ALL_PAIRS = 15; // six values, taken two at a time

// `answersCount` is how many comparisons produced this order (0 when unknown —
// a rail revisit, where the tournament record is gone).
export default function ValuesHierarchyScreen({
  ranking,
  onReorder,
  busy,
  onConfirm,
  footer,
  answersCount = 0,
}) {
  const items = ranking.map((id) => ({ id, label: WORK_VALUE_META[id]?.label || id }));

  return (
    <ScreenShell
      eyebrow="step 4b · confirm your hierarchy"
      title="We assume these are your values"
      sub="The tournament result — reorder if something looks off, then confirm."
      footer={footer}
    >
      {answersCount > 0 && answersCount < ALL_PAIRS && (
        <p className="rank-provenance">
          {answersCount} answers placed all six · the other {ALL_PAIRS - answersCount} of {ALL_PAIRS}{" "}
          possible pairs followed from them
        </p>
      )}
      <RankList items={items} onReorder={onReorder} disabled={busy} />
      <button type="button" className="btn btn--primary rank-confirm" onClick={onConfirm} disabled={busy}>
        {busy ? "Saving…" : "Confirm hierarchy"}
      </button>
    </ScreenShell>
  );
}
