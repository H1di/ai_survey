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

test("generateBigFiveItems: AI_BIG_FIVE_ITEMS=false forces static IPIP even with a client", async () => {
  // AI-generated items are the default when a key exists (v2); the flag set
  // to false must force the static set with no network call attempted (a
  // fake key would explode otherwise).
  process.env.AI_BIG_FIVE_ITEMS = "false";
  try {
    const keyedEngine = createAiEngine({ apiKey: "sk-fake", model: "test" });
    const items = await keyedEngine.generateBigFiveItems({ depth: "deep" });
    assert.equal(items.length, 50);
    assert.equal(items[0].id, "ipip_1");
  } finally {
    delete process.env.AI_BIG_FIVE_ITEMS;
  }
});

// --- v2 generators (RIASEC, job characteristics, CV) ---

const {
  normalizeRiasecItemsPayload,
  normalizeRiasecScoresPayload,
  normalizeJobCharQuestionsPayload,
  normalizeCvAnalysisPayload,
} = require("../aiEngine");
const { getFallbackRiasecItems } = require("../riasecItems");

test("normalizeRiasecItemsPayload enforces count, per-type balance, unique texts", () => {
  const good = { items: getFallbackRiasecItems("short").map(({ type, text }) => ({ type, text })) };
  const items = normalizeRiasecItemsPayload(good, 12);
  assert.equal(items.length, 12);
  assert.deepEqual(items.map((i) => i.id), items.map((_, n) => `ri_${n + 1}`));

  assert.throws(() => normalizeRiasecItemsPayload({ items: good.items.slice(0, 11) }, 12), /Expected 12/);
  const lopsided = { items: good.items.map((i) => ({ ...i, type: "R" })) };
  assert.throws(() => normalizeRiasecItemsPayload(lopsided, 12), /type R/);
  const dupes = { items: good.items.map((i) => ({ ...i, text: "Same text" })) };
  assert.throws(() => normalizeRiasecItemsPayload(dupes, 12), /Duplicate/);
});

test("normalizeRiasecScoresPayload clamps and requires all six keys", () => {
  const scores = normalizeRiasecScoresPayload({ scores: { R: -5, I: 200, A: 50.6, S: 0, E: 100, C: 33 } });
  assert.deepEqual(scores, { R: 0, I: 100, A: 51, S: 0, E: 100, C: 33 });
  assert.throws(() => normalizeRiasecScoresPayload({ scores: { R: 1, I: 2, A: 3, S: 4, E: 5 } }), /missing/i);
  assert.throws(
    () => normalizeRiasecScoresPayload({ scores: { R: "high", I: 2, A: 3, S: 4, E: 5, C: 6 } }),
    /missing|number/i
  );
});

test("normalizeJobCharQuestionsPayload validates params, options, and sorts by ranking", () => {
  const ranking = ["social", "compensation", "work_mode", "job_security", "career_growth", "complexity", "meaning_impact"];
  const payload = {
    items: [
      { param: "compensation", text: "Money?", options: [{ value: 90, label: "Max" }, { value: 40, label: "Med" }, { value: 10, label: "Low" }] },
      { param: "social", text: "People?", options: [{ value: 80, label: "Lots" }, { value: 20, label: "Few" }, { value: 50, label: "Some" }] },
    ],
  };
  const items = normalizeJobCharQuestionsPayload(payload, { count: 2, ranking });
  assert.equal(items[0].param, "social", "items re-sorted into ranking order");
  assert.deepEqual(items.map((i) => i.id), ["jc_1", "jc_2"]);

  assert.throws(() => normalizeJobCharQuestionsPayload({ items: [payload.items[0]] }, { count: 2, ranking }), /Expected 2/);
  const badParam = { items: [{ ...payload.items[0], param: "salary" }, payload.items[1]] };
  assert.throws(() => normalizeJobCharQuestionsPayload(badParam, { count: 2, ranking }), /param/);
  const twoOptions = { items: [{ ...payload.items[0], options: payload.items[0].options.slice(0, 2) }, payload.items[1]] };
  assert.throws(() => normalizeJobCharQuestionsPayload(twoOptions, { count: 2, ranking }), /3–4 options/);
});

test("normalizeCvAnalysisPayload trims, caps, and requires at least one skill", () => {
  const parsed = normalizeCvAnalysisPayload({
    skills: ["  welding ", "", 42, "safety"],
    domains: ["construction"],
    seniority: "senior",
  });
  assert.deepEqual(parsed, { skills: ["welding", "safety"], domains: ["construction"], seniority: "senior" });
  assert.throws(() => normalizeCvAnalysisPayload({ skills: [], domains: [], seniority: "" }), /skill/);
});

test("keyless engine: riasec items fall back to the static pool, analyzeCV to empty signal", async () => {
  const items = await engine.generateRiasecItems({ depth: "deep" });
  assert.equal(items.length, 18);
  const analysis = await engine.analyzeCV({ cvText: "whatever" });
  assert.deepEqual(analysis, { skills: [], domains: [], seniority: "" });
});

test("keyless engine: inferRiasecProfile derives from Big Five; jobChar questions from the bank", async () => {
  const scores = await engine.inferRiasecProfile({ session: fakeSession() });
  for (const key of ["R", "I", "A", "S", "E", "C"]) {
    assert.ok(scores[key] >= 0 && scores[key] <= 100);
  }
  const ranking = ["social", "compensation", "work_mode", "job_security", "career_growth", "complexity", "meaning_impact"];
  const questions = await engine.generateJobCharQuestions({ session: fakeSession(), ranking, count: 5 });
  assert.equal(questions.length, 5);
  assert.equal(questions[0].param, "social");
});
