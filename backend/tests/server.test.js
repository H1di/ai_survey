// Force fallback mode BEFORE requiring server: NODE_ENV=test makes server.js
// skip dotenv, so the blanked key here is never refilled from .env.
process.env.NODE_ENV = "test";
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

const RANKING = [
  "compensation",
  "work_mode",
  "job_security",
  "career_growth",
  "complexity",
  "meaning_impact",
  "social",
];

// Fast-forwards Page 1 + Page 2 up to the job-characteristics step.
// Static question banks arrive on start / depth / riasec-start snapshots
// only — answer responses are trimmed, so iterate over the captured lists.
async function walkToJobChar() {
  let { data } = await post("/api/session/start", {
    entryChoice: "find",
    dreamAnswer: "build useful things",
    cvIntent: "new",
  });
  const sessionId = data.sessionId;
  const careerJourneyQuestions = data.careerJourneyQuestions;

  const demoValues = { sex: "female", age: 30, country: "Testland", city: "Testville" };
  for (const q of data.demographicQuestions) {
    ({ data } = await post("/api/session/demographics", { sessionId, questionId: q.id, value: demoValues[q.id] }));
  }
  assert.equal(data.step, "depth_choice");

  ({ data } = await post("/api/session/big-five-depth", { sessionId, depth: "short" }));
  for (const item of data.bigFiveItems) {
    ({ data } = await post("/api/big-five/answer", { sessionId, itemId: item.id, value: 3 }));
  }
  assert.equal(data.step, "riasec");

  ({ data } = await post("/api/riasec/start", { sessionId }));
  assert.equal(data.riasecItems.length, 12);
  for (const item of data.riasecItems) {
    ({ data } = await post("/api/riasec/answer", { sessionId, itemId: item.id, value: 4 }));
  }
  assert.equal(data.step, "job_characteristics");
  assert.ok(data.riasecCode, "code derived on completion");

  return { sessionId, data, careerJourneyQuestions };
}

async function walkToCv() {
  const walked = await walkToJobChar();
  const { sessionId, careerJourneyQuestions } = walked;
  let { data } = await post("/api/job-characteristics/rank", { sessionId, ranking: RANKING, depth: 5 });
  assert.equal(data.jobCharItems.length, 5);
  for (const item of data.jobCharItems) {
    ({ data } = await post("/api/job-characteristics/answer", { sessionId, itemId: item.id, value: item.options[0].value }));
  }
  assert.equal(data.step, "cv");
  return { sessionId, data, careerJourneyQuestions };
}

async function completeAssessment() {
  const walked = await walkToCv();
  const { sessionId, careerJourneyQuestions } = walked;
  let data = walked.data;
  for (const q of careerJourneyQuestions) {
    ({ data } = await post("/api/cv/journey", { sessionId, questionId: q.id, value: "test answer" }));
  }
  assert.equal(data.step, "tree");
  return { sessionId, data };
}

test("answer snapshots omit static question banks; start/GET include them", async () => {
  let { data } = await post("/api/session/start", { entryChoice: "find", dreamAnswer: "trim me", cvIntent: "new" });
  const sessionId = data.sessionId;
  assert.ok(data.demographicQuestions, "start carries question banks");
  assert.ok(data.careerJourneyQuestions);
  assert.ok(data.jobCharParams);
  assert.ok(data.directionCatalog);

  ({ data } = await post("/api/session/demographics", { sessionId, questionId: "sex", value: "male" }));
  assert.equal(data.demographicQuestions, undefined, "answer response is trimmed");
  assert.equal(data.careerJourneyQuestions, undefined);
  assert.equal(data.jobCharParams, undefined);
  assert.equal(data.directionCatalog, undefined);
  assert.ok(data.demographics, "dynamic state still present");

  const res = await fetch(`${base}/api/session/${sessionId}`);
  const snapshot = await res.json();
  assert.ok(snapshot.demographicQuestions, "GET (resume) carries question banks");
});

test("session/start requires a valid cvIntent", async () => {
  const bad = await post("/api/session/start", { entryChoice: "find", dreamAnswer: "x" });
  assert.equal(bad.status, 400);
  const good = await post("/api/session/start", { entryChoice: "find", dreamAnswer: "x", cvIntent: "use_skills" });
  assert.equal(good.status, 200);
  assert.equal(good.data.cvIntent, "use_skills");
});

test("values route is gone", async () => {
  const res = await post("/api/values/answer", {});
  assert.equal(res.status, 404);
});

test("step guards: riasec/jobchar/cv routes reject out-of-order calls", async () => {
  const { data: start } = await post("/api/session/start", { entryChoice: "find", dreamAnswer: "x", cvIntent: "new" });
  const sessionId = start.sessionId;
  for (const [path, body] of [
    ["/api/riasec/start", { sessionId }],
    ["/api/riasec/skip", { sessionId }],
    ["/api/job-characteristics/rank", { sessionId, ranking: RANKING, depth: 5 }],
    ["/api/cv", { sessionId, cvText: "hi" }],
    ["/api/cv/journey", { sessionId, questionId: "cj_education", value: "x" }],
  ]) {
    const res = await post(path, body);
    assert.equal(res.status, 400, `${path} must reject before its step`);
  }
});

