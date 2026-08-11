const test = require("node:test");
const assert = require("node:assert/strict");
const { SessionStore, STEP_ORDER } = require("../sessionStore");

function makeSession(store) {
  return store.createSession({ dreamAnswer: "build things" });
}

test("createSession initializes v2 + output-loop fields; old models gone", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  // Page 1/2 fields intact
  assert.equal(s.dreamAnswer, "build things");
  assert.equal(s.schemaVersion, 3);
  assert.equal(s.valuesTournament, null);
  assert.equal(s.step, "demographics");
  assert.deepEqual(s.demographics, {});
  assert.deepEqual(s.bigFiveAnswers, {});
  // v2 assessment fields
  assert.equal(s.cvIntent, null, "intent arrives at the cv step now");
  assert.equal(s.cvText, null);
  assert.equal(s.cvAnalysis, null);
  assert.deepEqual(s.riasecItems, []);
  assert.deepEqual(s.riasecAnswers, {});
  assert.equal(s.riasecScores, null);
  assert.equal(s.riasecCode, null);
  assert.equal(s.riasecInferred, false);
  assert.equal(s.jobCharRanking, null);
  assert.equal(s.jobCharProfile, null);
  assert.equal(s.jobCharCurveVersion, null);
  assert.deepEqual(s.careerJourneyAnswers, {});
  assert.equal(s.userValues, null);
  // Output loop
  assert.equal(s.pathStage, "output");
  assert.deepEqual(s.outputs, []);
  assert.equal(s.acceptedOutputId, null);
  assert.deepEqual(s.refinementHistory, []);
  assert.deepEqual(s.roadmaps, {});
  // Old models gone
  assert.equal("whyHereAnswer" in s, false);
  assert.equal("valuesAnswers" in s, false);
  assert.equal("valuesScores" in s, false);
  assert.equal("directionQuestions" in s, false);
  assert.equal("proposedDirection" in s, false);
  assert.equal("direction" in s, false);
  assert.equal("narrowingQuestions" in s, false);
  assert.equal("professionOptions" in s, false);
  assert.equal("selectedProfession" in s, false);
  assert.equal("rejectedDirections" in s, false);
  assert.equal("branches" in s, false);
});

test("appendOutput chains ids and parent links; recordRefinement logs the trail", () => {
  const store = new SessionStore();
  const s = makeSession(store);

  const first = store.appendOutput(s, { jobTitle: "A", orientedField: "F" });
  assert.equal(first.id, "output_1");
  assert.equal(first.parentId, null);
  assert.equal(s.pathStage, "output");

  const second = store.appendOutput(s, { jobTitle: "B", orientedField: "F" });
  assert.equal(second.id, "output_2");
  assert.equal(second.parentId, "output_1");

  store.recordRefinement(s, {
    fromOutputId: "output_1",
    notSuitable: false,
    changedParams: [{ param: "compensation", reason: "more" }],
    toOutputId: "output_2",
  });
  assert.equal(s.refinementHistory.length, 1);
  assert.equal(s.refinementHistory[0].toOutputId, "output_2");
});

test("acceptOutput marks the output, stores detail, and flips pathStage", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  store.appendOutput(s, { jobTitle: "A", orientedField: "F" });
  const detail = { aiRecommendations: [], events: [], universities: [], courses: [] };

  store.acceptOutput(s, "output_1", detail);
  assert.equal(s.acceptedOutputId, "output_1");
  assert.equal(s.pathStage, "detail");
  assert.equal(s.outputs[0].accepted, true);
  assert.deepEqual(s.outputs[0].detail, detail);
});

test("setRoadmap keys by outputId and keeps earlier roadmaps", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  store.setRoadmap(s, { professionId: "output_1", stages: [{ id: "stage_1", title: "t", description: "d", timeframe: "", milestone: "" }] });
  assert.equal(s.roadmaps.output_1.professionId, "output_1");
  assert.equal(s.pathStage, "output", "setRoadmap no longer mutates pathStage");
});

