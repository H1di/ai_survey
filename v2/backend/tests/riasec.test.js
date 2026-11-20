const test = require("node:test");
const assert = require("node:assert/strict");
const {
  RIASEC_KEYS,
  DIRECTION_RIASEC,
  inferRiasecScores,
  rankingRiasec,
  rankDirections,
} = require("../engine/riasec");
const { DIRECTION_IDS } = require("../engine/directions");

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

test("rankingRiasec keeps a quiz with real shape untouched", () => {
  const measured = { R: 20, I: 90, A: 60, S: 40, E: 30, C: 50 }; // spread 70
  assert.deepEqual(rankingRiasec(measured, { O: 10, C: 90, E: 90, A: 10 }), measured);
  const edge = { R: 50, I: 90, A: 60, S: 60, E: 60, C: 60 }; // spread exactly 40
  assert.deepEqual(rankingRiasec(edge, { O: 10 }), edge);
});

test("rankingRiasec ranks a flat quiz by Big Five alone, and blends in between", () => {
  const flat = { R: 50, I: 50, A: 50, S: 50, E: 50, C: 50 };
  const bigFive = { O: 90, C: 30, E: 20, A: 60 };
  const inferred = inferRiasecScores(bigFive);
  const rounded = Object.fromEntries(RIASEC_KEYS.map((k) => [k, Math.round(inferred[k])]));
  assert.deepEqual(rankingRiasec(flat, bigFive), rounded);
  // Spread 20 → half quiz, half inference.
  const mild = { R: 50, I: 70, A: 50, S: 50, E: 50, C: 50 };
  const blended = rankingRiasec(mild, bigFive);
  for (const k of RIASEC_KEYS) {
    assert.equal(blended[k], Math.round(0.5 * mild[k] + 0.5 * inferred[k]));
  }
  // No quiz at all → the inference, as before.
  assert.deepEqual(rankingRiasec(null, bigFive), inferred);
});

test("a flat quiz no longer defaults to the alphabetically first family", () => {
  const flat = { R: 50, I: 50, A: 50, S: 50, E: 50, C: 50 };
  const curious = rankDirections(rankingRiasec(flat, { O: 95, C: 40, E: 15, A: 50 }))[0].id;
  const outgoing = rankDirections(rankingRiasec(flat, { O: 40, C: 70, E: 95, A: 80 }))[0].id;
  assert.notEqual(curious, "agriculture");
  assert.notEqual(outgoing, "agriculture");
  assert.notEqual(curious, outgoing, "different personalities must reach different families");
});
