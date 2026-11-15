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

// jose reports a non-200 JWKS response as ERR_JOSE_GENERIC and an unusable key
// set as ERR_JWKS_INVALID — both start with ERR_J but are our outage: a 401
// here would sign every user out and drop their stored session id.
const http = require("node:http");

async function withJwks(handler, fn) {
  const srv = http.createServer(handler);
  await new Promise((resolve) => srv.listen(0, "127.0.0.1", resolve));
  try {
    await fn(`http://127.0.0.1:${srv.address().port}`);
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
}

for (const [name, handler] of [
  ["a 500 from the JWKS endpoint", (_req, res) => res.writeHead(500).end("down")],
  ["a 429 from the JWKS endpoint", (_req, res) => res.writeHead(429).end("slow down")],
  [
    "a JWKS body that is not a key set",
    (_req, res) => res.writeHead(200, { "Content-Type": "application/json" }).end('{"oops":true}'),
  ],
]) {
  test(`${name} → 503 and onOutage, never 401`, async () => {
    await withJwks(handler, async (supabaseUrl) => {
      const calls = [];
      const auth = createAuth({ supabaseUrl, onOutage: (req) => calls.push(req) });
      const res = fakeRes();
      await auth.middleware({ id: "req-x", get: () => bearer }, res, () => {});
      assert.equal(res.statusCode, 503);
      assert.equal(calls.length, 1);
    });
  });
}

test("a token signed by a key the JWKS does not hold is still a 401", async () => {
  const { generateKeyPair: gen, exportJWK } = require("jose");
  const other = await gen("ES256");
  const jwk = { ...(await exportJWK(other.publicKey)), kid: "other", alg: "ES256", use: "sig" };
  await withJwks(
    (_req, res) =>
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ keys: [jwk] })),
    async (supabaseUrl) => {
      const calls = [];
      const auth = createAuth({ supabaseUrl, onOutage: (req) => calls.push(req) });
      const res = fakeRes();
      await auth.middleware({ id: "req-y", get: () => bearer }, res, () => {});
      assert.equal(res.statusCode, 401);
      assert.equal(calls.length, 0);
    }
  );
});
