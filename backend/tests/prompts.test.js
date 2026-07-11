const test = require("node:test");
const assert = require("node:assert/strict");
const prompts = require("../prompts");

const PROFILE = "Entry intent: find\nDream answer: build things";
const PROFESSION = { id: "output_1", title: "Software Developer", summary: "s" };

test("roadmap prompt demands 5-7 ordered stages for the profession", () => {
  const { system, user } = prompts.buildRoadmapPrompt({
    profileDigest: PROFILE,
    direction: { label: "Programming & Technology" },
    profession: PROFESSION,
  });
  assert.match(system, /"stages"/);
  assert.match(system, /5.*7|5-7/);
  assert.match(system, /order/i);
  assert.match(user, /Software Developer/);
  assert.match(user, /Programming & Technology/);
});

test("direction-era and branch templates are removed, Page 2 templates kept", () => {
  assert.equal(prompts.buildInitialBranchPrompts, undefined);
  assert.equal(prompts.buildEvolutionPrompts, undefined);
  assert.equal(prompts.buildDirectionQuestionsPrompt, undefined);
  assert.equal(prompts.buildDirectionRefinePrompt, undefined);
  assert.equal(prompts.buildNarrowingQuestionsPrompt, undefined);
  assert.equal(prompts.buildProfessionsPrompt, undefined);
  assert.equal(prompts.buildAnswersDigest, undefined);
  assert.equal(typeof prompts.buildProfileDigest, "function");
  assert.equal(typeof prompts.buildBigFiveItemsPrompt, "function");
});

// --- output loop (Phase 3) ---

test("oriented field prompt: schema, 7-parameter fit, hint and exclusions", () => {
  const { system, user } = prompts.buildOrientedFieldPrompt({
    profileDigest: PROFILE,
    directionHint: [
      { id: "science", label: "Science & Research" },
      { id: "design", label: "Design & Creative Industries" },
    ],
    excludeFields: ["Programming & Technology"],
  });
  assert.match(system, /"orientedField"/);
  assert.match(system, /"parameterFit"/);
  assert.match(system, /"meaning_impact"/);
  assert.match(system, /EACH of the 7 parameters/);
  assert.match(system, /Science & Research, Design & Creative Industries/);
  assert.match(system, /rejected these field families.*Programming & Technology/);
  assert.match(user, /build things/);
});

test("refinement prompt embeds previous output, changes, and changeSummary", () => {
  const { system, user } = prompts.buildRefinementPrompt({
    profileDigest: PROFILE,
    previousOutput: { orientedField: "Design", jobTitle: "UX Researcher", thesis: "t" },
    changes: [{ param: "compensation", reason: "need more upside" }],
  });
  assert.match(system, /"changeSummary"/);
  assert.match(system, /keeps everything else the same/);
  assert.match(user, /UX Researcher/);
  assert.match(user, /compensation: need more upside/);
});

test("output detail prompt demands the four advice blocks", () => {
  const { system, user } = prompts.buildOutputDetailPrompt({
    profileDigest: PROFILE,
    output: { jobTitle: "Agronomist", orientedField: "Agriculture & Environment", thesis: "t" },
  });
  assert.match(system, /"aiRecommendations"/);
  assert.match(system, /"events"/);
  assert.match(system, /"universities"/);
  assert.match(system, /"courses"/);
  assert.match(user, /Agronomist/);
});

// --- profile digest (Phase 1) ---

const DIGEST_FIXTURE = {
  entryChoice: "change",
  dreamAnswer: "open a bakery",
  cvIntent: "use_skills",
  demographics: { sex: "female", age: 34, country: "Poland", city: "Kraków" },
  bigFiveScores: { O: 80, C: 55, E: 40, A: 70, N: 45 },
  derivedTraits: { behaviourTendencies: 60, decisionPriorities: 60, summary: "Balanced." },
  riasecScores: { R: 30, I: 60, A: 85, S: 70, E: 40, C: 35 },
  riasecCode: "ASI",
  riasecInferred: false,
  jobCharRanking: ["meaning_impact", "work_mode", "compensation", "social", "complexity", "career_growth", "job_security"],
  jobCharProfile: { compensation: 45, work_mode: 90, job_security: 50, career_growth: 50, complexity: 60, meaning_impact: 95, social: 65 },
  cvAnalysis: { skills: ["pastry", "team leadership"], domains: ["food service"], seniority: "mid" },
  cvText: "…",
  careerJourneyAnswers: {},
};

