import { useState } from "react";
import ScreenShell from "../ui/ScreenShell";
import InsertionBoard from "../motion/insertion/InsertionBoard";
import { layoutFrom } from "../motion/insertion/insertionModel";
import { useReducedMotion } from "../motion/usePlayOnce";
import { WORK_VALUE_ORDER } from "../lifePath";
import "./screens.css";

const MAX_CHOICES = 10;

// The A/B question, with the order the answers so far imply building beside
// it: each choice slots a value into the list, which is why ten are enough.
// `decided` is the tournament's own record from the snapshot ([{ a, b, winner }]).
export default function ValuesTournamentScreen({
  comparison,
  decided = null,
  progress,
  busy,
  onChoose,
  footer,
  reducedMotion,
}) {
  const rm = useReducedMotion(reducedMotion);
  // Which card was pressed for THIS comparison — shown while the answer is in
  // flight. Keyed by comparisonId: the next pair often reuses one of the values.
  const [picked, setPicked] = useState(null);
  const chosen = busy && picked?.id === comparison.comparisonId ? picked.key : null;

  const answers = decided || [];
  const layout = layoutFrom({ decided: answers, pending: comparison, items: WORK_VALUE_ORDER });
  const eyebrow = progress
    ? `step 4 · values tournament · comparison ${progress.answered + 1} of ${progress.total}`
    : "step 4 · values tournament";

  return (
    <ScreenShell
      eyebrow={eyebrow}
      title="Which matters more?"
      glow="none"
      className="screen--tournament"
      footer={footer}
    >
      <div className="vins vins--live">
        <InsertionBoard
          layout={layout}
          applied={answers.length}
          chosen={chosen}
          reducedMotion={rm}
          maxChoices={progress?.total || MAX_CHOICES}
          disabled={busy}
          onChoose={(key) => {
            setPicked({ id: comparison.comparisonId, key });
            onChoose(key);
          }}
        />
      </div>
      <p className="screen-footnote">
        An adaptive Ford–Johnson merge-insertion tournament, ≤10 comparisons, ranking the six
        Minnesota work values: Achievement, Independence, Recognition, Relationships, Support,
        Working Conditions.
      </p>
    </ScreenShell>
  );
}
