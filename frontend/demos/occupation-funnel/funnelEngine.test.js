import { describe, it, expect } from "vitest";
import { stageAt, totalDuration } from "../kit/timeline";
import occupations from "../data/occupations.json";
import profile from "../data/demo-profile.json";
import {
  HOLD_AT,
  STAGES,
  buildModel,
  frameAt,
  sceneTime,
  stackLabels,
  stagesFor,
} from "./funnelEngine";

const model = buildModel(occupations, profile);
const ends = (stages) => stages.map((_, i) => totalDuration(stages.slice(0, i + 1)));
const enlarged = (f) => f.dots.filter((d) => d.r > 3 && d.alpha > 0.5).map((d) => d.soc);

describe("stages", () => {
  it("cover 0–12 s with the boundaries the scene is written against", () => {
    expect(STAGES[0].label).toBe(`${occupations.length} occupations from O*NET`);
    const b = ends(STAGES);
    [2.4, 5.0, 8.0, 10.5, 12.0].forEach((v, i) => expect(b[i]).toBeCloseTo(v));
    expect(HOLD_AT).toBeCloseTo(b[2]);
    // A boundary shows the earlier stage finished; just after it, the next stage.
    b.slice(0, -1).forEach((t, i) => {
      expect(stageAt(t, STAGES)).toMatchObject({ index: i, progress: 1 });
      expect(stageAt(t + 0.01, STAGES).index).toBe(i + 1);
    });
  });

  it("insert a waiting stage only when the response comes after the shortlist", () => {
    expect(stagesFor()).toBe(STAGES);
    expect(stagesFor(HOLD_AT - 3)).toBe(STAGES); // arrived early → no hold
    const held = stagesFor(11);
    expect(held.map((s) => s.id)).toEqual(["catalog", "families", "shortlist", "waiting", "pick", "ready"]);
    expect(totalDuration(held)).toBeCloseTo(15);
  });
});

describe("frameAt", () => {
  it("enlarges exactly the shortlist SOCs at the end of stage 3", () => {
    expect(enlarged(frameAt(5.0, model))).toEqual([]);
    const at8 = enlarged(frameAt(8.0, model)).sort();
    expect(at8).toEqual(profile.shortlist.map((s) => s.soc).sort());
    expect(at8).toHaveLength(15);
  });

  it("holds stage 3 while waiting and resumes from the arrival time", () => {
    expect(sceneTime(40, null).s).toBe(HOLD_AT);
    const waiting = frameAt(40, model, null);
    expect(waiting.dots).toEqual(frameAt(HOLD_AT, model).dots); // no loop back, no progress
    expect(waiting.pick.visible).toBe(false);
    // Arrival at 11 s: 1.25 s later the pick is where an unheld scene is at 9.25 s.
    expect(frameAt(12.25, model, 11).pick).toEqual(frameAt(9.25, model).pick);
    expect(frameAt(15, model, 11).pick.morph).toBe(1);
  });

  it("breathes the shortlist lines during the hold, without touching anything else", () => {
    const top = frameAt(HOLD_AT, model, null).lines[0].alpha;
    const dip = frameAt(HOLD_AT + 1.6, model, null).lines[0].alpha; // half a breath
    expect(dip).toBeLessThan(top * 0.6);
    expect(frameAt(HOLD_AT + 3.2, model, null).lines[0].alpha).toBeCloseTo(top);
  });

  it("ends on the pill with the full title", () => {
    const end = frameAt(12, model);
    expect(end.pick).toMatchObject({ visible: true, x: 0, y: 0, morph: 1, chars: profile.chosen.title.length });
    expect(Math.max(...end.dots.map((d) => d.alpha))).toBeLessThanOrEqual(0.05);
  });
});

describe("determinism", () => {
  it("same seed → same layout and frames; another seed → different jitter", () => {
    const again = buildModel(occupations, profile);
    expect(again).toEqual(model);
    expect(frameAt(6.3, again)).toEqual(frameAt(6.3, model));
    expect(buildModel(occupations, profile, 1).dots[0]).not.toEqual(model.dots[0]);
  });
});

describe("stackLabels", () => {
  it("pushes overlapping boxes apart and leaves clear ones alone", () => {
    const out = stackLabels([
      { x: 0, y: 0, w: 40, h: 12 },
      { x: 5, y: 3, w: 40, h: 12 },
      { x: 200, y: 1, w: 40, h: 12 },
    ]);
    expect(out[0].y).toBe(0);
    expect(out[1].y).toBeGreaterThanOrEqual(12);
    expect(out[2].y).toBe(1);
  });
});
