const { test } = require("node:test");
const assert = require("node:assert");

const {
  WORK_VALUES_ORDER,
  WORK_VALUES_META,
  WORK_VALUE_CURVE_VERSION,
  valuesFit,
  rankToWorkValueScores,
  deriveTopValues,
  buildFallbackProfessionValues,
  WORK_VALUES_DIRECTION_PROTOTYPES,
} = require("../workValues");

const KEYS = [
  "achievement",
  "independence",
  "recognition",
  "relationships",
  "support",
  "working_conditions",
];

test("WORK_VALUES_ORDER is the six Minnesota work-value keys", () => {
  assert.deepEqual([...WORK_VALUES_ORDER].sort(), [...KEYS].sort());
  assert.equal(WORK_VALUES_META.length, 6);
  for (const m of WORK_VALUES_META) {
    assert.ok(WORK_VALUES_ORDER.includes(m.id));
    assert.ok(typeof m.label === "string" && m.label.length > 0);
  }
});

test("valuesFit returns only { overall } and is 100 for identical vectors", () => {
  const v = { achievement: 80, independence: 60, recognition: 40, relationships: 70, support: 50, working_conditions: 55 };
  const fit = valuesFit(v, v);
  assert.deepEqual(Object.keys(fit), ["overall"]);
  assert.equal(fit.overall, 100);
});

test("valuesFit is lower for a mismatched profession than a matching one", () => {
  const user = { achievement: 90, independence: 80, recognition: 70, relationships: 30, support: 20, working_conditions: 40 };
  const near = { achievement: 85, independence: 75, recognition: 65, relationships: 35, support: 25, working_conditions: 45 };
  const far = { achievement: 20, independence: 30, recognition: 25, relationships: 90, support: 85, working_conditions: 60 };
  assert.ok(valuesFit(user, near).overall > valuesFit(user, far).overall);
});

test("valuesFit does not throw on a flat vector", () => {
  const flat = { achievement: 50, independence: 50, recognition: 50, relationships: 50, support: 50, working_conditions: 50 };
  const v = { achievement: 80, independence: 60, recognition: 40, relationships: 70, support: 50, working_conditions: 55 };
  const fit = valuesFit(flat, v);
  assert.ok(Number.isFinite(fit.overall));
});

test("rankToWorkValueScores: rank 1 highest, rank 6 lowest, strictly decreasing", () => {
  const order = ["support", "achievement", "independence", "recognition", "relationships", "working_conditions"];
  const scores = rankToWorkValueScores(order);
  assert.equal(Object.keys(scores).length, 6);
  assert.equal(scores.support, 100);
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(scores[order[i - 1]] > scores[order[i]], `rank ${i} must beat rank ${i + 1}`);
  }
  assert.ok(WORK_VALUE_CURVE_VERSION >= 1);
});

test("deriveTopValues returns the three highest-scoring keys", () => {
  const v = { achievement: 90, independence: 20, recognition: 80, relationships: 10, support: 70, working_conditions: 30 };
  assert.deepEqual(deriveTopValues(v), ["achievement", "recognition", "support"]);
});

test("buildFallbackProfessionValues: known direction differs from generic, all keys 0-100", () => {
  const social = buildFallbackProfessionValues("social", {});
  for (const k of KEYS) {
    assert.ok(typeof social[k] === "number" && social[k] >= 0 && social[k] <= 100);
  }
  // social prototype is relationships-dominant in the real O*NET data
  assert.ok(social.relationships > social.recognition);
  assert.ok(WORK_VALUES_DIRECTION_PROTOTYPES.social);
});

test("buildFallbackProfessionValues: job-char target nudges the profile", () => {
  const base = buildFallbackProfessionValues("tech", {});
  const highComp = buildFallbackProfessionValues("tech", { compensation: 100 });
  assert.ok(highComp.working_conditions >= base.working_conditions);
});
