// The shipped funnel: the selection path behind the first result, played while
// the response is outstanding. The rankable occupations (ESCO × O*NET) → the five field families
// the interest scores point to → the 15 closest profiles (both re-derived here
// from the same data and rules as the backend) → the pick, which only the
// response knows. Until it arrives the scene holds on the shortlist and
// breathes; it never shows a pick it does not have.
import { useEffect, useMemo, useRef, useState } from "react";
import { totalDuration } from "../timeline";
import { groundingFor } from "../onetField";
import { usePlayOnce } from "../usePlayOnce";
import FunnelCanvas from "./FunnelCanvas";
import { HOLD_AT, buildModel, captionAt, frameAt, stagesFor, withPick } from "./funnelEngine";
import "./funnel.css";

function funnelAria({ count, riasecCode, families, pick }) {
  const head = `${count} occupations (ESCO × O*NET) placed on the RIASEC hexagon, narrowed to five field families that match ${
    riasecCode ? `the ${riasecCode} interest profile` : "your interests"
  } (${families.join(", ")}), then to the 15 occupations with the closest interest profiles.`;
  return pick ? `${head} The pick is ${pick.title}.` : `${head} The pick is being made.`;
}

// `grounding` is { topDirections, shortlist }; omitted, it is derived from the
// field and the scores. `pick` is { soc, title } once the response is in.
export default function OccupationFunnel({
  field,
  riasecScores,
  riasecCode,
  grounding,
  pick = null,
  reducedMotion,
  onDone,
}) {
  const wrapRef = useRef(null);
  const ground = useMemo(
    () => grounding ?? groundingFor(field, riasecScores),
    [grounding, field, riasecScores]
  );
  const base = useMemo(
    () => buildModel(field.occupations, { riasecScores, ...ground }),
    [field, riasecScores, ground]
  );
  const model = useMemo(() => (pick ? withPick(base, pick) : base), [base, pick]);

  // Clock time at which the pick landed. Set while rendering so the frame that
  // first sees the pick already knows where the hold ends.
  const [arrivedAt, setArrivedAt] = useState(null);
  const holdUntil = pick && arrivedAt !== null ? Math.max(HOLD_AT, arrivedAt) : null;
  const duration = holdUntil === null ? Infinity : totalDuration(stagesFor(holdUntil));
  const clock = usePlayOnce(duration, { targetRef: wrapRef, reducedMotion });
  if (pick && arrivedAt === null) setArrivedAt(clock.T);

  // Reduced motion: the finished shortlist while waiting, the finished scene
  // once the pick is in — two static frames, no clock.
  const T = clock.reducedMotion ? (pick ? totalDuration(stagesFor(HOLD_AT)) : HOLD_AT) : clock.T;
  const hold = clock.reducedMotion ? HOLD_AT : holdUntil;
  const frame = useMemo(() => frameAt(T, model, hold), [T, model, hold]);
  const count = field.occupations.length;
  const caption =
    clock.reducedMotion && !pick ? captionAt(HOLD_AT + 1, null, count) : captionAt(T, hold, count);

  // A pick the map cannot place has no last act to play: finish at once.
  const placed = model.chosen >= 0;
  const done = Boolean(pick) && (clock.reducedMotion || clock.done || !placed);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });
  useEffect(() => {
    if (done) doneRef.current?.();
  }, [done]);

  return (
    <div className="funnel-wrap" ref={wrapRef}>
      <FunnelCanvas
        frame={frame}
        ariaLabel={funnelAria({
          count,
          riasecCode,
          families: ground.topDirections.map((d) => d.label),
          pick,
        })}
      />
      <p className="funnel-caption" aria-live="polite">
        {caption}
      </p>
    </div>
  );
}
