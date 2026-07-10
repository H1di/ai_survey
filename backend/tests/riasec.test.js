const test = require("node:test");
const assert = require("node:assert/strict");
const {
  RIASEC_KEYS,
  DIRECTION_RIASEC,
  inferRiasecScores,
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

test("inferRiasecScores: neutral profile -> all 50, extremes move sanely", () => {
  assert.deepEqual(inferRiasecScores(undefined), { R: 50, I: 50, A: 50, S: 50, E: 50, C: 50 });
  const artist = inferRiasecScores({ O: 95, C: 30, E: 40, A: 55, N: 50 });
  assert.ok(artist.A > 70, "high O drives Artistic");
  assert.ok(artist.R < 40, "high O suppresses Realistic");
  const organizer = inferRiasecScores({ O: 20, C: 90, E: 60, A: 50, N: 40 });
  assert.ok(organizer.C > 70, "high C drives Conventional");
});

test("inferRiasecScores stays clamped to 0-100 at the extremes", () => {
  for (const profile of [
    { O: 100, C: 100, E: 100, A: 100, N: 100 },
    { O: 0, C: 0, E: 0, A: 0, N: 0 },
  ]) {
    const scores = inferRiasecScores(profile);
    for (const key of RIASEC_KEYS) {
      assert.ok(scores[key] >= 0 && scores[key] <= 100, `${key}=${scores[key]} out of range`);
    }
  }
});

test("rankDirections ranks by weighted dot product over measured scores", () => {
  const scientist = { R: 20, I: 95, A: 40, S: 30, E: 20, C: 40 };
  const ranked = rankDirections(scientist);
  assert.equal(ranked[0].id, "science");
  assert.ok(ranked.every((r) => Number.isFinite(r.score)));
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(ranked[i - 1].score >= ranked[i].score, "scores must be non-increasing");
  }
});

test("rankDirections excludes rejected ids and tolerates a missing vector", () => {
  const ranked = rankDirections(
    { R: 20, I: 95, A: 40, S: 30, E: 20, C: 40 },
    { excludeIds: ["science"] }
  );
  assert.ok(!ranked.some((r) => r.id === "science"));
  const neutral = rankDirections(undefined);
  assert.equal(neutral.length, Object.keys(DIRECTION_RIASEC).length);
});
