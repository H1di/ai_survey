// Force fallback mode BEFORE requiring server: dotenv.config() never
// overrides an env var that is already set, so this blanks any real key.
process.env.OPENAI_API_KEY = "";
// This suite fires hundreds of requests from one IP; rate-limit behavior
// has its own suite (rateLimit.test.js runs in a separate process).
process.env.RATE_LIMIT_GLOBAL_MAX = "1000000";
process.env.RATE_LIMIT_AI_MAX = "1000000";

const test = require("node:test");
const assert = require("node:assert/strict");
const { app } = require("../server");

let server;
let base;

test.before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

async function post(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// Fast-forwards Page 1 + Page 2 (fallback Big Five items are deterministic).
async function completeAssessment() {
  let { data } = await post("/api/session/start", { entryChoice: "find", dreamAnswer: "build useful things" });
  const sessionId = data.sessionId;

  const demoValues = { sex: "female", age: 30, country: "Testland" };
  while (data.step === "demographics") {
    const q = data.nextQuestion.question;
    ({ data } = await post("/api/session/demographics", { sessionId, questionId: q.id, value: demoValues[q.id] }));
  }

  ({ data } = await post("/api/session/big-five-depth", { sessionId, depth: "short" }));

  while (data.step === "big_five") {
    const q = data.nextQuestion.question;
    ({ data } = await post("/api/big-five/answer", { sessionId, itemId: q.id, value: 3 }));
  }

  while (data.step === "values") {
    const q = data.nextQuestion.question;
    ({ data } = await post("/api/values/answer", { sessionId, questionId: q.id, choice: "A" }));
  }

  assert.equal(data.step, "complete");
  return { sessionId, data };
}

test("full Page 3 flow: direction -> narrowing -> professions -> select -> roadmap", async () => {
  const { sessionId } = await completeAssessment();

  // Stage A: direction questions (fallback: deterministic 3)
  let { status, data } = await post("/api/direction/question", { sessionId });
  assert.equal(status, 200);
  assert.equal(data.directionQuestions.length, 3);
  assert.equal(data.pathStage, "direction");

  // idempotent: second call does not regenerate/reset
  ({ data } = await post("/api/direction/question", { sessionId }));
  assert.equal(data.directionQuestions.length, 3);

  // answer all 3 with the first option
  for (const q of data.directionQuestions) {
    ({ status, data } = await post("/api/direction/answer", { sessionId, questionId: q.id, value: q.options[0].value }));
    assert.equal(status, 200);
  }
  // fallback q1/q2/q3 first options vote tech/finance/healthcare: a 1-1-1
  // tie is surfaced to the user instead of silently resolved by alphabet
  assert.equal(data.proposedDirection, null);
  assert.deepEqual(
    data.directionTieCandidates.map((c) => c.id),
    ["finance", "healthcare", "tech"]
  );

  // confirming during an unresolved tie is rejected
  let tieConfirm = await post("/api/direction/confirm", { sessionId });
  assert.equal(tieConfirm.status, 400);

  // the user resolves the tie -> proposal, tie cleared
  ({ status, data } = await post("/api/direction/choose", { sessionId, directionId: "finance" }));
  assert.equal(status, 200);
  assert.equal(data.proposedDirection.id, "finance");
  assert.deepEqual(data.directionTieCandidates, []);

  // Stage A confirm -> narrowing questions generated
  ({ status, data } = await post("/api/direction/confirm", { sessionId }));
  assert.equal(status, 200);
  assert.equal(data.direction.id, "finance");
  assert.equal(data.pathStage, "narrowing");
  assert.equal(data.narrowingQuestions.length, 2);

  // Stage B: answer narrowing questions -> exactly 3 professions
  for (const q of data.narrowingQuestions) {
    ({ status, data } = await post("/api/professions/narrow", { sessionId, questionId: q.id, value: q.options[0].value }));
    assert.equal(status, 200);
  }
  assert.equal(data.pathStage, "professions");
  assert.equal(data.professionOptions.length, 3);

  // Stage C: select a profession
  const chosen = data.professionOptions[1];
  ({ status, data } = await post("/api/professions/select", { sessionId, professionId: chosen.id }));
  assert.equal(status, 200);
  assert.equal(data.selectedProfession.id, chosen.id);

  // Stage D: roadmap (map keyed by professionId)
  ({ status, data } = await post("/api/roadmap/generate", { sessionId }));
  assert.equal(status, 200);
  assert.equal(data.pathStage, "roadmap");
  assert.ok(data.roadmaps[chosen.id], "roadmap stored under its professionId");
  assert.ok(data.roadmaps[chosen.id].stages.length >= 4);

  // cached: repeat call returns the same stages
  const firstStageTitle = data.roadmaps[chosen.id].stages[0].title;
  ({ data } = await post("/api/roadmap/generate", { sessionId }));
  assert.equal(data.roadmaps[chosen.id].stages[0].title, firstStageTitle);

  // second profession: selecting + generating keeps the first roadmap
  const other = data.professionOptions.find((p) => p.id !== chosen.id);
  ({ data } = await post("/api/professions/select", { sessionId, professionId: other.id }));
  assert.ok(data.roadmaps[chosen.id], "first roadmap survives selecting another profession");
  ({ data } = await post("/api/roadmap/generate", { sessionId }));
  assert.ok(data.roadmaps[other.id], "second roadmap generated");
  assert.ok(data.roadmaps[chosen.id], "first roadmap still present");
  assert.equal(Object.keys(data.roadmaps).length, 2);
});

test("guards: ordering and validation", async () => {
  const { data: start } = await post("/api/session/start", { entryChoice: "find", dreamAnswer: "x" });
  const sessionId = start.sessionId;

  // direction endpoints require completed assessment
  let res = await post("/api/direction/question", { sessionId });
  assert.equal(res.status, 400);

  // confirm without proposal
  const done = await completeAssessment();
  res = await post("/api/direction/confirm", { sessionId: done.sessionId });
  assert.equal(res.status, 400);

  // roadmap without selection
  res = await post("/api/roadmap/generate", { sessionId: done.sessionId });
  assert.equal(res.status, 400);

  // unknown session
  res = await post("/api/direction/question", { sessionId: "nope" });
  assert.equal(res.status, 404);
});

test("select rejects a professionId that is not one of the options", async () => {
  const { sessionId } = await completeAssessment();
  await post("/api/direction/question", { sessionId });
  let { data } = await post("/api/direction/question", { sessionId });
  for (const q of data.directionQuestions) {
    ({ data } = await post("/api/direction/answer", { sessionId, questionId: q.id, value: q.options[0].value }));
  }
  ({ data } = await post("/api/direction/choose", { sessionId, directionId: data.directionTieCandidates[0].id }));
  ({ data } = await post("/api/direction/confirm", { sessionId }));
  for (const q of data.narrowingQuestions) {
    ({ data } = await post("/api/professions/narrow", { sessionId, questionId: q.id, value: q.options[0].value }));
  }
  const res = await post("/api/professions/select", { sessionId, professionId: "prof_99" });
  assert.equal(res.status, 400);
});

test("monetization and branch routes are gone", async () => {
  for (const path of ["/api/payment/unlock-theme", "/api/branches/initial", "/api/branches/create", "/api/branches/evolve"]) {
    const res = await post(path, {});
    assert.equal(res.status, 404, `${path} should be removed`);
  }
});

test("direction refinement: reject twice, then manual choose", async () => {
  const { sessionId } = await completeAssessment();
  let { data } = await post("/api/direction/question", { sessionId });
  for (const q of data.directionQuestions) {
    ({ data } = await post("/api/direction/answer", { sessionId, questionId: q.id, value: q.options[0].value }));
  }
  // resolve the 1-1-1 tie, then exercise the refine cycle from a proposal
  ({ data } = await post("/api/direction/choose", { sessionId, directionId: data.directionTieCandidates[0].id }));
  assert.ok(data.proposedDirection.reason, "proposal carries a reason");
  const first = data.proposedDirection.id;

  // guards
  let res = await post("/api/direction/refine", { sessionId, reasonChoice: "nope", feedbackText: "" });
  assert.equal(res.status, 400, "invalid reason rejected");

  // reject #1
  ({ data } = await post("/api/direction/refine", { sessionId, reasonChoice: "interests", feedbackText: "I want to work with people" }));
  assert.equal(data.rejectedDirections.length, 1);
  assert.equal(data.rejectedDirections[0].id, first);
  assert.notEqual(data.proposedDirection.id, first);
  assert.ok(data.proposedDirection.reason);
  const second = data.proposedDirection.id;

  // reject #2
  ({ data } = await post("/api/direction/refine", { sessionId, reasonChoice: "environment", feedbackText: "" }));
  assert.equal(data.rejectedDirections.length, 2);
  assert.notEqual(data.proposedDirection.id, first);
  assert.notEqual(data.proposedDirection.id, second);

  // choose: rejected id -> 400; valid -> proposal "Chosen by you."
  res = await post("/api/direction/choose", { sessionId, directionId: first });
  assert.equal(res.status, 400);
  const pick = data.directionCatalog.find(
    (d) => ![first, second].includes(d.id)
  );
  ({ data } = await post("/api/direction/choose", { sessionId, directionId: pick.id }));
  assert.equal(data.proposedDirection.id, pick.id);
  assert.equal(data.proposedDirection.reason, "Chosen by you.");

  // confirm still works after choose
  ({ data } = await post("/api/direction/confirm", { sessionId }));
  assert.equal(data.direction.id, pick.id);
});

test("refine guards: no proposal and confirmed direction", async () => {
  const { sessionId } = await completeAssessment();
  // no proposal yet
  let res = await post("/api/direction/refine", { sessionId, reasonChoice: "interests", feedbackText: "" });
  assert.equal(res.status, 400);

  // confirm a direction, then refine/choose must 400
  let { data } = await post("/api/direction/question", { sessionId });
  for (const q of data.directionQuestions) {
    ({ data } = await post("/api/direction/answer", { sessionId, questionId: q.id, value: q.options[0].value }));
  }
  ({ data } = await post("/api/direction/choose", { sessionId, directionId: data.directionTieCandidates[0].id }));
  await post("/api/direction/confirm", { sessionId });
  res = await post("/api/direction/refine", { sessionId, reasonChoice: "interests", feedbackText: "" });
  assert.equal(res.status, 400);
  res = await post("/api/direction/choose", { sessionId, directionId: "media" });
  assert.equal(res.status, 400);
});

test("GET /api/session/:id returns enough state to resume after a reload", async () => {
  // Start and answer one demographic, then "reload".
  let { data } = await post("/api/session/start", { entryChoice: "find", dreamAnswer: "resume me" });
  const sessionId = data.sessionId;
  ({ data } = await post("/api/session/demographics", { sessionId, questionId: "sex", value: "female" }));

  const res = await fetch(`${base}/api/session/${sessionId}`);
  assert.equal(res.status, 200);
  const snapshot = await res.json();

  assert.equal(snapshot.sessionId, sessionId);
  assert.equal(snapshot.step, "demographics");
  assert.equal(snapshot.entryChoice, "find");
  assert.equal(snapshot.dreamAnswer, "resume me");
  assert.ok(snapshot.demographicQuestions.length >= 3, "question list present");
  assert.equal(snapshot.demographics.sex, "female", "saved answers present");
  assert.ok(Array.isArray(snapshot.valuesQuestions) && snapshot.valuesQuestions.length === 40);

  const unknown = await fetch(`${base}/api/session/does-not-exist`);
  assert.equal(unknown.status, 404);
});

test("dreamAnswer is capped at 500 chars before storage and prompts", async () => {
  const long = "x".repeat(10_000);
  const { status, data } = await post("/api/session/start", { entryChoice: "find", dreamAnswer: long });
  assert.equal(status, 200);
  assert.equal(data.dreamAnswer.length, 500);
});

test("snapshots expose aiEnabled so the UI can label demo mode", async () => {
  const { data } = await post("/api/session/start", { entryChoice: "find", dreamAnswer: "honesty" });
  assert.equal(data.aiEnabled, false, "keyless test run must report aiEnabled=false");
});
