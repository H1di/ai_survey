// Dev-only session seeder. Fills the assessment forward with one fixed profile
// so a developer can land on a late screen without answering ~55 questions.
//
// Every filler closes its step through the SAME store mutators, validators, and
// scoring functions the real route uses. That is deliberate: this module must
// never become a second implementation of the machine. The route tests seed to
// `tree` and then call the real /api/output/first — if a filler drifts from its
// route, that test is what catches it.

const { STEP_ORDER } = require("./sessionStore");
const { getStaticRiasecItems } = require("./riasecItems");
const {
  validateDemographicAnswer,
  validateBigFiveAnswer,
  validateRiasecAnswer,
  validateCareerJourneyAnswer,
  computeBigFiveScores,
  deriveBigFiveTraits,
  computeRiasecScores,
  deriveRiasecCode,
} = require("./questionEngine");
const { rankToWorkValueScores, WORK_VALUE_CURVE_VERSION } = require("./workValues");

// One fixed persona: Investigative-Artistic, high Openness, low Neuroticism.
// Fixed rather than random so a bug reproduces and two runs are comparable.
// Scores to O 94 / C 75 / E 44 / A 75 / N 25 and RIASEC code IAE — asserted in
// tests/devSeed.test.js, so a change to the scoring curves surfaces there
// instead of silently becoming a different person.
const DEV_PROFILE = Object.freeze({
  dreamAnswer:
    "I want to build things that explain complex systems to people — research, writing, and design in one job.",
  // "prefer_not" is the neutral value and exercises the withheld-sex branch in
  // the prompt digest.
  demographics: { sex: "prefer_not", age: 29, country: "Germany", city: "Berlin" },
  bigFive: {
    mip_1: 2, mip_2: 4, mip_3: 4, mip_4: 2, mip_5: 5,
    mip_6: 3, mip_7: 2, mip_8: 4, mip_9: 4, mip_10: 1,
    mip_11: 3, mip_12: 4, mip_13: 2, mip_14: 2, mip_15: 1,
    mip_16: 3, mip_17: 2, mip_18: 2, mip_19: 4, mip_20: 2,
  },
  riasec: {
    ri_1: 2, ri_2: 5, ri_3: 5, ri_4: 3, ri_5: 4, ri_6: 2,
    ri_7: 1, ri_8: 5, ri_9: 4, ri_10: 3, ri_11: 3, ri_12: 3,
  },
  valuesOrder: [
    "independence",
    "achievement",
    "working_conditions",
    "relationships",
    "recognition",
    "support",
  ],
  careerJourney: {
    cj_education: "BSc in physics, finished",
    cj_role: "Data analyst at a logistics company",
    cj_skills: "Statistics, explaining hard ideas simply, writing",
    cj_liked: "Loved digging into messy data; hated status meetings",
    cj_constraint: "Need to keep earning — no long unpaid break",
    cj_horizon: "Within two years",
    cj_retrain: "Willing, if it builds on what I already know",
  },
});

// One filler per step, mirroring that step's route completion branch.
// `tree` is terminal: it is a target, never a thing to fill.
const FILLERS = {
  demographics(session, { store }) {
    for (const [questionId, value] of Object.entries(DEV_PROFILE.demographics)) {
      if (session.demographics[questionId] !== undefined) continue;
      store.setDemographicAnswer(session, questionId, validateDemographicAnswer(questionId, value));
    }
    store.advanceStep(session, "big_five");
  },

  big_five(session, { store }) {
    for (const item of session.bigFiveItems) {
      if (session.bigFiveAnswers[item.id] !== undefined) continue;
      const raw = DEV_PROFILE.bigFive[item.id];
      store.recordBigFiveAnswer(session, item.id, validateBigFiveAnswer(session, item.id, raw));
    }
    const scores = computeBigFiveScores(session);
    store.setBigFiveScores(session, scores, deriveBigFiveTraits(scores));
    store.advanceStep(session, "riasec");
  },

  riasec(session, { store }) {
    // setRiasecItems clears any recorded answers, so it must run first and only
    // when the instrument is not already seeded.
    if (!session.riasecItems.length) store.setRiasecItems(session, getStaticRiasecItems());
    for (const item of session.riasecItems) {
      if (session.riasecAnswers[item.id] !== undefined) continue;
      const raw = DEV_PROFILE.riasec[item.id];
      store.recordRiasecAnswer(session, item.id, validateRiasecAnswer(session, item.id, raw));
    }
    const { scores } = computeRiasecScores(session);
    store.setRiasecScores(session, scores, deriveRiasecCode(scores));
    store.advanceStep(session, "values");
  },

  values(session, { store }) {
    const order = DEV_PROFILE.valuesOrder;
    store.finalizeValues(session, {
      scores: rankToWorkValueScores(order),
      order,
      curveVersion: WORK_VALUE_CURVE_VERSION,
      nextStep: "cv",
    });
  },

  // Closed through the career-journey path rather than a CV upload: no file
  // parsing, and it works without an API key.
  async cv(session, { store, aiEngine }) {
    if (!session.cvIntent) store.setCvIntent(session, "new");
    for (const [questionId, value] of Object.entries(DEV_PROFILE.careerJourney)) {
      if (session.careerJourneyAnswers[questionId] !== undefined) continue;
      store.recordCareerJourneyAnswer(
        session,
        questionId,
        validateCareerJourneyAnswer(questionId, value)
      );
    }
    store.setPersonaSummary(session, await aiEngine.generatePersonaSummary({ session }));
    store.advanceStep(session, "summary");
  },

  summary(session, { store }) {
    store.advanceStep(session, "tree");
  },
};

function httpErr(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// Closes every unfinished step strictly before `targetStep`. Steps already
// completed are skipped, which is what makes forward-fill preserve real answers.
async function seedTo(session, targetStep, { store, aiEngine }) {
  const targetIndex = STEP_ORDER.indexOf(targetStep);
  if (targetIndex === -1) throw httpErr(400, "Unknown step.");

  const startIndex = STEP_ORDER.indexOf(session.step);
  if (targetIndex < startIndex) {
    throw httpErr(400, "Target step is behind the session — seed a fresh session instead.");
  }

  for (let i = startIndex; i < targetIndex; i += 1) {
    await FILLERS[STEP_ORDER[i]](session, { store, aiEngine });
  }
  return session;
}

module.exports = { DEV_PROFILE, FILLERS, seedTo };
