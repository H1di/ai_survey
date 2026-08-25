import { describe, it, expect } from "vitest";
import { BRANCH_PRESETS, MAX_TIPS, seedTips, tickTips, tickDrops } from "./branchEngine";

// A deterministic stand-in for Math.random: 0.5 is the "no wander, no branch,
// no drop" midpoint, which makes growth exactly predictable.
const mid = () => 0.5;

describe("seedTips", () => {
  it("seeds one tip per origin, just below the frame, pointing up", () => {
    const tips = seedTips(BRANCH_PRESETS.hero, 1000, 500, mid);
    expect(tips).toHaveLength(1);
    expect(tips[0].x).toBe(720);
    expect(tips[0].y).toBe(504);
    expect(tips[0].a).toBeCloseTo(-Math.PI / 2);
    expect(tips[0].main).toBe(true);
    expect(tips[0].depth).toBe(0);
  });
});

describe("tickTips", () => {
  it("advances a tip along its angle and reports the segment it drew", () => {
    const opt = BRANCH_PRESETS.hero;
    const tips = seedTips(opt, 1000, 500, mid);
    const { tips: next, segments } = tickTips(tips, opt, 1000, 500, mid);
    expect(segments).toHaveLength(1);
    expect(segments[0].y2).toBeCloseTo(504 - opt.trunkSpeed);
    expect(segments[0].main).toBe(true);
    expect(next[0].y).toBeCloseTo(504 - opt.trunkSpeed);
    expect(next[0].life).toBe(opt.trunkLife - 1);
    expect(next[0].w).toBeCloseTo(opt.trunkWidth * opt.taper);
  });

  it("does not mutate the tips it is given", () => {
    const opt = BRANCH_PRESETS.hero;
    const tips = seedTips(opt, 1000, 500, mid);
    const before = { ...tips[0] };
    tickTips(tips, opt, 1000, 500, mid);
    expect(tips[0]).toEqual(before);
  });

  it("drops a tip that has run out of life", () => {
    const opt = BRANCH_PRESETS.hero;
    const spent = [{ ...seedTips(opt, 1000, 500, mid)[0], life: 1 }];
    const { tips: next } = tickTips(spent, opt, 1000, 500, mid);
    expect(next).toHaveLength(0);
  });

  it("drops a tip that has left the frame", () => {
    const opt = BRANCH_PRESETS.hero;
    const escaped = [{ ...seedTips(opt, 1000, 500, mid)[0], y: -30 }];
    const { tips: next } = tickTips(escaped, opt, 1000, 500, mid);
    expect(next).toHaveLength(0);
  });

  it("spawns a child with the branch hue when the roll succeeds, and never past maxDepth", () => {
    const opt = BRANCH_PRESETS.hero;
    const always = () => 0; // 0 is below every threshold, so every roll succeeds
    const tips = seedTips(opt, 1000, 500, mid);
    const { tips: next } = tickTips(tips, opt, 1000, 500, always);
    expect(next).toHaveLength(2);
    expect(next[1].depth).toBe(1);
    expect(next[1].main).toBe(false);
    expect(next[1].hue).toEqual(opt.branchHue);
    expect(next[1].w).toBeCloseTo(next[0].w * opt.childWidthMul);

    const deep = [{ ...tips[0], depth: opt.maxDepth }];
    const { tips: capped } = tickTips(deep, opt, 1000, 500, always);
    expect(capped).toHaveLength(1);
  });

  it("emits a drop when the roll succeeds", () => {
    const opt = BRANCH_PRESETS.hero;
    const always = () => 0;
    const { drops } = tickTips(seedTips(opt, 1000, 500, mid), opt, 1000, 500, always);
    expect(drops).toHaveLength(1);
    expect(drops[0].vy).toBeLessThan(0); // drops rise
    expect(drops[0].hue).toEqual(opt.dropHue);
  });

  it("stays bounded under a branch-every-frame roll", () => {
    // The cap gates child spawning, not the parents already alive: the frame
    // that crosses it still pushes every remaining parent, so the population
    // overshoots MAX_TIPS once and then can only shrink. Bounded, not capped.
    const opt = BRANCH_PRESETS.graph;
    const always = () => 0;
    let tips = seedTips(opt, 1000, 500, mid);
    let peak = 0;
    for (let i = 0; i < 200; i += 1) {
      tips = tickTips(tips, opt, 1000, 500, always).tips;
      peak = Math.max(peak, tips.length);
    }
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(2 * MAX_TIPS);
  });
});

describe("tickDrops", () => {
  it("moves each drop, ages it, and forgets the expired ones", () => {
    const alive = [{ x: 10, y: 10, vx: 1, vy: -2, life: 2, r: 2, hue: [1, 2, 3] }];
    const once = tickDrops(alive);
    expect(once[0]).toMatchObject({ x: 11, y: 8, life: 1 });
    expect(tickDrops(once)).toHaveLength(0);
  });
});

describe("BRANCH_PRESETS", () => {
  it("carries both presets with the artifact's values", () => {
    expect(BRANCH_PRESETS.hero.origins).toEqual([0.72]);
    expect(BRANCH_PRESETS.hero.maxDepth).toBe(4);
    expect(BRANCH_PRESETS.hero.pause).toBe(270);
    expect(BRANCH_PRESETS.graph.origins).toEqual([0.5]);
    expect(BRANCH_PRESETS.graph.maxDepth).toBe(6);
    expect(BRANCH_PRESETS.graph.bg).toBe("transparent");
  });
});
