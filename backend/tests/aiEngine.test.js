const test = require("node:test");
const assert = require("node:assert/strict");
const { createAiEngine } = require("../aiEngine");
const { DIRECTION_IDS } = require("../directions");

// No apiKey -> client is null -> every call takes the deterministic fallback.
const engine = createAiEngine({ apiKey: undefined, model: "test" });

function fakeSession(overrides = {}) {
  return {
    dreamAnswer: "build things",
    cvIntent: "new",
    demographics: { age: 30, country: "Testland", city: "Testville" },
    bigFiveScores: { O: 70, C: 60, E: 40, A: 55, N: 45 },
    derivedTraits: null,
    riasecScores: { R: 30, I: 80, A: 55, S: 40, E: 35, C: 45 },
    riasecCode: "IAC",
    riasecInferred: false,
    userValues: {
      order: ["achievement", "independence", "recognition", "relationships", "support", "working_conditions"],
      scores: { achievement: 100, independence: 84, recognition: 68, relationships: 52, support: 36, working_conditions: 20 },
      source: "tournament",
      confidence: "explicit",
    },
    cvAnalysis: null,
    cvText: null,
    careerJourneyAnswers: {},
    outputs: [],
    ...overrides,
  };
}

// --- output loop (Phase 3) ---

test("keyless first output: grounded in the top-ranked direction", async () => {
  const output = await engine.generateFirstOutput({ session: fakeSession() });
  assert.ok(DIRECTION_IDS.includes(output.directionId));
  assert.ok(output.orientedField && output.jobTitle && output.thesis);
  assert.ok(output.whyFit && output.firstMilestone && output.constraintsNote);
  assert.equal(output.parameterFit, undefined, "no 7-parameter fit block remains");
  // High-Investigative profile should not land in a Social/Enterprising family
  assert.ok(["science", "tech", "finance", "design"].includes(output.directionId), output.directionId);
});

test("keyless first output honors excluded direction ids (notSuitable path)", async () => {
  const session = fakeSession();
  const first = await engine.generateFirstOutput({ session });
  const second = await engine.generateFirstOutput({
    session: fakeSession({ outputs: [{ jobTitle: first.jobTitle }] }),
    excludeDirectionIds: [first.directionId],
  });
  assert.notEqual(second.directionId, first.directionId, "excluded family must not repeat");
});

test("keyless output detail: four blocks with 2+ entries, localized", async () => {
  const output = { jobTitle: "Agronomist", orientedField: "Agriculture & Environment", thesis: "t" };
  const detail = await engine.generateOutputDetail({ session: fakeSession(), output });
  for (const block of ["aiRecommendations", "events", "universities", "courses"]) {
    assert.ok(Array.isArray(detail[block]) && detail[block].length >= 2, `${block} too small`);
  }
  assert.match(detail.aiRecommendations[0].detail, /Testville/);
});

test("keyless roadmap targets the accepted output", async () => {
  const output = { id: "output_2", jobTitle: "Data Analyst", orientedField: "Finance", thesis: "t" };
  const roadmap = await engine.generateRoadmap({ session: fakeSession(), output });
  assert.equal(roadmap.professionId, "output_2");
  assert.ok(roadmap.stages.length >= 4);
  roadmap.stages.forEach((s, i) => {
    assert.equal(s.id, `stage_${i + 1}`);
    assert.ok(s.title && s.description);
  });
});

test("direction-era generators are gone", () => {
  assert.equal(engine.generateDirectionQuestions, undefined);
  assert.equal(engine.generateNarrowingQuestions, undefined);
  assert.equal(engine.generateProfessions, undefined);
  assert.equal(engine.refineDirection, undefined);
});

// --- output normalizers ---

const { normalizeOutputPayload, normalizeOutputDetailPayload } = require("../aiEngine");

function goodOutputPayload() {
  return {
    orientedField: "Healthcare",
    jobTitle: "Hospice Nurse",
    thesis: "Care work.",
    whyFit: "Fits.",
    firstMilestone: "Shadow a nurse.",
    constraintsNote: "Licensing required.",
  };
}

