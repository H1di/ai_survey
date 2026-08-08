// CV single-flight lock (Fix 2). A true concurrent race can't be forced
// deterministically (aiEngine is instantiated at module load; keyless analyzeCV
// returns instantly), so this covers the two observable halves: (a) a seeded
// lock returns 409 via the test-only __locks seam, and (b) a sequential
// double-submit is a clean 400 with no duplicate advance. Own process so the
// seeded key can't leak into other suites.
process.env.NODE_ENV = "test";
process.env.OPENAI_API_KEY = "";
process.env.RATE_LIMIT_GLOBAL_MAX = "1000000";
process.env.RATE_LIMIT_AI_MAX = "1000000";

const test = require("node:test");
const assert = require("node:assert/strict");
const { app, __locks } = require("../server");

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

// Walk a fresh session to the CV step (intent chosen), returning its id.
async function walkToCv() {
  let { data } = await post("/api/session/start", { dreamAnswer: "build useful things" });
  const sessionId = data.sessionId;
  // Static banks travel only on the start snapshot — capture before the loops
  // overwrite `data` with static-trimmed answer snapshots.
  const bigFiveItems = data.bigFiveItems;
  const demoValues = { sex: "female", age: 30, country: "Testland", city: "Testville" };
  for (const q of data.demographicQuestions) {
    ({ data } = await post("/api/session/demographics", { sessionId, questionId: q.id, value: demoValues[q.id] }));
  }
  for (const item of bigFiveItems) {
    ({ data } = await post("/api/big-five/answer", { sessionId, itemId: item.id, value: 3 }));
  }
  ({ data } = await post("/api/riasec/start", { sessionId }));
  for (const item of data.riasecItems) {
    ({ data } = await post("/api/riasec/answer", { sessionId, itemId: item.id, value: 4 }));
  }
  ({ data } = await post("/api/values/start", { sessionId }));
  while (data.valuesComparison) {
    const { comparisonId, a } = data.valuesComparison;
    ({ data } = await post("/api/values/answer", { sessionId, comparisonId, winner: a }));
  }
  ({ data } = await post("/api/values/confirm", { sessionId }));
  ({ data } = await post("/api/job-characteristics/rank", {
    sessionId,
    ranking: ["compensation", "work_mode", "job_security", "career_growth", "complexity", "meaning_impact", "social"],
  }));
  assert.equal(data.step, "cv");
  await post("/api/cv/intent", { sessionId, cvIntent: "use_skills" });
  return sessionId;
}

test("a held lock makes a concurrent /api/cv return 409 (seeded via __locks)", async () => {
  const { data } = await post("/api/session/start", { dreamAnswer: "x" });
  const sessionId = data.sessionId;
  const key = `${sessionId}:cv`;
  __locks.add(key); // simulate an in-flight completion
  try {
    const res = await post("/api/cv", { sessionId, cvText: "irrelevant" });
    assert.equal(res.status, 409);
    assert.match(res.data.error, /still processing/);
  } finally {
    __locks.delete(key);
  }
});

test("a sequential CV double-submit is a clean 400 with no duplicate advance", async () => {
  const sessionId = await walkToCv();

  const first = await post("/api/cv", { sessionId, cvText: "ten years leading data teams" });
  assert.equal(first.status, 200);
  assert.equal(first.data.step, "summary");
  const persona = first.data.personaSummary;

  // Second submit: the step already advanced, so the guard answers 400 and
  // nothing regenerates or advances again.
  const second = await post("/api/cv", { sessionId, cvText: "ten years leading data teams" });
  assert.equal(second.status, 400);
  assert.match(second.data.error, /Not currently in the CV step/);

  const { data: snap } = await post("/api/session/start", { dreamAnswer: "probe" }); // sanity: server still healthy
  assert.ok(snap.sessionId);

  const check = await fetch(`${base}/api/session/${sessionId}`).then((r) => r.json());
  assert.equal(check.step, "summary", "step unchanged by the blocked resubmit");
  assert.equal(check.personaSummary, persona, "persona not regenerated");
});
