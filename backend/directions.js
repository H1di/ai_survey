// Canonical broad professional directions for Stage A (direction finding).
// AI-generated direction questions must tag every option with one of these ids;
// the confirmed direction is a deterministic tally of those tags (no extra AI call).
const DIRECTIONS = [
  {
    id: "tech",
    label: "Programming & Technology",
    examples: "software developer, data analyst, IT support, DevOps engineer",
    professionSeeds: [
      { title: "Software Developer", summary: "Build and maintain applications, from features to fixes, mostly in focused screen work." },
      { title: "QA / Test Engineer", summary: "Design tests and hunt defects so software ships reliably; detail-driven and systematic." },
      { title: "Data Analyst", summary: "Turn raw data into decisions with queries, dashboards, and clear findings." },
    ],
  },
  {
    id: "healthcare",
    label: "Healthcare & Wellbeing",
    examples: "nurse, physical therapist, lab technician, paramedic",
    professionSeeds: [
      { title: "Registered Nurse", summary: "Care for patients directly in clinics or hospitals; hands-on, people-first work." },
      { title: "Physical Therapist", summary: "Help people recover movement and strength through guided one-on-one programs." },
      { title: "Medical Lab Technician", summary: "Run diagnostic tests behind the scenes; precise, structured, essential." },
    ],
  },
  {
    id: "design",
    label: "Design & Creative",
    examples: "UX designer, graphic designer, interior designer, illustrator",
    professionSeeds: [
      { title: "UX/UI Designer", summary: "Shape how digital products look and behave, balancing users and constraints." },
      { title: "Graphic Designer", summary: "Craft visual identity and communication for brands and campaigns." },
      { title: "Interior Designer", summary: "Design physical spaces people live and work in; creative plus client-facing." },
    ],
  },
  {
    id: "business",
    label: "Business & Sales",
    examples: "account executive, operations manager, business analyst, founder",
    professionSeeds: [
      { title: "Account Executive", summary: "Own client relationships and close deals; measurable, people-heavy, fast-paced." },
      { title: "Operations Manager", summary: "Keep the machine running: processes, coordination, and constant problem-solving." },
      { title: "Business Analyst", summary: "Bridge business goals and execution with analysis, requirements, and numbers." },
    ],
  },
  {
    id: "trades",
    label: "Skilled Trades",
    examples: "electrician, HVAC technician, carpenter, welder",
    professionSeeds: [
      { title: "Electrician", summary: "Install and repair electrical systems; tangible results and steady demand." },
      { title: "HVAC Technician", summary: "Diagnose and service heating/cooling systems; hands-on and independent." },
      { title: "Carpenter", summary: "Build with your hands from plans to finished structures; craft you can touch." },
    ],
  },
  {
    id: "education",
    label: "Education & Coaching",
    examples: "teacher, corporate trainer, career coach, instructional designer",
    professionSeeds: [
      { title: "Corporate Trainer", summary: "Teach practical skills to adults inside companies; explaining is the job." },
      { title: "Teacher", summary: "Guide learners through structured material; steady rhythm, visible human impact." },
      { title: "Career Coach", summary: "Help individuals navigate work decisions one-on-one; empathetic and practical." },
    ],
  },
  {
    id: "finance",
    label: "Finance & Analytics",
    examples: "financial analyst, accountant, compliance specialist, actuary",
    professionSeeds: [
      { title: "Financial Analyst", summary: "Model, forecast, and explain the numbers behind business decisions." },
      { title: "Accountant", summary: "Keep financial records accurate and compliant; structured and dependable." },
      { title: "Compliance Specialist", summary: "Make sure the rules are followed; detail-oriented work with real stakes." },
    ],
  },
  {
    id: "media",
    label: "Marketing & Media",
    examples: "digital marketer, content strategist, social media manager, copywriter",
    professionSeeds: [
      { title: "Digital Marketer", summary: "Run campaigns and grow audiences with a mix of creativity and metrics." },
      { title: "Content Strategist", summary: "Plan and shape what a brand says and where; editorial thinking at scale." },
      { title: "Social Media Manager", summary: "Own a brand's public voice day to day; fast feedback, creative output." },
    ],
  },
];

const DIRECTION_IDS = DIRECTIONS.map((d) => d.id);

function getDirection(id) {
  return DIRECTIONS.find((d) => d.id === id) || null;
}

// Deterministic Stage A resolution: each answered option votes for its
// directionId; most votes wins; ties break by catalog order (strict > while
// iterating DIRECTIONS keeps the earliest). No answers -> first direction.
// excludeIds removes rejected directions from both voting and the fallback.
function computeDirection(questions, answers, excludeIds = []) {
  const excluded = new Set(excludeIds);
  const counts = new Map();

  for (const question of questions) {
    const chosen = answers[question.id];
    if (chosen === undefined) continue;
    const option = question.options.find((o) => o.value === chosen);
    if (!option || !option.directionId) continue;
    if (excluded.has(option.directionId)) continue;
    counts.set(option.directionId, (counts.get(option.directionId) || 0) + 1);
  }

  let best = null;
  for (const dir of DIRECTIONS) {
    if (excluded.has(dir.id)) continue;
    const count = counts.get(dir.id) || 0;
    if (count > 0 && (best === null || count > best.count)) {
      best = { id: dir.id, label: dir.label, count };
    }
  }

  if (!best) {
    const firstAvailable = DIRECTIONS.find((dir) => !excluded.has(dir.id)) || DIRECTIONS[0];
    return { id: firstAvailable.id, label: firstAvailable.label };
  }
  return { id: best.id, label: best.label };
}

// Validated server-side; display labels live in the frontend refine card.
const REFINE_REASON_VALUES = ["environment", "interests", "too_technical", "prospects"];

module.exports = {
  DIRECTIONS,
  DIRECTION_IDS,
  getDirection,
  computeDirection,
  REFINE_REASON_VALUES,
};
