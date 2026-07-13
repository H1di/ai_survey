const test = require("node:test");
const assert = require("node:assert/strict");
const { createAiEngine } = require("../aiEngine");
const { DIRECTION_IDS } = require("../directions");
const { JOB_CHAR_PARAM_IDS } = require("../questionPool");

// No apiKey -> client is null -> every call takes the deterministic fallback.
const engine = createAiEngine({ apiKey: undefined, model: "test" });

function fakeSession(overrides = {}) {
  return {
    entryChoice: "find",
    dreamAnswer: "build things",
    cvIntent: "new",
    demographics: { age: 30, country: "Testland", city: "Testville" },
    bigFiveScores: { O: 70, C: 60, E: 40, A: 55, N: 45 },
    derivedTraits: null,
    riasecScores: { R: 30, I: 80, A: 55, S: 40, E: 35, C: 45 },
    riasecCode: "IAC",
    riasecInferred: false,
    jobCharRanking: [...JOB_CHAR_PARAM_IDS],
    jobCharProfile: { compensation: 60, work_mode: 80, job_security: 40, career_growth: 55, complexity: 85, meaning_impact: 70, social: 30 },
    cvAnalysis: null,
    cvText: null,
    careerJourneyAnswers: {},
    outputs: [],
    ...overrides,
  };
}

// --- output loop (Phase 3) ---

test("keyless first output: grounded in the top-ranked direction with full parameterFit", async () => {
  const output = await engine.generateFirstOutput({ session: fakeSession() });
  assert.ok(DIRECTION_IDS.includes(output.directionId));
  assert.ok(output.orientedField && output.jobTitle && output.thesis);
  assert.ok(output.whyFit && output.firstMilestone && output.constraintsNote);
  for (const param of JOB_CHAR_PARAM_IDS) {
    assert.ok(output.parameterFit[param], `parameterFit missing ${param}`);
  }
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

test("keyless refineOutput: same family next seed, changed params rewritten, changeSummary present", async () => {
  const session = fakeSession();
  const first = await engine.generateFirstOutput({ session });
  session.outputs = [first];
  const refined = await engine.refineOutput({
    session,
    previousOutput: first,
    changes: [{ param: "compensation", reason: "need more upside" }],
  });
  assert.notEqual(refined.jobTitle, first.jobTitle, "must move to a different seed");
  assert.match(refined.parameterFit.compensation, /need more upside/);
  assert.ok(refined.changeSummary);
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
    parameterFit: Object.fromEntries(JOB_CHAR_PARAM_IDS.map((p) => [p, `${p} line`])),
    whyFit: "Fits.",
    firstMilestone: "Shadow a nurse.",
    constraintsNote: "Licensing required.",
  };
}

test("normalizeOutputPayload requires every field and all 7 fit lines", () => {
  const output = normalizeOutputPayload(goodOutputPayload());
  assert.equal(output.jobTitle, "Hospice Nurse");
  assert.equal(output.changeSummary, undefined, "absent changeSummary stays absent");

  const withSummary = normalizeOutputPayload({ ...goodOutputPayload(), changeSummary: "Moved pay up." });
  assert.equal(withSummary.changeSummary, "Moved pay up.");

  assert.throws(() => normalizeOutputPayload({ ...goodOutputPayload(), jobTitle: " " }), /jobTitle/);
  const missingFit = goodOutputPayload();
  delete missingFit.parameterFit.social;
  assert.throws(() => normalizeOutputPayload(missingFit), /social/);
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
  normalizeJobCharQuestionsPayload,
  normalizeCvAnalysisPayload,
  normalizePersonaSummaryPayload,
} = require("../aiEngine");

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

test("keyless engine: analyzeCV returns the honest empty signal", async () => {
  const analysis = await engine.analyzeCV({ cvText: "whatever" });
  assert.deepEqual(analysis, { skills: [], domains: [], seniority: "" });
});

test("keyless engine: inferRiasecProfile derives from Big Five; jobChar questions from the bank", async () => {
  const scores = await engine.inferRiasecProfile({ session: fakeSession({ riasecScores: null }) });
  for (const key of ["R", "I", "A", "S", "E", "C"]) {
    assert.ok(scores[key] >= 0 && scores[key] <= 100);
  }
  const ranking = ["social", "compensation", "work_mode", "job_security", "career_growth", "complexity", "meaning_impact"];
  const questions = await engine.generateJobCharQuestions({ session: fakeSession(), ranking, count: 5 });
  assert.equal(questions.length, 5);
  assert.equal(questions[0].param, "social");
});

// --- Schwartz values (Phase 2) ---

const { normalizeSchwartzValuesPayload } = require("../aiEngine");
const { SCHWARTZ_ORDER } = require("../schwartzValues");

const GOOD_SCHWARTZ = {
  self_direction: 90, stimulation: 75, hedonism: 55, achievement: 60, power: 25,
  security: 30, conformity: 20, tradition: 15, benevolence: 55, universalism: 70,
};

test("normalizeSchwartzValuesPayload clamps, requires all keys, rejects flat profiles", () => {
  const { scores, rationale } = normalizeSchwartzValuesPayload({
    schwartzValues: { ...GOOD_SCHWARTZ, self_direction: 150.7, tradition: -3 },
    valuesRationale: { self_direction: "Creates and explores.", bogus_key: "x", universalism: "Cares broadly.", stimulation: "Variety.", power: "extra beyond three" },
  });
  assert.equal(scores.self_direction, 100);
  assert.equal(scores.tradition, 0);
  assert.equal(rationale.bogus_key, undefined, "invalid keys dropped");
  assert.ok(Object.keys(rationale).length <= 3, "rationale capped at 3");

  const missing = { ...GOOD_SCHWARTZ };
  delete missing.universalism;
  assert.throws(() => normalizeSchwartzValuesPayload({ schwartzValues: missing }), /missing/i);

  const flat = Object.fromEntries(SCHWARTZ_ORDER.map((k) => [k, 50]));
  assert.throws(() => normalizeSchwartzValuesPayload({ schwartzValues: flat }), /flat/i);
});

test("keyless inferUserValues: non-flat in-range profile from a varied session", async () => {
  const scores = await engine.inferUserValues({
    session: fakeSession({
      riasecScores: { R: 20, I: 70, A: 85, S: 60, E: 40, C: 25 },
      jobCharProfile: { compensation: 30, work_mode: 85, job_security: 20, career_growth: 45, complexity: 80, meaning_impact: 90, social: 60 },
    }),
  });
  for (const key of SCHWARTZ_ORDER) {
    assert.ok(scores[key] >= 0 && scores[key] <= 100, `${key} out of range`);
  }
  const nums = SCHWARTZ_ORDER.map((k) => scores[k]);
  assert.ok(Math.max(...nums) - Math.min(...nums) >= 15, "profile must not be flat");
});

test("keyless scoreProfessionValues: prototype-based profile + top-value rationale", async () => {
  const { schwartzValues, valuesRationale } = await engine.scoreProfessionValues({
    jobTitle: "Data Scientist",
    orientedField: "Science & Research",
    thesis: "Investigative modeling work.",
    directionId: "science",
    jobCharProfile: { meaning_impact: 90 },
  });
  for (const key of SCHWARTZ_ORDER) {
    assert.ok(schwartzValues[key] >= 0 && schwartzValues[key] <= 100);
  }
  assert.equal(Object.keys(valuesRationale).length, 1, "fallback carries one top-value line");
});
