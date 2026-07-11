const test = require("node:test");
const assert = require("node:assert/strict");
const { SessionStore } = require("../sessionStore");

function makeSession(store) {
  return store.createSession({ entryChoice: "find", dreamAnswer: "build things", cvIntent: "new" });
}

test("createSession initializes v2 + output-loop fields; old models gone", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  // Page 1/2 fields intact
  assert.equal(s.entryChoice, "find");
  assert.equal(s.dreamAnswer, "build things");
  assert.equal(s.step, "demographics");
  assert.deepEqual(s.demographics, {});
  assert.deepEqual(s.bigFiveAnswers, {});
  // v2 assessment fields
  assert.equal(s.cvIntent, "new");
  assert.equal(s.cvText, null);
  assert.equal(s.cvAnalysis, null);
  assert.deepEqual(s.riasecItems, []);
  assert.deepEqual(s.riasecAnswers, {});
  assert.equal(s.riasecScores, null);
  assert.equal(s.riasecCode, null);
  assert.equal(s.riasecInferred, false);
  assert.equal(s.jobCharRanking, null);
  assert.equal(s.jobCharDepth, null);
  assert.deepEqual(s.jobCharItems, []);
  assert.deepEqual(s.jobCharAnswers, {});
  assert.equal(s.jobCharProfile, null);
  assert.deepEqual(s.careerJourneyAnswers, {});
  assert.equal(s.userValues, null);
  // Output loop
  assert.equal(s.pathStage, "output");
  assert.deepEqual(s.outputs, []);
  assert.equal(s.acceptedOutputId, null);
  assert.deepEqual(s.refinementHistory, []);
  assert.deepEqual(s.roadmaps, {});
  // Old models gone
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
  store.setBigFiveDepthAndItems(s, "short", [
    { id: "bf1", text: "Item one", trait: "O", reverse: true },
  ]);
  store.recordBigFiveAnswer(s, "bf1", 4);
  store.setDemographicAnswer(s, "sex", "female");

  const snapshot = store.serializeSessionState(s, { done: false }, {}, { includeStatic: true });

  assert.equal(snapshot.demographicQuestions.length, 4);
  for (const q of snapshot.demographicQuestions) {
    assert.ok(q.id && q.kind && q.question);
  }
  assert.deepEqual(snapshot.demographics, { sex: "female" });

  // Big Five items expose only id/text — trait/reverse stay server-side.
  assert.deepEqual(snapshot.bigFiveItems, [{ id: "bf1", text: "Item one" }]);
  assert.deepEqual(snapshot.bigFiveAnswers, { bf1: 4 });

  assert.equal("valuesQuestions" in snapshot, false, "values bank is gone");
  assert.equal("valuesAnswers" in snapshot, false);
});

test("createSession initializes v2 fields and serialization exposes them", () => {
  const store = new SessionStore();
  const session = store.createSession({ entryChoice: "find", dreamAnswer: "x", cvIntent: "use_skills" });
  assert.equal(session.step, "demographics");
  assert.equal(session.cvIntent, "use_skills");

  const snap = store.serializeSessionState(session, {}, {}, { includeStatic: true });
  assert.ok(Array.isArray(snap.careerJourneyQuestions) && snap.careerJourneyQuestions.length === 7);
  assert.equal(snap.jobCharParams.length, 7);
  assert.equal(snap.valuesQuestions, undefined, "values bank is gone");
  assert.equal(snap.cvProvided, false);

  const trimmed = store.serializeSessionState(session, {}, {}, { includeStatic: false });
  assert.equal(trimmed.careerJourneyQuestions, undefined);
  assert.ok("riasecAnswers" in trimmed, "dynamic riasec state always travels");
  assert.ok("jobCharItems" in trimmed, "jobChar items travel on every snapshot");
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
  store.setRiasecScores(s, { R: 100, I: 0, A: 0, S: 0, E: 0, C: 0 }, "RIA", { inferred: true });
  assert.equal(s.riasecCode, "RIA");
  assert.equal(s.riasecInferred, true);
  // re-setting items resets downstream riasec state
  store.setRiasecItems(s, [{ id: "ri_1", type: "R", text: "y" }]);
  assert.deepEqual(s.riasecAnswers, {});
  assert.equal(s.riasecScores, null);
  assert.equal(s.riasecInferred, false);

  const items = [{ id: "jc_1", param: "social", text: "q", options: [{ value: 80, label: "l" }] }];
  store.setJobCharRanking(s, ["social"], 5, items);
  store.recordJobCharAnswer(s, "jc_1", 80);
  store.setJobCharProfile(s, { social: 80 });
  assert.equal(s.jobCharProfile.social, 80);

  store.setCvAnalysis(s, "raw cv", { skills: ["a"], domains: [], seniority: "mid" });
  assert.equal(s.cvText, "raw cv");
  store.recordCareerJourneyAnswer(s, "cj_education", "BSc");
  assert.equal(s.careerJourneyAnswers.cj_education, "BSc");
});

test("setUserValues wraps scores as inferred low-confidence; axes serialized alongside", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  assert.equal(s.userValues, null);

  const scores = { self_direction: 80, stimulation: 60, hedonism: 50, achievement: 55, power: 30, security: 40, conformity: 35, tradition: 30, benevolence: 65, universalism: 70 };
  store.setUserValues(s, scores);
  assert.deepEqual(s.userValues, { scores, confidence: "low", source: "inferred" });

  const trimmed = store.serializeSessionState(s, {}, {}, { includeStatic: false });
  assert.deepEqual(trimmed.userValues.scores, scores, "userValues travels in the dynamic part");
  assert.ok(Number.isFinite(trimmed.userValuesAxes.x_open_vs_conserv), "plane point pre-derived");
  assert.ok(Number.isFinite(trimmed.userValuesAxes.y_transc_vs_enhance));
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
