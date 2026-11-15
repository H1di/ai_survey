import { describe, it, expect } from "vitest";
import {
  lerp,
  clamp,
  smoothstep,
  easeOutCubic,
  mulberry32,
  totalDuration,
  stageAt,
  stageProgress,
} from "./timeline";

const STAGES = [
  { id: "a", label: "A", dur: 2 },
  { id: "b", label: "B", dur: 3 },
  { id: "c", label: "C", dur: 1 },
];

describe("easing primitives", () => {
  it("lerp, clamp, smoothstep, easeOutCubic hit their endpoints", () => {
    expect(lerp(10, 20, 0.25)).toBe(12.5);
    expect(clamp(-1)).toBe(0);
    expect(clamp(5, 0, 3)).toBe(3);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(smoothstep(0, 1, -2)).toBe(0);
    expect(smoothstep(0, 1, 9)).toBe(1);
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5); // decelerating
  });
});

describe("mulberry32", () => {
  it("is deterministic per seed and stays in [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 50 }, a);
    expect(seqA).toEqual(Array.from({ length: 50 }, b));
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(mulberry32(43)()).not.toBe(seqA[0]);
  });
});

describe("stageAt / stageProgress", () => {
  it("maps T to the stage covering (start, end]", () => {
    expect(totalDuration(STAGES)).toBe(6);
    expect(stageAt(0, STAGES).stage.id).toBe("a");
    expect(stageAt(2, STAGES)).toMatchObject({ index: 0, progress: 1 }); // boundary = finished
    expect(stageAt(3.5, STAGES)).toMatchObject({ index: 1, start: 2, end: 5, progress: 0.5 });
    expect(stageAt(99, STAGES)).toMatchObject({ index: 2, progress: 1 });
  });

  it("reports 0 before, partial during, 1 after a stage", () => {
    expect(stageProgress(1, STAGES, "b")).toBe(0);
    expect(stageProgress(3.5, STAGES, "b")).toBe(0.5);
    expect(stageProgress(5.5, STAGES, "b")).toBe(1);
    expect(() => stageProgress(1, STAGES, "zzz")).toThrow();
  });
});