test("serializeSessionState exposes the output loop and hides the direction era", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  store.appendOutput(s, { jobTitle: "A", orientedField: "F" });
  const snapshot = store.serializeSessionState(s, { done: false }, {}, { includeStatic: true });

  assert.equal(snapshot.pathStage, "output");
  assert.equal(snapshot.outputs.length, 1);
  assert.equal(snapshot.acceptedOutputId, null);
  assert.deepEqual(snapshot.refinementHistory, []);
  assert.deepEqual(snapshot.roadmaps, {});
  assert.equal("directionQuestions" in snapshot, false);
  assert.equal("directionCatalog" in snapshot, false);
  assert.equal("refineReasons" in snapshot, false);
  assert.equal("professionOptions" in snapshot, false);
  assert.equal("rejectedDirections" in snapshot, false);
  // Page 2 surface intact
  assert.equal(snapshot.step, "demographics");
  assert.ok(snapshot.progress);
  assert.ok(snapshot.summary !== undefined);
});

test("serializeSessionState exposes question lists and answers for back-navigation", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  store.recordBigFiveAnswer(s, "mip_1", 4);
  store.setDemographicAnswer(s, "sex", "female");

  const snapshot = store.serializeSessionState(s, { done: false }, {}, { includeStatic: true });

  assert.equal(snapshot.demographicQuestions.length, 4);
  for (const q of snapshot.demographicQuestions) {
    assert.ok(q.id && q.kind && q.question);
  }
  assert.deepEqual(snapshot.demographics, { sex: "female" });

  // Static items are seeded at creation; only id/text serialize —
  // trait/reverse stay server-side.
  assert.equal(snapshot.bigFiveItems.length, 20);
  assert.deepEqual(snapshot.bigFiveItems[0], { id: "mip_1", text: "I am the life of the party." });
  assert.deepEqual(snapshot.bigFiveAnswers, { mip_1: 4 });
  assert.equal("bigFiveDepth" in snapshot, false, "depth field removed");

  assert.equal("valuesQuestions" in snapshot, false, "values bank is gone");
  assert.equal("valuesAnswers" in snapshot, false);
});

test("createSession initializes v2 fields and serialization exposes them", () => {
  const store = new SessionStore();
  const session = store.createSession({ dreamAnswer: "x" });
  assert.equal(session.step, "demographics");
  assert.equal(session.cvIntent, null);

  const snap = store.serializeSessionState(session, {}, {}, { includeStatic: true });
  assert.ok(Array.isArray(snap.careerJourneyQuestions) && snap.careerJourneyQuestions.length === 7);
  assert.equal(snap.jobCharParams.length, 7);
  assert.equal(snap.valuesQuestions, undefined, "values bank is gone");
  assert.equal(snap.cvProvided, false);

  const trimmed = store.serializeSessionState(session, {}, {}, { includeStatic: false });
  assert.equal(trimmed.careerJourneyQuestions, undefined);
  assert.ok("riasecAnswers" in trimmed, "dynamic riasec state always travels");
  assert.ok("jobCharProfile" in trimmed, "jobChar targets travel on every snapshot");
  assert.equal(trimmed.jobCharItems, undefined, "the tradeoff battery is gone");
  assert.ok("outputs" in trimmed, "outputs travel on every snapshot");
});

test("riasec items serialize without the scoring type", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  store.setRiasecItems(s, [{ id: "ri_1", type: "R", text: "Fixing things" }]);
  const snap = store.serializeSessionState(s, {}, {}, { includeStatic: true });
  assert.deepEqual(snap.riasecItems, [{ id: "ri_1", text: "Fixing things" }]);
});

