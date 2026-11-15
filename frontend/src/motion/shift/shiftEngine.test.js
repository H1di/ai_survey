import { describe, it, expect } from "vitest";
import { stageAt } from "../timeline";
import occupations from "../../../demos/data/occupations.json";
import profile from "../../../demos/data/demo-profile.json";
import {
  ARRIVE,
  LEAVE,
  TRANSITION,
  buildModel,
  cubicBezier,
  frameAt,
  parseCubicBezier,
  project,
  roundEnd,
  roundStart,
  holdAt,
  settledRounds,
  stackLabels,
  traceSource,
} from "./shiftEngine";

const source = traceSource(profile);
const model = buildModel(occupations, source);
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

describe("waiting on the response", () => {
  // The product's "No": the outputs shown so far, plus a round with no
  // destination yet.
  const shown = { ...source, picks: source.picks.slice(0, 2) };
  const pending = buildModel(occupations, { ...shown, pending: true });
  const start = roundStart(pending, pending.rounds);

  it("adds one open round and rules the current family out during its leave", () => {
    expect(pending.rounds).toBe(2);
    expect(pending.families).toHaveLength(2);
    expect(frameAt(start, pending).ruledOut).toEqual([shown.picks[0].directionId]);
    const left = frameAt(start + LEAVE, pending);
    expect(left.ruledOut).toEqual(shown.picks.map((p) => p.directionId));
    expect(left.families[1]).toMatchObject({ out: 1, outline: 1, pill: 0, live: 0 });
  });

  it("holds there for as long as it takes: no new pick, camera on the whole hexagon", () => {
    const hold = holdAt(pending);
    expect(hold).toBeCloseTo(start + LEAVE, 9);
    for (const wait of [0.5, 7, 45, 600]) {
      const f = frameAt(hold + wait, pending);
      expect(f.held).toBeCloseTo(wait, 9);
      expect(f.camera).toEqual({ x: 0, y: 0, zoom: 1 });
      expect(f.families).toHaveLength(2); // nothing invented
      expect(f.families.every((fam) => fam.pill === 0 && fam.live === 0)).toBe(true);
      expect(f.settled).toBe(1);
    }
  });

  it("breathes calmly: only the families still in play change, and never by a jump", () => {
    const hold = holdAt(pending);
    const free = pending.dots.findIndex((d) => d.family < 0);
    const out = pending.dots.findIndex((d) => d.family === 0);
    const at = (t) => frameAt(hold + t, pending).dots;
    expect(at(0)[free].alpha).toBeCloseTo(frameAt(hold, pending).dots[free].alpha, 9);
    expect(at(1.6)[free].alpha).toBeGreaterThan(at(0)[free].alpha);
    expect(at(3.2)[free].alpha).toBeCloseTo(at(0)[free].alpha, 9); // one full breath
    expect(at(1.6)[out].alpha).toBe(at(0)[out].alpha);
    for (let t = 0; t < 6.4; t += 0.05) {
      expect(Math.abs(at(t + 0.05)[free].alpha - at(t)[free].alpha)).toBeLessThan(0.01);
    }
  });

  it("resumes from the same frame once the next pick is known", () => {
    const arrived = buildModel(occupations, { ...source, picks: source.picks.slice(0, 3) });
    const resume = holdAt(arrived);
    expect(resume).toBeCloseTo(holdAt(pending), 9);
    const a = frameAt(resume, arrived);
    const b = frameAt(resume, pending);
    expect(a.camera).toEqual(b.camera);
    expect(a.ruledOut).toEqual(b.ruledOut);
    const end = frameAt(resume + ARRIVE, arrived);
    expect(end.families[2]).toMatchObject({ live: 1, pill: 1, out: 0 });
    expect(end.camera.x).toBeCloseTo(arrived.families[2].x, 9);
  });

  it("a settled model can also be made to wait (waiting flag) without a pending round", () => {
    const f = frameAt(holdAt(model) + 30, model, { waiting: true });
    expect(f.held).toBeCloseTo(30, 9);
    expect(f.camera).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("refuses to draw a pick that is not on the map", () => {
    expect(buildModel(occupations, { ...source, picks: [{ ...source.picks[0], soc: null }] })).toBeNull();
    expect(buildModel(occupations, { ...source, picks: [] })).toBeNull();
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
