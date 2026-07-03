const BASE_SYSTEM = [
  "You are an elite career strategist and life-design psychologist.",
  "This is not a quiz. You are building realistic, emotionally honest, practical futures.",
  "Respect constraints. Do not hallucinate impossible paths.",
  "Tone: elegant, calm, intelligent, specific.",
  "Write concise outputs and avoid buzzwords.",
].join(" ");

function buildProfileDigest({
  entryChoice,
  dreamAnswer,
  demographics,
  bigFiveScores,
  derivedTraits,
  valuesScores,
  valuesDimensions,
}) {
  const lines = [];
  lines.push(`Entry intent: ${entryChoice}`);
  lines.push(`Dream answer: ${dreamAnswer}`);

  if (demographics && Object.keys(demographics).length) {
    lines.push("Demographics:");
    if (demographics.sex !== undefined) lines.push(`- Sex: ${demographics.sex}`);
    if (demographics.age !== undefined) lines.push(`- Age: ${demographics.age}`);
    if (demographics.country !== undefined) lines.push(`- Country: ${demographics.country}`);
  }

  if (bigFiveScores) {
    lines.push("Big Five (0–100):");
    lines.push(`- Openness: ${bigFiveScores.O}`);
    lines.push(`- Conscientiousness: ${bigFiveScores.C}`);
    lines.push(`- Extraversion: ${bigFiveScores.E}`);
    lines.push(`- Agreeableness: ${bigFiveScores.A}`);
    lines.push(`- Neuroticism: ${bigFiveScores.N}`);
  }

  if (derivedTraits) {
    lines.push(
      `Derived: behaviour tendencies=${derivedTraits.behaviourTendencies}, decision priorities=${derivedTraits.decisionPriorities}.`
    );
    if (derivedTraits.summary) lines.push(`Trait summary: ${derivedTraits.summary}`);
  }

  if (valuesScores && valuesDimensions) {
    lines.push("Values inventory (0–5, A-choices per dimension):");
    for (const dim of valuesDimensions) {
      const score = valuesScores[dim.id];
      if (score === undefined) continue;
      lines.push(`- ${dim.emoji} ${dim.label}: ${score}/5`);
    }
  }

  return lines.join("\n");
}

function buildBigFiveItemsPrompt(depth) {
  const count = depth === "deep" ? 50 : 20;
  const perTrait = count / 5;

  const system = [
    "You generate Big Five (OCEAN) self-report items in the style of the IPIP item pool.",
    "Return valid JSON only. No prose, no markdown fences, no commentary.",
    `JSON schema: {"items":[{"id":"item_1","trait":"O|C|E|A|N","reverse":true|false,"text":"..."}]}`,
    `Generate exactly ${count} items.`,
    `Distribute exactly ${perTrait} items per trait across O, C, E, A, N.`,
    "Roughly half of each trait's items should be reverse-keyed (reverse: true).",
    "Each `text` is a first-person statement (e.g., 'I am the life of the party.', 'I rarely worry.').",
    "Items must be answerable on a 1–5 Likert (Strongly disagree → Strongly agree).",
    "Avoid double-barrelled or negated-twice phrasings. Keep each item under 90 characters.",
    "Use varied phrasings per session; do not output identical wording each call.",
  ].join(" ");

  const user = `Generate ${count} Big Five items now.`;

  return { system, user };
}

const { DIRECTIONS } = require("./directions");

function buildAnswersDigest(questions, answers) {
  const lines = [];
  for (const question of questions) {
    const chosen = answers[question.id];
    if (chosen === undefined) continue;
    const option = question.options.find((o) => o.value === chosen);
    if (!option) continue;
    lines.push(`- ${question.text} → ${option.label}`);
  }
  return lines.join("\n");
}

function directionCatalogLines() {
  return DIRECTIONS.map((d) => `- ${d.id}: ${d.label} (${d.examples})`).join("\n");
}

