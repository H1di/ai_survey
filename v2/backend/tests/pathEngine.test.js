const test = require("node:test");
const assert = require("node:assert/strict");
const { createCatalogue, isValidCourse } = require("../catalogue");
const { detectCase, slotsFor } = require("../path/caseEngine");
const { validateProfile, needsParentalConsent } = require("../path/personalQuestions");
const {
  candidatesForSlot,
  buildCandidateSets,
  assembleSteps,
  defaultPicks,
  addStep,
  removeStep,
  swapStep,
  moveStep,
  pathTotals,
  meets,
} = require("../path/pathEngine");

const catalogue = createCatalogue({ importPath: "/nonexistent/ie-courses.json" });

const BASE = {
  status: "school_leaver",
  age: 18,
  field: "healthcare",
  level: "bachelor",
  goal: "Help people recover from injuries",
  location: "dublin",
  budget: "any",
  time: "either",
  start: "september",
};

function build(profile, ctx = {}) {
  const slots = slotsFor(detectCase(profile), profile);
  const sets = buildCandidateSets(catalogue, slots, profile, { nowMonth: 6, ...ctx });
  return { slots, sets, ...assembleSteps(sets, defaultPicks(sets), profile, { nextSeq: 1 }) };
}

test("sample catalogue: every course valid, unique id, marked sample", () => {
  assert.equal(catalogue.source, "sample");
  assert.equal(catalogue.count, 105);
  const ids = new Set();
  for (const c of catalogue.courses) {
    assert.ok(isValidCourse(c), c.id);
    assert.equal(c.sample, true);
    assert.match(c.provider, /^Sample /);
    assert.ok(!ids.has(c.id), `duplicate ${c.id}`);
    ids.add(c.id);
  }
  assert.ok(catalogue.describe().notice.includes("placeholders"));
});

test("catalogue search filters and never scores", () => {
  const online = catalogue.search({ mode: "online" });
  assert.ok(online.length > 0 && online.every((c) => c.mode === "online"));
  const free = catalogue.search({ maxFee: "0" });
  assert.ok(free.every((c) => c.feeEur === 0));
  assert.ok(catalogue.search({ q: "programming" }).some((c) => c.id === "tech-short"));
});

test("profile validation: rejects bad options, requires a goal, flags under-16s", () => {
  assert.deepEqual(validateProfile(BASE), BASE);
  assert.throws(() => validateProfile({ ...BASE, field: "astrology" }), /Choose an option/);
  assert.throws(() => validateProfile({ ...BASE, goal: "  " }), /in a sentence/);
  assert.throws(() => validateProfile({ ...BASE, age: 9 }), /age between/);
  assert.equal(needsParentalConsent({ ...BASE, age: 15 }), true);
  assert.equal(needsParentalConsent(BASE), false);
});

test("case detection covers the three cases in the report", () => {
  assert.equal(detectCase({ status: "school" }), "first_course");
  assert.equal(detectCase({ status: "school_leaver" }), "first_course");
  assert.equal(detectCase({ status: "studying" }), "studying");
  assert.equal(detectCase({ status: "graduate" }), "next_step");
  assert.equal(detectCase({ status: "working" }), "next_step");
});

test("first-course path: in-field, one course per slot, no duplicates, traceable basis", () => {
  const { steps, slots } = build(BASE);
  assert.deepEqual(slots.map((s) => s.id), ["prepare", "main", "next"]);
  assert.equal(steps.length, 3);
  assert.equal(new Set(steps.map((s) => s.courseId)).size, 3);
  for (const step of steps) {
    const course = catalogue.get(step.courseId);
    assert.ok(course, "every step references a catalogue course");
    assert.ok(course.directionIds.includes("healthcare"));
    assert.ok(step.basis.some((b) => /^Field: Healthcare.* — your answer$/.test(b)));
    assert.ok(step.basis.length >= 5);
  }
  assert.equal(catalogue.get(steps[1].courseId).kind, "undergrad");
});

