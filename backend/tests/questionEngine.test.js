const test = require("node:test");
const assert = require("node:assert/strict");
const { VALUES_QUESTIONS, VALUES_DIMENSIONS } = require("../questionPool");
const { computeValuesScores, serializeValueQuestion } = require("../questionEngine");

test("values inventory: 40 questions, 5 per dimension, aligned side balanced ~50/50", () => {
  assert.equal(VALUES_QUESTIONS.length, 40);

  const flippedTotal = VALUES_QUESTIONS.filter((q) => q.flip).length;
  assert.equal(flippedTotal, 20, "aligned pole should sit on each side half the time");

  for (const dim of VALUES_DIMENSIONS) {
    const group = VALUES_QUESTIONS.filter((q) => q.dimension === dim.id);
    assert.equal(group.length, 5, `${dim.id} must have 5 questions`);
    const flipped = group.filter((q) => q.flip).length;
    assert.ok(flipped >= 2 && flipped <= 3, `${dim.id} flips ${flipped}, want 2-3`);
  }
});

test("values inventory: no duplicate option texts across the whole set", () => {
  const seen = new Set();
  for (const q of VALUES_QUESTIONS) {
    for (const text of [q.optionA, q.optionB]) {
      const key = text.toLowerCase();
      assert.ok(!seen.has(key), `duplicate option text: "${text}"`);
      seen.add(key);
    }
  }
});

test("computeValuesScores is flip-aware: aligned answers score 5/5 everywhere", () => {
  const session = {
    valuesAnswers: Object.fromEntries(
      VALUES_QUESTIONS.map((q) => [q.id, q.flip ? "B" : "A"])
    ),
  };
  const { scores, answered } = computeValuesScores(session);
  assert.equal(answered, 40);
  for (const dim of VALUES_DIMENSIONS) {
    assert.equal(scores[dim.id], 5, `${dim.id} should be 5/5 for all-aligned answers`);
  }
});

test("computeValuesScores: always answering A no longer maxes every dimension", () => {
  const session = {
    valuesAnswers: Object.fromEntries(VALUES_QUESTIONS.map((q) => [q.id, "A"])),
  };
  const { scores } = computeValuesScores(session);
  for (const dim of VALUES_DIMENSIONS) {
    assert.ok(scores[dim.id] >= 2 && scores[dim.id] <= 3, `${dim.id}=${scores[dim.id]}, expected 2-3`);
  }
});

test("flip flag never leaks through serializeValueQuestion", () => {
  for (const q of VALUES_QUESTIONS) {
    assert.equal(serializeValueQuestion(q).flip, undefined);
  }
});

const {
  serializeRiasecItem,
  validateRiasecAnswer,
  computeRiasecScores,
  deriveRiasecCode,
} = require("../questionEngine");
const { getFallbackRiasecItems } = require("../riasecItems");

test("serializeRiasecItem strips the scoring type", () => {
  const item = { id: "ri_1", type: "R", text: "Fixing things" };
  assert.deepEqual(serializeRiasecItem(item), { id: "ri_1", text: "Fixing things" });
});

test("validateRiasecAnswer rejects unknown items and out-of-range values", () => {
  const session = { riasecItems: getFallbackRiasecItems("short"), riasecAnswers: {} };
  assert.equal(validateRiasecAnswer(session, "ri_1", 4), 4);
  assert.throws(() => validateRiasecAnswer(session, "nope", 3), /Unknown RIASEC item/);
  assert.throws(() => validateRiasecAnswer(session, "ri_1", 0), /1–5/);
  assert.throws(() => validateRiasecAnswer(session, "ri_1", 3.5), /1–5/);
});

test("computeRiasecScores: null until complete, then per-type 0–100 means", () => {
  const items = getFallbackRiasecItems("short");
  const session = { riasecItems: items, riasecAnswers: {} };
  assert.equal(computeRiasecScores(session).scores, null);

  // All R items -> 5, everything else -> 1
  for (const item of items) session.riasecAnswers[item.id] = item.type === "R" ? 5 : 1;
  const { scores, answered } = computeRiasecScores(session);
  assert.equal(answered, 12);
  assert.equal(scores.R, 100);
  assert.equal(scores.I, 0);
});

test("deriveRiasecCode returns top-3 with stable R,I,A,S,E,C tie-break", () => {
  assert.equal(deriveRiasecCode({ R: 10, I: 90, A: 80, S: 70, E: 10, C: 10 }), "IAS");
  // full tie -> catalog order
  assert.equal(deriveRiasecCode({ R: 50, I: 50, A: 50, S: 50, E: 50, C: 50 }), "RIA");
});
