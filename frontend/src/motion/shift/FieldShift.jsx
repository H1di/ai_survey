// The shipped refine transition, in two halves around a real request:
//   phase "leaving"  — a "No" is in flight. The current family is ruled out,
//                      the camera pulls back to the whole hexagon, and the
//                      scene holds there, breathing, for as long as the
//                      response takes. It shows no next pick: there is none.
//   phase "arriving" — the new output is in. The camera flies to its family
//                      and the pick lands (for a first output: it just lands).
// Reduced motion: "leaving" is the still ruled-out overview; "arriving" is
// skipped (onDone fires at once and the caller shows the settled map).
import { useEffect, useMemo, useRef } from "react";
import { usePlayOnce } from "../usePlayOnce";
import ShiftCanvas from "./ShiftCanvas";
import { ARRIVE, FIRST_DUR, LEAVE, buildModel, frameAt, holdAt, parseCubicBezier, roundStart } from "./shiftEngine";
import "./shift.css";

function readEase() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--ease-out");
  return parseCubicBezier(raw);
}

// Outputs (oldest first) → the engine's picks.
function picksFrom(field, outputs) {
  return outputs.map((o) => ({
    soc: o.socCode,
    title: o.jobTitle,
    directionId: o.directionId,
    label: field.directionLabel(o.directionId),
  }));
}

const list = (items) => items.join(", ");

function shiftAria({ families, phase }) {
  const current = families[families.length - 1];
  const before = families.slice(0, -1).map((f) => f.label);
  if (phase === "leaving") {
    return `Occupations on the RIASEC hexagon, grouped into field families. ${list(
      families.map((f) => f.label)
    )} ruled out; the remaining families are being weighed for the next pick.`;
  }
  const ruled = before.length ? ` ${list(before)} ruled out.` : "";
  return `Occupations on the RIASEC hexagon, grouped into field families.${ruled} The pick, ${current.pick.title}, comes from ${current.label}.`;
}

export default function FieldShift({ field, riasecScores, outputs, phase, reducedMotion, onDone }) {
  const boxRef = useRef(null);
  const ease = useMemo(() => readEase(), []);
  const model = useMemo(
    () =>
      buildModel(
        field.occupations,
        { picks: picksFrom(field, outputs), riasecScores, pending: phase === "leaving" },
        ease ? { ease } : {}
      ),
    [field, outputs, riasecScores, phase, ease]
  );

  const first = outputs.length === 1;
  const leaving = phase === "leaving";
  const duration = leaving ? Infinity : first ? FIRST_DUR : ARRIVE;
  const clock = usePlayOnce(duration, { targetRef: boxRef, reducedMotion });

  const done = !leaving && (clock.reducedMotion || clock.done);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });
  useEffect(() => {
    if (done || !model) doneRef.current?.();
  }, [done, model]);

  const frame = useMemo(() => {
    if (!model) return null;
    const start = leaving ? roundStart(model, model.rounds) : first ? 0 : holdAt(model);
    const local = clock.reducedMotion ? (leaving ? LEAVE : duration) : clock.T;
    return frameAt(start + local, model);
  }, [model, leaving, first, duration, clock.T, clock.reducedMotion]);

  if (!frame) return null;
  return (
    <div className="shift-wrap shift-wrap--fill" ref={boxRef}>
      <ShiftCanvas
        frame={frame}
        stateKey={phase}
        crossfade={false}
        ariaLabel={shiftAria({ families: model.families, phase })}
      />
    </div>
  );
}
