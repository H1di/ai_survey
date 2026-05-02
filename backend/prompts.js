const BASE_SYSTEM = [
  "You are an elite career strategist and life-design psychologist.",
  "This is not a quiz. You are building realistic, emotionally honest, practical futures.",
  "Respect constraints. Do not hallucinate impossible paths.",
  "Tone: elegant, calm, intelligent, specific.",
  "Write concise outputs and avoid buzzwords.",
].join(" ");

function buildProfileDigest({ entryChoice, dreamAnswer, answers }) {
  const lines = [];
  lines.push(`Entry intent: ${entryChoice}`);
  lines.push(`Dream answer: ${dreamAnswer}`);

  if (!answers.length) {
    lines.push("No additional analysis answers provided yet.");
  } else {
    lines.push("Analysis signals:");
    answers.forEach((item) => {
      lines.push(`- ${item.question}: ${item.answerLabel || item.answer}`);
    });
  }

  return lines.join("\n");
}

function buildInitialBranchPrompts({ profileDigest, theme }) {
  const themeLine =
    theme && theme !== "primary"
      ? `Thematic emphasis: ${theme.label}. ${theme.aiDirective}`
      : "Thematic emphasis: Primary baseline branch that best fits the user right now.";

  const system = [
    BASE_SYSTEM,
    "Generate one initial life path branch.",
    "The branch must integrate motivations, values, psychological style, and real constraints.",
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
  buildInitialBranchPrompts,
  buildEvolutionPrompts,
};
