// Force fallback mode BEFORE requiring server: dotenv.config() never
// overrides an env var that is already set, so this blanks any real key.
process.env.OPENAI_API_KEY = "";

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
  assert.ok(data.proposedDirection, "proposedDirection set after final answer");
  // fallback q1/q2/q3 first options vote tech/finance/design -> tie broken by catalog order = tech
  assert.equal(data.proposedDirection.id, "tech");

  // Stage A confirm -> narrowing questions generated
  ({ status, data } = await post("/api/direction/confirm", { sessionId }));
  assert.equal(status, 200);
  assert.equal(data.direction.id, "tech");
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

  // Stage D: roadmap
  ({ status, data } = await post("/api/roadmap/generate", { sessionId }));
  assert.equal(status, 200);
  assert.equal(data.pathStage, "roadmap");
  assert.equal(data.roadmap.professionId, chosen.id);
  assert.ok(data.roadmap.stages.length >= 4);

  // cached: same roadmap object on repeat call
  const firstStageTitle = data.roadmap.stages[0].title;
  ({ data } = await post("/api/roadmap/generate", { sessionId }));
  assert.equal(data.roadmap.stages[0].title, firstStageTitle);
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
