import ScreenShell from "../ui/ScreenShell";
import SplitChoice from "../ui/SplitChoice";
import { WORK_VALUE_META } from "../lifePath";
import "./screens.css";

function half(key) {
  const meta = WORK_VALUE_META[key] || { label: key, blurb: "" };
  return { key, title: meta.label, body: meta.blurb };
}

export default function ValuesTournamentScreen({ comparison, progress, busy, onChoose }) {
  const eyebrow = progress
    ? `step 4 · values tournament · comparison ${progress.answered + 1} of ${progress.total}`
    : "step 4 · values tournament";

  return (
    <ScreenShell eyebrow={eyebrow} title="Which matters more?" glow="none" className="screen--tournament">
      <SplitChoice
        a={half(comparison.a)}
        b={half(comparison.b)}
        onChoose={onChoose}
        disabled={busy}
      />
      <p className="screen-footnote">
        An adaptive Ford–Johnson merge-insertion tournament, ≤10 comparisons, ranking the six
        Minnesota work values: Achievement, Independence, Recognition, Relationships, Support,
        Working Conditions.
      </p>
    </ScreenShell>
  );
}
