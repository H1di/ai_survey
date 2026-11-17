import { describe, it, expect } from "vitest";
import {
  buildMindGraph,
  mindFrame,
  clusterRadius,
  nodeTotal,
  flareLevel,
  ARRIVAL_S,
  FLARE_RISE_S,
  FLARE_HOLD_S,
} from "./mindGraph";

const STEPS = [
  ["demographics", 4],
  ["big_five", 20],
  ["riasec", 12],
  ["journey", 7],
];

describe("buildMindGraph", () => {
  it("is deterministic: same seed and total, same graph", () => {
    for (const [seed, total] of STEPS) {
      expect(buildMindGraph(seed, total)).toEqual(buildMindGraph(seed, total));
    }
  });

  it("differs between steps", () => {
    expect(buildMindGraph("big_five", 20).nodes).not.toEqual(buildMindGraph("riasec", 20).nodes);
  });

  it("ends a step as a field of ~40–60 nodes, a four-question step as ~20", () => {
    expect(buildMindGraph("demographics", 4).nodes).toHaveLength(20);
    for (const [seed, total] of STEPS.slice(1)) {
      const { nodes } = buildMindGraph(seed, total);
      expect(nodes).toHaveLength(nodeTotal(total));
      expect(nodes.length).toBeGreaterThanOrEqual(40);
      expect(nodes.length).toBeLessThanOrEqual(60);
    }
    expect(buildMindGraph("x", 0).nodes).toHaveLength(0);
  });

  it("adds a small cluster per answer, in answer order", () => {
    for (const [seed, total] of STEPS) {
      const g = buildMindGraph(seed, total);
      expect(g.cut[0]).toBe(0);
      expect(g.cut[total]).toBe(g.nodes.length);
      for (let k = 1; k <= total; k++) {
        const added = g.cut[k] - g.cut[k - 1];
        expect(added).toBeGreaterThanOrEqual(2);
        expect(added).toBeLessThanOrEqual(6);
        g.nodes.slice(g.cut[k - 1], g.cut[k]).forEach((n) => expect(n.answer).toBe(k));
      }
    }
  });

  it("gives every node after the first 1–3 edges, all to earlier nodes", () => {
    for (const [seed, total] of STEPS) {
      const g = buildMindGraph(seed, total);
      for (let i = 0; i < g.nodes.length; i++) {
        const own = g.edges.filter((e) => e.b === i);
        if (i === 0) expect(own).toHaveLength(0);
        else {
          expect(own.length).toBeGreaterThanOrEqual(1);
          expect(own.length).toBeLessThanOrEqual(3);
        }
        own.forEach((e) => expect(e.a).toBeLessThan(e.b));
      }
      const pairs = g.edges.map((e) => `${e.a}-${e.b}`);
      expect(new Set(pairs).size).toBe(pairs.length);
    }
  });

  it("stays inside its disc", () => {
    for (const [seed, total] of STEPS) {
      const R = clusterRadius(total);
      buildMindGraph(seed, total).nodes.forEach((n) => {
        expect(Math.hypot(n.x, n.y)).toBeLessThanOrEqual(R + 1e-9);
      });
    }
  });
});