test("v2 mutators: riasec, jobChar, cv, journey", () => {
  const store = new SessionStore();
  const s = makeSession(store);

  store.setRiasecItems(s, [{ id: "ri_1", type: "R", text: "x" }]);
  store.recordRiasecAnswer(s, "ri_1", 5);
  assert.equal(s.riasecAnswers.ri_1, 5);

  store.setCvIntent(s, "use_skills");
  assert.equal(s.cvIntent, "use_skills");
  store.setRiasecScores(s, { R: 100, I: 0, A: 0, S: 0, E: 0, C: 0 }, "RIA", { inferred: true });
  assert.equal(s.riasecCode, "RIA");
  assert.equal(s.riasecInferred, true);
  // re-setting items resets downstream riasec state
  store.setRiasecItems(s, [{ id: "ri_1", type: "R", text: "y" }]);
  assert.deepEqual(s.riasecAnswers, {});
  assert.equal(s.riasecScores, null);
  assert.equal(s.riasecInferred, false);

  store.finalizeJobChar(s, {
    ranking: ["social"],
    profile: { social: 90 },
    curveVersion: 1,
    nextStep: "cv",
  });
  assert.deepEqual(s.jobCharRanking, ["social"]);
  assert.equal(s.jobCharProfile.social, 90);
  assert.equal(s.jobCharCurveVersion, 1);
  assert.equal(s.step, "cv", "the ranking is the whole step");

  store.setCvAnalysis(s, "raw cv", { skills: ["a"], domains: [], seniority: "mid" });
  assert.equal(s.cvText, "raw cv");
  store.recordCareerJourneyAnswer(s, "cj_education", "BSc");
  assert.equal(s.careerJourneyAnswers.cj_education, "BSc");
});

test("finalizeValues stores the hierarchy, clears the tournament, and advances", () => {
  const { startTournament } = require("../valuesTournament");
  const { WORK_VALUES_ORDER } = require("../workValues");
  const store = new SessionStore();
  const s = makeSession(store);
  store.setValuesTournament(s, startTournament(WORK_VALUES_ORDER));
  s.step = "values";
  assert.equal(s.userValues, null);

  const order = ["achievement", "independence", "recognition", "relationships", "support", "working_conditions"];
  const scores = { achievement: 100, independence: 84, recognition: 68, relationships: 52, support: 36, working_conditions: 20 };
  store.finalizeValues(s, { order, scores, curveVersion: 1, nextStep: "job_characteristics" });

  assert.deepEqual(s.userValues, {
    scores,
    order,
    source: "tournament",
    confidence: "explicit",
    curveVersion: 1,
  });
  assert.equal(s.valuesTournament, null, "finished tournament is dropped");
  assert.equal(s.step, "job_characteristics", "step advanced");

  const trimmed = store.serializeSessionState(s, {}, {}, { includeStatic: false });
  assert.deepEqual(trimmed.userValues.scores, scores, "userValues travels in the dynamic part");
  assert.equal(trimmed.userValuesAxes, undefined, "Schwartz plane point is gone");
  assert.equal(trimmed.valuesComparison, null, "no pending comparison after confirm");
  assert.equal(trimmed.valuesRanking, null, "no lingering ranking after confirm");
});

test("valuesComparison serializes the pending pairwise question", () => {
  const { startTournament } = require("../valuesTournament");
  const { WORK_VALUES_ORDER } = require("../workValues");
  const store = new SessionStore();
  const s = makeSession(store);
  store.setValuesTournament(s, startTournament(WORK_VALUES_ORDER));
  const snap = store.serializeSessionState(s, {}, {}, { includeStatic: false });
  assert.ok(snap.valuesComparison && snap.valuesComparison.comparisonId, "pending comparison exposed");
  assert.ok(WORK_VALUES_ORDER.includes(snap.valuesComparison.a));
  assert.ok(WORK_VALUES_ORDER.includes(snap.valuesComparison.b));
});

test("old branch/theme methods are gone", () => {
  const store = new SessionStore();
  for (const gone of ["unlockTheme", "isThemeUnlocked", "hasBranchForTheme", "getBranch", "createBranch", "appendNode", "setDirectionQuestions", "confirmDirection", "setProfessionOptions", "selectProfession", "rejectProposedDirection"]) {
    assert.equal(store[gone], undefined, `${gone} should be removed`);
  }
});

