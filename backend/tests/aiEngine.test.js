const test = require("node:test");
const assert = require("node:assert/strict");
const { createAiEngine } = require("../aiEngine");
const { DIRECTION_IDS } = require("../directions");

// No apiKey -> client is null -> every call takes the deterministic fallback.
const engine = createAiEngine({ apiKey: undefined, model: "test" });

function fakeSession(overrides = {}) {
  return {
    entryChoice: "find",
    dreamAnswer: "build things",
    demographics: { age: 30, country: "Testland" },
    bigFiveScores: { O: 70, C: 60, E: 40, A: 55, N: 45 },
    derivedTraits: null,
    valuesScores: null,
    direction: { id: "tech", label: "Programming & Technology" },
    directionQuestions: [],
    directionAnswers: {},
    narrowingQuestions: [],
    narrowingAnswers: {},
    selectedProfession: { id: "prof_1", title: "Software Developer", summary: "s", whyFit: "w", dayToDay: "d" },
    ...overrides,
  };
}

test("fallback direction questions: 3 questions, 4 options each, valid directionIds, >=10 directions covered", async () => {
  const questions = await engine.generateDirectionQuestions({ session: fakeSession() });
  assert.equal(questions.length, 3);
  const covered = new Set();
  questions.forEach((q, i) => {
    assert.equal(q.id, `dir_q${i + 1}`);
    assert.ok(q.text.length > 0);
    assert.equal(q.options.length, 4);
    for (const o of q.options) {
      assert.ok(o.value && o.label);
      assert.ok(DIRECTION_IDS.includes(o.directionId), `bad directionId ${o.directionId}`);
      covered.add(o.directionId);
    }
  });
  assert.ok(covered.size >= 10, `only ${covered.size} directions covered`);
});

test("fallback narrowing questions: 2 questions, ids nar_q1/nar_q2, no directionId on options", async () => {
  const questions = await engine.generateNarrowingQuestions({ session: fakeSession() });
  assert.equal(questions.length, 2);
  questions.forEach((q, i) => {
    assert.equal(q.id, `nar_q${i + 1}`);
    assert.equal(q.options.length, 4);
    for (const o of q.options) assert.equal(o.directionId, undefined);
  });
});

test("fallback professions: exactly 3 from the direction's seeds with generated whyFit/dayToDay", async () => {
  const professions = await engine.generateProfessions({ session: fakeSession() });
  assert.equal(professions.length, 3);
  professions.forEach((p, i) => {
    assert.equal(p.id, `prof_${i + 1}`);
    assert.ok(p.title && p.summary && p.whyFit && p.dayToDay);
  });
  assert.equal(professions[0].title, "Software Developer");
});

test("fallback professions for an unknown direction still returns 3 (first catalog direction)", async () => {
  const professions = await engine.generateProfessions({
    session: fakeSession({ direction: { id: "nope", label: "Nope" } }),
  });
  assert.equal(professions.length, 3);
});

test("fallback roadmap: 6 ordered stages tied to the selected profession", async () => {
  const roadmap = await engine.generateRoadmap({ session: fakeSession() });
  assert.equal(roadmap.professionId, "prof_1");
  assert.equal(roadmap.stages.length, 6);
  roadmap.stages.forEach((s, i) => {
    assert.equal(s.id, `stage_${i + 1}`);
    assert.ok(s.title && s.description && s.timeframe && s.milestone);
  });
  assert.match(roadmap.stages[5].title, /Software Developer/);
});

test("generateBigFiveItems still works (Page 2 untouched)", async () => {
  const items = await engine.generateBigFiveItems({ depth: "short" });
  assert.equal(items.length, 20);
});

test("old branch methods are gone", () => {
  assert.equal(engine.generateInitialBranch, undefined);
  assert.equal(engine.evolveBranch, undefined);
});

test("refineDirection fallback: excludes rejected ids and carries a reason", async () => {
  const session = fakeSession({
    directionQuestions: [
      { id: "dir_q1", text: "q", options: [
        { value: "a", label: "A", directionId: "tech" },
        { value: "b", label: "B", directionId: "design" },
      ]},
    ],
    directionAnswers: { dir_q1: "a" },
    rejectedDirections: [{ id: "tech", label: "Programming & Technology" }],
  });
  const refined = await engine.refineDirection({ session, reasonChoice: "interests", feedbackText: "" });
  assert.notEqual(refined.id, "tech");
  assert.ok(DIRECTION_IDS.includes(refined.id));
  assert.equal(refined.reason, "Based on your quiz answers, this is your next strongest match.");
});

test("refineDirection fallback: all quiz votes rejected -> first non-rejected catalog direction", async () => {
  const session = fakeSession({
    directionQuestions: [],
    directionAnswers: {},
    rejectedDirections: [
      { id: "tech", label: "x" },
      { id: "healthcare", label: "y" },
    ],
  });
  const refined = await engine.refineDirection({ session, reasonChoice: "environment", feedbackText: "" });
  assert.equal(refined.id, "agriculture");
});

// --- AI Big Five item validator (P1-1) ---

const { normalizeBigFiveItemsPayload } = require("../aiEngine");

function balancedItems(count = 20) {
  const traits = ["O", "C", "E", "A", "N"];
  const perTrait = count / 5;
  const items = [];
  for (const trait of traits) {
    for (let i = 0; i < perTrait; i++) {
      items.push({
        id: `x_${trait}_${i}`,
        trait,
        reverse: i % 2 === 0,
        text: `I do the ${trait} thing number ${i}.`,
      });
    }
  }
  return items;
}

test("item validator accepts a balanced 20-item payload and reassigns ids", () => {
  const items = normalizeBigFiveItemsPayload({ items: balancedItems() }, 20);
  assert.equal(items.length, 20);
  items.forEach((item, idx) => assert.equal(item.id, `ai_${idx + 1}`));
});

test("item validator rejects uneven trait distribution", () => {
  const items = balancedItems();
  items[0].trait = "E"; // O loses one, E gains one
  assert.throws(() => normalizeBigFiveItemsPayload({ items }, 20), /Trait/);
});

test("item validator rejects all-forward keying", () => {
  const items = balancedItems().map((i) => ({ ...i, reverse: false }));
  assert.throws(() => normalizeBigFiveItemsPayload({ items }, 20), /reverse share/);
});

test("item validator rejects duplicate texts and wrong counts", () => {
  const dup = balancedItems();
  dup[1].text = dup[0].text;
  assert.throws(() => normalizeBigFiveItemsPayload({ items: dup }, 20), /Duplicate/);
  assert.throws(() => normalizeBigFiveItemsPayload({ items: balancedItems().slice(1) }, 20), /Expected 20/);
  assert.throws(() => normalizeBigFiveItemsPayload({}, 20), /Expected 20/);
});

test("generateBigFiveItems serves static IPIP by default even with a client", async () => {
  // A key is present but the AI_BIG_FIVE_ITEMS flag is not set -> static set,
  // and no network call is attempted (a fake key would explode otherwise).
  delete process.env.AI_BIG_FIVE_ITEMS;
  const keyedEngine = createAiEngine({ apiKey: "sk-fake", model: "test" });
  const items = await keyedEngine.generateBigFiveItems({ depth: "deep" });
  assert.equal(items.length, 50);
  assert.equal(items[0].id, "ipip_1");
});
