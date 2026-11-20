// Prompt builders for the v2 path-first flow. Every prompt hands the model a
// closed list (catalogue course ids, precomputed scores) and asks it to choose
// and explain — never to score the user or name a course that is not listed.

const { scrubPii } = require("./piiScrub");
const { labelFor } = require("../path/personalQuestions");
const { WORK_VALUES_META } = require("./workValues");

const WORK_VALUE_LABEL = new Map(WORK_VALUES_META.map((m) => [m.id, m.label]));

const SYSTEM = [
  "You are a calm, practical career-path planner for young people in Ireland.",
  "You build step-by-step study roadmaps ONLY from the course list you are given.",
  "Never invent a course, provider, occupation, event, date or price. Never score or label the person.",
  "Respect the person's stated location, budget and time; when a listed course breaks one, say so plainly.",
  "Write short, specific sentences in second person. No buzzwords. Reply with JSON only.",
].join(" ");

function buildProfileDigest(profile, caseInfo) {
  return [
    `Situation: ${labelFor("status", profile.status)} (case: ${caseInfo.label})`,
    `Age band: ${profile.age < 18 ? "under 18" : profile.age < 25 ? "18–24" : "25+"}`,
    `Field: ${labelFor("field", profile.field)}`,
    `Target level: ${labelFor("level", profile.level)}`,
    `Goal (user's words): ${scrubPii(profile.goal)}`,
    `Location: ${labelFor("location", profile.location)}`,
    `Budget: ${labelFor("budget", profile.budget)}`,
    `Time: ${labelFor("time", profile.time)}`,
    `Start: ${labelFor("start", profile.start)}`,
  ].join("\n");
}

function describeCourse(c) {
  return `${c.id} | ${c.title} | ${c.provider} | ${c.award} NFQ ${c.nfqLevel} | ${c.mode} | ${c.city} | €${c.feeEur}/yr | ${c.durationMonths} months | skills: ${c.skills.join(", ")}`;
}

function buildPathPrompt({ profile, caseInfo, sets, note, testsDigest }) {
  const slotBlocks = sets.map(({ slot, candidates }) =>
    [
      `Slot "${slot.id}" — ${slot.label}. Choose ONE id from:`,
      ...candidates.map((c) => `  - ${describeCourse(c.course)} | fit ${c.score}`),
    ].join("\n")
  );
  const user = [
    "PROFILE",
    buildProfileDigest(profile, caseInfo),
    testsDigest ? `\nTEST RESULTS (already scored by fixed rules)\n${testsDigest}` : "",
    note ? `\nTHE PERSON ASKED FOR THIS REBUILD: ${scrubPii(note)}` : "",
    "\nSLOTS (in path order)",
    ...slotBlocks,
    "",
    "Return JSON:",
    '{"summary": "2 sentences on how the path gets them toward their goal",',
    ' "steps": [{"slot": "<slot id>", "courseId": "<one id listed for that slot>", "why": "one sentence, ≤160 chars, tied to their answers"}]}',
    "Use each slot once, in the order given. Prefer higher fit unless their goal or rebuild request argues otherwise.",
  ]
    .filter(Boolean)
    .join("\n");
  return { system: SYSTEM, user };
}

function buildTestsDigest(tests) {
  if (!tests) return "";
  const lines = [];
  if (tests.bigFiveScores) {
    const s = tests.bigFiveScores;
    lines.push(`Big Five (0–100): O ${s.O}, C ${s.C}, E ${s.E}, A ${s.A}, emotional steadiness ${100 - s.N}`);
  }
  if (tests.riasecScores) {
    lines.push(`RIASEC interests (0–100): ${Object.entries(tests.riasecScores).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  }
  if (tests.userValues?.order) {
    lines.push(`Work values, most to least important: ${tests.userValues.order.map((k) => WORK_VALUE_LABEL.get(k) || k).join(" > ")}`);
  }
  const exp = Object.values(tests.experienceAnswers || {}).filter(Boolean);
  if (exp.length) lines.push(`Experience (user's words): ${exp.map((t) => scrubPii(t)).join(" / ")}`);
  return lines.join("\n");
}

function buildGuidancePrompt({ profile, caseInfo, facts, pathCourses, tests }) {
  const user = [
    "PROFILE",
    buildProfileDigest(profile, caseInfo),
    "\nTEST RESULTS (already scored by fixed rules — quote, do not rescore)",
    buildTestsDigest(tests),
    "\nCURRENT PATH",
    ...pathCourses.map((c, i) => `${i + 1}. ${describeCourse(c)}`),
    "\nFACTS",
    `Top interest fields: ${facts.interestTop.map((t) => `${t.label} (${t.score})`).join(", ") || "n/a"}`,
    `Path field: ${facts.pathField?.label || "mixed"}${facts.pathFieldRank ? ` — #${facts.pathFieldRank} in their interest ranking` : ""}`,
    `Real occupations this path leads toward (O*NET): ${facts.occupations.map((o) => `${o.title} (interest fit ${o.interestFit}${o.valuesFit !== null ? `, values fit ${o.valuesFit}` : ""})`).join("; ") || "n/a"}`,
    `Scenarios: ${facts.scenarios.map((s) => `${s.id}: ${s.totals.months} months, €${s.totals.fees} total`).join("; ") || "none"}`,
    "",
    "Return JSON:",
    '{"explanation": "3 sentences: why this path fits them, citing the facts above",',
    ' "points": ["up to 4 short bullets, each tied to one score or answer"],',
    ' "scenarioNotes": {"<scenario id>": "one sentence on who that scenario suits"}}',
  ].join("\n");
  return { system: SYSTEM, user };
}

module.exports = { SYSTEM, buildProfileDigest, buildPathPrompt, buildTestsDigest, buildGuidancePrompt, describeCourse };