test("evictExpired removes sessions older than ttl and keeps fresh ones", () => {
  const store = new SessionStore({ ttlMs: 1000 });
  const stale = makeSession(store);
  const fresh = makeSession(store);

  stale.updatedAt = new Date(Date.now() - 5000).toISOString();

  const evicted = store.evictExpired();
  assert.equal(evicted, 1);
  assert.equal(store.get(stale.id), null);
  assert.equal(store.get(fresh.id), fresh);
});

test("touch resets the eviction clock", () => {
  const store = new SessionStore({ ttlMs: 1000 });
  const s = makeSession(store);
  s.updatedAt = new Date(Date.now() - 5000).toISOString();

  store.touch(s);

  assert.equal(store.evictExpired(), 0);
  assert.equal(store.get(s.id), s);
});

test("startSweep/stopSweep are idempotent and unref'd", () => {
  const store = new SessionStore({ ttlMs: 1000, sweepIntervalMs: 50 });
  store.startSweep();
  const timer = store.sweepTimer;
  store.startSweep();
  assert.equal(store.sweepTimer, timer, "second start must not replace the timer");
  store.stopSweep();
  assert.equal(store.sweepTimer, null);
  store.stopSweep();
});

// Minimal Upstash-shaped fake: string values, EX ignored, one-shot SCAN.
class FakeRedis {
  constructor() {
    this.store = new Map();
  }
  async set(key, value) {
    this.store.set(key, value);
    return "OK";
  }
  async get(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  async del(key) {
    return this.store.delete(key) ? 1 : 0;
  }
  async scan(_cursor, _opts) {
    return ["0", [...this.store.keys()]];
  }
}

test("with redis: createSession and touch write the session through", () => {
  const redis = new FakeRedis();
  const store = new SessionStore({ redis });
  const s = makeSession(store);

  // _persist is synchronous into the fake (no await point before store.set).
  const raw = redis.store.get(`session:${s.id}`);
  assert.equal(typeof raw, "string");
  assert.equal(JSON.parse(raw).id, s.id);

  store.advanceStep(s, "big_five"); // mutator → touch → persist
  assert.equal(JSON.parse(redis.store.get(`session:${s.id}`)).step, "big_five");
});

test("with redis: finalizeValues persists exactly ONE write with the tournament cleared", () => {
  const { startTournament } = require("../valuesTournament");
  const { WORK_VALUES_ORDER } = require("../workValues");
  const redis = new FakeRedis();
  let sets = 0;
  const origSet = redis.set.bind(redis);
  redis.set = (k, v, o) => {
    sets += 1;
    return origSet(k, v, o);
  };
  const store = new SessionStore({ redis });
  const s = makeSession(store);
  store.setValuesTournament(s, startTournament(WORK_VALUES_ORDER));
  s.step = "values";

  const scores = { achievement: 100, independence: 84, recognition: 68, relationships: 52, support: 36, working_conditions: 20 };
  sets = 0; // count only the confirm write, not the setup mutations
  store.finalizeValues(s, {
    order: [...WORK_VALUES_ORDER],
    scores,
    curveVersion: 1,
    nextStep: "job_characteristics",
  });

  // A separate clear-tournament mutator would be a second fire-and-forget write
  // that could land out of order and resurrect the tournament on hydrate.
  assert.equal(sets, 1, "confirm persists exactly one whole-session write");
  const persisted = JSON.parse(redis.store.get(`session:${s.id}`));
  assert.equal(persisted.valuesTournament, null, "persisted snapshot has no tournament");
  assert.equal(persisted.step, "job_characteristics");
  assert.deepEqual(persisted.userValues.scores, scores);
});

test("with redis: hydrate reloads durable sessions into a fresh store's Map", async () => {
  const redis = new FakeRedis();
  const writer = new SessionStore({ redis });
  const a = makeSession(writer);
  const b = makeSession(writer);
  writer.advanceStep(b, "big_five");

  const reader = new SessionStore({ redis });
  assert.equal(reader.get(a.id), null, "fresh store starts empty");
  const loaded = await reader.hydrate();

  assert.equal(loaded, 2);
  assert.equal(reader.get(a.id).id, a.id);
  assert.equal(reader.require(b.id).step, "big_five");
});

test("with redis: eviction removes the durable copy too", () => {
  const redis = new FakeRedis();
  const store = new SessionStore({ redis, ttlMs: 1000 });
  const s = makeSession(store);
  s.updatedAt = new Date(Date.now() - 5000).toISOString();

  assert.equal(store.evictExpired(), 1);
  assert.equal(redis.store.has(`session:${s.id}`), false);
});

test("without redis: persistence hooks are inert no-ops", async () => {
  const store = new SessionStore();
  const s = makeSession(store);
  store.touch(s);
  assert.equal(await store.hydrate(), 0);
});

test("furthestStep starts at demographics and rises with each advance", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  assert.equal(s.furthestStep, "demographics");

  store.advanceStep(s, "big_five");
  assert.equal(s.furthestStep, "big_five");

  store.finalizeValues(s, {
    scores: {}, order: [], curveVersion: 1, nextStep: "job_characteristics",
  });
  assert.equal(s.furthestStep, "job_characteristics");

  store.finalizeJobChar(s, { ranking: [], profile: {}, curveVersion: 1, nextStep: "cv" });
  assert.equal(s.furthestStep, "cv");
});

