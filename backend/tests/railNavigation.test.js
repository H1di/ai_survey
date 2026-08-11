process.env.NODE_ENV = "test";
process.env.OPENAI_API_KEY = "";
process.env.DEV_TOOLS_TOKEN = "test-dev-token";
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

async function post(path, body, headers = {}) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// The dev seeder is the cheapest way to get a session with real answers behind
// it; the assertions below are about goto, not about how the data got there.
function seed(step) {
  return post("/api/dev/jump", { step }, { "X-Dev-Token": "test-dev-token" });
}

test("goto moves back to a reached step and keeps the mark", async () => {
  const { data: seeded } = await seed("cv");
  assert.equal(seeded.furthestStep, "cv");

  const { status, data } = await post("/api/session/goto", {
    sessionId: seeded.sessionId,
    step: "riasec",
  });

  assert.equal(status, 200);
  assert.equal(data.step, "riasec");
  assert.equal(data.furthestStep, "cv", "the mark must not fall");
  assert.ok(data.demographicQuestions, "static banks travel on a goto snapshot");
});

test("a back-and-forward round trip leaves every answer untouched", async () => {
  const { data: seeded } = await seed("cv");
  const before = {
    bigFiveAnswers: seeded.bigFiveAnswers,
    bigFiveScores: seeded.bigFiveScores,
    riasecScores: seeded.riasecScores,
    userValues: seeded.userValues,
    jobCharProfile: seeded.jobCharProfile,
  };

  await post("/api/session/goto", { sessionId: seeded.sessionId, step: "big_five" });
  const { data } = await post("/api/session/goto", { sessionId: seeded.sessionId, step: "cv" });

  assert.equal(data.step, "cv");
  assert.deepEqual(data.bigFiveAnswers, before.bigFiveAnswers);
  assert.deepEqual(data.bigFiveScores, before.bigFiveScores);
  assert.deepEqual(data.riasecScores, before.riasecScores);
  assert.deepEqual(data.userValues, before.userValues);
  assert.deepEqual(data.jobCharProfile, before.jobCharProfile);
});

test("goto refuses to skip past the furthest step reached", async () => {
  const { data: seeded } = await seed("riasec");

  const { status, data } = await post("/api/session/goto", {
    sessionId: seeded.sessionId,
    step: "summary",
  });

  assert.equal(status, 400);
  assert.ok(data.requestId);
});

test("goto to the furthest step itself is allowed", async () => {
  const { data: seeded } = await seed("values");
  await post("/api/session/goto", { sessionId: seeded.sessionId, step: "demographics" });

  const { status, data } = await post("/api/session/goto", {
    sessionId: seeded.sessionId,
    step: "values",
  });

  assert.equal(status, 200);
  assert.equal(data.step, "values");
});

test("goto rejects an unknown step and an unknown session", async () => {
  const { data: seeded } = await seed("cv");

  const bad = await post("/api/session/goto", { sessionId: seeded.sessionId, step: "nope" });
  assert.equal(bad.status, 400);

  const missing = await post("/api/session/goto", {
    sessionId: "00000000-0000-0000-0000-000000000000",
    step: "riasec",
  });
  assert.equal(missing.status, 404);
});

test("a session stored before furthestStep existed still navigates", async () => {
  const { store } = require("../server");
  const { data: seeded } = await seed("cv");

  // Simulate a session hydrated from Redis in the pre-change shape.
  delete store.get(seeded.sessionId).furthestStep;

  const { status, data } = await post("/api/session/goto", {
    sessionId: seeded.sessionId,
    step: "riasec",
  });

  // With the field gone the mark falls back to the current step (`cv`), so
  // everything at or before it stays reachable.
  assert.equal(status, 200);
  assert.equal(data.step, "riasec");
  assert.equal(data.furthestStep, "riasec", "the fallback reports the current step");
});

test("values can be re-confirmed after returning to the step", async () => {
  const { data: seeded } = await seed("job_characteristics");
  const original = seeded.userValues.order;
  const reordered = [...original].reverse();

  await post("/api/session/goto", { sessionId: seeded.sessionId, step: "values" });
  const { status, data } = await post("/api/values/confirm", {
    sessionId: seeded.sessionId,
    order: reordered,
  });

  assert.equal(status, 200);
  assert.deepEqual(data.userValues.order, reordered, "the edited hierarchy is stored");
  assert.equal(data.step, "job_characteristics", "confirming advances as on the first pass");
  // The rank->score curve is re-applied to the new order, so the value now
  // ranked first carries the highest score. Asserted relatively, not against a
  // hardcoded number, so a curve change does not break this test spuriously.
  const scores = data.userValues.scores;
  assert.equal(scores[reordered[0]], Math.max(...Object.values(scores)));
  assert.equal(scores[reordered[5]], Math.min(...Object.values(scores)));
});

test("a revisit confirm with an incomplete ordering is rejected", async () => {
  const { data: seeded } = await seed("job_characteristics");
  await post("/api/session/goto", { sessionId: seeded.sessionId, step: "values" });

  const { status } = await post("/api/values/confirm", {
    sessionId: seeded.sessionId,
    order: ["achievement", "independence"],
  });

  // No tournament order to fall back on, so a partial list cannot be accepted.
  assert.equal(status, 400);
});

test("re-answering a revisited step advances forward again without lowering the mark", async () => {
  const { data: seeded } = await seed("cv");
  await post("/api/session/goto", { sessionId: seeded.sessionId, step: "big_five" });

  // Re-submit one Big Five item; all 20 are already answered, so the completion
  // branch fires and the step advances to riasec exactly as on the first pass.
  const { data } = await post("/api/big-five/answer", {
    sessionId: seeded.sessionId,
    itemId: "mip_1",
    value: 5,
  });

  assert.equal(data.step, "riasec");
  assert.equal(data.furthestStep, "cv");
  assert.equal(data.bigFiveAnswers.mip_1, 5, "the edited answer is stored");
});
