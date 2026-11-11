import { describe, it, expect } from "vitest";
import { buildStages, buildTimeline, easeOut, stepFrame, timelineDuration } from "./roadmapTimeline";
import { totalDuration } from "../kit/timeline";
import profile from "../data/demo-profile.json";

describe("roadmap timeline", () => {
  for (const n of [5, 6, 7]) {
    it(`${n} steps: sequential, monotonic, no overlaps, ≤ 6 s`, () => {
      const tl = buildTimeline(n);
      expect(tl).toHaveLength(n);
      tl.forEach((w, i) => {
        expect(w.edgeStart).toBeLessThan(w.edgeEnd);
        expect(w.edgeEnd).toBeLessThanOrEqual(w.nodeIn);
        expect(w.nodeIn).toBeLessThan(w.nodeEnd);
        expect(w.nodeEnd).toBeLessThanOrEqual(w.labelIn);
        expect(w.labelIn).toBeLessThan(w.labelEnd);
        if (i > 0) {
          const prev = tl[i - 1];
          expect(w.edgeStart).toBeGreaterThan(prev.edgeStart);
          // an edge waits for the previous node to finish arriving
          expect(w.edgeStart).toBeGreaterThanOrEqual(prev.nodeEnd - 1e-9);
        }
      });
      expect(timelineDuration(tl)).toBeLessThanOrEqual(6);
    });
  }

  it("stages tile the timeline exactly", () => {
    const steps = profile.roadmap.stages;
    const tl = buildTimeline(steps.length);
    expect(totalDuration(buildStages(steps, tl))).toBeCloseTo(timelineDuration(tl));
  });

  it("frames go from nothing to everything", () => {
    const tl = buildTimeline(6);
    expect(stepFrame(0, tl[0])).toEqual({ edge: 0, node: 0, label: 0 });
    const end = timelineDuration(tl);
    tl.forEach((w) => expect(stepFrame(end, w)).toEqual({ edge: 1, node: 1, label: 1 }));
    // mid-edge of step 2: step 1 done, step 2 node not yet in
    const mid = stepFrame((tl[1].edgeStart + tl[1].edgeEnd) / 2, tl[1]);
    expect(mid.edge).toBeGreaterThan(0.5); // ease-out front-loads the draw
    expect(mid.node).toBe(0);
  });

  it("easeOut matches cubic-bezier(0.22, 1, 0.36, 1) endpoints and is monotonic", () => {
    let last = 0;
    for (let x = 0; x <= 1.0001; x += 0.05) {
      const y = easeOut(x);
      expect(y).toBeGreaterThanOrEqual(last - 1e-9);
      last = y;
    }
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
  });
});