test("riasec skip infers a low-confidence profile and advances", async () => {
  let { data } = await post("/api/session/start", { entryChoice: "find", dreamAnswer: "x", cvIntent: "new" });
  const sessionId = data.sessionId;
  const demoValues = { sex: "male", age: 40, country: "Testland", city: "Testville" };
  for (const q of data.demographicQuestions) {
    ({ data } = await post("/api/session/demographics", { sessionId, questionId: q.id, value: demoValues[q.id] }));
  }
  ({ data } = await post("/api/session/big-five-depth", { sessionId, depth: "short" }));
  for (const item of data.bigFiveItems) {
    ({ data } = await post("/api/big-five/answer", { sessionId, itemId: item.id, value: 4 }));
  }
  assert.equal(data.step, "riasec");

  ({ data } = await post("/api/riasec/skip", { sessionId }));
  assert.equal(data.step, "job_characteristics");
  assert.equal(data.riasecInferred, true);
  assert.equal(data.riasecCode.length, 3);
});

test("job-characteristics/rank validates ranking permutation, depth, and re-rank", async () => {
  const { sessionId } = await walkToJobChar();
  let res = await post("/api/job-characteristics/rank", { sessionId, ranking: ["compensation"], depth: 5 });
  assert.equal(res.status, 400);
  res = await post("/api/job-characteristics/rank", { sessionId, ranking: RANKING, depth: 7 });
  assert.equal(res.status, 400, "depth must be 5 or 10");
  res = await post("/api/job-characteristics/rank", { sessionId, ranking: RANKING, depth: 10 });
  assert.equal(res.status, 200);
  assert.equal(res.data.jobCharItems.length, 10);
  res = await post("/api/job-characteristics/rank", { sessionId, ranking: RANKING, depth: 5 });
  assert.equal(res.status, 400, "ranking already submitted");
});

test("jobChar answers must be one of the option values; completion computes the profile", async () => {
  const { sessionId, data: ranked } = await (async () => {
    const walked = await walkToJobChar();
    const { data } = await post("/api/job-characteristics/rank", { sessionId: walked.sessionId, ranking: RANKING, depth: 5 });
    return { sessionId: walked.sessionId, data };
  })();

  const item = ranked.jobCharItems[0];
  let res = await post("/api/job-characteristics/answer", { sessionId, itemId: item.id, value: 42.5 });
  assert.equal(res.status, 400);

  let data = ranked;
  for (const q of ranked.jobCharItems) {
    ({ data } = await post("/api/job-characteristics/answer", { sessionId, itemId: q.id, value: q.options[0].value }));
  }
  assert.equal(data.step, "cv");
  assert.ok(data.jobCharProfile, "profile computed on completion");
  for (const param of RANKING) {
    assert.equal(typeof data.jobCharProfile[param], "number");
  }
});

test("cv with pasted text stores analysis and reaches tree", async () => {
  const { sessionId } = await walkToCv();
  const { data } = await post("/api/cv", { sessionId, cvText: "Nurse for 10 years, ICU team lead." });
  assert.equal(data.step, "tree");
  assert.equal(data.cvProvided, true);
  // keyless: analysis is the honest empty signal
  assert.deepEqual(data.cvAnalysis, { skills: [], domains: [], seniority: "" });
});

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
  const { data: start } = await post("/api/session/start", { entryChoice: "find", dreamAnswer: "x", cvIntent: "new" });
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
  // the catalog is a static-snapshot field; refine responses no longer carry it
  const catalogRes = await fetch(`${base}/api/session/${sessionId}`);
  const { directionCatalog } = await catalogRes.json();
  const pick = directionCatalog.find(
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
  let { data } = await post("/api/session/start", { entryChoice: "find", dreamAnswer: "resume me", cvIntent: "use_skills" });
  const sessionId = data.sessionId;
  ({ data } = await post("/api/session/demographics", { sessionId, questionId: "sex", value: "female" }));

  const res = await fetch(`${base}/api/session/${sessionId}`);
  assert.equal(res.status, 200);
  const snapshot = await res.json();

  assert.equal(snapshot.sessionId, sessionId);
  assert.equal(snapshot.step, "demographics");
  assert.equal(snapshot.entryChoice, "find");
  assert.equal(snapshot.dreamAnswer, "resume me");
  assert.equal(snapshot.cvIntent, "use_skills");
  assert.ok(snapshot.demographicQuestions.length === 4, "question list present incl. city");
  assert.equal(snapshot.demographics.sex, "female", "saved answers present");
  assert.ok(Array.isArray(snapshot.careerJourneyQuestions) && snapshot.careerJourneyQuestions.length === 7);
  assert.equal(snapshot.jobCharParams.length, 7);

  const unknown = await fetch(`${base}/api/session/does-not-exist`);
  assert.equal(unknown.status, 404);
});

test("dreamAnswer is capped at 500 chars before storage and prompts", async () => {
  const long = "x".repeat(10_000);
  const { status, data } = await post("/api/session/start", { entryChoice: "find", dreamAnswer: long, cvIntent: "new" });
  assert.equal(status, 200);
  assert.equal(data.dreamAnswer.length, 500);
});

test("snapshots expose aiEnabled so the UI can label demo mode", async () => {
  const { data } = await post("/api/session/start", { entryChoice: "find", dreamAnswer: "honesty", cvIntent: "new" });
  assert.equal(data.aiEnabled, false, "keyless test run must report aiEnabled=false");
});