test("profile digest carries city, RIASEC, ranked jobChar targets, CV signal", () => {
  const digest = prompts.buildProfileDigest(DIGEST_FIXTURE);
  assert.match(digest, /City: Kraków/);
  assert.match(digest, /code ASI \(measured\)/);
  assert.match(digest, /1\. Meaning \/ Impact: 95\/100/);
  assert.match(digest, /7\. Job Security: 50\/100/);
  assert.match(digest, /skills \[pastry, team leadership\]/);
  assert.ok(!/Values inventory/.test(digest), "old values block is gone");
});

test("digest falls back to journey summary / raw excerpt without cvAnalysis", () => {
  const journey = prompts.buildProfileDigest({
    ...DIGEST_FIXTURE,
    cvAnalysis: null,
    cvText: null,
    careerJourneyAnswers: { cj_education: "BSc economics" },
  });
  assert.match(journey, /Career journey:/);
  assert.match(journey, /BSc economics/);

  const unparsed = prompts.buildProfileDigest({
    ...DIGEST_FIXTURE,
    cvAnalysis: { skills: [], domains: [], seniority: "" },
  });
  assert.match(unparsed, /CV provided \(unparsed excerpt\)/);
});

test("inferred RIASEC is flagged low-confidence in the digest", () => {
  const digest = prompts.buildProfileDigest({ ...DIGEST_FIXTURE, riasecInferred: true });
  assert.match(digest, /code ASI \(inferred, low confidence\)/);
});

test("riasec items prompt pins count and JSON schema", () => {
  const { system, user } = prompts.buildRiasecItemsPrompt(12);
  assert.match(system, /exactly 12 items/);
  assert.match(system, /"type":"R\|I\|A\|S\|E\|C"/);
  assert.match(user, /12/);
});

test("jobChar questions prompt embeds ranking order and count", () => {
  const { system, user } = prompts.buildJobCharQuestionsPrompt({
    ranking: DIGEST_FIXTURE.jobCharRanking,
    count: 5,
  });
  assert.match(system, /exactly 5 questions/);
  assert.match(user, /meaning_impact, work_mode, compensation/);
});

test("cv parse prompt embeds the text and the target schema", () => {
  const { system, user } = prompts.buildCvParsePrompt("10 years as a nurse");
  assert.match(system, /"skills":\[/);
  assert.match(user, /10 years as a nurse/);
});

test("riasec inference prompt includes Big Five and dream", () => {
  const { user } = prompts.buildRiasecInferencePrompt({
    bigFiveScores: DIGEST_FIXTURE.bigFiveScores,
    dreamAnswer: "open a bakery",
  });
  assert.match(user, /O=80/);
  assert.match(user, /open a bakery/);
});

// --- Schwartz (Phase 2) ---

test("user values inference prompt demands the 10-score schema over the digest", () => {
  const { system, user } = prompts.buildUserValuesInferencePrompt({ profileDigest: "PROFILE_TEXT" });
  assert.match(system, /"schwartzValues"/);
  assert.match(system, /self_direction, stimulation, hedonism, achievement, power, security, conformity, tradition, benevolence, universalism/);
  assert.match(system, /flat/i);
  assert.match(user, /PROFILE_TEXT/);
});

test("profession values prompt scores the role, lists circular order, caps rationale at top-3", () => {
  const { system, user } = prompts.buildProfessionValuesProfilePrompt({
    jobTitle: "Hospice Nurse",
    orientedField: "Healthcare",
    thesis: "Care work with deep human contact.",
  });
  assert.match(system, /"schwartzValues"/);
  assert.match(system, /"valuesRationale"/);
  assert.match(system, /ROLE structurally rewards/);
  assert.match(system, /self_direction, stimulation, hedonism, achievement, power, security, conformity, tradition, benevolence, universalism/);
  assert.match(system, /3 highest values only/);
  assert.match(user, /Hospice Nurse/);
  assert.match(user, /Healthcare/);
  assert.match(user, /deep human contact/);
});
