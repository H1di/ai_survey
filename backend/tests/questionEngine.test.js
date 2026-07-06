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
