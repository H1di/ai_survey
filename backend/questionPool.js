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

// The 7 tunable job-characteristic parameters (career-question-engine v2).
// These keys are a cross-layer contract: prompts, scoring, session state,
// and the frontend refinement panel all use them verbatim.
const JOB_CHAR_PARAMS = [
  { id: "compensation", label: "Compensation", meaning: "Pay level and upside" },
  { id: "work_mode", label: "Work Mode", meaning: "Remote/hybrid/on-site, hours, flexibility" },
  { id: "job_security", label: "Job Security", meaning: "Stability, demand, redundancy risk" },
  { id: "career_growth", label: "Career Growth", meaning: "Advancement speed and ceiling" },
  { id: "complexity", label: "Complexity", meaning: "Intellectual difficulty and variety" },
  { id: "meaning_impact", label: "Meaning / Impact", meaning: "Contribution and purpose" },
  { id: "social", label: "Social", meaning: "Amount and type of people interaction" },
];
const JOB_CHAR_PARAM_IDS = JOB_CHAR_PARAMS.map((p) => p.id);

// Two static tradeoff questions per parameter; each option encodes a 0–100
// target on that parameter. Fallback bank for the AI question generator.
const JOB_CHAR_QUESTION_BANK = {
  compensation: [
    { text: "Which offer would you actually sign?", options: [
      { value: 95, label: "Top-of-market pay in a demanding, high-pressure team" },
      { value: 70, label: "Clearly above-average pay with normal expectations" },
      { value: 45, label: "Average pay in a role I genuinely like" },
      { value: 20, label: "Modest pay for work that fits my life perfectly" },
    ]},
    { text: "How much does the money ceiling matter long-term?", options: [
      { value: 90, label: "I want a path to a top-percentile income" },
      { value: 60, label: "Comfortable and steadily growing is enough" },
      { value: 30, label: "Enough to not think about money — beyond that, no" },
    ]},
  ],
  work_mode: [
    { text: "Pick the working setup you'd protect the hardest:", options: [
      { value: 95, label: "Fully remote, I set my own hours" },
      { value: 70, label: "Hybrid with flexible hours" },
      { value: 40, label: "A structured office rhythm with clear boundaries" },
      { value: 15, label: "On-site and scheduled — the place is part of the job" },
    ]},
    { text: "A great job asks you in 5 days a week. You…", options: [
      { value: 90, label: "Decline — flexibility is non-negotiable" },
      { value: 55, label: "Negotiate a middle ground" },
      { value: 20, label: "Take it — presence matters less than the work" },
    ]},
  ],
  job_security: [
    { text: "Which position feels right?", options: [
      { value: 95, label: "Near-unfireable role in an institution that will outlive me" },
      { value: 65, label: "Stable industry, normal market risk" },
      { value: 35, label: "Volatile field, strong demand for good people" },
      { value: 10, label: "High-risk bets — security is not what I optimize" },
    ]},
    { text: "Your employer wobbles. What's your instinct?", options: [
      { value: 90, label: "I should have chosen somewhere safer" },
      { value: 50, label: "Uncomfortable but survivable — I keep options warm" },
      { value: 15, label: "Exciting — change creates openings" },
    ]},
  ],
  career_growth: [
    { text: "Five years in, what does success look like?", options: [
      { value: 95, label: "Two promotions up, visibly climbing" },
      { value: 65, label: "Bigger scope and pay, title secondary" },
      { value: 35, label: "Deep mastery of the craft, same seat is fine" },
      { value: 10, label: "Success isn't a ladder for me at all" },
    ]},
    { text: "A lateral move pays the same but teaches you more. You…", options: [
      { value: 85, label: "Take it only if it speeds the climb later" },
      { value: 55, label: "Take it for the learning itself" },
      { value: 25, label: "Skip it — stability beats motion" },
    ]},
  ],
  complexity: [
    { text: "The task you'd pick first from a shared board:", options: [
      { value: 95, label: "The unsolved one nobody can scope yet" },
      { value: 65, label: "A meaty problem with a known shape" },
      { value: 35, label: "A clear task done excellently" },
      { value: 10, label: "The routine one — flow over puzzle" },
    ]},
    { text: "How much novelty per week keeps you healthy?", options: [
      { value: 90, label: "New problems weekly or I go numb" },
      { value: 55, label: "A mix — some new, some familiar" },
      { value: 20, label: "Mostly familiar — repetition is calming" },
    ]},
  ],
  meaning_impact: [
    { text: "Which result would keep you going through a hard year?", options: [
      { value: 95, label: "Concrete lives or causes visibly better off" },
      { value: 65, label: "Users genuinely helped, even indirectly" },
      { value: 35, label: "A craft well practiced and well paid" },
      { value: 10, label: "The results ledger is not where I look" },
    ]},
    { text: "A cynical-but-lucrative project lands on you. You…", options: [
      { value: 90, label: "Refuse — alignment is the point of working" },
      { value: 50, label: "Do it, but negotiate what I can live with" },
      { value: 15, label: "Do it — work is work" },
    ]},
  ],
  social: [
    { text: "Your ideal day has how much people time?", options: [
      { value: 95, label: "Mostly with people — that's the work itself" },
      { value: 65, label: "Half collaboration, half solo" },
      { value: 35, label: "Mostly solo with a few good check-ins" },
      { value: 10, label: "Deep solo focus, interaction only when needed" },
    ]},
    { text: "Which meeting would you never cancel?", options: [
      { value: 90, label: "The one where I help someone directly" },
      { value: 55, label: "The team sync that keeps us close" },
      { value: 20, label: "None — I'd trade most meetings for quiet" },
    ]},
  ],
};

// count=5: one question for each of the 5 top-ranked params.
// count=10: two for the top 3, one for the remaining 4 (3*2+4=10).
function selectFallbackJobCharQuestions(ranking, count) {
  const picks = [];
  if (count === 10) {
    for (const param of ranking.slice(0, 3)) picks.push(...JOB_CHAR_QUESTION_BANK[param]);
    for (const param of ranking.slice(3)) picks.push(JOB_CHAR_QUESTION_BANK[param][0]);
  } else {
    for (const param of ranking.slice(0, 5)) picks.push(JOB_CHAR_QUESTION_BANK[param][0]);
  }
  // Bank entries don't carry `param`; attach it from the ranking walk order.
  const paramOrder =
    count === 10
      ? [...ranking.slice(0, 3).flatMap((p) => [p, p]), ...ranking.slice(3)]
      : ranking.slice(0, 5);
  return picks.map((q, index) => ({
    id: `jc_${index + 1}`,
    param: paramOrder[index],
    text: q.text,
    options: q.options,
  }));
}

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
  JOB_CHAR_PARAMS,
  JOB_CHAR_PARAM_IDS,
  selectFallbackJobCharQuestions,
  CAREER_JOURNEY_QUESTIONS,
  CAREER_JOURNEY_BY_ID,
};
