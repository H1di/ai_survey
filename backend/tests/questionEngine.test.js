const test = require("node:test");
const assert = require("node:assert/strict");

const {
  serializeRiasecItem,
  validateRiasecAnswer,
  computeRiasecScores,
  deriveRiasecCode,
  validateCareerJourneyAnswer,
} = require("../questionEngine");
const {
  DEMOGRAPHIC_QUESTIONS,
  CAREER_JOURNEY_QUESTIONS,
} = require("../questionPool");
const { getStaticRiasecItems } = require("../riasecItems");

test("serializeRiasecItem strips the scoring type", () => {
  const item = { id: "ri_1", type: "R", text: "Fixing things" };
  assert.deepEqual(serializeRiasecItem(item), { id: "ri_1", text: "Fixing things" });
});

test("validateRiasecAnswer rejects unknown items and out-of-range values", () => {
  const session = { riasecItems: getStaticRiasecItems(), riasecAnswers: {} };
  assert.equal(validateRiasecAnswer(session, "ri_1", 4), 4);
  assert.throws(() => validateRiasecAnswer(session, "nope", 3), /Unknown RIASEC item/);
  assert.throws(() => validateRiasecAnswer(session, "ri_1", 0), /1–5/);
  assert.throws(() => validateRiasecAnswer(session, "ri_1", 3.5), /1–5/);
});

test("computeRiasecScores: null until complete, then per-type 0–100 means", () => {
  const items = getStaticRiasecItems();
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

test("career journey: 7 questions; answers trimmed and capped at 400 chars", () => {
  assert.equal(CAREER_JOURNEY_QUESTIONS.length, 7);
  assert.equal(validateCareerJourneyAnswer(CAREER_JOURNEY_QUESTIONS[0].id, "  BSc  "), "BSc");
  assert.throws(() => validateCareerJourneyAnswer("nope", "x"), /Unknown/);
  assert.throws(() => validateCareerJourneyAnswer(CAREER_JOURNEY_QUESTIONS[0].id, ""), /empty/);
  assert.equal(
    validateCareerJourneyAnswer(CAREER_JOURNEY_QUESTIONS[0].id, "x".repeat(1000)).length,
    400
  );
});

test("demographics include city as the 4th question", () => {
  assert.deepEqual(DEMOGRAPHIC_QUESTIONS.map((q) => q.id), ["sex", "age", "country", "city"]);
});
