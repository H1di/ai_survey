// Values insertion — the pure half. Replays demo-profile.tournamentTrace (the
// real Ford–Johnson answers) and lays the six values out in three zones:
//
//   pool    — not compared yet
//   pending — the current A/B pair (the cards)
//   column  — every other compared value, in an order consistent with the
//             trace's partialOrder (transitively closed [better, worse] pairs)
//
// A column row carries a rank only once that value's relation to all five
// others is known, and `linkBelow` says whether its order against the next row
// is decided or still provisional. Nothing here keeps state: layoutAt(k) and
// frameAt(T) are functions of their inputs.
import { stageAt } from "../kit/timeline";

export const STEP_DUR = 1.3;
export const MAX_CHOICES = 10;

// Within one choice stage: the pair is read, the winner is marked, then the
// layout switches and the cards glide (420 ms) into their slots — settled
// before the stage ends, so a stage boundary shows the answer applied.
const MARK_AT = 0.35;
const APPLY_AT = 0.55;

export function buildStages(trace) {
  return [
    ...trace.map((_, i) => ({ id: `choice-${i + 1}`, label: `Choice ${i + 1}`, dur: STEP_DUR })),
    { id: "confirmed", label: "Confirmed order", dur: 1.0 },
  ];
}

// Layout after the first k answers of the trace.
export function layoutAt(trace, items, k) {
  const known = new Set((k > 0 ? trace[k - 1].partialOrder : []).map(([b, w]) => `${b}>${w}`));
  const better = (x, y) => known.has(`${x}>${y}`);
  const next = trace[k];
  const pending = next ? [next.a, next.b] : [];

  // First-touch order of the answered pairs = the tie-break for provisional
  // rows, so a row never jumps unless an answer moves it.
  const touched = [];
  for (const { a, b, winner } of trace.slice(0, k)) {
    for (const key of [winner, winner === a ? b : a]) if (!touched.includes(key)) touched.push(key);
  }
  const pool = items.filter((key) => !touched.includes(key) && !pending.includes(key));

  // Kahn's topological sort over the column members, earliest-touched first.
  const left = touched.filter((key) => !pending.includes(key));
  const order = [];
  while (left.length) {
    const i = left.findIndex((x) => !left.some((y) => better(y, x)));
    order.push(left.splice(i, 1)[0]);
  }

  const column = order.map((key, i) => {
    const comparable = items.filter((o) => o !== key && (better(o, key) || better(key, o)));
    return {
      key,
      rank: comparable.length === items.length - 1 ? 1 + items.filter((o) => better(o, key)).length : null,
      linkBelow: i < order.length - 1 ? better(key, order[i + 1]) : null,
    };
  });

  return { pending: next ? { a: next.a, b: next.b } : null, column, pool };
}

// Frame at clock time T: how many answers are applied, which card is marked.
export function frameAt(T, trace, stages = buildStages(trace)) {
  const { index, progress } = stageAt(T, stages);
  if (index >= trace.length) {
    return { applied: trace.length, chosen: null, choice: trace.length, confirmed: true };
  }
  return {
    applied: progress >= APPLY_AT ? index + 1 : index,
    chosen: progress >= MARK_AT && progress < APPLY_AT ? trace[index].winner : null,
    choice: Math.min((progress >= APPLY_AT ? index + 1 : index) + 1, trace.length),
    confirmed: false,
  };
}
