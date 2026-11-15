// The shipped scene: plays once when the interest result is first shown.
// Reduced motion paints the settled frame — every spoke, the point, the code.
import { useMemo, useRef } from "react";
import { usePlayOnce } from "../usePlayOnce";
import SettleScene from "./SettleScene";
import { DURATION, buildProfile, frameAt } from "./settleEngine";

export default function RiasecSettle({ scores, code, reducedMotion }) {
  const ref = useRef(null);
  const profile = useMemo(() => buildProfile(scores, code), [scores, code]);
  const { T } = usePlayOnce(DURATION, { targetRef: ref, reducedMotion });
  const frame = useMemo(() => frameAt(T, profile), [T, profile]);
  return (
    <div ref={ref} className="rset-host">
      <SettleScene profile={profile} frame={frame} />
    </div>
  );
}
