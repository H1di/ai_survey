const BRANCH_THEMES = [
  {
    id: "safe",
    label: "Safe Path",
    description: "Predictable progress, lower downside, steady compounding.",
    aiDirective:
      "Design for stability, lower volatility, and realistic short-term cash-flow security.",
  },
  {
    id: "high_income",
    label: "High Income Path",
    description: "Optimized for earning power and upside over comfort.",
    aiDirective:
      "Design for income acceleration and upside, while acknowledging pressure and tradeoffs.",
  },
  {
    id: "meaning",
    label: "Meaning Path",
    description: "Purpose, contribution, and psychological alignment first.",
    aiDirective:
      "Design for purpose, contribution, and values congruence over pure status.",
  },
  {
    id: "creative",
    label: "Creative Path",
    description: "Expression, originality, and autonomy in craft.",
    aiDirective:
      "Design for creative output, portfolio growth, and identity-based work.",
  },
  {
    id: "freedom",
    label: "Freedom Path",
    description: "Flexibility, autonomy, and life-design optionality.",
    aiDirective:
      "Design for autonomy, schedule flexibility, and long-term optionality.",
  },
];

const DEMOGRAPHIC_QUESTIONS = [
  {
    id: "sex",
    kind: "single",
    question: "What is your sex?",
    options: [
      { value: "female", label: "Female" },
      { value: "male", label: "Male" },
      { value: "other", label: "Other / non-binary" },
      { value: "prefer_not", label: "Prefer not to say" },
    ],
  },
  {
    id: "age",
    kind: "number",
    question: "How old are you?",
    placeholder: "e.g. 32",
    min: 13,
    max: 99,
  },
  {
    id: "country",
    kind: "text",
    question: "Which country are you currently based in?",
    placeholder: "Type your country",
  },
];

const VALUES_DIMENSIONS = [
  { id: "economic_return", label: "Economic Return", emoji: "💰", subtitle: "Money & Security" },
  { id: "lifestyle", label: "Lifestyle", emoji: "🧘", subtitle: "Balance & Time" },
  { id: "achievement", label: "Achievement", emoji: "🚀", subtitle: "Success & Growth" },
  { id: "intellectual_stimulation", label: "Intellectual Stimulation", emoji: "🧠", subtitle: "" },
  { id: "meaning_impact", label: "Meaning / Impact", emoji: "❤️", subtitle: "" },
  { id: "independence", label: "Independence", emoji: "🧭", subtitle: "Autonomy" },
  { id: "structure", label: "Structure", emoji: "🏢", subtitle: "Stability & Order" },
  { id: "social_environment", label: "Social Environment", emoji: "👥", subtitle: "" },
];

const VALUES_ROWS = [
  // Economic Return
  ["economic_return", "Higher salary with pressure", "Lower salary with comfort"],
  ["economic_return", "Stable income every month", "Income that can grow but is uncertain"],
  ["economic_return", "Financial security long-term", "Opportunity to earn a lot quickly"],
  ["economic_return", "Predictable financial path", "Risky but high-reward opportunities"],
  ["economic_return", "Guaranteed income", "Performance-based income"],
  // Lifestyle
  ["lifestyle", "Free time and flexibility", "Busy schedule with higher rewards"],
  ["lifestyle", "Clear work-life boundaries", "Work blending into life"],
  ["lifestyle", "Fixed hours, predictable routine", "Flexible hours, changing schedule"],
  ["lifestyle", "Energy left after work", "Full commitment to work"],
  ["lifestyle", "Calm pace", "Intense, fast-paced lifestyle"],
  // Achievement
  ["achievement", "Climb career ladder fast", "Stay in stable, comfortable role"],
  ["achievement", "Compete and win", "Collaborate and maintain harmony"],
  ["achievement", "Be recognized for success", "Work without needing recognition"],
  ["achievement", "Constant challenge and growth", "Mastery in a stable role"],
  ["achievement", "Ambitious career trajectory", "Consistent, predictable progression"],
  // Intellectual Stimulation
  ["intellectual_stimulation", "Solve complex problems", "Do clear, structured tasks"],
  ["intellectual_stimulation", "Learn new things constantly", "Use already mastered skills"],
  ["intellectual_stimulation", "Creative thinking", "Practical execution"],
  ["intellectual_stimulation", "Variety of tasks", "Repetition and specialization"],
  ["intellectual_stimulation", "Abstract thinking", "Hands-on, tangible work"],
  // Meaning / Impact
  ["meaning_impact", "Help people directly", "Focus on results and outcomes"],
  ["meaning_impact", "Work that feels meaningful", "Work that is efficient and profitable"],
  ["meaning_impact", "Contribute to society", "Focus on personal success"],
  ["meaning_impact", "Emotional connection to work", "Detachment from work"],
  ["meaning_impact", "Purpose-driven career", "Pragmatic career"],
  // Independence
  ["independence", "Decide how to work", "Follow clear instructions"],
  ["independence", "Freedom in decisions", "Guidance and supervision"],
  ["independence", "Self-directed tasks", "Assigned responsibilities"],
  ["independence", "Control over schedule", "Structured schedule"],
  ["independence", "Independence in work style", "Alignment with system rules"],
  // Structure
  ["structure", "Clear rules and expectations", "Flexible and undefined environment"],
  ["structure", "Stable system", "Constantly changing environment"],
  ["structure", "Predictable tasks", "Uncertain and evolving tasks"],
  ["structure", "Defined career path", "Open, unpredictable future"],
  ["structure", "Organized environment", "Chaotic but dynamic environment"],
  // Social Environment
  ["social_environment", "Work with people constantly", "Work mostly alone"],
  ["social_environment", "Team-based decisions", "Independent decisions"],
  ["social_environment", "Frequent communication", "Minimal interaction"],
  ["social_environment", "Supportive team environment", "Competitive individual environment"],
  ["social_environment", "Build relationships at work", "Focus on tasks over people"],
];

const VALUES_QUESTIONS = VALUES_ROWS.map(([dimension, a, b], index) => {
  const dimIndex = VALUES_DIMENSIONS.findIndex((d) => d.id === dimension);
  const dim = VALUES_DIMENSIONS[dimIndex];
  return {
    id: `values_${index + 1}`,
    dimension,
    dimensionLabel: dim.label,
    dimensionEmoji: dim.emoji,
    groupIndex: dimIndex,
    indexInGroup: index % 5,
    optionA: a,
    optionB: b,
  };
});

const DEMOGRAPHIC_BY_ID = new Map(DEMOGRAPHIC_QUESTIONS.map((q) => [q.id, q]));
const VALUES_BY_ID = new Map(VALUES_QUESTIONS.map((q) => [q.id, q]));

module.exports = {
  BRANCH_THEMES,
  DEMOGRAPHIC_QUESTIONS,
  DEMOGRAPHIC_BY_ID,
  VALUES_DIMENSIONS,
  VALUES_QUESTIONS,
  VALUES_BY_ID,
};
