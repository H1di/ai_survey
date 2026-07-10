const test = require("node:test");
const assert = require("node:assert/strict");
const { SessionStore } = require("../sessionStore");

function makeSession(store) {
  return store.createSession({ entryChoice: "find", dreamAnswer: "build things", cvIntent: "new" });
}

test("createSession initializes Page 3 fields and keeps Page 1/2 fields", () => {
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
  // Old values model gone
  assert.equal("valuesAnswers" in s, false);
  assert.equal("valuesScores" in s, false);
  // New Page 3 fields
  assert.equal(s.pathStage, "direction");
  assert.deepEqual(s.directionQuestions, []);
  assert.deepEqual(s.directionAnswers, {});
  assert.equal(s.proposedDirection, null);
  assert.equal(s.direction, null);
  assert.deepEqual(s.narrowingQuestions, []);
  assert.deepEqual(s.narrowingAnswers, {});
  assert.deepEqual(s.professionOptions, []);
  assert.equal(s.selectedProfession, null);
  assert.deepEqual(s.roadmaps, {});
  assert.deepEqual(s.rejectedDirections, []);
  assert.deepEqual(s.refineNotes, []);
  assert.equal("roadmap" in s, false);
  // Old model gone
  assert.equal("branches" in s, false);
  assert.equal("unlockedThemes" in s, false);
  assert.equal("branchCounter" in s, false);
});

test("direction flow setters", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  const questions = [{ id: "dir_q1", text: "q", options: [{ value: "a", label: "A", directionId: "tech" }] }];

  store.setDirectionQuestions(s, questions);
  assert.deepEqual(s.directionQuestions, questions);

  store.recordDirectionAnswer(s, "dir_q1", "a");
  assert.equal(s.directionAnswers.dir_q1, "a");

  store.setProposedDirection(s, { id: "tech", label: "Programming & Technology" });
  assert.equal(s.proposedDirection.id, "tech");

  store.confirmDirection(s, { id: "tech", label: "Programming & Technology" });
  assert.equal(s.direction.id, "tech");
  assert.equal(s.pathStage, "narrowing");
});

test("setDirectionQuestions resets stale answers and proposal", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  s.directionAnswers = { dir_q1: "a" };
  s.proposedDirection = { id: "tech", label: "x" };
  store.setDirectionQuestions(s, []);
  assert.deepEqual(s.directionAnswers, {});
  assert.equal(s.proposedDirection, null);
});

test("narrowing, professions, selection, roadmap setters advance pathStage", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  store.confirmDirection(s, { id: "tech", label: "Programming & Technology" });

  store.setNarrowingQuestions(s, [{ id: "nar_q1", text: "q", options: [{ value: "a", label: "A" }] }]);
  store.recordNarrowingAnswer(s, "nar_q1", "a");
  assert.equal(s.narrowingAnswers.nar_q1, "a");

  const professions = [
    { id: "prof_1", title: "Software Developer", summary: "s", whyFit: "w", dayToDay: "d" },
    { id: "prof_2", title: "QA / Test Engineer", summary: "s", whyFit: "w", dayToDay: "d" },
    { id: "prof_3", title: "Data Analyst", summary: "s", whyFit: "w", dayToDay: "d" },
  ];
  store.setProfessionOptions(s, professions);
  assert.equal(s.pathStage, "professions");
  assert.equal(s.professionOptions.length, 3);

  store.selectProfession(s, professions[0]);
  assert.equal(s.selectedProfession.id, "prof_1");

  store.setRoadmap(s, { professionId: "prof_1", stages: [{ id: "stage_1", title: "t", description: "d", timeframe: "", milestone: "" }] });
  assert.equal(s.pathStage, "roadmap");
  assert.equal(s.roadmaps.prof_1.professionId, "prof_1");

  store.setRoadmap(s, { professionId: "prof_2", stages: [{ id: "stage_1", title: "t2", description: "d", timeframe: "", milestone: "" }] });
  assert.equal(Object.keys(s.roadmaps).length, 2, "second roadmap must not evict the first");
  assert.equal(s.roadmaps.prof_1.stages[0].title, "t");
});

test("serializeSessionState exposes Page 3 fields and hides the old model", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  const snapshot = store.serializeSessionState(s, { done: false }, {});
  assert.equal(snapshot.pathStage, "direction");
  assert.deepEqual(snapshot.directionQuestions, []);
  assert.deepEqual(snapshot.directionAnswers, {});
  assert.equal(snapshot.proposedDirection, null);
  assert.equal(snapshot.direction, null);
  assert.deepEqual(snapshot.narrowingQuestions, []);
  assert.deepEqual(snapshot.narrowingAnswers, {});
  assert.deepEqual(snapshot.professionOptions, []);
  assert.equal(snapshot.selectedProfession, null);
  assert.deepEqual(snapshot.roadmaps, {});
  assert.deepEqual(snapshot.rejectedDirections, []);
  assert.equal(snapshot.directionCatalog.length, 15);
  for (const entry of snapshot.directionCatalog) {
    assert.deepEqual(Object.keys(entry).sort(), ["id", "label"]);
  }
  assert.equal("roadmap" in snapshot, false);
  assert.equal("branches" in snapshot, false);
  assert.equal("unlockedThemes" in snapshot, false);
  assert.equal("themes" in snapshot, false);
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

  const snapshot = store.serializeSessionState(s, { done: false }, {});

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

test("rejectProposedDirection records the rejection and clears the proposal", () => {
  const store = new SessionStore();
  const s = makeSession(store);
  store.setProposedDirection(s, { id: "tech", label: "Programming & Technology", reason: "r" });
  store.rejectProposedDirection(s, { reasonChoice: "interests", feedbackText: "people work" });
  assert.deepEqual(s.rejectedDirections, [{ id: "tech", label: "Programming & Technology" }]);
  assert.deepEqual(s.refineNotes, [{ reasonChoice: "interests", feedbackText: "people work" }]);
  assert.equal(s.proposedDirection, null);
});

test("old branch/theme methods are gone", () => {
  const store = new SessionStore();
  for (const gone of ["unlockTheme", "isThemeUnlocked", "hasBranchForTheme", "getBranch", "createBranch", "appendNode"]) {
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