test("gotoStep moves the step back without lowering the mark or touching data", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  store.advanceStep(s, "big_five");
  store.recordBigFiveAnswer(s, "mip_1", 4);
  store.advanceStep(s, "riasec");

  store.gotoStep(s, "big_five");

  assert.equal(s.step, "big_five");
  assert.equal(s.furthestStep, "riasec", "the mark never falls");
  assert.equal(s.bigFiveAnswers.mip_1, 4, "answers survive");
});

test("advancing to a step behind the mark does not lower it", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  store.advanceStep(s, "cv");
  store.gotoStep(s, "riasec");
  store.advanceStep(s, "values");

  assert.equal(s.furthestStep, "cv");
});

test("gotoStep rejects a step outside STEP_ORDER", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  assert.throws(() => store.gotoStep(s, "nope"), /Unknown session step: nope/);
});

test("a session without furthestStep (pre-change shape) reads through to step", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  store.advanceStep(s, "riasec");
  delete s.furthestStep;

  // The fallback must treat the current step as the mark, so a later advance
  // still raises it rather than starting from undefined.
  store.advanceStep(s, "values");
  assert.equal(s.furthestStep, "values");

  const snapshot = store.serializeSessionState(s, null, null, { includeStatic: false });
  assert.equal(snapshot.furthestStep, "values");
});

test("STEP_ORDER is the assessment machine in order", () => {
  assert.deepEqual(STEP_ORDER, [
    "demographics",
    "big_five",
    "riasec",
    "values",
    "job_characteristics",
    "cv",
    "summary",
    "tree",
  ]);
});

test("step writes reject a step outside STEP_ORDER", () => {
  const store = new SessionStore();
  const s = makeSession(store);

  assert.throws(() => store.advanceStep(s, "big_fvie"), /Unknown session step: big_fvie/);
  assert.throws(
    () => store.finalizeValues(s, { scores: {}, order: [], curveVersion: 1, nextStep: "nope" }),
    /Unknown session step: nope/
  );
  assert.throws(
    () => store.finalizeJobChar(s, { ranking: [], profile: {}, curveVersion: 1, nextStep: "nope" }),
    /Unknown session step: nope/
  );
  // A rejected write must not have moved the session.
  assert.equal(s.step, "demographics");
});

test("every real transition is accepted", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  for (const step of STEP_ORDER) {
    store.advanceStep(s, step);
    assert.equal(s.step, step);
  }
});
