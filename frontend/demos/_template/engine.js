// Template engine — the pure half of a scene. The frame is a function of
// (T, data) only: no accumulation, no canvas, no DOM. Copy this file's shape.
import { easeOutCubic, lerp, stageProgress } from "../kit/timeline";
import { projectRiasec } from "../kit/riasecPlane";

export const STAGES = [
  { id: "frame", label: "Six interest types", dur: 2.4 },
  { id: "place", label: "Where this profile sits", dur: 2.6 },
];

export function frameAt(T, riasecScores) {
  const frame = easeOutCubic(stageProgress(T, STAGES, "frame"));
  const place = easeOutCubic(stageProgress(T, STAGES, "place"));
  const target = projectRiasec(riasecScores);
  return {
    outline: frame, // 0..1 of the hexagon perimeter drawn
    labelAlpha: frame,
    point: { x: lerp(0, target.x, place), y: lerp(0, target.y, place) },
    pointAlpha: Math.min(1, place * 4),
  };
}
