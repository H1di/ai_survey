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
// Static question banks arrive on start / GET / riasec-start snapshots
// only — answer responses are trimmed, so iterate over the captured lists.
async function walkToJobChar() {
  let { data } = await post("/api/session/start", {
    whyHereAnswer: "figure out what fits me",
    dreamAnswer: "build useful things",
  });
  const sessionId = data.sessionId;
  const careerJourneyQuestions = data.careerJourneyQuestions;
  const bigFiveItems = data.bigFiveItems;
  assert.equal(bigFiveItems.length, 20, "static Mini-IPIP present from the start");

  const demoValues = { sex: "female", age: 30, country: "Testland", city: "Testville" };
  for (const q of data.demographicQuestions) {
    ({ data } = await post("/api/session/demographics", { sessionId, questionId: q.id, value: demoValues[q.id] }));
  }
  assert.equal(data.step, "big_five");

  for (const item of bigFiveItems) {
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
  await post("/api/cv/intent", { sessionId, cvIntent: "new" });
  let data = walked.data;
  for (const q of careerJourneyQuestions) {
    ({ data } = await post("/api/cv/journey", { sessionId, questionId: q.id, value: "test answer" }));
  }
  assert.equal(data.step, "tree");
  assert.ok(data.userValues, "userValues inferred the moment step becomes tree");
  assert.equal(data.userValues.confidence, "low");
  assert.equal(Object.keys(data.userValues.scores).length, 10);
  assert.ok(data.personaSummary, "persona summary generated at cv→tree");
  return { sessionId, data };
}

test("answer snapshots omit static question banks; start/GET include them", async () => {
  let { data } = await post("/api/session/start", { whyHereAnswer: "figure out what fits me", dreamAnswer: "trim me" });
  const sessionId = data.sessionId;
  assert.ok(data.demographicQuestions, "start carries question banks");
  assert.ok(data.careerJourneyQuestions);
  assert.ok(data.jobCharParams);

  ({ data } = await post("/api/session/demographics", { sessionId, questionId: "sex", value: "male" }));
  assert.equal(data.demographicQuestions, undefined, "answer response is trimmed");
  assert.equal(data.careerJourneyQuestions, undefined);
  assert.equal(data.jobCharParams, undefined);
  assert.ok(data.demographics, "dynamic state still present");

  const res = await fetch(`${base}/api/session/${sessionId}`);
  const snapshot = await res.json();
  assert.ok(snapshot.demographicQuestions, "GET (resume) carries question banks");
});

test("session/start requires both free-text answers and caps them at 500", async () => {
  let res = await post("/api/session/start", { dreamAnswer: "x" });
  assert.equal(res.status, 400, "whyHereAnswer required");
  res = await post("/api/session/start", { whyHereAnswer: "   ", dreamAnswer: "x" });
  assert.equal(res.status, 400, "blank whyHereAnswer rejected");
  res = await post("/api/session/start", { whyHereAnswer: "y", dreamAnswer: "" });
  assert.equal(res.status, 400, "dreamAnswer required");

  const long = "w".repeat(10_000);
  res = await post("/api/session/start", { whyHereAnswer: long, dreamAnswer: "x" });
  assert.equal(res.status, 200);
  assert.equal(res.data.whyHereAnswer.length, 500, "capped like dreamAnswer");
  assert.equal("entryChoice" in res.data, false, "entryChoice gone from the snapshot");
  assert.equal(res.data.cvIntent, null, "intent not chosen yet");
});

test("values route is gone", async () => {
  const res = await post("/api/values/answer", {});
  assert.equal(res.status, 404);
});

test("depth era is gone: fixed instrument, no depth route, no depth fields", async () => {
  const res = await post("/api/session/big-five-depth", { sessionId: "x", depth: "short" });
  assert.equal(res.status, 404);

  const a = await post("/api/session/start", { whyHereAnswer: "figure out what fits me", dreamAnswer: "x" });
  const b = await post("/api/session/start", { whyHereAnswer: "figure out what fits me", dreamAnswer: "y" });
  assert.equal(a.data.bigFiveItems.length, 20);
  assert.deepEqual(a.data.bigFiveItems, b.data.bigFiveItems, "one fixed instrument for everyone");
  assert.equal(a.data.bigFiveItems[0].trait, undefined, "scoring keys never serialized");
  assert.equal("bigFiveDepth" in a.data, false, "depth field gone from the snapshot");
  assert.equal("depth" in a.data.progress.bigFive, false, "depth gone from progress");
  assert.equal("depth" in a.data.summary.bigFive, false, "depth gone from summary");
});

test("step guards: riasec/jobchar/cv routes reject out-of-order calls", async () => {
  const { data: start } = await post("/api/session/start", { whyHereAnswer: "figure out what fits me", dreamAnswer: "x" });
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
  let { data } = await post("/api/session/start", { whyHereAnswer: "figure out what fits me", dreamAnswer: "x" });
  const sessionId = data.sessionId;
  const demoValues = { sex: "male", age: 40, country: "Testland", city: "Testville" };
  const items = data.bigFiveItems;
  for (const q of data.demographicQuestions) {
    ({ data } = await post("/api/session/demographics", { sessionId, questionId: q.id, value: demoValues[q.id] }));
  }
  for (const item of items) {
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
  await post("/api/cv/intent", { sessionId, cvIntent: "use_skills" });
  const { data } = await post("/api/cv", { sessionId, cvText: "Nurse for 10 years, ICU team lead." });
  assert.equal(data.step, "tree");
  assert.equal(data.cvProvided, true);
  // keyless: analysis is the honest empty signal
  assert.deepEqual(data.cvAnalysis, { skills: [], domains: [], seniority: "" });
  // Schwartz user vector exists on BOTH cv paths before the graph renders
  assert.equal(data.userValues.source, "inferred");
  assert.equal(Object.keys(data.userValues.scores).length, 10);
  assert.ok(data.personaSummary, "persona summary on the CV path too");
  for (const v of Object.values(data.userValues.scores)) {
    assert.ok(v >= 0 && v <= 100);
  }
});

test("cv/intent: step guard, value validation, re-selection, snapshot carry", async () => {
  const { data: start } = await post("/api/session/start", { whyHereAnswer: "x", dreamAnswer: "x" });
  let res = await post("/api/cv/intent", { sessionId: start.sessionId, cvIntent: "new" });
  assert.equal(res.status, 400, "rejected before the cv step");

  const { sessionId } = await walkToCv();
  res = await post("/api/cv/intent", { sessionId, cvIntent: "later" });
  assert.equal(res.status, 400, "invalid value rejected");

  res = await post("/api/cv/intent", { sessionId, cvIntent: "use_skills" });
  assert.equal(res.status, 200);
  assert.equal(res.data.cvIntent, "use_skills");

  res = await post("/api/cv/intent", { sessionId, cvIntent: "new" });
  assert.equal(res.status, 200, "re-selection allowed while on cv");
  assert.equal(res.data.cvIntent, "new");
});

test("cv accepts a multipart .txt upload", async () => {
  const { sessionId } = await walkToCv();
  const form = new FormData();
  form.append("sessionId", sessionId);
  form.append("file", new Blob([Buffer.from("Welder, 8 years, certified")], { type: "text/plain" }), "cv.txt");
  const res = await fetch(`${base}/api/cv`, { method: "POST", body: form });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.step, "tree");
  assert.equal(data.cvProvided, true);
});

test("cv upload rejects unsupported file types", async () => {
  const { sessionId } = await walkToCv();
  const form = new FormData();
  form.append("sessionId", sessionId);
  form.append("file", new Blob([Buffer.from("x")], { type: "image/jpeg" }), "cv.jpg");
  const res = await fetch(`${base}/api/cv`, { method: "POST", body: form });
  assert.equal(res.status, 400);
});

test("cv upload rejects oversized files with a 400", async () => {
  const { sessionId } = await walkToCv();
  const form = new FormData();
  form.append("sessionId", sessionId);
  form.append("file", new Blob([Buffer.alloc(3 * 1024 * 1024, "a")], { type: "text/plain" }), "cv.txt");
  const res = await fetch(`${base}/api/cv`, { method: "POST", body: form });
  assert.equal(res.status, 400);
});

test("full output loop: first -> refine param -> notSuitable -> accept -> detail -> roadmap", async () => {
  const { sessionId } = await completeAssessment();

  // 1st Output (idempotent)
  let { status, data } = await post("/api/output/first", { sessionId });
  assert.equal(status, 200);
  assert.equal(data.outputs.length, 1);
  assert.equal(data.pathStage, "output");
  const first = data.outputs[0];
  assert.equal(first.id, "output_1");
  assert.equal(first.parentId, null);
  assert.ok(first.orientedField && first.jobTitle && first.thesis);
  for (const param of RANKING) {
    assert.ok(first.parameterFit[param], `parameterFit missing ${param}`);
  }
  // Schwartz layer: 10 scores, backend-derived aggregates, fit vs userValues
  assert.equal(Object.keys(first.schwartzValues).length, 10);
  const nums = Object.values(first.schwartzValues);
  assert.ok(Math.max(...nums) - Math.min(...nums) >= 8, "profile must not be flat");
  assert.ok(first.higherOrder && first.axes && first.dominantPole);
  assert.equal(first.topValues.length, 3);
  assert.ok(first.valuesFit.overall >= 0 && first.valuesFit.overall <= 100);
  // Structured explanation from the separate second call
  for (const key of ["personality", "interests", "values", "currentSkills"]) {
    assert.ok(first.whyThisFits[key].length >= 1, `whyThisFits.${key} missing`);
  }
  assert.ok(first.whyThisFits.skillsToDevelop.length >= 3);

  ({ data } = await post("/api/output/first", { sessionId }));
  assert.equal(data.outputs.length, 1, "idempotent");

  // No -> change one parameter
  ({ status, data } = await post("/api/output/refine", {
    sessionId,
    outputId: "output_1",
    changes: [{ param: "compensation", reason: "need more upside" }],
  }));
  assert.equal(status, 200);
  assert.equal(data.outputs.length, 2);
  assert.equal(data.outputs[1].parentId, "output_1");
  assert.ok(data.outputs[1].changeSummary, "refinement carries a changeSummary");
  assert.ok(data.outputs[1].whyThisFits, "refined output carries whyThisFits");
  assert.equal(Object.keys(data.outputs[1].schwartzValues).length, 10, "re-scored on Schwartz");
  assert.equal(data.refinementHistory.length, 1);
  assert.equal(data.refinementHistory[0].changedParams[0].param, "compensation");

  // No -> not suitable overall: a genuinely different field family
  ({ status, data } = await post("/api/output/refine", {
    sessionId,
    outputId: "output_2",
    notSuitable: true,
  }));
  assert.equal(status, 200);
  assert.equal(data.outputs.length, 3);
  const families = data.outputs.map((o) => o.directionId);
  assert.notEqual(families[2], families[0], "notSuitable must leave the rejected family");
  assert.equal(data.refinementHistory[1].notSuitable, true);
  assert.ok(data.outputs[2].whyThisFits, "notSuitable regeneration carries whyThisFits");

  // Yes -> accept output_3, get the 4 advice blocks
  ({ status, data } = await post("/api/output/accept", { sessionId, outputId: "output_3" }));
  assert.equal(status, 200);
  assert.equal(data.acceptedOutputId, "output_3");
  assert.equal(data.pathStage, "detail");
  const detail = data.outputs[2].detail;
  for (const block of ["aiRecommendations", "events", "universities", "courses"]) {
    assert.ok(detail[block].length >= 2, `${block} too small`);
  }

  // Roadmap for the accepted output, cached under its id
  ({ status, data } = await post("/api/roadmap/generate", { sessionId, outputId: "output_3" }));
  assert.equal(status, 200);
  assert.ok(data.roadmaps.output_3.stages.length >= 4);
  const firstStageTitle = data.roadmaps.output_3.stages[0].title;
  ({ data } = await post("/api/roadmap/generate", { sessionId, outputId: "output_3" }));
  assert.equal(data.roadmaps.output_3.stages[0].title, firstStageTitle, "cached");
});

test("output guards: ordering, XOR body, accept-once, roadmap gating", async () => {
  const { data: start } = await post("/api/session/start", { whyHereAnswer: "figure out what fits me", dreamAnswer: "x" });
  // outputs require a completed assessment
  let res = await post("/api/output/first", { sessionId: start.sessionId });
  assert.equal(res.status, 400);

  const { sessionId } = await completeAssessment();
  await post("/api/output/first", { sessionId });

  // refine: unknown output
  res = await post("/api/output/refine", { sessionId, outputId: "output_99", notSuitable: true });
  assert.equal(res.status, 400);
  // refine: neither notSuitable nor changes
  res = await post("/api/output/refine", { sessionId, outputId: "output_1" });
  assert.equal(res.status, 400);
  // refine: both notSuitable and changes
  res = await post("/api/output/refine", {
    sessionId, outputId: "output_1", notSuitable: true, changes: [{ param: "social", reason: "" }],
  });
  assert.equal(res.status, 400);
  // refine: invalid param / duplicate params
  res = await post("/api/output/refine", { sessionId, outputId: "output_1", changes: [{ param: "salary" }] });
  assert.equal(res.status, 400);
  res = await post("/api/output/refine", {
    sessionId, outputId: "output_1",
    changes: [{ param: "social", reason: "a" }, { param: "social", reason: "b" }],
  });
  assert.equal(res.status, 400);

  // roadmap before accept
  res = await post("/api/roadmap/generate", { sessionId, outputId: "output_1" });
  assert.equal(res.status, 400);

  // accept unknown output
  res = await post("/api/output/accept", { sessionId, outputId: "output_99" });
  assert.equal(res.status, 400);

  // accept, then refine/accept again must 400
  await post("/api/output/accept", { sessionId, outputId: "output_1" });
  res = await post("/api/output/refine", { sessionId, outputId: "output_1", notSuitable: true });
  assert.equal(res.status, 400);
  res = await post("/api/output/accept", { sessionId, outputId: "output_1" });
  assert.equal(res.status, 400);

  // unknown session
  res = await post("/api/output/first", { sessionId: "nope" });
  assert.equal(res.status, 404);
});

test("monetization, branch, and direction-era routes are gone", async () => {
  for (const path of [
    "/api/payment/unlock-theme",
    "/api/branches/initial",
    "/api/branches/create",
    "/api/branches/evolve",
    "/api/direction/question",
    "/api/direction/answer",
    "/api/direction/confirm",
    "/api/direction/refine",
    "/api/direction/choose",
    "/api/professions/narrow",
    "/api/professions/select",
  ]) {
    const res = await post(path, {});
    assert.equal(res.status, 404, `${path} should be removed`);
  }
});

test("GET /api/session/:id returns enough state to resume after a reload", async () => {
  // Start and answer one demographic, then "reload".
  let { data } = await post("/api/session/start", { whyHereAnswer: "figure out what fits me", dreamAnswer: "resume me" });
  const sessionId = data.sessionId;
  ({ data } = await post("/api/session/demographics", { sessionId, questionId: "sex", value: "female" }));

  const res = await fetch(`${base}/api/session/${sessionId}`);
  assert.equal(res.status, 200);
  const snapshot = await res.json();

  assert.equal(snapshot.sessionId, sessionId);
  assert.equal(snapshot.step, "demographics");
  assert.equal(snapshot.whyHereAnswer, "figure out what fits me");
  assert.equal(snapshot.dreamAnswer, "resume me");
  assert.equal(snapshot.cvIntent, null);
  assert.ok(snapshot.demographicQuestions.length === 4, "question list present incl. city");
  assert.equal(snapshot.demographics.sex, "female", "saved answers present");
  assert.ok(Array.isArray(snapshot.careerJourneyQuestions) && snapshot.careerJourneyQuestions.length === 7);
  assert.equal(snapshot.jobCharParams.length, 7);

  const unknown = await fetch(`${base}/api/session/does-not-exist`);
  assert.equal(unknown.status, 404);
});

test("dreamAnswer is capped at 500 chars before storage and prompts", async () => {
  const long = "x".repeat(10_000);
  const { status, data } = await post("/api/session/start", { whyHereAnswer: "figure out what fits me", dreamAnswer: long });
  assert.equal(status, 200);
  assert.equal(data.dreamAnswer.length, 500);
});

test("snapshots expose aiEnabled so the UI can label demo mode", async () => {
  const { data } = await post("/api/session/start", { whyHereAnswer: "figure out what fits me", dreamAnswer: "honesty" });
  assert.equal(data.aiEnabled, false, "keyless test run must report aiEnabled=false");
});