test("normalizeOutputPayload requires every field", () => {
  const output = normalizeOutputPayload(goodOutputPayload());
  assert.equal(output.jobTitle, "Hospice Nurse");
  assert.equal(output.parameterFit, undefined, "the fit block is no longer normalized");

  assert.throws(() => normalizeOutputPayload({ ...goodOutputPayload(), jobTitle: " " }), /jobTitle/);
  assert.throws(() => normalizeOutputPayload({ ...goodOutputPayload(), whyFit: "" }), /whyFit/);
});

test("normalizeOutputDetailPayload enforces 2-4 valid entries per block", () => {
  const good = {
    aiRecommendations: [{ title: "a", detail: "b" }, { title: "c", detail: "d" }],
    events: [{ name: "a", why: "b" }, { name: "c", why: "d" }, { name: "e", why: "f" }],
    universities: [{ name: "a", program: "b" }, { name: "c", program: "d" }],
    courses: [{ name: "a", provider: "b", why: "c" }, { name: "d", provider: "e", why: "f" }],
  };
  const detail = normalizeOutputDetailPayload(good);
  assert.equal(detail.events.length, 3);

  const bad = { ...good, courses: [{ name: "a", provider: "", why: "c" }, { name: "d" }] };
  assert.throws(() => normalizeOutputDetailPayload(bad), /courses/);
});

// --- v2 generators (RIASEC, job characteristics, CV) ---

const {
  normalizeRiasecScoresPayload,
  normalizeCvAnalysisPayload,
  normalizePersonaSummaryPayload,
  normalizeWhyThisFitsPayload,
} = require("../aiEngine");

test("keyless whyThisFits: fixed counts, every bullet traces to profile signal", async () => {
  const session = fakeSession();
  const output = await engine.generateFirstOutput({ session });
  const why = await engine.generateWhyThisFits({ session, output });
  assert.equal(why.personality.length, 2);
  assert.equal(why.interests.length, 1);
  assert.equal(why.values.length, 1);
  assert.ok(why.currentSkills.length >= 2 && why.currentSkills.length <= 3);
  assert.ok(why.skillsToDevelop.length >= 3 && why.skillsToDevelop.length <= 4);
  // Traceability: the bullets quote the signal they rest on.
  assert.match(why.interests[0].point, /IAC/);
  assert.match(why.values[0].point, /Achievement/);
  assert.match(why.personality[0].point, /\/100/);
});

test("keyless whyThisFits quotes parsed CV skills when they exist", async () => {
  const session = fakeSession({
    cvAnalysis: { skills: ["welding", "blueprint reading"], domains: [], seniority: "mid" },
  });
  const output = await engine.generateFirstOutput({ session });
  const why = await engine.generateWhyThisFits({ session, output });
  assert.match(why.currentSkills[0].point, /welding/);
});

test("normalizeWhyThisFitsPayload enforces per-block counts and trims overshoot", () => {
  const good = {
    personality: [{ point: "a" }, { point: "b" }],
    interests: [{ point: "c" }],
    values: [{ point: "d" }],
    currentSkills: [{ point: "e" }, { point: "f" }],
    skillsToDevelop: ["s1", "s2", "s3"],
  };
  const parsed = normalizeWhyThisFitsPayload(good);
  assert.equal(parsed.personality.length, 2);
  assert.deepEqual(parsed.skillsToDevelop, ["s1", "s2", "s3"]);

  const over = normalizeWhyThisFitsPayload({
    ...good,
    currentSkills: [{ point: "e" }, { point: "f" }, { point: "g" }, { point: "h" }],
    skillsToDevelop: ["s1", "s2", "s3", "s4", "s5"],
  });
  assert.equal(over.currentSkills.length, 3, "over-count trimmed");
  assert.equal(over.skillsToDevelop.length, 4, "over-count trimmed");

  assert.throws(() => normalizeWhyThisFitsPayload({ ...good, personality: [{ point: "a" }] }), /personality/);
  assert.throws(() => normalizeWhyThisFitsPayload({ ...good, interests: [] }), /interests/);
  assert.throws(() => normalizeWhyThisFitsPayload({ ...good, skillsToDevelop: ["s1"] }), /skillsToDevelop/);
});

