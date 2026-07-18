// Error-handling + observability contract (Fix 3). Uses the test-only seam
// (server.js exports `store` for monkeypatching) to force a 500 without a real
// fault, and captures console.error to assert the structured log line itself —
// not just the response body — so the observability half can't silently
// regress. Mirrors server.test.js env/boot setup; runs in its own process so
// the store monkeypatch can't leak into other suites.
process.env.NODE_ENV = "test";
process.env.OPENAI_API_KEY = "";
process.env.RATE_LIMIT_GLOBAL_MAX = "1000000";
process.env.RATE_LIMIT_AI_MAX = "1000000";

const test = require("node:test");
const assert = require("node:assert/strict");
const { app, store } = require("../server");

let server;
let base;

test.before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

// Capture console.error for the duration of `fn`, returning the collected lines.
async function captureErr(fn) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args);
  try {
    await fn();
  } finally {
    console.error = original;
  }
  return lines;
}

test("an unexpected 500 returns a generic body (no internal leak) + requestId, and logs one structured line", async () => {
  const leakyMessage = "internal detail that must never reach the client";
  const original = store.require;
  store.require = () => {
    throw new Error(leakyMessage);
  };

  let res;
  let data;
  const logs = await captureErr(async () => {
    // A UUID-shaped id proves the logged route is the template, not the secret.
    res = await fetch(`${base}/api/session/11111111-1111-1111-1111-111111111111`);
    data = await res.json();
  });

  store.require = original;

  assert.equal(res.status, 500);
  assert.equal(data.error, "Something went wrong.");
  assert.notEqual(data.error, leakyMessage);
  assert.ok(typeof data.requestId === "string" && data.requestId.length > 0);

  assert.equal(logs.length, 1, "exactly one error log line");
  const entry = JSON.parse(logs[0][0]);
  assert.equal(entry.lvl, "error");
  assert.equal(entry.method, "GET");
  assert.equal(entry.route, "/api/session/:sessionId", "route template, not the raw UUID");
  assert.ok(!/11111111-1111/.test(logs[0][0]), "session UUID must not appear in the log");
  assert.equal(entry.status, 500);
  assert.equal(entry.reqId, data.requestId);
  assert.ok(typeof entry.stack === "string" && entry.stack.length > 0);
});

test("a 4xx returns its specific message + requestId and is NOT logged as an error", async () => {
  let res;
  let data;
  const logs = await captureErr(async () => {
    res = await fetch(`${base}/api/session/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    data = await res.json();
  });

  assert.equal(res.status, 400);
  assert.equal(data.error, "dreamAnswer is required.");
  assert.ok(typeof data.requestId === "string" && data.requestId.length > 0);
  assert.equal(logs.length, 0, "client errors are never logged as errors");
});

test("X-Request-Id is echoed when valid and replaced by a UUID when unusable", async () => {
  const echoed = await fetch(`${base}/api/health`, {
    headers: { "X-Request-Id": "trace-abc_123" },
  });
  assert.equal(echoed.headers.get("x-request-id"), "trace-abc_123");

  // An all-invalid inbound id sanitizes to empty → must become a fresh UUID,
  // never an echoed empty string.
  const replaced = await fetch(`${base}/api/health`, {
    headers: { "X-Request-Id": "@@@###!!!" },
  });
  const id = replaced.headers.get("x-request-id");
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
});

test("malformed JSON body is a generic 400 (final error middleware) + requestId", async () => {
  const res = await fetch(`${base}/api/session/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{ this is not valid json",
  });
  const data = await res.json();

  assert.equal(res.status, 400);
  assert.equal(data.error, "Malformed JSON body.");
  assert.ok(typeof data.requestId === "string" && data.requestId.length > 0);
});
