// Canonical broad professional field families. Since question-engine v2 the
// catalog is internal grounding for the Oriented Field output loop: it feeds
// the RIASEC ranking hint in the oriented-field prompt, the deterministic
// keyless fallbacks (professionSeeds), and the per-direction Schwartz
// prototypes. It spans the full range of human work and stays alphabetical
// ON PURPOSE so no domain — especially tech — is structurally favored by
// sitting first in any deterministic walk.
const DIRECTIONS = [
  {
    id: "agriculture",
    label: "Agriculture & Environment",
    examples: "agronomist, park ranger, landscape gardener, environmental technician",
    professionSeeds: [
      { title: "Agronomist", summary: "Advise farms on crops, soil, and yields — science applied outdoors, season by season." },
      { title: "Landscape Gardener", summary: "Design and maintain green spaces; physical, visible work in the open air." },
      { title: "Environmental Technician", summary: "Monitor air, water, and soil quality in the field and report what you find." },
    ],
  },
  {
    id: "arts",
    label: "Arts & Performance",
    examples: "photographer, musician, writer, stage technician",
    professionSeeds: [
      { title: "Photographer", summary: "Shoot commissioned work — portraits, events, products — while building a distinctive portfolio." },
      { title: "Working Musician", summary: "Perform, teach, and record; a portfolio career built around your instrument." },
      { title: "Stage Production Technician", summary: "Put shows on stage with light, sound, and set — the craft behind the curtain." },
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
    id: "hospitality",
    label: "Hospitality & Events",
    examples: "chef, event planner, hotel manager, barista",
    professionSeeds: [
      { title: "Chef", summary: "Run a station or a kitchen; intense, physical, immediate feedback from every plate." },
      { title: "Event Planner", summary: "Design and deliver weddings, conferences, and launches — logistics with a human face." },
      { title: "Hotel Operations Manager", summary: "Keep a property running and guests happy across a hundred small decisions a day." },
    ],
  },
  {
    id: "law",
    label: "Law & Public Service",
    examples: "paralegal, lawyer, policy analyst, civil servant",
    professionSeeds: [
      { title: "Paralegal", summary: "Research, draft, and organize cases inside a law practice; precision with real consequences." },
      { title: "Policy Analyst", summary: "Study public problems and draft what government should do about them." },
      { title: "Civil Servant", summary: "Run public programs and services; a structured career with societal purpose." },
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
    id: "science",
    label: "Science & Research",
    examples: "lab scientist, research assistant, field biologist, data researcher",
    professionSeeds: [
      { title: "Laboratory Scientist", summary: "Run experiments and analyses in a lab; rigorous, methodical discovery work." },
      { title: "Research Assistant", summary: "Support studies end to end — literature, data collection, analysis — inside a research group." },
      { title: "Field Researcher", summary: "Collect and analyze data outside the lab, from ecosystems to communities." },
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
    id: "social",
    label: "Social & Community Work",
    examples: "social worker, HR specialist, NGO coordinator, youth worker",
    professionSeeds: [
      { title: "Social Worker", summary: "Support people through crises with casework that changes individual lives." },
      { title: "HR Specialist", summary: "Hire, support, and develop people inside an organization." },
      { title: "Nonprofit Program Coordinator", summary: "Run community programs from funding to delivery; mission-driven organizing." },
    ],
  },
  {
    id: "sports",
    label: "Sports & Fitness",
    examples: "personal trainer, sports coach, physiotherapy assistant, studio manager",
    professionSeeds: [
      { title: "Personal Trainer", summary: "Coach individuals to measurable physical results; energy and accountability." },
      { title: "Sports Coach", summary: "Train teams or athletes through seasons; leadership expressed through practice." },
      { title: "Fitness Studio Manager", summary: "Run a gym or studio — people, schedules, and a place with its own pulse." },
    ],
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