describe("mindFrame", () => {
  const g = buildMindGraph("big_five", 20);

  it("draws nothing before the first answer and everything at the end", () => {
    expect(mindFrame(g, 0).nodes).toHaveLength(0);
    expect(mindFrame(g, 0).edges).toHaveLength(0);
    expect(mindFrame(g, 20).nodes).toHaveLength(g.nodes.length);
    expect(mindFrame(g, 20).edges).toHaveLength(g.edges.length);
    expect(mindFrame(g, 99).nodes).toHaveLength(g.nodes.length);
  });

  it("is a prefix: k answers show the first cut[k] nodes and only edges between them", () => {
    for (let k = 0; k <= 20; k++) {
      const f = mindFrame(g, k);
      expect(f.nodes.map(({ x, y }) => ({ x, y }))).toEqual(
        g.nodes.slice(0, g.cut[k]).map(({ x, y }) => ({ x, y }))
      );
      f.edges.forEach((e) => {
        expect(e.a).toBeLessThan(g.cut[k]);
        expect(e.b).toBeLessThan(g.cut[k]);
      });
      // Each answer only adds: the previous frame's edges are all still there.
      if (k > 0) {
        const prev = mindFrame(g, k - 1).edges.map((e) => `${e.a}-${e.b}`);
        const now = new Set(f.edges.map((e) => `${e.a}-${e.b}`));
        prev.forEach((p) => expect(now.has(p)).toBe(true));
        expect(f.nodes.length).toBeGreaterThan(mindFrame(g, k - 1).nodes.length);
      }
    }
  });

  it("settled frame is uniform pale ink with no flare", () => {
    const settled = mindFrame(g, 8);
    settled.nodes.forEach((n) => {
      expect(n.accent).toBe(0);
      expect(n.alpha).toBe(1);
    });
    expect(settled.flare).toBe(0);
    expect(settled.newest).toBe(-1);
  });

  it("an answer flares the whole graph and turns only the new cluster turquoise", () => {
    const first = g.cut[7];
    const peak = (FLARE_RISE_S + FLARE_HOLD_S) / 2 / ARRIVAL_S;
    const f = mindFrame(g, 8, peak);
    expect(f.newest).toBe(first);
    expect(f.flare).toBe(1);
    f.nodes.slice(0, first).forEach((n) => expect(n.accent).toBe(0));
    f.nodes.slice(first).forEach((n) => expect(n.accent).toBe(1));
    // The cluster has not appeared yet at the very start of the answer.
    mindFrame(g, 8, 0).nodes.slice(first).forEach((n) => expect(n.alpha).toBe(0));
    // And everything is back to rest at the end of the window.
    const end = mindFrame(g, 8, 1);
    expect(end.flare).toBe(0);
    end.nodes.forEach((n) => expect(n.accent).toBe(0));
  });

  it("the first answer flares too; an empty graph never does", () => {
    expect(mindFrame(g, 1, 0.25).flare).toBeGreaterThan(0);
    expect(mindFrame(g, 0, 0.25).flare).toBe(0);
  });

  it("same step and answered count give an identical frame", () => {
    expect(mindFrame(buildMindGraph("riasec", 12), 5)).toEqual(
      mindFrame(buildMindGraph("riasec", 12), 5)
    );
  });
});

describe("flareLevel", () => {
  it("rests at 0 outside the answer window", () => {
    expect(flareLevel(-1)).toBe(0);
    expect(flareLevel(0)).toBe(0);
    expect(flareLevel(ARRIVAL_S)).toBe(0);
    expect(flareLevel(5)).toBe(0);
    expect(flareLevel(NaN)).toBe(0);
  });

  it("lights quickly, holds, then eases back — inside ~0.9 s", () => {
    expect(ARRIVAL_S).toBeGreaterThanOrEqual(0.8);
    expect(ARRIVAL_S).toBeLessThanOrEqual(1);
    expect(flareLevel(FLARE_RISE_S / 2)).toBeGreaterThan(0.5);
    expect(flareLevel(FLARE_RISE_S)).toBe(1);
    expect(flareLevel(FLARE_HOLD_S)).toBe(1);
    let prev = 1;
    for (let t = FLARE_HOLD_S; t < ARRIVAL_S; t += 0.01) {
      const v = flareLevel(t);
      expect(v).toBeLessThanOrEqual(prev + 1e-12);
      expect(v).toBeGreaterThanOrEqual(0);
      prev = v;
    }
    expect(flareLevel(ARRIVAL_S - 0.01)).toBeLessThan(0.01);
  });

  it("never leaves 0..1", () => {
    for (let t = 0; t <= 1.2; t += 0.005) {
      const v = flareLevel(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
