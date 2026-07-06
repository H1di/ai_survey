const test = require("node:test");
const assert = require("node:assert/strict");
const {
  RIASEC_KEYS,
  DIRECTION_RIASEC,
  deriveRiasecScores,
  rankDirections,
} = require("../riasec");
const { DIRECTION_IDS } = require("../directions");

test("every catalog direction has a RIASEC mapping and vice versa", () => {
  const mapped = Object.keys(DIRECTION_RIASEC).sort();
  assert.deepEqual(mapped, [...DIRECTION_IDS].sort());
  for (const weights of Object.values(DIRECTION_RIASEC)) {
    for (const key of Object.keys(weights)) {
      assert.ok(RIASEC_KEYS.includes(key), `bad RIASEC key ${key}`);
    }
  }
});

test("deriveRiasecScores returns all six dimensions clamped to 0-100", () => {
  const scores = deriveRiasecScores({
    bigFiveScores: { O: 90, C: 20, E: 80, A: 70, N: 40 },
    valuesScores: { intellectual_stimulation: 5, meaning_impact: 4, structure: 0 },
  });
  for (const key of RIASEC_KEYS) {
    assert.ok(scores[key] >= 0 && scores[key] <= 100, `${key}=${scores[key]} out of range`);
  }
});

test("a partial/empty profile still yields a neutral vector (no throw)", () => {
  const scores = deriveRiasecScores({});
  for (const key of RIASEC_KEYS) {
    assert.equal(typeof scores[key], "number");
  }
});

test("high-Openness, low-Conscientiousness profile ranks Arts/Design above Finance/Trades", () => {
  const ranked = rankDirections({
    bigFiveScores: { O: 95, C: 15, E: 55, A: 60, N: 45 },
    valuesScores: { intellectual_stimulation: 5, structure: 0, economic_return: 1 },
  });
  const pos = Object.fromEntries(ranked.map((r, i) => [r.id, i]));
  assert.ok(pos.arts < pos.finance, "arts should outrank finance for a high-O artist");
  assert.ok(pos.design < pos.trades, "design should outrank trades");
});

test("high-Conscientiousness + structure profile ranks Finance/Business high", () => {
  const ranked = rankDirections({
    bigFiveScores: { O: 30, C: 95, E: 55, A: 50, N: 40 },
    valuesScores: { structure: 5, economic_return: 5, achievement: 5, intellectual_stimulation: 1 },
  });
  const top5 = ranked.slice(0, 5).map((r) => r.id);
  assert.ok(top5.includes("finance") || top5.includes("business"), `got top5 ${top5}`);
});

test("rankDirections honors excludeIds and stays sorted high-to-low", () => {
  const ranked = rankDirections(
    { bigFiveScores: { O: 70, C: 60, E: 50, A: 50, N: 50 }, valuesScores: {} },
    { excludeIds: ["arts", "science"] }
  );
  assert.ok(!ranked.some((r) => r.id === "arts" || r.id === "science"));
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(ranked[i - 1].score >= ranked[i].score, "scores must be non-increasing");
  }
});
