// Boots the server WITH a (fake) markitdown binary: pptx uploads succeed and
// snapshots advertise .pptx. Mirrors server.test.js env setup.
process.env.NODE_ENV = "test";
process.env.OPENAI_API_KEY = "";
process.env.RATE_LIMIT_GLOBAL_MAX = "1000000";
process.env.RATE_LIMIT_AI_MAX = "1000000";
process.env.MARKITDOWN_BIN = require("path").join(__dirname, "fixtures", "fake-markitdown");

const test = require("node:test");
const assert = require("node:assert/strict");
const { getCvUploadExtensions } = require("../cvExtract");
const { app } = require("../server");

let server;
let base;

test.before(async () => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  // Let server.js's boot-time formats refresh settle before any assertions.
  await getCvUploadExtensions();
  await new Promise((resolve) => setImmediate(resolve));
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

// Compact copy of server.test.js's walk (helpers are per-process; see there
// for the annotated version).
async function walkToCv() {
  let { data } = await post("/api/session/start", {
    dreamAnswer: "build useful things",
  });
  const sessionId = data.sessionId;
  const bigFiveItems = data.bigFiveItems;
  const demoValues = { sex: "female", age: 30, country: "Testland", city: "Testville" };
  for (const q of data.demographicQuestions) {
    ({ data } = await post("/api/session/demographics", { sessionId, questionId: q.id, value: demoValues[q.id] }));
  }
  for (const item of bigFiveItems) {
    ({ data } = await post("/api/big-five/answer", { sessionId, itemId: item.id, value: 3 }));
  }
  ({ data } = await post("/api/riasec/start", { sessionId }));
  for (const item of data.riasecItems) {
    ({ data } = await post("/api/riasec/answer", { sessionId, itemId: item.id, value: 4 }));
  }
  // values tournament: pick `a` every comparison, then confirm
  ({ data } = await post("/api/values/start", { sessionId }));
  while (data.valuesComparison) {
    const { comparisonId, a } = data.valuesComparison;
    ({ data } = await post("/api/values/answer", { sessionId, comparisonId, winner: a }));
  }
  ({ data } = await post("/api/values/confirm", { sessionId }));
  assert.equal(data.step, "cv");
  await post("/api/cv/intent", { sessionId, cvIntent: "use_skills" });
  return { sessionId };
}

test("snapshots advertise .pptx when markitdown is available", async () => {
  const { data } = await post("/api/session/start", {
    dreamAnswer: "x",
  });
  assert.ok(data.cvUploadFormats.includes(".pptx"), `got ${JSON.stringify(data.cvUploadFormats)}`);
});

test("a .pptx upload converts via markitdown and reaches the summary step", async () => {
  const { sessionId } = await walkToCv();
  const form = new FormData();
  form.append("sessionId", sessionId);
  form.append(
    "file",
    new Blob([Buffer.from("pptx-bytes")], {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }),
    "deck.pptx"
  );
  const res = await fetch(`${base}/api/cv`, { method: "POST", body: form });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.step, "summary");
  assert.equal(data.cvProvided, true);
});
