const test = require("node:test");
const assert = require("node:assert/strict");
const { SessionStore } = require("../sessionStore");

function makeSession(store) {
  return store.createSession({ entryChoice: "find", dreamAnswer: "build things" });
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
  assert.deepEqual(s.valuesAnswers, {});
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
