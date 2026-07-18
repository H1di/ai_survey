const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildOrientedFieldPrompt,
  buildRefinementPrompt,
  buildWhyThisFitsPrompt,
} = require("../prompts");
const { createAiEngine, resolveShortlistSoc } = require("../aiEngine");
const { getOccupation } = require("../onet");
const { getDirection } = require("../directions");
const { JOB_CHAR_PARAM_IDS } = require("../questionPool");

const engine = createAiEngine({ apiKey: undefined, model: "test" });

function fakeSession(overrides = {}) {
  return {
    dreamAnswer: "help people recover",
    cvIntent: "new",
    demographics: { age: 28, country: "Testland", city: "Testville" },
    bigFiveScores: { O: 55, C: 60, E: 65, A: 75, N: 40 },
    derivedTraits: null,
    riasecScores: { R: 25, I: 55, A: 30, S: 90, E: 45, C: 35 },
    riasecCode: "SIE",
    riasecInferred: false,
    jobCharRanking: [...JOB_CHAR_PARAM_IDS],
    jobCharProfile: {
      compensation: 55, work_mode: 40, job_security: 70, career_growth: 60,
      complexity: 50, meaning_impact: 90, social: 85,
    },
    cvAnalysis: null,
    cvText: null,
    careerJourneyAnswers: {},
    outputs: [],
    ...overrides,
  };
}

const SHORTLIST = [
  { soc: "29-1141.00", title: "Registered Nurses", blurb: "Assess patient health problems and needs." },
  { soc: "21-1093.00", title: "Social and Human Service Assistants", blurb: "Provide client services." },
];

test("oriented-field prompt lists the occupation shortlist and demands a socCode from it", () => {
  const { system, user } = buildOrientedFieldPrompt({
    profileDigest: "digest",
    directionHint: [{ id: "healthcare", label: "Healthcare & Wellbeing" }],
    occupationShortlist: SHORTLIST,
  });
  assert.match(system, /"socCode"/);
  assert.match(system, /FROM THIS LIST/i);
  assert.match(user, /\[29-1141\.00\] Registered Nurses — Assess patient health problems and needs\./);
  assert.match(user, /\[21-1093\.00\] Social and Human Service Assistants/);
});

test("refinement prompt carries the shortlist too", () => {
  const { system, user } = buildRefinementPrompt({
    profileDigest: "digest",
    previousOutput: { orientedField: "Healthcare", jobTitle: "Registered Nurse", thesis: "t" },
    changes: [{ param: "work_mode", reason: "more remote" }],
    occupationShortlist: SHORTLIST,
  });
  assert.match(system, /"socCode"/);
  assert.match(user, /\[21-1093\.00\] Social and Human Service Assistants/);
  // Without this instruction the model degenerates parameterFit to bare
  // numbers on refine (observed live) — the oriented-field prompt always had
  // it, the refinement prompt must too.
  assert.match(system, /parameterFit explains the job/);
  assert.match(system, /full sentence/);
});

test("whyThisFits prompt grounds skills in O*NET when provided", () => {
  const { user } = buildWhyThisFitsPrompt({
    profileDigest: "digest",
    output: { jobTitle: "Registered Nurse", orientedField: "Healthcare", thesis: "t" },
    topValueLabel: "Relationships",
    onetSkills: ["Service Orientation", "Active Listening"],
  });
  assert.match(user, /O\*NET.*Service Orientation, Active Listening/);
});

test("resolveShortlistSoc keeps a valid socCode, falls back to title match, then to the top candidate", () => {
  assert.equal(resolveShortlistSoc({ socCode: "21-1093.00" }, SHORTLIST), "21-1093.00");
  assert.equal(
    resolveShortlistSoc({ socCode: "99-0000.00", jobTitle: "registered nurses" }, SHORTLIST),
    "29-1141.00"
  );
  assert.equal(resolveShortlistSoc({ jobTitle: "Nonexistent Job" }, SHORTLIST), "29-1141.00");
  assert.equal(resolveShortlistSoc({}, []), null);
});

test("keyless first output is a real snapshot occupation with a socCode", async () => {
  const output = await engine.generateFirstOutput({ session: fakeSession() });
  const occupation = getOccupation(output.socCode);
  assert.ok(occupation, `socCode ${output.socCode} must exist in the snapshot`);
  assert.equal(output.jobTitle, occupation.title);
  assert.equal(output.thesis, occupation.blurb);
  assert.equal(output.directionId, occupation.directionId);
  assert.equal(output.orientedField, getDirection(occupation.directionId).label);
  // Social-dominant profile must not land in a hands-off family
  assert.ok(output.whyFit.length > 0);
});

test("keyless refine moves to a different occupation and never repeats a SOC", async () => {
  const session = fakeSession();
  const first = await engine.generateFirstOutput({ session });
  session.outputs = [first];

  const refined = await engine.refineOutput({
    session,
    previousOutput: first,
    changes: [{ param: "work_mode", reason: "want more remote work" }],
  });
  assert.ok(refined.socCode);
  assert.notEqual(refined.socCode, first.socCode);
  assert.equal(getOccupation(refined.socCode).title, refined.jobTitle);
});

test("keyless notSuitable excludes whole direction families", async () => {
  const session = fakeSession();
  const first = await engine.generateFirstOutput({ session });
  session.outputs = [first];

  const second = await engine.generateFirstOutput({
    session,
    excludeDirectionIds: [first.directionId],
  });
  assert.notEqual(second.directionId, first.directionId);
  assert.notEqual(second.socCode, first.socCode);
});

test("keyless whyThisFits names O*NET skills to develop for the chosen occupation", async () => {
  const session = fakeSession();
  const output = await engine.generateFirstOutput({ session });
  const why = await engine.generateWhyThisFits({ session, output });
  const occupation = getOccupation(output.socCode);
  // At least one suggested skill comes straight from the O*NET skill list.
  assert.ok(
    why.skillsToDevelop.some((s) => occupation.skills.includes(s)),
    `${JSON.stringify(why.skillsToDevelop)} should overlap ${JSON.stringify(occupation.skills)}`
  );
});
