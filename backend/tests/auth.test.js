// Auth on: SUPABASE_URL points at a local server that publishes a JWKS we
// sign tokens with, so the real jose verification path runs end to end.
process.env.NODE_ENV = "test";
process.env.OPENAI_API_KEY = "";
process.env.DEV_TOOLS_TOKEN = "test-dev-token";
process.env.RATE_LIMIT_GLOBAL_MAX = "1000000";
process.env.RATE_LIMIT_AI_MAX = "1000000";
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { generateKeyPair, exportJWK, SignJWT } = require("jose");

let jwksServer;
let server;
let base;
let issuer;
let signingKey;
let app;
let db;

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

test.before(async () => {
  const pair = await generateKeyPair("ES256");
  signingKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "test-key", alg: "ES256", use: "sig" };
  jwksServer = http.createServer((req, res) => {
    if (req.url === "/auth/v1/.well-known/jwks.json") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ keys: [jwk] }));
    }
    res.writeHead(404).end();
  });
  await new Promise((resolve) => jwksServer.listen(0, "127.0.0.1", resolve));
  const supabaseUrl = `http://127.0.0.1:${jwksServer.address().port}`;
  issuer = `${supabaseUrl}/auth/v1`;
  process.env.SUPABASE_URL = supabaseUrl;

  ({ app, db } = require("../server"));
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
  jwksServer.close();
});

function token(sub, { key = signingKey, aud = "authenticated", iss, exp = "1h" } = {}) {
  return new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid: "test-key" })
    .setSubject(sub)
    .setIssuer(iss || issuer)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key);
}

