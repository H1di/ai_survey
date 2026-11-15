// A JWKS outage locks every user out, so it must reach the alert hook — the
// 503 is answered inside the auth middleware, not through sendError.
const test = require("node:test");
const assert = require("node:assert/strict");
const { generateKeyPair, SignJWT } = require("jose");
const { createAuth } = require("../core/auth");

// A well-formed token: a malformed one is rejected before jose asks for keys.
let bearer;
test.before(async () => {
  const { privateKey } = await generateKeyPair("ES256");
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: "k" })
    .setSubject("11111111-1111-4111-8111-111111111111")
    .setExpirationTime("5m")
    .sign(privateKey);
  bearer = `Bearer ${token}`;
});

function fakeRes() {
  return {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("JWKS unreachable → 503 and onOutage called once with the request", async () => {
  const calls = [];
  // Port 1 refuses connections: a network failure, not a jose verdict.
  const auth = createAuth({ supabaseUrl: "http://127.0.0.1:1", onOutage: (req) => calls.push(req) });
  const req = { id: "req-1", get: () => bearer };
  const res = fakeRes();
  let nexted = false;
  await auth.middleware(req, res, () => {
    nexted = true;
  });
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.requestId, "req-1");
  assert.equal(nexted, false);
  assert.deepEqual(calls, [req]);
});

test("a missing token is a 401 and never an outage", async () => {
  const calls = [];
  const auth = createAuth({ supabaseUrl: "http://127.0.0.1:1", onOutage: (req) => calls.push(req) });
  const res = fakeRes();
  await auth.middleware({ id: "req-2", get: () => "" }, res, () => {});
  assert.equal(res.statusCode, 401);
  assert.equal(calls.length, 0);
});

test("a throwing onOutage does not break the 503", async () => {
  const auth = createAuth({
    supabaseUrl: "http://127.0.0.1:1",
    onOutage: () => {
      throw new Error("hook down");
    },
  });
  const res = fakeRes();
  await auth.middleware({ id: "req-3", get: () => bearer }, res, () => {});
  assert.equal(res.statusCode, 503);
});
