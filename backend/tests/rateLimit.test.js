// Env must be set BEFORE requiring server (dotenv never overrides set vars,
// and the limiters read these at module load). node --test runs each file
// in its own process, so this cannot leak into other suites.
process.env.OPENAI_API_KEY = "";
process.env.RATE_LIMIT_AI_MAX = "2";
process.env.RATE_LIMIT_GLOBAL_MAX = "50";

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

test("AI-priced routes return 429 once the strict limit is exceeded", async () => {
  const { data } = await post("/api/session/start", {
    entryChoice: "find",
    dreamAnswer: "rate limit probe",
  });
  const sessionId = data.sessionId;

  // The limiter runs before the handler, so even guard-rejected calls count.
  const first = await post("/api/direction/question", { sessionId });
  const second = await post("/api/direction/question", { sessionId });
  const third = await post("/api/direction/question", { sessionId });

  assert.notEqual(first.status, 429);
  assert.notEqual(second.status, 429);
  assert.equal(third.status, 429);
  assert.match(third.data.error, /Too many AI requests/);
});

test("non-AI routes stay under the global limiter only", async () => {
  const { status } = await post("/api/session/start", {
    entryChoice: "find",
    dreamAnswer: "still fine",
  });
  assert.equal(status, 200);
});
