// The Multer file-size cap (5 MB) rejects an oversized upload BEFORE the route
// handler runs, via the MulterError branch of the error middleware. This guards
// against the message drifting away from the actual limit again (it once said
// "2 MB" while the cap was 5 MB). Mirrors server.test.js's env/boot setup.
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

test("an over-limit CV upload is rejected with the correct 5 MB message", async () => {
  // 6 MB > the 5 MB cap: Multer aborts during multipart parsing, so no session
  // or step is needed — the error middleware answers before the handler.
  const form = new FormData();
  form.append("sessionId", "irrelevant");
  form.append("file", new Blob([Buffer.alloc(6 * 1024 * 1024)]), "big.pdf");

  const res = await fetch(`${base}/api/cv`, { method: "POST", body: form });
  const data = await res.json();

  assert.equal(res.status, 400);
  assert.match(data.error, /5 MB/);
  assert.doesNotMatch(data.error, /2 MB/);
});
