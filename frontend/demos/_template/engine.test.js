import { describe, it, expect } from "vitest";
import { STAGES, frameAt } from "./engine";
import { totalDuration } from "../kit/timeline";
import { projectRiasec } from "../kit/riasecPlane";
import profile from "../data/demo-profile.json";

describe("template engine", () => {
  it("starts empty and ends on the projected profile", () => {
    const start = frameAt(0, profile.riasecScores);
    expect(start.outline).toBe(0);
    expect(start.point).toEqual({ x: 0, y: 0 });

    const end = frameAt(totalDuration(STAGES), profile.riasecScores);
    const target = projectRiasec(profile.riasecScores);
    expect(end.outline).toBe(1);
    expect(end.point.x).toBeCloseTo(target.x);
    expect(end.point.y).toBeCloseTo(target.y);
  });
});
