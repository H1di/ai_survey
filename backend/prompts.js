const { JOB_CHAR_PARAMS, CAREER_JOURNEY_QUESTIONS } = require("./questionPool");

const JOB_CHAR_LABEL = new Map(JOB_CHAR_PARAMS.map((p) => [p.id, p.label]));
const JOURNEY_QUESTION_BY_ID = new Map(CAREER_JOURNEY_QUESTIONS.map((q) => [q.id, q.question]));

const BASE_SYSTEM = [
  "You are an elite career strategist and life-design psychologist.",
  "This is not a quiz. You are building realistic, emotionally honest, practical futures.",
  "Integrate the user's Big Five personality, RIASEC interests, ranked job-characteristic targets, demographics, and CV or career-journey signal.",
  "You know the FULL range of human work — creative and artistic fields, science, care and healthcare, skilled trades, education, hospitality, agriculture, law and public service, sports, media, business, and technology alike.",
  "Never default to technology or tech-adjacent careers because they feel safe; recommend tech only when the user's survey profile clearly points there.",
  "The survey profile (personality, interests, targets, demographics) is the primary basis for every recommendation; the user's stated dream is emotional colour, not a domain filter.",
  "Respect all constraints. Do not hallucinate impossible paths.",
  "Tone: elegant, calm, intelligent, specific.",
  "Write concise outputs and avoid buzzwords.",
].join(" ");

