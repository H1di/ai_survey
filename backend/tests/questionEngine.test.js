const test = require("node:test");
const assert = require("node:assert/strict");

const {
  serializeRiasecItem,
  validateRiasecAnswer,
  computeRiasecScores,
  deriveRiasecCode,
  validateJobCharRanking,
  validateJobCharAnswer,
  computeJobCharProfile,
  validateCareerJourneyAnswer,
} = require("../questionEngine");
const {
  DEMOGRAPHIC_QUESTIONS,
  JOB_CHAR_PARAM_IDS,
  selectFallbackJobCharQuestions,
  CAREER_JOURNEY_QUESTIONS,
} = require("../questionPool");
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

test("validateJobCharRanking accepts only a permutation of all 7 params", () => {
  const ok = [...JOB_CHAR_PARAM_IDS].reverse();
  assert.deepEqual(validateJobCharRanking(ok), ok);
  assert.throws(() => validateJobCharRanking(JOB_CHAR_PARAM_IDS.slice(0, 6)), /all 7/);
  assert.throws(() => validateJobCharRanking([...JOB_CHAR_PARAM_IDS.slice(0, 6), "salary"]), /all 7/);
  assert.throws(
    () => validateJobCharRanking([JOB_CHAR_PARAM_IDS[0], ...JOB_CHAR_PARAM_IDS.slice(0, 6)]),
    /all 7/
  );
});

test("fallback jobChar questions follow ranking order and depth weighting", () => {
  const ranking = [...JOB_CHAR_PARAM_IDS];
  const five = selectFallbackJobCharQuestions(ranking, 5);
  assert.equal(five.length, 5);
  assert.deepEqual(five.map((q) => q.param), ranking.slice(0, 5));
  const ten = selectFallbackJobCharQuestions(ranking, 10);
  assert.equal(ten.length, 10);
  // top-3 params get 2 questions each, the remaining 4 get 1
  for (const p of ranking.slice(0, 3)) assert.equal(ten.filter((q) => q.param === p).length, 2);
  for (const p of ranking.slice(3)) assert.equal(ten.filter((q) => q.param === p).length, 1);
  assert.deepEqual(ten.map((q) => q.id), ten.map((_, n) => `jc_${n + 1}`));
  for (const q of ten) {
    assert.ok(q.options.length >= 3 && q.options.length <= 4);
    for (const o of q.options) assert.ok(o.value >= 0 && o.value <= 100 && o.label);
  }
});

test("validateJobCharAnswer only accepts one of the item's option values", () => {
  const items = selectFallbackJobCharQuestions([...JOB_CHAR_PARAM_IDS], 5);
  const session = { jobCharItems: items, jobCharAnswers: {} };
  const legal = items[0].options[0].value;
  assert.equal(validateJobCharAnswer(session, items[0].id, legal), legal);
  assert.throws(() => validateJobCharAnswer(session, items[0].id, 42.5), /option/);
  assert.throws(() => validateJobCharAnswer(session, "jc_99", legal), /Unknown/);
});

test("computeJobCharProfile: null until complete, then per-param means with 50 default", () => {
  const ranking = [...JOB_CHAR_PARAM_IDS];
  const items = selectFallbackJobCharQuestions(ranking, 5);
  const session = { jobCharItems: items, jobCharAnswers: {} };
  assert.equal(computeJobCharProfile(session).profile, null);
  for (const item of items) session.jobCharAnswers[item.id] = item.options[0].value;
  const { profile } = computeJobCharProfile(session);
  for (const p of ranking.slice(0, 5)) {
    const item = items.find((i) => i.param === p);
    assert.equal(profile[p], item.options[0].value);
  }
  for (const p of ranking.slice(5)) assert.equal(profile[p], 50, "unasked params default to 50");
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
