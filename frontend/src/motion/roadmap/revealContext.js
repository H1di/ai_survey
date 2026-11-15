import { createContext, useContext } from "react";
import { stepFrame } from "./roadmapTimeline";

// { T, timeline } or null. Exported so a scrubbable clock (the demo) can
// provide its own T.
export const RevealContext = createContext(null);

// Eased { edge, node, label } progress for step `index`, or null when the
// element is not part of a running reveal (then it renders in its final state).
export function useStepReveal(index) {
  const reveal = useContext(RevealContext);
  if (!reveal || index === undefined || index === null || !reveal.timeline[index]) return null;
  return stepFrame(reveal.T, reveal.timeline[index]);
}