test("constraints relax in order and the basis says so", () => {
  // Online-only + free + full-time healthcare bachelor: no degree is online, so
  // the main slot has to loosen something — and must say what.
  const profile = { ...BASE, location: "online_only", budget: "free" };
  const slot = slotsFor("first_course", profile)[1];
  const { candidates, relaxed } = candidatesForSlot(catalogue, slot, profile, { nowMonth: 6 });
  assert.ok(candidates.length > 0);
  assert.ok(relaxed.length > 0);
  assert.deepEqual(relaxed, ["budget", "location", "time", "field"].slice(0, relaxed.length));
  const { steps } = build(profile);
  const main = steps.find((s) => s.slot === "main");
  assert.ok(main.basis.some((b) => b.startsWith("Nothing fitted all your answers")));
  // A course that keeps the budget is never said to break it.
  const healthyBudget = steps.filter((s) => catalogue.get(s.courseId).feeEur === 0);
  for (const s of healthyBudget) assert.ok(!s.basis.some((b) => /outside your .*budget/.test(b)));
});

test("rebuild steering avoids the previous courses where another option exists", () => {
  const first = build(BASE);
  const avoidIds = first.steps.map((s) => s.courseId);
  const second = build(BASE, { avoidIds });
  assert.notDeepEqual(second.steps.map((s) => s.courseId), avoidIds);
  assert.equal(second.steps.length, first.steps.length, "a rebuild never empties a step");
});

test("assembleSteps ignores off-list AI picks and fills from the slot's best", () => {
  const slots = slotsFor("first_course", BASE);
  const sets = buildCandidateSets(catalogue, slots, BASE, { nowMonth: 6 });
  const { steps } = assembleSteps(sets, { prepare: "made-up-course", main: "tech-undergrad" }, BASE, {
    nextSeq: 1,
    whyBySlot: { prepare: "nope", main: "nope" },
  });
  for (const s of steps) {
    const set = sets.find((x) => x.slot.id === s.slot);
    assert.ok(set.candidates.some((c) => c.course.id === s.courseId));
    assert.equal(s.why, null, "a why written for an off-list pick is dropped");
  }
});

test("unsure field + interest ranking steers toward top interest fields", () => {
  const profile = { ...BASE, field: "unsure" };
  const interestRanking = [{ id: "tech" }, { id: "science" }, { id: "design" }];
  const { steps } = build(profile, { interestRanking });
  for (const s of steps) {
    const dirs = catalogue.get(s.courseId).directionIds;
    assert.ok(dirs.some((d) => ["tech", "science", "design"].includes(d)));
  }
});

test("manage ops: add, swap, move, remove with guards", () => {
  let { steps } = build(BASE);
  steps = addStep(steps, catalogue, BASE, { courseId: "social-short", seq: 99 });
  assert.equal(steps.at(-1).courseId, "social-short");
  assert.equal(steps.at(-1).addedBy, "user");
  assert.throws(() => addStep(steps, catalogue, BASE, { courseId: "social-short", seq: 100 }), /already on your path/);
  assert.throws(() => addStep(steps, catalogue, BASE, { courseId: "nope", seq: 100 }), /not in the catalogue/);

  const firstId = steps[0].id;
  steps = swapStep(steps, catalogue, BASE, { stepId: firstId, courseId: "science-short" });
  assert.equal(steps[0].id, firstId, "a swap keeps the step id");
  assert.equal(steps[0].courseId, "science-short");

  steps = moveStep(steps, { stepId: firstId, direction: "down" });
  assert.equal(steps[1].id, firstId);
  assert.deepEqual(moveStep(steps, { stepId: steps[0].id, direction: "up" }), steps, "edge move is a no-op");

  steps = removeStep(steps, { stepId: firstId });
  assert.ok(!steps.some((s) => s.id === firstId));
  assert.throws(() => removeStep([steps[0]], { stepId: steps[0].id }), /at least one step/);
});

test("pathTotals sums duration and fees and lists cities", () => {
  const steps = [{ courseId: "healthcare-short" }, { courseId: "healthcare-undergrad" }];
  const t = pathTotals(steps, catalogue);
  const a = catalogue.get("healthcare-short");
  const b = catalogue.get("healthcare-undergrad");
  assert.equal(t.months, a.durationMonths + b.durationMonths);
  assert.equal(t.fees, a.totalFeeEur + b.totalFeeEur);
});

test("location/time rules treat online as compatible", () => {
  const online = catalogue.get("tech-short");
  assert.equal(online.mode, "online");
  assert.ok(meets(online, { location: "galway" }, "location"));
  assert.ok(meets(online, { time: "full_time" }, "time"));
  assert.ok(!meets(catalogue.get("tech-undergrad"), { location: "online_only" }, "location"));
});
