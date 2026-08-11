process.env.NODE_ENV = "test";
process.env.OPENAI_API_KEY = "";

const test = require("node:test");
const assert = require("node:assert/strict");
const { SessionStore } = require("../sessionStore");
const { createAiEngine } = require("../aiEngine");
const { DEV_PROFILE, seedTo } = require("../devSeed");
const { WORK_VALUES_ORDER } = require("../workValues");
const { JOB_CHAR_PARAM_IDS } = require("../questionPool");

const aiEngine = createAiEngine({ apiKey: undefined, model: "test" });

function freshSession() {
  const store = new SessionStore();
  const session = store.createSession({ dreamAnswer: DEV_PROFILE.dreamAnswer });
  return { store, session };
}

test("DEV_PROFILE answers every item of every instrument", () => {
  assert.equal(Object.keys(DEV_PROFILE.bigFive).length, 20);
  assert.equal(Object.keys(DEV_PROFILE.riasec).length, 12);
  assert.equal(Object.keys(DEV_PROFILE.careerJourney).length, 7);
  assert.deepEqual([...DEV_PROFILE.valuesOrder].sort(), [...WORK_VALUES_ORDER].sort());
  assert.deepEqual([...DEV_PROFILE.jobCharRanking].sort(), [...JOB_CHAR_PARAM_IDS].sort());
});

test("the fixed profile scores to the documented persona", async () => {
  const { store, session } = freshSession();
  await seedTo(session, "tree", { store, aiEngine });

  assert.deepEqual(session.bigFiveScores, { O: 94, C: 75, E: 44, A: 75, N: 25 });
  assert.deepEqual(session.riasecScores, { R: 13, I: 100, A: 88, S: 50, E: 63, C: 38 });
  assert.equal(session.riasecCode, "IAE");
});

test("seeding to tree leaves everything the output engine needs", async () => {
  const { store, session } = freshSession();
  await seedTo(session, "tree", { store, aiEngine });

  assert.equal(session.step, "tree");
  assert.ok(session.riasecScores, "riasecScores");
  assert.ok(session.jobCharProfile, "jobCharProfile");
  assert.equal(session.userValues.source, "tournament");
  assert.equal(session.userValues.confidence, "explicit");
  assert.equal(session.valuesTournament, null, "finished tournament must be cleared");
  assert.ok(session.personaSummary, "personaSummary");
  for (const param of JOB_CHAR_PARAM_IDS) {
    assert.equal(typeof session.jobCharProfile[param], "number", param);
  }
});

test("seeding stops exactly at the requested step", async () => {
  for (const target of ["big_five", "riasec", "values", "job_characteristics", "cv", "summary"]) {
    const { store, session } = freshSession();
    await seedTo(session, target, { store, aiEngine });
    assert.equal(session.step, target, `target ${target}`);
  }
});

test("the targeted step itself is left for the user to do", async () => {
  const { store, session } = freshSession();
  await seedTo(session, "riasec", { store, aiEngine });
  // Only steps strictly before the target are filled, so the RIASEC instrument
  // is neither seeded nor answered — the frontend's start effect handles it,
  // exactly as in the real flow.
  assert.deepEqual(session.riasecAnswers, {});
  assert.equal(session.riasecScores, null);
  assert.deepEqual(session.riasecItems, []);
});

test("forward-fill preserves real answers already recorded", async () => {
  const { store, session } = freshSession();
  store.setDemographicAnswer(session, "city", "Lisbon");
  store.setDemographicAnswer(session, "country", "Portugal");

  await seedTo(session, "summary", { store, aiEngine });

  assert.equal(session.demographics.city, "Lisbon");
  assert.equal(session.demographics.country, "Portugal");
  assert.equal(session.demographics.age, DEV_PROFILE.demographics.age, "gaps still filled");
});

test("a backward target is rejected with a 400-tagged error", async () => {
  const { store, session } = freshSession();
  await seedTo(session, "cv", { store, aiEngine });

  await assert.rejects(
    () => seedTo(session, "riasec", { store, aiEngine }),
    (error) => error.statusCode === 400
  );
});

test("seeding is idempotent — re-seeding the same target changes nothing", async () => {
  const { store, session } = freshSession();
  await seedTo(session, "summary", { store, aiEngine });
  const before = JSON.stringify(session.bigFiveAnswers);

  await seedTo(session, "summary", { store, aiEngine });
  assert.equal(JSON.stringify(session.bigFiveAnswers), before);
  assert.equal(session.step, "summary");
});
