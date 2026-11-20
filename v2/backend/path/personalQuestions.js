// Step 1 of the free flow (report §01): "Personal questions. Who the user is:
// studying now or planning to, the field, the level, goals, location, budget
// and time." Static, validated server-side; the snapshot serves them without
// any scoring key (there is none — these are variables, not a test).

const { DIRECTIONS } = require("../engine/directions");

// The digital age of consent is 16 in Ireland (GDPR Art. 8, report §13):
// below it the start request must carry an explicit parental-consent flag.
const DIGITAL_AGE_OF_CONSENT = 16;

const PERSONAL_QUESTIONS = [
  {
    id: "status",
    kind: "single",
    question: "Where are you right now?",
    options: [
      { value: "school", label: "In secondary school" },
      { value: "school_leaver", label: "Finished school, choosing a first course" },
      { value: "studying", label: "Studying now" },
      { value: "graduate", label: "Finished a course or degree" },
      { value: "working", label: "Working, thinking about a change" },
    ],
  },
  {
    id: "age",
    kind: "number",
    question: "How old are you?",
    min: 14,
    max: 80,
  },
  {
    id: "field",
    kind: "single",
    question: "Which field pulls you most?",
    options: [
      ...DIRECTIONS.map((d) => ({ value: d.id, label: d.label })),
      { value: "unsure", label: "Not sure yet" },
    ],
  },
  {
    id: "level",
    kind: "single",
    question: "What level of course are you aiming for next?",
    options: [
      { value: "foundation", label: "Further education / PLC (NFQ 5–6)" },
      { value: "bachelor", label: "A bachelor's degree (NFQ 7–8)" },
      { value: "postgrad", label: "Postgraduate (NFQ 9)" },
      { value: "short", label: "A short course or micro-credential" },
      { value: "unsure", label: "Not sure yet" },
    ],
  },
  {
    id: "goal",
    kind: "text",
    question: "In a sentence: what do you want this path to get you?",
    placeholder: "e.g. a job where I help people recover from injuries",
    maxLength: 300,
  },
  {
    id: "location",
    kind: "single",
    question: "Where can you study?",
    options: [
      { value: "dublin", label: "Dublin" },
      { value: "cork", label: "Cork" },
      { value: "galway", label: "Galway" },
      { value: "limerick", label: "Limerick" },
      { value: "waterford", label: "Waterford" },
      { value: "online_only", label: "Online only" },
      { value: "anywhere", label: "Anywhere in Ireland" },
    ],
  },
  {
    id: "budget",
    kind: "single",
    question: "What can you spend on fees per year?",
    options: [
      { value: "free", label: "Nothing — free or funded places only" },
      { value: "under_1k", label: "Up to €1,000" },
      { value: "under_5k", label: "Up to €5,000" },
      { value: "any", label: "Fees are not the deciding factor" },
    ],
  },
  {
    id: "time",
    kind: "single",
    question: "How much time can you give it?",
    options: [
      { value: "full_time", label: "Full-time" },
      { value: "part_time", label: "Part-time, around work or school" },
      { value: "either", label: "Either" },
    ],
  },
  {
    id: "start",
    kind: "single",
    question: "When do you want to start?",
    options: [
      { value: "asap", label: "As soon as possible" },
      { value: "september", label: "Next September" },
      { value: "later", label: "Later — I'm planning ahead" },
    ],
  },
];

const BY_ID = new Map(PERSONAL_QUESTIONS.map((q) => [q.id, q]));

const BUDGET_CAP_EUR = { free: 0, under_1k: 1000, under_5k: 5000, any: Infinity };

function httpErr(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}

// Validate a full answer set. Returns a clean profile object; throws a 400
// naming the first bad field.
function validateProfile(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw httpErr(400, "Answers are required.");
  }
  const profile = {};
  for (const q of PERSONAL_QUESTIONS) {
    const value = raw[q.id];
    if (q.kind === "single") {
      if (typeof value !== "string" || !q.options.some((o) => o.value === value)) {
        throw httpErr(400, `Choose an option for "${q.question}"`);
      }
      profile[q.id] = value;
    } else if (q.kind === "number") {
      const n = Number(value);
      if (value === "" || value === null || !Number.isInteger(n) || n < q.min || n > q.max) {
        throw httpErr(400, `Enter an age between ${q.min} and ${q.max}.`);
      }
      profile[q.id] = n;
    } else if (q.kind === "text") {
      const s = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
      if (!s) throw httpErr(400, "Tell us in a sentence what you want this path to get you.");
      if (s.length > q.maxLength) throw httpErr(400, `Keep the goal under ${q.maxLength} characters.`);
      profile[q.id] = s;
    }
  }
  return profile;
}

function needsParentalConsent(profile) {
  return profile.age < DIGITAL_AGE_OF_CONSENT;
}

function labelFor(questionId, value) {
  const q = BY_ID.get(questionId);
  return q?.options?.find((o) => o.value === value)?.label || String(value ?? "");
}

module.exports = {
  PERSONAL_QUESTIONS,
  BUDGET_CAP_EUR,
  DIGITAL_AGE_OF_CONSENT,
  validateProfile,
  needsParentalConsent,
  labelFor,
};
