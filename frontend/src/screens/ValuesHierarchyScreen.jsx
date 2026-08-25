import ScreenShell from "../ui/ScreenShell";
import RankList from "../ui/RankList";
import { WORK_VALUE_META } from "../lifePath";
import "./screens.css";

export default function ValuesHierarchyScreen({ ranking, onReorder, busy, onConfirm, footer }) {
  const items = ranking.map((id) => ({ id, label: WORK_VALUE_META[id]?.label || id }));

  return (
    <ScreenShell
      eyebrow="step 4b · confirm your hierarchy"
      title="Your work values, ranked"
      sub="The tournament result — reorder if something looks off, then confirm."
      footer={footer}
    >
      <RankList items={items} onReorder={onReorder} disabled={busy} />
      <button type="button" className="btn btn--gold rank-confirm" onClick={onConfirm} disabled={busy}>
        {busy ? "Saving…" : "Confirm hierarchy"}
      </button>
    </ScreenShell>
  );
}
