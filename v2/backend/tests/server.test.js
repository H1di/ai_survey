// End-to-end over HTTP, keyless (deterministic fallbacks), mock payments on.
process.env.NODE_ENV = "test";
delete process.env.OPENAI_API_KEY;
process.env.MOCK_PAYMENTS = "1";

const test = require("node:test");
const assert = require("node:assert/strict");
const { app, __locks } = require("../server");

let server;
let base;
test.before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

async function call(path, body) {
  const res = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json(), headers: res.headers };
}

const ANSWERS = {
  status: "graduate",
  age: 23,
  field: "tech",
  level: "postgrad",
  goal: "Move from an arts degree into data work",
  location: "dublin",
  budget: "any",
  time: "part_time",
  start: "september",
};

async function startWithPath(answers = ANSWERS) {
  const start = await call("/api/session/start", { answers });
  assert.equal(start.status, 200);
  const built = await call("/api/path/build", { sessionId: start.body.sessionId });
  assert.equal(built.status, 200);
  return built.body;
}

test("meta serves the personal questions, add-ons and the sample notice", async () => {
  const { status, body } = await call("/api/meta");
  assert.equal(status, 200);
  assert.equal(body.personalQuestions.length, 9);
  assert.equal(body.freeRebuilds, 3);
  assert.equal(body.catalogue.source, "sample");
  assert.ok(body.catalogue.notice);
  assert.ok(body.addons.find((a) => a.id === "extras").available === false);
});

test("start: validates answers and requires parental consent under 16", async () => {
  const bad = await call("/api/session/start", { answers: { ...ANSWERS, budget: "lots" } });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.requestId);

  const young = { ...ANSWERS, status: "school", age: 15 };
  const blocked = await call("/api/session/start", { answers: young });
  assert.equal(blocked.status, 400);
  assert.match(blocked.body.error, /parent or guardian/);
  const ok = await call("/api/session/start", { answers: young, parentalConsent: true });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.case.id, "first_course");
});

test("start returns the case with no path; build is idempotent and keyless", async () => {
  const start = await call("/api/session/start", { answers: ANSWERS });
  assert.equal(start.body.case.id, "next_step");
  assert.equal(start.body.path, null);
  const first = await call("/api/path/build", { sessionId: start.body.sessionId });
  assert.equal(first.body.path.source, "rules");
  assert.ok(first.body.path.steps.length >= 2);
  for (const s of first.body.path.steps) {
    assert.ok(s.course && s.course.id === s.courseId, "steps resolve to catalogue courses");
    assert.ok(s.basis.length);
  }
  const again = await call("/api/path/build", { sessionId: start.body.sessionId });
  assert.deepEqual(
    again.body.path.steps.map((s) => s.courseId),
    first.body.path.steps.map((s) => s.courseId)
  );
});

test("three free rebuilds, then 402 until the rebuilds add-on", async () => {
  const snap = await startWithPath();
  const sessionId = snap.sessionId;
  for (let i = 1; i <= 3; i += 1) {
    const r = await call("/api/path/rebuild", { sessionId, note: "cheaper please" });
    assert.equal(r.status, 200);
    assert.equal(r.body.rebuilds.used, i);
    assert.equal(r.body.rebuilds.remaining, 3 - i);
  }
  const blocked = await call("/api/path/rebuild", { sessionId });
  assert.equal(blocked.status, 402);
  assert.equal(blocked.body.rebuilds, undefined);

  const unlock = await call("/api/addons/unlock", { sessionId, addon: "rebuilds" });
  assert.equal(unlock.status, 200);
  assert.equal(unlock.body.rebuilds.unlimited, true);
  assert.equal(unlock.body.rebuilds.remaining, null);
  const dup = await call("/api/addons/unlock", { sessionId, addon: "rebuilds" });
  assert.equal(dup.status, 409);
  const fourth = await call("/api/path/rebuild", { sessionId });
  assert.equal(fourth.status, 200);
  assert.equal(fourth.body.rebuilds.used, 4);
});

