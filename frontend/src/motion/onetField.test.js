import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import raw from "./data/onet-field.json";
import { decodeField, groundingFor, pearson, rankDirections, rankOccupations } from "./onetField";

// The real backend modules — the mirror must agree with them, not with a copy.
const require = createRequire(import.meta.url);
const backendOnet = require("../../../backend/engine/onet.js");
const backendRiasec = require("../../../backend/engine/riasec.js");
const { buildField } = require("../../scripts/build-onet-field.cjs");
const { DEV_PROFILE } = require("../../../backend/core/devSeed.js");

const field = decodeField(raw);

const PROFILES = [
  { R: 13, I: 100, A: 88, S: 50, E: 63, C: 38 },
  { R: 94, I: 58, A: 15, S: 22, E: 36, C: 80 },
  { R: 18, I: 30, A: 62, S: 92, E: 74, C: 40 },
  { R: 50, I: 50, A: 50, S: 50, E: 50, C: 50 }, // flat: zero variance
  // What the snapshot's rankingRiasecScores carries for a near-flat quiz:
  // the backend's own blend toward Big Five, ranked through the mirror.
  backendRiasec.rankingRiasec(
    { R: 50, I: 63, A: 50, S: 50, E: 50, C: 38 },
    { O: 90, C: 35, E: 20, A: 60 }
  ),
];

describe("onet-field.json", () => {
  it("is exactly what the build script produces from the backend snapshot", () => {
    // Fails when the snapshot, the direction weights or the labels change
    // without `node frontend/scripts/build-onet-field.cjs` being re-run.
    expect(raw).toEqual(JSON.parse(JSON.stringify(buildField())));
  });

  it("covers every snapshot occupation and carries the attribution line", () => {
    expect(field.occupations).toHaveLength(backendOnet.SNAPSHOT_OCCUPATION_COUNT);
    expect(field.version).toBe(backendOnet.SNAPSHOT_VERSION);
    expect(field.attribution).toBe(backendOnet.ONET_ATTRIBUTION);
    expect(field.occupations.every((o) => o.directionId)).toBe(true);
  });

  it("holds no salary or outlook data", () => {
    expect(JSON.stringify(raw)).not.toMatch(/salary|outlook|annualMedian/i);
  });
});

describe("client-side grounding mirror", () => {
  it("pearson matches the backend", () => {
    const a = [13, 100, 88, 50, 63, 38];
    const b = [4, 34, 19, 42, 99, 66];
    expect(pearson(a, b)).toBe(backendOnet.pearson(a, b));
    expect(pearson([5, 5, 5], [1, 2, 3])).toBe(0);
  });

  it.each(PROFILES)("ranks field families like the backend (%o)", (scores) => {
    for (const excludeIds of [[], ["science", "arts"]]) {
      const mine = rankDirections(field, scores, { excludeIds }).map(({ id, score }) => ({ id, score }));
      expect(mine).toEqual(backendRiasec.rankDirections(scores, { excludeIds }));
    }
  });

  it.each(PROFILES)("ranks occupations like the backend (%o)", (scores) => {
    const directionIds = backendRiasec.rankDirections(scores).slice(0, 5).map((d) => d.id);
    const theirs = backendOnet.rankOccupations(scores, { directionIds, limit: 15 });
    const mine = rankOccupations(field, scores, { directionIds, limit: 15 });
    expect(mine.map((o) => o.soc)).toEqual(theirs.map((o) => o.soc));
    mine.forEach((o, i) => expect(o.r).toBe(theirs[i].score));
  });

  it("re-derives the shortlist a refine sees: used families and SOCs are out", () => {
    const scores = DEV_PROFILE.riasecScores ?? PROFILES[0];
    const first = groundingFor(field, scores);
    expect(first.topDirections).toHaveLength(5);
    expect(first.shortlist).toHaveLength(15);

    const prior = [{ directionId: first.shortlist[0].directionId, socCode: first.shortlist[0].soc }];
    const next = groundingFor(field, scores, prior);
    expect(next.topDirections.map((d) => d.id)).not.toContain(prior[0].directionId);
    expect(next.shortlist.map((o) => o.soc)).not.toContain(prior[0].socCode);

    const directionIds = backendRiasec
      .rankDirections(scores, { excludeIds: [prior[0].directionId] })
      .slice(0, 5)
      .map((d) => d.id);
    const theirs = backendOnet.rankOccupations(scores, {
      directionIds,
      excludeSocs: [prior[0].socCode],
      limit: 15,
    });
    expect(next.shortlist.map((o) => o.soc)).toEqual(theirs.map((o) => o.soc));
  });
});
