process.env.NODE_ENV = "test";
process.env.OPENAI_API_KEY = "";
process.env.DEV_TOOLS_TOKEN = "test-dev-token";
process.env.RATE_LIMIT_GLOBAL_MAX = "1000000";
process.env.RATE_LIMIT_AI_MAX = "1000000";

const test = require("node:test");
const assert = require("node:assert/strict");
const { app } = require("../server");
const { STEP_ORDER } = require("../sessionStore");
const { FILLERS } = require("../devSeed");

let server;
let base;

test.before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

async function jump(body, token = "test-dev-token") {
  const headers = { "Content-Type": "application/json" };
  if (token !== null) headers["X-Dev-Token"] = token;
  const res = await fetch(`${base}/api/dev/jump`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function post(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// Paired with the identical assertion in devJumpDisabled.test.js, which runs in
// its own process with the token unset. Together they prove a bad token is
// byte-for-byte what an unmounted route returns — comparing against a different
// path here would prove nothing, since Express echoes the path into the body.
const ABSENT_ROUTE_BODY =
  '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n<body>\n<pre>Cannot POST /api/dev/jump</pre>\n</body>\n</html>\n';

test("a wrong or missing token is indistinguishable from an absent route", async () => {
  for (const token of ["wrong-token", null]) {
    const res = await fetch(`${base}/api/dev/jump`, {
      method: "POST",
      headers:
        token === null
          ? { "Content-Type": "application/json" }
          : { "Content-Type": "application/json", "X-Dev-Token": token },
      body: JSON.stringify({ step: "summary" }),
    });
    assert.equal(res.status, 404, `token ${token}`);
    // Same body, not just the same status: a distinct error shape would confirm
    // the route exists just as surely as a 403 would.
    assert.equal(await res.text(), ABSENT_ROUTE_BODY, `token ${token}`);
  }
});

test("a jump with no sessionId creates a seeded session", async () => {
  const { status, data } = await jump({ step: "summary" });
  assert.equal(status, 200);
  assert.ok(data.sessionId);
  assert.equal(data.step, "summary");
  assert.ok(data.bigFiveScores, "summary renders the Big Five radar");
  assert.ok(data.userValues, "summary renders the work-values radar");
  assert.ok(data.personaSummary, "summary renders the persona prose");
  assert.ok(data.demographicQuestions, "static banks travel on a jump snapshot");
});

test("every step is reachable", async () => {
  for (const step of STEP_ORDER) {
    const { status, data } = await jump({ step });
    assert.equal(status, 200, step);
    assert.equal(data.step, step, step);
  }
});

test("an unknown step is a 400 carrying a requestId", async () => {
  const { status, data } = await jump({ step: "not_a_step" });
  assert.equal(status, 400);
  assert.ok(data.requestId);
});

// Drift guard: if a filler stops writing something the engine needs, this fails.
test("a session seeded to tree can generate a real first output", async () => {
  const { data: seeded } = await jump({ step: "tree" });
  const { status, data } = await post("/api/output/first", { sessionId: seeded.sessionId });
  assert.equal(status, 200);
  assert.equal(data.outputs.length, 1);
  assert.ok(data.outputs[0].jobTitle);
  assert.ok(data.outputs[0].socCode);
});

// Drift guard: a step added to the machine without a filler fails here.
test("the filler map covers every non-terminal step", () => {
  assert.deepEqual(Object.keys(FILLERS).sort(), STEP_ORDER.slice(0, -1).sort());
});

test("forward-fill keeps real answers already in the session", async () => {
  const { data: started } = await post("/api/session/start", { dreamAnswer: "my own dream" });
  await post("/api/session/demographics", {
    sessionId: started.sessionId,
    questionId: "city",
    value: "Lisbon",
  });

  const { data } = await jump({ sessionId: started.sessionId, step: "summary" });
  assert.equal(data.sessionId, started.sessionId, "same session, filled forward");
  assert.equal(data.demographics.city, "Lisbon");
  assert.equal(data.dreamAnswer, "my own dream");
});

test("a backward jump returns a fresh session carrying the dream over", async () => {
  const { data: ahead } = await jump({ step: "summary" });
  const { status, data } = await jump({ sessionId: ahead.sessionId, step: "riasec" });

  assert.equal(status, 200);
  assert.notEqual(data.sessionId, ahead.sessionId);
  assert.equal(data.step, "riasec");
  assert.equal(data.dreamAnswer, ahead.dreamAnswer);
});

test("an unknown sessionId seeds a fresh session instead of 404ing", async () => {
  const { status, data } = await jump({
    sessionId: "00000000-0000-0000-0000-000000000000",
    step: "summary",
  });
  assert.equal(status, 200);
  assert.equal(data.step, "summary");
});
