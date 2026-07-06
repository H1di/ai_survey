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

// [dimension, alignedOption, counterOption, flip]
// The aligned option is the pole that scores toward the dimension. flip=true
// renders the counter option as A, so agreeing with the dimension is on the
// left for only about half the items (kills the always-pick-A position bias).
// Both poles are written to be genuinely attractive — a counter option that
// nobody would choose adds no information.
const VALUES_ROWS = [
  // Economic Return
  ["economic_return", "Higher salary with pressure", "Lower salary with comfort", false],
  ["economic_return", "Stable income every month", "Income that can grow but is uncertain", true],
  ["economic_return", "Financial security long-term", "Doing what I love even if money is tight", false],
  ["economic_return", "A raise motivates me more than praise", "Recognition motivates me more than money", true],
  ["economic_return", "A duller job with clearly better pay", "A pay cut for work I enjoy more", false],
  // Lifestyle
  ["lifestyle", "Free time and flexibility", "A busy schedule with higher rewards", true],
  ["lifestyle", "Clear work-life boundaries", "Work blending into life", false],
  ["lifestyle", "Fixed hours, predictable routine", "Flexible hours, changing schedule", true],
  ["lifestyle", "Energy left after work", "Full commitment to work", false],
  ["lifestyle", "Calm pace", "Intense, fast-paced lifestyle", true],
  // Achievement
  ["achievement", "Climb the career ladder fast", "Stay in a stable, comfortable role", false],
  ["achievement", "Compete and win", "Collaborate and maintain harmony", true],
  ["achievement", "Be recognized for success", "Work without needing recognition", false],
  ["achievement", "Constant challenge and growth", "Mastery in a stable role", true],
  ["achievement", "Titles and promotions that mark my growth", "Growing without needing titles to show it", false],
  // Intellectual Stimulation
  ["intellectual_stimulation", "Solve complex problems", "Do clear, structured tasks", true],
  ["intellectual_stimulation", "Learn new things constantly", "Use already mastered skills", false],
  ["intellectual_stimulation", "Creative thinking", "Practical execution", true],
  ["intellectual_stimulation", "Variety of tasks", "Repetition and specialization", false],
  ["intellectual_stimulation", "Abstract thinking", "Hands-on, tangible work", true],
  // Meaning / Impact
  ["meaning_impact", "Help people directly", "Build things whose impact shows in the numbers", false],
  ["meaning_impact", "Work that feels meaningful", "Work that is sharp, efficient, and well-rewarded", true],
  ["meaning_impact", "Contribute to society", "Build my own success story first", false],
  ["meaning_impact", "Emotional connection to my work", "Healthy distance — work is work, life is life", true],
  ["meaning_impact", "Purpose-driven career", "Pragmatic career", false],
  // Independence
  ["independence", "Decide how to work", "Follow clear instructions", true],
  ["independence", "Freedom in decisions", "Guidance and supervision", false],
  ["independence", "Self-directed tasks", "Assigned responsibilities", true],
  ["independence", "Choose my own tools and methods", "Use the team's proven playbook", false],
  ["independence", "Independence in work style", "Alignment with system rules", true],
  // Structure
  ["structure", "Clear rules and expectations", "Flexible and undefined environment", false],
  ["structure", "Stable system", "Constantly changing environment", true],
  ["structure", "Predictable tasks", "Uncertain and evolving tasks", false],
  ["structure", "Defined career path", "Open, unpredictable future", true],
  ["structure", "Organized environment", "Chaotic but dynamic environment", false],
  // Social Environment
  ["social_environment", "Work with people constantly", "Work mostly alone", true],
  ["social_environment", "Team-based decisions", "Independent decisions", false],
  ["social_environment", "Frequent communication", "Minimal interaction", true],
  ["social_environment", "A supportive team environment", "A competitive individual environment", false],
  ["social_environment", "Build relationships at work", "Focus on tasks over people", true],
];

const VALUES_QUESTIONS = VALUES_ROWS.map(([dimension, aligned, counter, flip], index) => {
  const dimIndex = VALUES_DIMENSIONS.findIndex((d) => d.id === dimension);
  const dim = VALUES_DIMENSIONS[dimIndex];
  return {
    id: `values_${index + 1}`,
    dimension,
    dimensionLabel: dim.label,
    dimensionEmoji: dim.emoji,
    groupIndex: dimIndex,
    indexInGroup: index % 5,
    flip: Boolean(flip),
    optionA: flip ? counter : aligned,
    optionB: flip ? aligned : counter,
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
