import { describe, it, expect } from "vitest";
import { stageAt } from "../kit/timeline";
import occupations from "../data/occupations.json";
import profile from "../data/demo-profile.json";
import {
  TRANSITION,
  buildModel,
  cubicBezier,
  frameAt,
  parseCubicBezier,
  project,
  roundEnd,
  roundStart,
  settledRounds,
  stackLabels,
} from "./shiftEngine";

const model = buildModel(occupations, profile);
const K = profile.refineTrace.length;

describe("model", () => {
  it("visits the families of the real refine trace, in order", () => {
    expect(model.rounds).toBe(K);
    expect(model.families.map((f) => f.id)).toEqual([
      profile.chosen.directionId,
      ...profile.refineTrace.map((r) => r.chosen.directionId),
    ]);
    expect(model.families.map((f) => f.pick.title)).toEqual([
      profile.chosen.title,
      ...profile.refineTrace.map((r) => r.chosen.title),
    ]);
  });

  it("has one stage per round, and a boundary shows that round settled", () => {
    expect(model.stages.map((s) => s.id)).toEqual(["first", ...Array.from({ length: K }, (_, i) => `round${i + 1}`)]);
    for (let k = 0; k <= K; k += 1) {
      const t = roundEnd(model, k);
      expect(stageAt(t, model.stages)).toMatchObject({ index: k, progress: 1 });
      expect(settledRounds(t, model)).toBe(k);
      if (k > 0) expect(settledRounds(t - 0.01, model)).toBe(k - 1);
    }
    expect(roundEnd(model, K)).toBeLessThanOrEqual(12);
  });
});

describe("frameAt", () => {
  it("before any No, nothing is ruled out and only the first family is live", () => {
    const f = frameAt(roundEnd(model, 0), model);
    expect(f.ruledOut).toEqual([]);
    expect(f.families[0]).toMatchObject({ live: 1, out: 0, pill: 1 });
    f.families.slice(1).forEach((fam) => expect(fam.live).toBe(0));
  });

  it("after k rounds the ruled-out set equals the backend's excluded families", () => {
    for (let k = 1; k <= K; k += 1) {
      const f = frameAt(roundEnd(model, k), model);
      expect(f.ruledOut).toEqual(profile.refineTrace[k - 1].excludedDirectionIds);
      // Ruled out stays ruled out: fully dimmed, outlined, no pill.
      f.families.slice(0, k).forEach((fam) => expect(fam).toMatchObject({ out: 1, outline: 1, pill: 0, live: 0 }));
      expect(f.families[k]).toMatchObject({ live: 1, pill: 1, out: 0 });
    }
  });

  it("at round end the camera centres the new family's centroid", () => {
    const W = 360;
    const H = 360;
    for (let k = 0; k <= K; k += 1) {
      const { camera } = frameAt(roundEnd(model, k), model);
      const fam = model.families[k];
      expect(camera.x).toBeCloseTo(fam.x, 9);
      expect(camera.y).toBeCloseTo(fam.y, 9);
      expect(camera.zoom).toBeCloseTo(fam.camera.zoom, 9);
      const { X, Y } = project(camera, W, H);
      expect(X(fam.x)).toBeCloseTo(W / 2, 6);
      expect(Y(fam.y)).toBeCloseTo(H / 2, 6);
    }
  });

  it("the camera moves only during a round's motion", () => {
    const mid = frameAt(roundStart(model, 1) + TRANSITION / 2, model).camera;
    const a = model.families[0].camera;
    const b = model.families[1].camera;
    expect(mid.x).not.toBeCloseTo(a.x, 6);
    expect(mid.zoom).toBeLessThan(Math.max(a.zoom, b.zoom)); // pull-back mid-flight
    const end = frameAt(roundStart(model, 1) + TRANSITION, model).camera;
    ["x", "y", "zoom"].forEach((k) => expect(end[k]).toBeCloseTo(b[k], 9));
  });

  it("is a pure function of T", () => {
    const t = roundStart(model, 2) + 0.7;
    expect(frameAt(t, model)).toEqual(frameAt(t, model));
  });
});

describe("stackLabels", () => {
  it("terminates when float rounding leaves a moved label a hair inside its neighbour", () => {
    // (0.7302 + 32) − 0.7302 < 32 in floats: without slack this never ends.
    const p = { x: 0, y: 0.7302, w: 10, h: 26, fixed: true };
    const l = { x: 0, y: 1, w: 10, h: 26 };
    const [, moved] = stackLabels([p, l], 6);
    expect(moved.y).toBeCloseTo(p.y + 32, 6);
  });

  it("moves an overlapping label below the placed one", () => {
    const out = stackLabels([{ x: 0, y: 0, w: 20, h: 10 }, { x: 5, y: 4, w: 20, h: 10 }], 2);
    expect(out[1].y).toBe(12);
  });
});

describe("easing", () => {
  it("cubicBezier matches its endpoints and the --ease-out shape", () => {
    const e = cubicBezier(0.22, 1, 0.36, 1);
    expect(e(0)).toBe(0);
    expect(e(1)).toBe(1);
    expect(e(0.5)).toBeGreaterThan(0.85); // strong ease-out
    expect(cubicBezier(0, 0, 1, 1)(0.3)).toBeCloseTo(0.3, 4); // linear
    expect(parseCubicBezier(" cubic-bezier(0.22, 1, 0.36, 1)")(0.5)).toBeCloseTo(e(0.5), 9);
    expect(parseCubicBezier("ease")).toBeNull();
  });
});
