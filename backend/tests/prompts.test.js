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