test("keyless persona summary: 3-5 second-person sentences naming the scores", async () => {
  const summary = await engine.generatePersonaSummary({ session: fakeSession() });
  const sentences = summary.split(/[.!?]+/).map((t) => t.trim()).filter(Boolean);
  assert.ok(sentences.length >= 3 && sentences.length <= 5, summary);
  assert.match(summary, /\byou\b/i);
  assert.match(summary, /Openness 70/);
  assert.match(summary, /Emotional Steadiness 55/);
});

test("normalizePersonaSummaryPayload enforces 3-5 sentences and non-empty text", () => {
  const good = "You build things. You finish what you start. You avoid crowds.";
  assert.equal(normalizePersonaSummaryPayload({ summary: good }), good);
  assert.throws(() => normalizePersonaSummaryPayload({}), /missing/);
  assert.throws(() => normalizePersonaSummaryPayload({ summary: "One sentence only." }), /3-5/);
  assert.throws(
    () => normalizePersonaSummaryPayload({ summary: "A one. B two. C three. D four. E five. F six." }),
    /3-5/
  );
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

test("normalizeCvAnalysisPayload trims, caps, and requires at least one skill", () => {
  const parsed = normalizeCvAnalysisPayload({
    roles: Array.from({ length: 10 }, (_, i) => ` role ${i} `),
    skills: ["  welding ", "", 42, "safety"],
    domains: ["construction"],
    seniority: "senior",
    keywords: Array.from({ length: 10 }, (_, i) => `kw${i}`),
  });
  assert.deepEqual(parsed.skills, ["welding", "safety"]);
  assert.deepEqual(parsed.domains, ["construction"]);
  assert.equal(parsed.roles.length, 6);
  assert.equal(parsed.roles[0], "role 0");
  assert.equal(parsed.keywords.length, 6);
  assert.equal(parsed.seniority, "senior");
  assert.throws(() => normalizeCvAnalysisPayload({ skills: [], domains: [], seniority: "" }), /skill/);
});

test("keyless engine: analyzeCV returns the honest empty signal", async () => {
  const analysis = await engine.analyzeCV({ cvText: "whatever" });
  assert.deepEqual(analysis, { roles: [], skills: [], domains: [], seniority: "", keywords: [] });
});

test("keyless engine: inferRiasecProfile derives from Big Five", async () => {
  const scores = await engine.inferRiasecProfile({ session: fakeSession({ riasecScores: null }) });
  for (const key of ["R", "I", "A", "S", "E", "C"]) {
    assert.ok(scores[key] >= 0 && scores[key] <= 100);
  }
});

// Work-value scoring moved out of aiEngine entirely: profession values now come
// from the O*NET snapshot + per-direction prototype (backend/workValues.js,
// covered in workValues.test.js), and user values from the pairwise tournament
// (valuesTournament.test.js). aiEngine no longer scores or infers values.

// --- runJsonCompletion (token ceilings) ---

const { runJsonCompletion } = require("../aiEngine");

test("runJsonCompletion forwards an explicit max_tokens ceiling", async () => {
  let captured;
  const fakeClient = {
    chat: {
      completions: {
        create: async (args) => {
          captured = args;
          return { choices: [{ message: { content: '{"ok":true}' } }] };
        },
      },
    },
  };
  const parsed = await runJsonCompletion(fakeClient, {
    model: "m",
    system: "s",
    user: "u",
    temperature: 0,
    maxTokens: 300,
  });
  assert.equal(captured.max_tokens, 300);
  assert.equal(captured.temperature, 0);
  assert.equal(parsed.ok, true);
});
