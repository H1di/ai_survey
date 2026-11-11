// Roadmap-draw timeline — pure. Step i of the roadmap gets one window:
//
//   edgeStart ── edge draws (600 ms) ── edgeEnd = nodeIn ── node fades + rises
//   (220 ms) ── nodeEnd = labelIn ── timeframe label fades (140 ms) ── labelEnd
//
// and the next edge starts at nodeEnd, so edges and nodes never overlap; only
// the small timeframe label fades in while the next edge is already drawing.
// The frame is a function of T only — the painter never accumulates state.
import { clamp } from "../kit/timeline";

export const EDGE_S = 0.6;
export const NODE_S = 0.22;
export const LABEL_S = 0.14;
export const NODE_RISE_PX = 6;

// --ease-out from tokens.css (cubic-bezier(0.22, 1, 0.36, 1)), solved in JS
// because the frame is computed, not left to CSS transitions.
function cubicBezier(x1, y1, x2, y2) {
  const coord = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3;
  const slope = (a, b, t) => 3 * a * (1 - t) ** 2 + 6 * (b - a) * t * (1 - t) + 3 * (1 - b) * t ** 2;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const d = slope(x1, x2, t);
      if (Math.abs(d) < 1e-6) break;
      t = clamp(t - (coord(x1, x2, t) - x) / d);
    }
    return coord(y1, y2, t);
  };
}
export const easeOut = cubicBezier(0.22, 1, 0.36, 1);

// Step i → { edgeStart, edgeEnd, nodeIn, nodeEnd, labelIn, labelEnd } in seconds.
export function buildTimeline(stepCount) {
  return Array.from({ length: stepCount }, (_, i) => {
    const edgeStart = i * (EDGE_S + NODE_S);
    const edgeEnd = edgeStart + EDGE_S;
    const nodeIn = edgeEnd;
    const nodeEnd = nodeIn + NODE_S;
    return { edgeStart, edgeEnd, nodeIn, nodeEnd, labelIn: nodeEnd, labelEnd: nodeEnd + LABEL_S };
  });
}

export const timelineDuration = (timeline) => (timeline.length ? timeline[timeline.length - 1].labelEnd : 0);

// One clock stage per step, ending when that step's timeframe label is in, so
// a `?t=<boundary>` screenshot shows exactly that many steps complete (the next
// edge has already begun — the label overlaps it to fit 7 steps in 6 s).
export function buildStages(steps, timeline) {
  return timeline.map((w, i) => ({
    id: steps[i].id,
    label: `Step ${i + 1} · ${steps[i].title}`,
    dur: w.labelEnd - (i ? timeline[i - 1].labelEnd : 0),
  }));
}

const progress = (T, start, end) => clamp((T - start) / (end - start));

// Eased 0..1 progress of each part of one step at time T.
export function stepFrame(T, w) {
  return {
    edge: easeOut(progress(T, w.edgeStart, w.edgeEnd)),
    node: easeOut(progress(T, w.nodeIn, w.nodeEnd)),
    label: easeOut(progress(T, w.labelIn, w.labelEnd)),
  };
}
