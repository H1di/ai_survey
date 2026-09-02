// /api/health is the unauthenticated at-a-glance view of the process: which
// snapshot is loaded and whether the live O*NET key is configured and working.
// It reports cached state only — asserting it never leaks the key itself.
process.env.NODE_ENV = "test";
process.env.OPENAI_API_KEY = "";
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

test("health reports the loaded O*NET snapshot and the live-key status", async () => {
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.onet.snapshotVersion, "30.3");
  assert.ok(body.onet.occupations > 900, `occupations: ${body.onet.occupations}`);
  // No ONET_API_KEY in the test env — this is the "no key" half of the pair
  // that makes a wrong key diagnosable.
  assert.equal(body.onet.liveKey, false);
  assert.equal(body.onet.lastLookupOk, null);
  assert.equal(body.onet.lastLookupAt, null);
  assert.equal(body.onet.lastError, null);
  assert.equal(body.onet.cachedOccupations, 0);
});

test("health never exposes the O*NET key, in any form", async () => {
  const serialized = await (await fetch(`${base}/api/health`)).text();
  for (const forbidden of ["apiKey", "x-api-key", "X-API-Key", "ONET_API_KEY"]) {
    assert.ok(!serialized.includes(forbidden), `health leaked ${forbidden}: ${serialized}`);
  }
});