function buildDirectionQuestionsPrompt({ profileDigest }) {
  const system = [
    BASE_SYSTEM,
    "Generate exactly 3 questions (multiple-choice) whose only job is to converge on ONE broad professional direction for this user.",
    "Return valid JSON only and no extra keys.",
    'JSON schema: {"questions":[{"text":"","options":[{"value":"","label":"","directionId":""}]}]}',
    "Each question has exactly 4 options.",
    "Every option MUST set directionId to exactly one id from this catalog:",
    directionCatalogLines(),
    "Across the 3 questions the options must collectively cover at least 6 different directionIds.",
    "Option labels are concrete day-to-day preferences (under 80 characters), never direction names.",
    "Questions must be sharp and specific to this profile, not generic career-quiz filler.",
  ].join("\n");

  const user = [
    "Generate the 3 direction-finding questions now.",
    "Profile:",
    profileDigest,
  ].join("\n\n");

  return { system, user };
}

function buildNarrowingQuestionsPrompt({ profileDigest, direction }) {
  const system = [
    BASE_SYSTEM,
    "The user confirmed a broad professional direction. Generate exactly 2 questions to narrow toward specific professions inside that direction.",
    "Ask about work style, environment, or day-to-day preference within the direction.",
    "Return valid JSON only and no extra keys.",
    'JSON schema: {"questions":[{"text":"","options":[{"value":"","label":""}]}]}',
    "Each question has exactly 4 options. Option labels under 80 characters.",
  ].join("\n");

  const user = [
    `Confirmed direction: ${direction.label}`,
    "Profile:",
    profileDigest,
  ].join("\n\n");

  return { system, user };
}

function buildProfessionsPrompt({ profileDigest, direction, directionDigest, narrowingDigest }) {
  const system = [
    BASE_SYSTEM,
    "Generate exactly 3 specific, realistic professions that fit the user's confirmed direction and answers.",
    "Return valid JSON only and no extra keys.",
    'JSON schema: {"professions":[{"title":"","summary":"","whyFit":"","dayToDay":""}]}',
    "title: a real, recognizable job title. summary: one sentence, what the job is.",
    "whyFit: one or two sentences tying THIS user's profile and answers to the job.",
    "dayToDay: one sentence about a typical working day.",
    "The 3 professions must be meaningfully different from each other (role, seniority path, or work mode).",
    "Stay grounded in labor-market reality. No fantasy titles.",
  ].join("\n");

  const user = [
    `Confirmed direction: ${direction.label}`,
    "Direction-finding answers:",
    directionDigest || "(none)",
    "Narrowing answers:",
    narrowingDigest || "(none)",
    "Profile:",
    profileDigest,
  ].join("\n\n");

  return { system, user };
}

function buildRoadmapPrompt({ profileDigest, direction, profession, narrowingDigest }) {
  const system = [
    BASE_SYSTEM,
    "Generate a personalized, ordered, step-by-step career roadmap toward one target profession.",
    "Return valid JSON only and no extra keys.",
    'JSON schema: {"stages":[{"title":"","description":"","timeframe":"","milestone":""}]}',
    "Produce 5-7 stages, strictly in chronological order: foundations → first practice → entry-level role → key credential or milestone → mid-level growth → target role.",
    "title: short (under 40 characters), one main idea. description: 1-2 actionable sentences saying exactly what to learn, build, or gain.",
    "timeframe: rough duration like '2-3 months'. milestone: the concrete checkpoint that proves the stage is done.",
    "Personalize using the profile (age, country, personality, values) — adjust pace, entry point, and credential choices accordingly.",
  ].join("\n");

  const user = [
    `Target profession: ${profession.title}`,
    `Profession summary: ${profession.summary}`,
    `Direction: ${direction.label}`,
    "Narrowing answers:",
    narrowingDigest || "(none)",
    "Profile:",
    profileDigest,
  ].join("\n\n");

  return { system, user };
}

module.exports = {
  buildProfileDigest,
  buildBigFiveItemsPrompt,
  buildAnswersDigest,
  buildDirectionQuestionsPrompt,
  buildNarrowingQuestionsPrompt,
  buildProfessionsPrompt,
  buildRoadmapPrompt,
};
