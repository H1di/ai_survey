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
  {
    id: "city",
    kind: "text",
    question: "Which city are you based in?",
    placeholder: "Type your city",
  },
];

const CAREER_JOURNEY_QUESTIONS = [
  { id: "cj_education", question: "What is your education so far (field and level)?", placeholder: "e.g. BSc in economics, unfinished" },
  { id: "cj_role", question: "What is your current or most recent role?", placeholder: "e.g. shift manager at a cafe; student" },
  { id: "cj_skills", question: "What are you genuinely good at — your strongest skills?", placeholder: "Name 2–4 things" },
  { id: "cj_liked", question: "In past work or study, what did you like and dislike the most?", placeholder: "One thing you loved, one that drained you" },
  { id: "cj_constraint", question: "What is the biggest real-world constraint on your next move?", placeholder: "Money, location, family, health, visa…" },
  { id: "cj_horizon", question: "How soon do you need the change to pay off?", placeholder: "e.g. within a year; I can invest 3–4 years" },
  { id: "cj_retrain", question: "How willing are you to retrain from scratch?", placeholder: "Honestly — from 'not at all' to 'fully'" },
];
const CAREER_JOURNEY_BY_ID = new Map(CAREER_JOURNEY_QUESTIONS.map((q) => [q.id, q]));

const DEMOGRAPHIC_BY_ID = new Map(DEMOGRAPHIC_QUESTIONS.map((q) => [q.id, q]));

module.exports = {
  DEMOGRAPHIC_QUESTIONS,
  DEMOGRAPHIC_BY_ID,
  CAREER_JOURNEY_QUESTIONS,
  CAREER_JOURNEY_BY_ID,
};
