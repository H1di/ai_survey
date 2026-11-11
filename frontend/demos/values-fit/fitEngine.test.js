import { createRequire } from "node:module";
import { describe, it, expect } from "vitest";
import occupations from "../data/occupations.json";
import profile from "../data/demo-profile.json";
import {
  AXES,
  COUNT_END,
  COUNT_START,
  DURATION,
  POOR_FIT,
  RAYS,
  agreeAxes,
  axisAngle,
  buildPresets,
  countAt,
  frameAt,
  radiusOnRay,
} from "./fitEngine";

// The real scorer the output card uses — the fixture the presets are checked against.
const require = createRequire(import.meta.url);
const { valuesFit, WORK_VALUES_ORDER } = require("../../../backend/engine/workValues.js");

const presets = buildPresets(profile, occupations);

describe("presets", () => {
  it("axes follow the backend WORK_VALUES_ORDER", () => {
    expect(AXES.map((a) => a.key)).toEqual(WORK_VALUES_ORDER);
  });

  it("the result preset shows the precomputed valuesFit, which the backend reproduces", () => {
    const [chosen] = presets;
    expect(chosen.fit).toBe(profile.valuesFit.overall);
    expect(valuesFit(profile.valuesScores, profile.chosen.workValues).overall).toBe(chosen.fit);
  });

  it("the poor-fit preset is the lowest-fit measured occupation, with the backend's number", () => {
    const ranked = occupations
      .filter((o) => o.workValues)
      .map((o) => ({ soc: o.soc, fit: valuesFit(profile.valuesScores, o.workValues).overall }))
      .sort((a, b) => a.fit - b.fit);
    expect(ranked[0]).toEqual({ soc: POOR_FIT.soc, fit: POOR_FIT.overall });
    expect(presets[1].fit).toBe(POOR_FIT.overall);
  });
});

describe("intersection", () => {
  it(`samples ≥ 360 rays; each radius is ≤ both polygons' radii and equals one of them`, () => {
    expect(RAYS).toBeGreaterThanOrEqual(360);
    for (const p of presets) {
      expect(p.region).toHaveLength(RAYS);
      for (const { angle, r } of p.region) {
        const ru = radiusOnRay(p.userRadii, angle);
        const rj = radiusOnRay(p.jobRadii, angle);
        expect(r).toBeLessThanOrEqual(ru + 1e-12);
        expect(r).toBeLessThanOrEqual(rj + 1e-12);
        expect(Math.min(Math.abs(r - ru), Math.abs(r - rj))).toBeLessThan(1e-12);
      }
    }
  });

  it("follows straight polygon edges, not per-vertex values", () => {
    const radii = presets[0].userRadii;
    AXES.forEach((_, i) => expect(radiusOnRay(radii, axisAngle(i))).toBeCloseTo(radii[i], 12));
    // Mid-edge point lies on the segment between the two vertices.
    const pt = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
    const [ax, ay] = pt(radii[0], axisAngle(0));
    const [bx, by] = pt(radii[1], axisAngle(1));
    const mid = axisAngle(0) + 0.37 * (axisAngle(1) - axisAngle(0));
    const [px, py] = pt(radiusOnRay(radii, mid), mid);
    expect((bx - ax) * (py - ay) - (by - ay) * (px - ax)).toBeCloseTo(0, 12);
  });
});

describe("count-up", () => {
  it("is 0 before it starts, never decreases, and ends exactly at the value", () => {
    for (const { fit } of presets) {
      expect(countAt(COUNT_START, fit)).toBe(0);
      let prev = 0;
      for (let T = COUNT_START; T <= COUNT_END; T += 0.01) {
        const c = countAt(T, fit);
        expect(c).toBeGreaterThanOrEqual(prev);
        prev = c;
      }
      expect(countAt(COUNT_END, fit)).toBe(fit);
    }
  });
});

describe("final frame (reduced motion parks here)", () => {
  it("has everything drawn", () => {
    for (const p of presets) {
      const f = frameAt(DURATION, p);
      expect(f).toEqual({
        userScale: 1,
        jobScale: 1,
        sweep: 1,
        userValuesAlpha: 1,
        jobValuesAlpha: 1,
        readoutAlpha: 1,
        tickAlpha: 1,
        count: p.fit,
      });
    }
  });
});

describe("agreeAxes", () => {
  it("ticks only axes where both shapes lean the same way", () => {
    expect(agreeAxes(profile.valuesScores, profile.chosen.workValues)).toEqual(["support", "achievement"]);
    expect(presets[1].agree).toEqual([]);
  });
});