test("restore brings back the path before a rebuild", async () => {
  const snap = await startWithPath();
  const before = snap.path.steps.map((s) => s.courseId);
  const rebuilt = await call("/api/path/rebuild", { sessionId: snap.sessionId });
  assert.notDeepEqual(rebuilt.body.path.steps.map((s) => s.courseId), before);
  const restored = await call("/api/path/restore", { sessionId: snap.sessionId });
  assert.deepEqual(restored.body.path.steps.map((s) => s.courseId), before);
  const none = await call("/api/path/restore", { sessionId: snap.sessionId });
  assert.equal(none.status, 400);
});

test("changing answers flags the path; the next rebuild follows the new answers", async () => {
  const snap = await startWithPath();
  const sessionId = snap.sessionId;
  const before = snap.path.steps.map((s) => s.courseId);
  const updated = await call("/api/profile/update", { sessionId, answers: { ...ANSWERS, field: "design" } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.profileChanged, true);
  assert.deepEqual(updated.body.path.steps.map((s) => s.courseId), before, "the path waits for a rebuild");
  const rebuilt = await call("/api/path/rebuild", { sessionId });
  assert.equal(rebuilt.status, 200);
  assert.equal(rebuilt.body.profileChanged, false);
  assert.ok(rebuilt.body.path.steps.every((s) => s.course.directionIds.includes("design")));
  assert.equal(rebuilt.body.rebuilds.used, 1);

  const bad = await call("/api/profile/update", { sessionId, answers: { ...ANSWERS, time: "never" } });
  assert.equal(bad.status, 400);
});

test("manage: add / swap / move / remove are free and validated", async () => {
  const snap = await startWithPath();
  const sessionId = snap.sessionId;
  const added = await call("/api/path/add", { sessionId, courseId: "design-short" });
  assert.equal(added.status, 200);
  const step = added.body.path.steps.at(-1);
  assert.equal(step.courseId, "design-short");
  assert.equal(added.body.path.edited, true);
  assert.equal(added.body.rebuilds.used, 0, "editing never spends a rebuild");

  assert.equal((await call("/api/path/add", { sessionId, courseId: "design-short" })).status, 409);
  assert.equal((await call("/api/path/add", { sessionId, courseId: "invented" })).status, 404);

  const swapped = await call("/api/path/swap", { sessionId, stepId: step.id, courseId: "media-short" });
  assert.equal(swapped.body.path.steps.at(-1).courseId, "media-short");
  const moved = await call("/api/path/move", { sessionId, stepId: step.id, direction: "up" });
  assert.equal(moved.body.path.steps.at(-2).id, step.id);
  const removed = await call("/api/path/remove", { sessionId, stepId: step.id });
  assert.ok(!removed.body.path.steps.some((s) => s.id === step.id));
  assert.equal((await call("/api/path/remove", { sessionId, stepId: "step_999" })).status, 404);
});

test("courses endpoint filters the catalogue", async () => {
  const { body } = await call("/api/courses?field=tech&mode=online");
  assert.ok(body.courses.length > 0);
  assert.ok(body.courses.every((c) => c.directionIds.includes("tech") && c.mode === "online"));
});

test("add-ons need a path first; extras is not available yet", async () => {
  const start = await call("/api/session/start", { answers: ANSWERS });
  const early = await call("/api/addons/unlock", { sessionId: start.body.sessionId, addon: "tests" });
  assert.equal(early.status, 400);
  await call("/api/path/build", { sessionId: start.body.sessionId });
  const extras = await call("/api/addons/unlock", { sessionId: start.body.sessionId, addon: "extras" });
  assert.equal(extras.status, 409);
});

test("tests are paid; full run → guidance with real occupations, scenarios, apply", async () => {
  const snap = await startWithPath();
  const sessionId = snap.sessionId;
  assert.equal((await call("/api/tests/start", { sessionId })).status, 402);
  assert.equal((await call("/api/guidance/generate", { sessionId })).status, 402);

  const pass = await call("/api/addons/unlock", { sessionId, addon: "pass" });
  assert.equal(pass.body.entitlements.tests, true);
  assert.equal(pass.body.entitlements.rebuilds, true);
  assert.equal(pass.body.entitlements.extras, false, "a pass cannot grant an unavailable add-on");
  assert.equal(pass.body.addons.find((a) => a.id === "pass").owned, true);

  let s = (await call("/api/tests/start", { sessionId })).body;
  assert.equal(s.tests.step, "big_five");
  assert.equal(s.tests.items.length, 20);
  for (const item of s.tests.items) {
    assert.deepEqual(Object.keys(item).sort(), ["id", "text"], "no scoring key leaks");
  }
  for (const item of s.tests.items) {
    s = (await call("/api/tests/big-five", { sessionId, itemId: item.id, value: 4 })).body;
  }
  assert.equal(s.tests.step, "riasec");
  assert.ok(s.tests.bigFiveScores);
  for (const item of s.tests.items) {
    assert.deepEqual(Object.keys(item).sort(), ["id", "text"]);
    s = (await call("/api/tests/riasec", { sessionId, itemId: item.id, value: item.id.includes("I") ? 5 : 2 })).body;
  }
  assert.equal(s.tests.step, "values");
  let guard = 0;
  while (s.tests.step === "values" && guard++ < 12) {
    const { comparisonId, a } = s.tests.comparison;
    s = (await call("/api/tests/values", { sessionId, comparisonId, winner: a })).body;
  }
  assert.equal(s.tests.step, "experience");
  assert.equal(s.tests.valuesOrder.length, 6);

  const thin = await call("/api/tests/experience", { sessionId, answers: { cj_role: "barista" } });
  assert.equal(thin.status, 400);
  s = (
    await call("/api/tests/experience", {
      sessionId,
      answers: { cj_role: "barista", cj_skills: "spreadsheets, writing", cj_education: "BA in history" },
    })
  ).body;
  assert.equal(s.tests.step, "done");

  const g = await call("/api/guidance/generate", { sessionId });
  assert.equal(g.status, 200);
  const guidance = g.body.guidance;
  assert.equal(guidance.source, "rules");
  assert.ok(guidance.explanation.length > 20);
  assert.ok(guidance.occupations.length > 0);
  for (const o of guidance.occupations) assert.match(o.soc, /^\d{2}-\d{4}\.\d{2}$/);
  assert.ok(guidance.attribution.includes("O*NET"));
  assert.ok(guidance.scenarios.length >= 1 && guidance.scenarios.length <= 3);

  const scenario = guidance.scenarios[0];
  const applied = await call("/api/path/apply-scenario", { sessionId, scenarioId: scenario.id });
  assert.equal(applied.status, 200);
  assert.deepEqual(applied.body.path.steps.map((x) => x.courseId), scenario.steps.map((x) => x.courseId));
  assert.equal(applied.body.path.source, "scenario");
  assert.equal(applied.body.guidance, null, "a changed path drops stale guidance");
});

test("single-flight: a concurrent path change gets 409", async () => {
  const snap = await startWithPath();
  __locks.add(`${snap.sessionId}:path`);
  try {
    const r = await call("/api/path/rebuild", { sessionId: snap.sessionId });
    assert.equal(r.status, 409);
  } finally {
    __locks.delete(`${snap.sessionId}:path`);
  }
});

test("unknown session is 404 with a request id; malformed JSON is 400", async () => {
  const r = await call("/api/path/build", { sessionId: "nope" });
  assert.equal(r.status, 404);
  assert.ok(r.body.requestId);
  const res = await fetch(base + "/api/session/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{bad",
  });
  assert.equal(res.status, 400);
});