function buildProfileDigest({
  entryChoice,
  dreamAnswer,
  cvIntent,
  demographics,
  bigFiveScores,
  derivedTraits,
  riasecScores,
  riasecCode,
  riasecInferred,
  jobCharRanking,
  jobCharProfile,
  cvAnalysis,
  cvText,
  careerJourneyAnswers,
}) {
  const lines = [];
  lines.push(`Entry intent: ${entryChoice}`);
  lines.push(
    `Dream answer (secondary context — emotional colour, NOT a domain filter): ${dreamAnswer}`
  );

  if (demographics && Object.keys(demographics).length) {
    lines.push("Demographics:");
    if (demographics.sex !== undefined) lines.push(`- Sex: ${demographics.sex}`);
    if (demographics.age !== undefined) lines.push(`- Age: ${demographics.age}`);
    if (demographics.country !== undefined) lines.push(`- Country: ${demographics.country}`);
    if (demographics.city !== undefined) lines.push(`- City: ${demographics.city}`);
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

  if (riasecScores) {
    const flag = riasecInferred ? "inferred, low confidence" : "measured";
    lines.push(
      `RIASEC interests (0–100): R=${riasecScores.R} I=${riasecScores.I} A=${riasecScores.A} ` +
        `S=${riasecScores.S} E=${riasecScores.E} C=${riasecScores.C} → code ${riasecCode} (${flag})`
    );
  }

  if (jobCharRanking && jobCharProfile) {
    lines.push("Job-characteristic targets (0–100, ranked most→least important):");
    jobCharRanking.forEach((param, index) => {
      lines.push(`${index + 1}. ${JOB_CHAR_LABEL.get(param)}: ${jobCharProfile[param]}/100`);
    });
  }

  const hasParsedCv =
    cvAnalysis && (cvAnalysis.skills?.length || cvAnalysis.domains?.length || cvAnalysis.seniority);
  if (hasParsedCv) {
    lines.push(
      `CV signal: skills [${(cvAnalysis.skills || []).join(", ")}]; ` +
        `domains [${(cvAnalysis.domains || []).join(", ")}]; seniority "${cvAnalysis.seniority || "unknown"}"`
    );
  } else if (cvText) {
    lines.push(`CV provided (unparsed excerpt): "${cvText.slice(0, 300)}"`);
  } else if (careerJourneyAnswers && Object.keys(careerJourneyAnswers).length) {
    lines.push("Career journey:");
    for (const [qId, answer] of Object.entries(careerJourneyAnswers)) {
      lines.push(`- ${JOURNEY_QUESTION_BY_ID.get(qId) || qId} → ${answer}`);
    }
  }
  if (cvIntent) {
    lines.push(
      cvIntent === "use_skills"
        ? "Intent: build on existing skills and experience."
        : "Intent: open to something completely new."
    );
  }

  return lines.join("\n");
}

function buildRiasecInferencePrompt({ bigFiveScores, dreamAnswer }) {
  const system = [
    "You estimate a person's Holland RIASEC interest profile from limited signal.",
    "Return valid JSON only.",
    'JSON schema: {"scores":{"R":0,"I":0,"A":0,"S":0,"E":0,"C":0}} with each value an integer 0-100.',
    "Base the estimate on established Big Five ↔ RIASEC links (Openness→Artistic/Investigative, Extraversion→Enterprising/Social, Conscientiousness→Conventional); the dream answer only nudges.",
    "Use the full range; avoid a flat all-50 profile.",
  ].join(" ");
  const user = [
    `Big Five (0–100): O=${bigFiveScores.O} C=${bigFiveScores.C} E=${bigFiveScores.E} A=${bigFiveScores.A} N=${bigFiveScores.N}`,
    `Dream answer: ${dreamAnswer}`,
    "Estimate the RIASEC scores now.",
  ].join("\n");
  return { system, user };
}

function buildJobCharQuestionsPrompt({ ranking, count }) {
  const catalog = ranking
    .map((id, i) => `${i + 1}. ${id} — ${JOB_CHAR_LABEL.get(id)}`)
    .join("\n");
  const system = [
    "You generate job-preference questions for a ranked set of career parameters.",
    "Return valid JSON only.",
    'JSON schema: {"items":[{"id":"jc_1","param":"compensation|work_mode|job_security|career_growth|complexity|meaning_impact|social","text":"...","options":[{"value":50,"label":"..."}]}]}',
    `Generate exactly ${count} questions, weighted toward the top-ranked parameters (the most important parameter comes first and gets the most questions).`,
    "Each question is a realistic tradeoff about ONE parameter; each option encodes a 0–100 target on that parameter (value = the target).",
    "3–4 options each, labels under 90 characters, concrete situations, no buzzwords.",
  ].join(" ");
  const user = [
    `Ranking (most→least important): ${ranking.join(", ")}`,
    catalog,
    `Generate ${count} questions now.`,
  ].join("\n");
  return { system, user };
}

const SCHWARTZ_CIRCLE_LINE =
  "self_direction, stimulation, hedonism, achievement, power, security, conformity, tradition, benevolence, universalism";

const SCHWARTZ_SCORES_SCHEMA =
  '{"schwartzValues":{"self_direction":0,"stimulation":0,"hedonism":0,"achievement":0,"power":0,"security":0,"conformity":0,"tradition":0,"benevolence":0,"universalism":0}}';

function buildUserValuesInferencePrompt({ profileDigest }) {
  const system = [
    "You estimate a person's Schwartz Basic Human Values profile from survey signal.",
    "Return valid JSON only.",
    `JSON schema: ${SCHWARTZ_SCORES_SCHEMA} with each value an integer 0-100.`,
    "Circular order (adjacent compatible, opposite conflicting):",
    `${SCHWARTZ_CIRCLE_LINE}.`,
    "Opposite values should rarely both be high. Use the full 0–100 range; a flat all-similar profile is a failure.",
    "Ground the estimate in the Big Five scores, RIASEC interests, ranked job-characteristic targets, and the dream answer.",
  ].join(" ");
  const user = ["Profile:", profileDigest, "Estimate the 10 value scores now."].join("\n");
  return { system, user };
}

function buildProfessionValuesProfilePrompt({ jobTitle, orientedField, thesis }) {
  const system = [
    "You are an occupational psychologist scoring a profession on Schwartz's 10 Basic Human Values.",
    "Return valid JSON only.",
    'JSON schema: {"schwartzValues":{"self_direction":0,"stimulation":0,"hedonism":0,"achievement":0,"power":0,"security":0,"conformity":0,"tradition":0,"benevolence":0,"universalism":0},"valuesRationale":{"<key>":"..."}}',
    "Score what the ROLE structurally rewards or requires, not one employer's culture.",
    "Circular order (adjacent compatible, opposite conflicting):",
    `${SCHWARTZ_CIRCLE_LINE}.`,
    "Opposite values should rarely both be high. Use the full 0–100 range; a flat all-similar profile is a failure.",
    "valuesRationale: one short line for each of the 3 highest values only.",
  ].join(" ");
  const user = `Job: ${jobTitle}. Field: ${orientedField}. Summary: ${thesis}. Score it now.`;
  return { system, user };
}

function buildPersonaSummaryPrompt({ profileDigest }) {
  const system = [
    "You turn assessment scores into a short self-portrait the person reads about themselves.",
    "Return valid JSON only.",
    'JSON schema: {"summary":""}',
    'summary: 3-5 sentences. Second person, present tense. State the dominant pattern directly - no hedging, no "you might be".',
    "Every claim must trace to a specific score in the profile; name it in plain words.",
    "Plain, human words. No jargon. No passive voice. Short sentences, one idea each. Start with the point.",
  ].join(" ");
  const user = ["Profile:", profileDigest, "Write the 3-5 sentence portrait now."].join("\n");
  return { system, user };
}

function buildCvParsePrompt(cvText) {
  const system = [
    "You extract a structured career signal from a raw CV text.",
    "Return valid JSON only.",
    'JSON schema: {"skills":["..."],"domains":["..."],"seniority":"..."}',
    "skills: up to 12 concrete skills. domains: up to 6 industries/fields worked in.",
    'seniority: one of "student", "junior", "mid", "senior", "lead", "executive", or a short honest label.',
    "Extract only what the text supports; do not invent.",
  ].join(" ");
  return { system, user: `CV text:\n${cvText}\n\nExtract the signal now.` };
}

const { JOB_CHAR_PARAM_IDS: OUTPUT_PARAM_IDS } = require("./questionPool");

const OUTPUT_SCHEMA =
  '{"orientedField":"","jobTitle":"","thesis":"","parameterFit":{"compensation":"","work_mode":"","job_security":"","career_growth":"","complexity":"","meaning_impact":"","social":""},"whyFit":"","firstMilestone":"","constraintsNote":""}';

// directionHint: [{ id, label }] high-to-low from rankDirections — a grounding
// signal, not a hard constraint. excludeFields: field families the user
// already rejected as "not suitable overall".
function buildOrientedFieldPrompt({ profileDigest, directionHint = [], excludeFields = [] }) {
  const system = [
    BASE_SYSTEM,
    "Produce ONE oriented career field and a concrete resulting job.",
    "Return valid JSON only and no extra keys.",
    `JSON schema: ${OUTPUT_SCHEMA}`,
    "parameterFit explains the job through EACH of the 7 parameters, referencing the user's stated 0–100 targets (agreements AND honest tensions).",
    "Ground everything in labor-market reality and the user's Big Five + RIASEC + CV signal.",
    excludeFields.length
      ? `The user already rejected these field families entirely — pick something genuinely different: ${excludeFields.join(", ")}.`
      : null,
    directionHint.length
      ? `Interest-fit signal (best first) — lean toward these families unless the profile argues otherwise: ${directionHint.map((d) => d.label).join(", ")}.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const user = ["Profile:", profileDigest, "Produce the oriented field and job now."].join("\n\n");
  return { system, user };
}

function buildRefinementPrompt({ profileDigest, previousOutput, changes }) {
  const system = [
    BASE_SYSTEM,
    "The user rejected the previous output and wants to change specific parameters.",
    "Regenerate ONE new oriented field + job that keeps everything else the same but shifts the named parameters toward the user's stated direction.",
    "Return valid JSON only and no extra keys.",
    `JSON schema: ${OUTPUT_SCHEMA.slice(0, -1)},"changeSummary":""}`,
    "changeSummary: 1-2 sentences on what moved and the trade-off it creates.",
    `Changeable parameters: ${OUTPUT_PARAM_IDS.join(", ")}.`,
  ].join("\n");

  const changeLines = changes
    .map((c) => `- ${c.param}: ${c.reason || "(no reason given)"}`)
    .join("\n");

  const user = [
    "Previous output:",
    JSON.stringify({
      orientedField: previousOutput.orientedField,
      jobTitle: previousOutput.jobTitle,
      thesis: previousOutput.thesis,
    }),
    "Parameters to change (with the user's reasons):",
    changeLines,
    "Profile:",
    profileDigest,
  ].join("\n\n");

  return { system, user };
}

const WHY_THIS_FITS_SCHEMA =
  '{"personality":[{"point":""},{"point":""}],"interests":[{"point":""}],"values":[{"point":""}],"currentSkills":[{"point":""},{"point":""}],"skillsToDevelop":["",""]}';

// Second call after an output is generated: a structured, traceable
// explanation with fixed bullet counts so the UI renders a stable block.
function buildWhyThisFitsPrompt({ profileDigest, output, topParamLabel }) {
  const system = [
    "You explain why one specific job fits one specific person.",
    "Return valid JSON only and no extra keys.",
    `JSON schema: ${WHY_THIS_FITS_SCHEMA}`,
    "personality: exactly 2 points. Each names a Big Five trait, its direction, and the one-line consequence for this job.",
    "interests: exactly 1 point tying the person's strongest Holland interest letters to the daily work.",
    `values: exactly 1 point about the person's top-ranked job priority${topParamLabel ? ` (${topParamLabel})` : ""}. If the job conflicts with that priority, say so plainly instead of hiding it.`,
    "currentSkills: 2-3 points naming skills or experience the person already reported and how each transfers.",
    "skillsToDevelop: 3-4 short skill names (not sentences) the person should build for this job.",
    "Every point must trace to a specific score, rank, or answer from the profile - never a generic claim.",
    "Plain, human words. No jargon. No passive voice. Short sentences. Start with the point.",
  ].join(" ");
  const user = [
    `Job: ${output.jobTitle} (${output.orientedField}). ${output.thesis}`,
    "Profile:",
    profileDigest,
    "Explain why this fits now.",
  ].join("\n\n");
  return { system, user };
}