async function call(method, path, { bearer, body, headers = {} } = {}) {
  const h = { "Content-Type": "application/json", ...headers };
  if (bearer) h.Authorization = `Bearer ${bearer}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

test("health stays open and reports the auth mode without a token", async () => {
  const { status, data } = await call("GET", "/api/health");
  assert.equal(status, 200);
  assert.equal(data.auth, "supabase");
  assert.equal(data.savedPaths, false);
  assert.ok(!JSON.stringify(data).includes(process.env.SUPABASE_URL), "health must not echo the URL");
});

test("no token → 401 with a request id", async () => {
  const { status, data } = await call("POST", "/api/session/start", { body: { dreamAnswer: "x" } });
  assert.equal(status, 401);
  assert.ok(data.requestId);
});

test("bad signature, expired, wrong audience and wrong issuer → 401", async () => {
  const other = (await generateKeyPair("ES256")).privateKey;
  const bad = [
    await token(USER_A, { key: other }),
    await token(USER_A, { exp: Math.floor(Date.now() / 1000) - 60 }),
    await token(USER_A, { aud: "anon" }),
    await token(USER_A, { iss: "https://evil.example/auth/v1" }),
    "not-a-jwt",
  ];
  for (const bearer of bad) {
    const { status } = await call("POST", "/api/session/start", {
      bearer,
      body: { dreamAnswer: "x" },
    });
    assert.equal(status, 401);
  }
});

test("own session 200, someone else's session 404 on read and write", async () => {
  const a = await token(USER_A);
  const b = await token(USER_B);
  const started = await call("POST", "/api/session/start", {
    bearer: a,
    body: { dreamAnswer: "Build bridges" },
  });
  assert.equal(started.status, 200);
  const id = started.data.sessionId || started.data.id;
  assert.ok(id);

  assert.equal((await call("GET", `/api/session/${id}`, { bearer: a })).status, 200);
  assert.equal((await call("GET", `/api/session/${id}`, { bearer: b })).status, 404);
  const write = await call("POST", "/api/session/demographics", {
    bearer: b,
    body: { sessionId: id, questionId: "sex", value: "female" },
  });
  assert.equal(write.status, 404);
  assert.equal(write.data.error, "Session not found.");
});

test("dev jump never adopts another user's session", async () => {
  const a = await token(USER_A);
  const b = await token(USER_B);
  const headers = { "X-Dev-Token": "test-dev-token" };
  const mine = await call("POST", "/api/dev/jump", { bearer: a, headers, body: { step: "big_five" } });
  assert.equal(mine.status, 200);
  const id = mine.data.sessionId || mine.data.id;
  const theirs = await call("POST", "/api/dev/jump", {
    bearer: b,
    headers,
    body: { sessionId: id, step: "riasec" },
  });
  assert.equal(theirs.status, 200);
  assert.notEqual(theirs.data.sessionId || theirs.data.id, id);
  // A's session is untouched.
  const again = await call("GET", `/api/session/${id}`, { bearer: a });
  assert.equal(again.data.step, "big_five");
});

test("accept saves the path once per session, roadmap updates the same row", async () => {
  const saves = [];
  db.enabled = true;
  db.saveAcceptedPath = async (row) => saves.push(row);
  try {
    const a = await token(USER_A);
    const headers = { "X-Dev-Token": "test-dev-token" };
    const seeded = await call("POST", "/api/dev/jump", { bearer: a, headers, body: { step: "tree" } });
    const sessionId = seeded.data.sessionId || seeded.data.id;
    const first = await call("POST", "/api/output/first", { bearer: a, body: { sessionId } });
    assert.equal(first.status, 200);
    const outputId = first.data.outputs[0].id;

    assert.equal(
      (await call("POST", "/api/output/accept", { bearer: a, body: { sessionId, outputId } })).status,
      200
    );
    // Accept-once: the second accept is refused and writes nothing.
    assert.equal(
      (await call("POST", "/api/output/accept", { bearer: a, body: { sessionId, outputId } })).status,
      400
    );
    assert.equal(saves.length, 1);
    assert.equal(saves[0].userId, USER_A);
    assert.equal(saves[0].session.id, sessionId);
    assert.equal(saves[0].output.id, outputId);
    assert.equal(saves[0].roadmap, null);

    const roadmap = await call("POST", "/api/roadmap/generate", {
      bearer: a,
      body: { sessionId, outputId },
    });
    assert.equal(roadmap.status, 200);
    // Cached roadmap on a retry: no further write.
    await call("POST", "/api/roadmap/generate", { bearer: a, body: { sessionId, outputId } });
    assert.equal(saves.length, 2);
    assert.equal(saves[1].session.id, sessionId);
    assert.ok(saves[1].roadmap);
  } finally {
    db.enabled = false;
  }
});

test("a failing saved_paths write never breaks accept", async () => {
  db.enabled = true;
  db.saveAcceptedPath = async () => {
    throw new Error("supabase down");
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    const a = await token(USER_A);
    const headers = { "X-Dev-Token": "test-dev-token" };
    const seeded = await call("POST", "/api/dev/jump", { bearer: a, headers, body: { step: "tree" } });
    const sessionId = seeded.data.sessionId || seeded.data.id;
    const first = await call("POST", "/api/output/first", { bearer: a, body: { sessionId } });
    const outputId = first.data.outputs[0].id;
    const accepted = await call("POST", "/api/output/accept", {
      bearer: a,
      body: { sessionId, outputId },
    });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.data.acceptedOutputId, outputId);
  } finally {
    console.error = originalError;
    db.enabled = false;
  }
});

test("GET /api/me/paths lists only the caller's rows", async () => {
  const asked = [];
  db.listSavedPaths = async (userId) => {
    asked.push(userId);
    return [{ id: "p1", title: "Hydrologist" }];
  };
  const { status, data } = await call("GET", "/api/me/paths", { bearer: await token(USER_B) });
  assert.equal(status, 200);
  assert.deepEqual(asked, [USER_B]);
  assert.deepEqual(data.paths, [{ id: "p1", title: "Hydrologist" }]);
  assert.equal((await call("GET", "/api/me/paths")).status, 401);
});
