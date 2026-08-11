// No DEV_TOOLS_TOKEN: the dev router must not exist at all.
process.env.NODE_ENV = "test";
process.env.OPENAI_API_KEY = "";
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

test.after(() => server.close());

// The other half of the indistinguishability proof: devJump.test.js asserts a
// wrong token returns exactly this body with the route mounted, and this file
// asserts it is what an unmounted route returns. Keep the two literals in sync.
const ABSENT_ROUTE_BODY =
  '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n<body>\n<pre>Cannot POST /api/dev/jump</pre>\n</body>\n</html>\n';

test("the dev route is absent when DEV_TOOLS_TOKEN is unset", async () => {
  const res = await fetch(`${base}/api/dev/jump`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Dev-Token": "anything" },
    body: JSON.stringify({ step: "summary" }),
  });
  assert.equal(res.status, 404);
  assert.equal(await res.text(), ABSENT_ROUTE_BODY);
});
