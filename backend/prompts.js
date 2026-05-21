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

function buildInitialBranchPrompts({ profileDigest, theme }) {
  const themeLine =
    theme && theme !== "primary"
      ? `Thematic emphasis: ${theme.label}. ${theme.aiDirective}`
      : "Thematic emphasis: Primary baseline branch that best fits the user right now.";

  const system = [
    BASE_SYSTEM,
    "Generate one initial life path branch.",
    "Integrate demographics, Big Five personality scores, derived traits, and the 8-dimension values inventory.",
    "Reflect the user's strongest values dimensions (highest scores) in the path's tradeoffs.",
    "Return valid JSON only and no extra keys.",
    'JSON schema: {"title":"","thesis":"","whyFit":"","firstMilestone":"","constraintsNote":"","question":{"text":"","options":[{"value":"","label":""}]}}',
    "question.options must have exactly 4 options.",
    "The question must be a realistic tradeoff question about this path.",
  ].join(" ");

  const user = [
    themeLine,
    "Build the first branch node.",
    "Profile:",
    profileDigest,
    "Constraints:",
    "- Keep the branch realistic and grounded in labor-market reality.",
    "- Avoid generic motivational language.",
    "- Reflect the dominant values dimensions in the whyFit copy.",
    "- The branch should feel immediately actionable.",
  ].join("\n\n");

  return { system, user };
}

function buildEvolutionPrompts({ profileDigest, branch, node, answerLabel }) {
  const system = [
    BASE_SYSTEM,
    "Evolve one branch step after the user answered a tradeoff question.",
    "Return valid JSON only and no extra keys.",
    'JSON schema: {"nextNodeTitle":"","nextNodeSummary":"","clarityGain":"","riskNote":"","question":{"text":"","options":[{"value":"","label":""}]},"shouldStop":false}',
    "question.options must have exactly 4 options.",
    "Continue to reflect the user's values dimensions and personality scores in the tradeoff design.",
    "If clarity is already high, you may set shouldStop true.",
  ].join(" ");

  const user = [
    `Branch theme: ${branch.themeLabel}`,
    `Current branch title: ${branch.title}`,
    `Current node title: ${node.title}`,
    `Current node summary: ${node.summary}`,
    `User answered: ${answerLabel}`,
    "Generate the next node that logically follows from this answer.",
    "Profile:",
    profileDigest,
    "Requirements:",
    "- Keep it concrete and realistic.",
    "- Explicitly reflect tradeoffs.",
    "- The next question must pressure-test feasibility or life satisfaction.",
  ].join("\n\n");

  return { system, user };
}

module.exports = {
  buildProfileDigest,
  buildBigFiveItemsPrompt,
  buildInitialBranchPrompts,
  buildEvolutionPrompts,
};
