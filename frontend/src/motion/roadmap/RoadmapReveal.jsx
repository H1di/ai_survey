// The roadmap's reveal clock. The plan is a sequence you walk: the path line
// draws into each stage, then its marker comes in, then its pill — in the
// order and timing roadmapTimeline.js defines. The roadmap path node reads
// its frame through context, so a tick re-renders only it: React Flow never
// re-lays-out and the camera fits once.
//
// Reduced motion (and no provider at all): everything is simply there.
import { useMemo } from "react";
import { usePlayOnce } from "../usePlayOnce";
import { RevealContext } from "./revealContext";
import { buildTimeline, timelineDuration } from "./roadmapTimeline";

// Plays once per `revealKey` (the accepted output's id).
export function RoadmapReveal({ stepCount = 0, revealKey, reducedMotion, children }) {
  const timeline = useMemo(() => buildTimeline(stepCount), [stepCount]);
  const { T } = usePlayOnce(timelineDuration(timeline), { restartKey: revealKey, reducedMotion });
  const value = useMemo(() => (stepCount ? { T, timeline } : null), [T, timeline, stepCount]);
  return <RevealContext.Provider value={value}>{children}</RevealContext.Provider>;
}
