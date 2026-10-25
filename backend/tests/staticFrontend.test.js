// Single-service deploy: the backend serves the built SPA next to /api.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// FRONTEND_DIST is read at module load, so the fake build must exist first.
const dist = fs.mkdtempSync(path.join(os.tmpdir(), "lpe-dist-"));
fs.mkdirSync(path.join(dist, "assets"));
fs.writeFileSync(path.join(dist, "index.html"), "<!doctype html><title>shell</title>");
fs.writeFileSync(path.join(dist, "assets", "app-abc123.js"), "console.log(1);");
fs.writeFileSync(path.join(dist, "favicon.svg"), "<svg/>");

process.env.NODE_ENV = "test";
process.env.OPENAI_API_KEY = "";
process.env.FRONTEND_DIST = dist;
delete process.env.DEV_TOOLS_TOKEN;

const test = require("node:test");
const assert = require("node:assert/strict");
const { app } = require("../server");

let server;
let base;

test.before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
  fs.rmSync(dist, { recursive: true, force: true });
});

test("the root and client-side paths return the app shell, uncached", async () => {
  for (const url of ["/", "/some/client/path"]) {
    const res = await fetch(base + url);
    assert.equal(res.status, 200, url);
    assert.equal(await res.text(), "<!doctype html><title>shell</title>");
    assert.equal(res.headers.get("cache-control"), "no-cache");
  }
});

test("fingerprinted assets are cached immutably, other files are revalidated", async () => {
  const asset = await fetch(`${base}/assets/app-abc123.js`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("cache-control"), /immutable/);

  const icon = await fetch(`${base}/favicon.svg`);
  assert.equal(icon.status, 200);
  assert.equal(icon.headers.get("cache-control"), "no-cache");
});

test("a missing file with an extension is a 404, not the shell", async () => {
  const res = await fetch(`${base}/assets/stale-000.js`);
  assert.equal(res.status, 404);
});

test("API paths never fall through to the shell", async () => {
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.match(health.headers.get("content-type"), /json/);

  for (const url of ["/api", "/api/unknown"]) {
    const res = await fetch(base + url);
    assert.equal(res.status, 404, url);
    assert.match(await res.text(), /Cannot GET/);
  }
});
