import { describe, it, expect } from "vitest";
import profile from "../data/demo-profile.json";
import { totalDuration } from "../kit/timeline";
import { LAYOUT, STAGES, SYNTHETIC_PROFILES, buildEmblem, frameAt } from "./emblemEngine";

const clone = (o) => JSON.parse(JSON.stringify(o));

describe("archetype emblem engine", () => {
  it("same profile → identical geometry", () => {
    expect(buildEmblem(clone(profile))).toEqual(buildEmblem(clone(profile)));
  });

  it("different profiles → different geometry", () => {
    const [a, b, c] = [profile, ...SYNTHETIC_PROFILES].map(buildEmblem);
    expect(a).not.toEqual(b);
    expect(b).not.toEqual(c);
    expect(new Set([a.seed, b.seed, c.seed]).size).toBe(3);
    // One point of one score is enough to change the mark.
    const nudged = clone(profile);
    nudged.riasecScores.C += 1;
    expect(buildEmblem(nudged).seed).not.toBe(a.seed);
  });

  it("encodes the measured layers", () => {
    const e = buildEmblem(profile);
    // Steadiness (100 − N = 75) is drawn, not raw N.
    const s = e.lobes.find((l) => l.key === "S");
    expect(s.value).toBe(100 - profile.bigFiveScores.N);
    const O = e.lobes.find((l) => l.key === "O");
    expect(O.tip).toBeGreaterThan(s.tip); // 94 > 75
    // The code letters, and only they, are marked; higher score → thicker.
    expect(e.segments.filter((g) => g.codeRank >= 0).map((g) => g.key).sort()).toEqual(["A", "E", "I"]);
    const I = e.segments.find((g) => g.key === "I");
    const R = e.segments.find((g) => g.key === "R");
    expect(I.outer - I.inner).toBeGreaterThan(R.outer - R.inner);
    // Rank 1 tick is the longest, rank 6 the shortest.
    const byRank = [...e.ticks].sort((x, y) => x.rank - y.rank);
    expect(byRank[0].key).toBe(profile.valuesOrder[0]);
    expect(byRank[0].outer).toBeCloseTo(LAYOUT.tickBase + LAYOUT.tickMax);
    byRank.slice(1).forEach((t, i) => expect(t.outer).toBeLessThan(byRank[i].outer));
  });

  it("draws nothing at T=0 and everything at the end", () => {
    const start = frameAt(0);
    expect([...start.lobes, ...start.segments, ...start.ticks, start.nameAlpha]).toEqual(Array(18).fill(0));
    const end = frameAt(totalDuration(STAGES));
    expect([...end.lobes, ...end.segments, ...end.ticks, end.nameAlpha, end.taglineAlpha]).toEqual(Array(19).fill(1));
  });
});
