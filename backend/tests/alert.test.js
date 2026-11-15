const test = require("node:test");
const assert = require("node:assert/strict");
const { createAlerter } = require("../core/alert");

const alert = { status: 500, route: "/api/session/:sessionId", requestId: "req-1", message: "boom" };

test("no url -> fetchImpl never called", () => {
  let calls = 0;
  const a = createAlerter({ url: "", fetchImpl: async () => void calls++ });
  a.notify(alert);
  assert.equal(calls, 0);
});

test("sends one POST with text === content and no stack", () => {
  const sent = [];
  const a = createAlerter({
    url: "https://hook.example/x",
    fetchImpl: async (url, init) => void sent.push({ url, init }),
  });
  a.notify({ ...alert, stack: "SECRET STACK" });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].init.method, "POST");
  const body = JSON.parse(sent[0].init.body);
  assert.equal(body.text, body.content);
  assert.equal(body.text, "500 /api/session/:sessionId req-1 boom");
  assert.ok(!sent[0].init.body.includes("SECRET"));
});

test("same status+route inside 60 s is dropped; after 60 s it sends", () => {
  let t = 1000;
  let calls = 0;
  const a = createAlerter({
    url: "https://hook.example/x",
    fetchImpl: async () => void calls++,
    now: () => t,
  });
  a.notify(alert);
  t += 59_000;
  a.notify(alert);
  assert.equal(calls, 1);
  a.notify({ ...alert, status: 502 });
  assert.equal(calls, 2);
  t += 2_000;
  a.notify(alert);
  assert.equal(calls, 3);
});

test("fetchImpl rejecting or throwing does not throw or leave an unhandled rejection", async () => {
  let unhandled = 0;
  const onUnhandled = () => unhandled++;
  process.on("unhandledRejection", onUnhandled);
  const rejecting = createAlerter({
    url: "https://hook.example/x",
    fetchImpl: () => Promise.reject(new Error("net down")),
  });
  const throwing = createAlerter({
    url: "https://hook.example/x",
    fetchImpl: () => {
      throw new Error("sync");
    },
  });
  assert.doesNotThrow(() => rejecting.notify(alert));
  assert.doesNotThrow(() => throwing.notify(alert));
  await new Promise((r) => setTimeout(r, 20));
  process.off("unhandledRejection", onUnhandled);
  assert.equal(unhandled, 0);
});
