// Canonical broad professional field families. Since question-engine v2 the
// catalog is internal grounding for the Oriented Field output loop: it feeds
// the RIASEC ranking hint in the oriented-field prompt, the deterministic
// keyless fallbacks (family labels), and the per-direction work-value
// prototypes. It spans the full range of human work and stays alphabetical
// ON PURPOSE so no domain — especially tech — is structurally favored by
// sitting first in any deterministic walk.
const DIRECTIONS = [
  {
    id: "agriculture",
    label: "Agriculture & Environment",
    examples: "agronomist, park ranger, landscape gardener, environmental technician",
  },
  {
    id: "arts",
    label: "Arts & Performance",
    examples: "photographer, musician, writer, stage technician",
  },
  {
    id: "business",
    label: "Business & Sales",
    examples: "account executive, operations manager, business analyst, founder",
  },
  {
    id: "design",
    label: "Design & Creative",
    examples: "UX designer, graphic designer, interior designer, illustrator",
  },
  {
    id: "education",
    label: "Education & Coaching",
    examples: "teacher, corporate trainer, career coach, instructional designer",
  },
  {
    id: "finance",
    label: "Finance & Analytics",
    examples: "financial analyst, accountant, compliance specialist, actuary",
  },
  {
    id: "healthcare",
    label: "Healthcare & Wellbeing",
    examples: "nurse, physical therapist, lab technician, paramedic",
  },
  {
    id: "hospitality",
    label: "Hospitality & Events",
    examples: "chef, event planner, hotel manager, barista",
  },
  {
    id: "law",
    label: "Law & Public Service",
    examples: "paralegal, lawyer, policy analyst, civil servant",
  },
  {
    id: "media",
    label: "Marketing & Media",
    examples: "digital marketer, content strategist, social media manager, copywriter",
  },
  {
    id: "tech",
    label: "Programming & Technology",
    examples: "software developer, data analyst, IT support, DevOps engineer",
  },
  {
    id: "science",
    label: "Science & Research",
    examples: "lab scientist, research assistant, field biologist, data researcher",
  },
  {
    id: "trades",
    label: "Skilled Trades",
    examples: "electrician, HVAC technician, carpenter, welder",
  },
  {
    id: "social",
    label: "Social & Community Work",
    examples: "social worker, HR specialist, NGO coordinator, youth worker",
  },
  {
    id: "sports",
    label: "Sports & Fitness",
    examples: "personal trainer, sports coach, physiotherapy assistant, studio manager",
  },
];

const DIRECTION_IDS = DIRECTIONS.map((d) => d.id);

function getDirection(id) {
  return DIRECTIONS.find((d) => d.id === id) || null;
}

module.exports = {
  DIRECTIONS,
  DIRECTION_IDS,
  getDirection,
};