function buildOutputDetailPrompt({ profileDigest, output }) {
  const system = [
    BASE_SYSTEM,
    "The user accepted the job. Produce actionable next steps.",
    "Return valid JSON only and no extra keys.",
    'JSON schema: {"aiRecommendations":[{"title":"","detail":""}],"events":[{"name":"","why":""}],"universities":[{"name":"","program":""}],"courses":[{"name":"","provider":"","why":""}]}',
    "2-4 entries per block. Tailor to the user's location, seniority, and constraints.",
    "Be specific and realistic; prefer concrete program/course/event types over generic advice.",
  ].join("\n");

  const user = [
    `Accepted job: ${output.jobTitle} (${output.orientedField}). ${output.thesis}`,
    "Profile:",
    profileDigest,
  ].join("\n\n");

  return { system, user };
}

function buildRoadmapPrompt({ profileDigest, direction, profession }) {
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
    "Profile:",
    profileDigest,
  ].join("\n\n");

  return { system, user };
}

module.exports = {
  buildProfileDigest,
  buildRiasecInferencePrompt,
  buildJobCharQuestionsPrompt,
  buildCvParsePrompt,
  buildPersonaSummaryPrompt,
  buildUserValuesInferencePrompt,
  buildProfessionValuesProfilePrompt,
  buildOrientedFieldPrompt,
  buildRefinementPrompt,
  buildWhyThisFitsPrompt,
  buildOutputDetailPrompt,
  buildRoadmapPrompt,
};
