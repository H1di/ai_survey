const test = require("node:test");
const assert = require("node:assert/strict");

const {
  serializeRiasecItem,
  validateRiasecAnswer,
  computeRiasecScores,
  deriveRiasecCode,
  validateJobCharRanking,
  rankToJobCharTargets,
  validateCareerJourneyAnswer,
} = require("../questionEngine");
const {
  DEMOGRAPHIC_QUESTIONS,
  JOB_CHAR_PARAM_IDS,
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

test("rankToJobCharTargets: strictly descending 0-100 targets in ranking order", () => {
  const ranking = [...JOB_CHAR_PARAM_IDS];
  const profile = rankToJobCharTargets(ranking);

  assert.deepEqual(Object.keys(profile).sort(), [...ranking].sort(), "every param gets a target");
  const targets = ranking.map((p) => profile[p]);
  assert.equal(targets[0], 90, "top rank sits at the high anchor");
  assert.equal(targets[targets.length - 1], 25, "last rank sits at the low anchor");
  for (const t of targets) {
    assert.ok(Number.isInteger(t) && t >= 0 && t <= 100, "targets are integers inside 0-100");
  }
  for (let i = 1; i < targets.length; i += 1) {
    assert.ok(targets[i] < targets[i - 1], "each rank scores below the one above it");
  }
});

test("rankToJobCharTargets follows the order, not the param identity", () => {
  const reversed = [...JOB_CHAR_PARAM_IDS].reverse();
  const profile = rankToJobCharTargets(reversed);
  assert.equal(profile[reversed[0]], 90);
  assert.equal(profile[JOB_CHAR_PARAM_IDS[0]], 25, "a param ranked last lands on the low anchor");
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
