const test = require("node:test");
const assert = require("node:assert/strict");
const prompts = require("../prompts");
const { DIRECTION_IDS } = require("../directions");

const PROFILE = "Entry intent: find\nDream answer: build things";
const DIRECTION = { id: "tech", label: "Programming & Technology" };
const PROFESSION = { id: "prof_1", title: "Software Developer", summary: "s", whyFit: "w", dayToDay: "d" };

test("buildAnswersDigest renders question -> chosen label lines", () => {
  const questions = [
    { id: "q1", text: "Pick one", options: [{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }] },
    { id: "q2", text: "Unanswered", options: [{ value: "a", label: "Alpha" }] },
  ];
  const digest = prompts.buildAnswersDigest(questions, { q1: "b" });
  assert.match(digest, /Pick one/);
  assert.match(digest, /Beta/);
  assert.doesNotMatch(digest, /Unanswered/);
});

test("direction questions prompt lists every direction id and demands exactly 3 questions", () => {
  const { system, user } = prompts.buildDirectionQuestionsPrompt({ profileDigest: PROFILE });
  for (const id of DIRECTION_IDS) assert.match(system, new RegExp(id));
  assert.match(system, /exactly 3 questions/i);
  assert.match(system, /directionId/);
  assert.match(system, /"questions"/);
  assert.match(system, /at least 8 different directionIds/);
  assert.match(system, /at most 2 of the 12 options/);
  assert.match(user, /build things/);
});

test("narrowing questions prompt scopes to the direction and demands exactly 2 questions", () => {
  const { system, user } = prompts.buildNarrowingQuestionsPrompt({ profileDigest: PROFILE, direction: DIRECTION });
  assert.match(system, /exactly 2 questions/i);
  assert.doesNotMatch(system, /directionId/);
  assert.match(user, /Programming & Technology/);
});

test("professions prompt demands exactly 3 professions inside the direction", () => {
  const { system, user } = prompts.buildProfessionsPrompt({
    profileDigest: PROFILE,
    direction: DIRECTION,
    directionDigest: "Q -> A",
    narrowingDigest: "Q -> B",
  });
  assert.match(system, /exactly 3/i);
  assert.match(system, /"professions"/);
  // whyFit must demand multi-part, survey-grounded reasoning
  assert.match(system, /whyFit: 3-5 sentences/);
  assert.match(system, /other two professions/);
  assert.match(system, /Stay inside the confirmed direction/);
  assert.match(user, /Programming & Technology/);
  assert.match(user, /Q -> B/);
});

test("roadmap prompt demands 5-7 ordered stages for the profession", () => {
  const { system, user } = prompts.buildRoadmapPrompt({
    profileDigest: PROFILE,
    direction: DIRECTION,
    profession: PROFESSION,
    narrowingDigest: "Q -> B",
  });
  assert.match(system, /"stages"/);
  assert.match(system, /5.*7|5-7/);
  assert.match(system, /order/i);
  assert.match(user, /Software Developer/);
});

test("old branch templates are removed, Page 2 templates kept", () => {
  assert.equal(prompts.buildInitialBranchPrompts, undefined);
  assert.equal(prompts.buildEvolutionPrompts, undefined);
  assert.equal(typeof prompts.buildProfileDigest, "function");
  assert.equal(typeof prompts.buildBigFiveItemsPrompt, "function");
});

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

test("refine prompt excludes rejected ids, includes feedback, and demands the refine schema", () => {
  const { system, user } = prompts.buildDirectionRefinePrompt({
    profileDigest: PROFILE,
    directionDigest: "Q -> A",
    rejectedDirections: [{ id: "tech", label: "Programming & Technology" }],
    reasonChoice: "interests",
    feedbackText: "I want to work with people",
  });
  assert.match(system, /"directionId"/);
  assert.match(system, /"reason"/);
  assert.match(system, /MUST NOT be any of: tech/);
  assert.doesNotMatch(system, /- tech: Programming/);
  assert.match(system, /- healthcare:/);
  assert.match(user, /I want to work with people/);
  assert.match(user, /interests/);
  assert.match(user, /Programming & Technology/);
});
