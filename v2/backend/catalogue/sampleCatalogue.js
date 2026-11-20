// SAMPLE course catalogue — placeholder data, NOT real Irish courses.
//
// The business report's path-first flow builds every roadmap from "the
// database of Irish courses" (Qualifax / FETCH / CAO). That import does not
// exist yet, so this module generates a deterministic, clearly fictional
// catalogue with the same shape the import will have. Every provider name
// starts with "Sample", every course carries `sample: true`, and the snapshot
// tells the UI to show a "sample data" notice. Drop a real
// `data/ie-courses.json` next to this and catalogue/index.js uses it instead.
//
// Skills are written in the O*NET skill vocabulary on purpose: occupations in
// the O*NET snapshot list the same names, so "what to add" recommendations are
// a plain skill overlap (report §07: "courses and extras are tagged with the
// same skills, so matching is the overlap").

const PROVIDERS = {
  university: { dublin: "Sample University Dublin", cork: "Sample University Cork", galway: "Sample University Galway" },
  tu: { dublin: "Sample Technological University Dublin", limerick: "Sample TU Limerick", waterford: "Sample TU Waterford", cork: "Sample TU Cork" },
  fet: { dublin: "Sample FET College Dublin", cork: "Sample FET College Cork", galway: "Sample FET College Galway", limerick: "Sample FET College Limerick" },
  online: { online: "Sample Online Academy" },
};

// kind → award, NFQ level, duration (months), annual fee (€), mode, start month.
const KINDS = {
  short: { award: "Micro-credential", nfqLevel: 6, durationMonths: 3, feeEur: 450, mode: "online", startMonth: 1, providerType: "online" },
  plc: { award: "QQI Level 5 Certificate", nfqLevel: 5, durationMonths: 9, feeEur: 0, mode: "full_time", startMonth: 9, providerType: "fet" },
  undergrad: { award: "Level 8 Honours Bachelor's Degree", nfqLevel: 8, durationMonths: 48, feeEur: 3000, mode: "full_time", startMonth: 9, providerType: "university" },
  higher_cert: { award: "Level 6 Higher Certificate", nfqLevel: 6, durationMonths: 24, feeEur: 3000, mode: "full_time", startMonth: 9, providerType: "tu" },
  postgrad: { award: "Level 9 Postgraduate Diploma", nfqLevel: 9, durationMonths: 12, feeEur: 6500, mode: "part_time", startMonth: 9, providerType: "university" },
};

// One row per field family: titles per kind + the O*NET-vocabulary skills each
// course builds. Ids are stable (`<direction>-<kind>`), so saved paths survive
// a regenerate.
const FIELDS = [
  ["agriculture", { short: "Sustainable Land Management Essentials", plc: "Horticulture and Environmental Studies", higher_cert: "Agricultural Science", undergrad: "Environmental Science and Agriculture", postgrad: "Climate and Environmental Sustainability" },
    ["Science", "Equipment Maintenance", "Monitoring", "Critical Thinking", "Operation and Control"]],
  ["arts", { short: "Creative Writing Online", plc: "Performing Arts Foundation", higher_cert: "Music Production", undergrad: "Creative Arts and Media Practice", postgrad: "Arts Management" },
    ["Writing", "Speaking", "Active Learning", "Coordination", "Persuasion"]],
  ["business", { short: "Digital Marketing Fundamentals", plc: "Business Administration", higher_cert: "Business Studies", undergrad: "Business and Management", postgrad: "Business Analytics" },
    ["Persuasion", "Negotiation", "Management of Financial Resources", "Judgment and Decision Making", "Speaking"]],
  ["design", { short: "UX Design Foundations", plc: "Art, Craft and Design Portfolio", higher_cert: "Graphic Design", undergrad: "Visual Communication Design", postgrad: "User Experience Design" },
    ["Operations Analysis", "Active Listening", "Complex Problem Solving", "Writing", "Quality Control Analysis"]],
  ["education", { short: "Introduction to Tutoring and Coaching", plc: "Early Childhood Care and Education", higher_cert: "Early Learning and Care", undergrad: "Education Studies", postgrad: "Professional Master of Education (taster route)" },
    ["Instructing", "Learning Strategies", "Social Perceptiveness", "Speaking", "Active Listening"]],
  ["finance", { short: "Personal Finance and Bookkeeping", plc: "Accounting Technician Foundation", higher_cert: "Accounting", undergrad: "Finance and Economics", postgrad: "Financial Analysis" },
    ["Mathematics", "Management of Financial Resources", "Critical Thinking", "Systems Evaluation", "Monitoring"]],
  ["healthcare", { short: "First Aid and Patient Care Basics", plc: "Pre-Nursing Studies", higher_cert: "Applied Health Care", undergrad: "Physiotherapy", postgrad: "Public Health" },
    ["Service Orientation", "Social Perceptiveness", "Science", "Active Listening", "Monitoring"]],
  ["hospitality", { short: "Food Safety and Customer Service", plc: "Hospitality and Tourism Operations", higher_cert: "Culinary Arts", undergrad: "International Hospitality Management", postgrad: "Tourism and Events Management" },
    ["Service Orientation", "Coordination", "Time Management", "Management of Personnel Resources", "Speaking"]],
  ["law", { short: "Introduction to Irish Law", plc: "Legal Studies", higher_cert: "Paralegal Studies", undergrad: "Law (LLB)", postgrad: "Legal Practice Preparation" },
    ["Reading Comprehension", "Writing", "Critical Thinking", "Negotiation", "Judgment and Decision Making"]],
  ["media", { short: "Podcasting and Video Basics", plc: "Media Production", higher_cert: "Journalism and Digital Media", undergrad: "Communications and Media", postgrad: "Digital Journalism" },
    ["Writing", "Speaking", "Active Listening", "Persuasion", "Time Management"]],
  ["tech", { short: "Python Programming Fundamentals", plc: "Computer Systems and Networks", higher_cert: "Software Development", undergrad: "Computer Science", postgrad: "Data Science (conversion)" },
    ["Programming", "Complex Problem Solving", "Systems Analysis", "Troubleshooting", "Mathematics"]],
  ["science", { short: "Lab Skills Online", plc: "Applied Laboratory Science", higher_cert: "Applied Biology", undergrad: "Biomedical Science", postgrad: "Research Methods in Science" },
    ["Science", "Mathematics", "Critical Thinking", "Quality Control Analysis", "Reading Comprehension"]],
  ["trades", { short: "Health and Safety on Site", plc: "Pre-Apprenticeship in Construction", higher_cert: "Electrical Engineering Technology", undergrad: "Construction Management", postgrad: "Sustainable Building Retrofit" },
    ["Repairing", "Installation", "Equipment Maintenance", "Troubleshooting", "Operation and Control"]],
  ["social", { short: "Mental Health Awareness", plc: "Community and Youth Work", higher_cert: "Social Care Practice", undergrad: "Social Science", postgrad: "Counselling Skills" },
    ["Social Perceptiveness", "Active Listening", "Service Orientation", "Speaking", "Coordination"]],
  ["sports", { short: "Fitness Instruction Basics", plc: "Sport and Recreation Studies", higher_cert: "Sports Coaching", undergrad: "Sport and Exercise Science", postgrad: "Strength and Conditioning" },
    ["Instructing", "Monitoring", "Coordination", "Science", "Learning Strategies"]],
];

// Deterministic spread over cities / modes so filters have something to bite on.
const CITY_ROTATION = {
  university: ["dublin", "cork", "galway"],
  tu: ["dublin", "limerick", "waterford", "cork"],
  fet: ["dublin", "cork", "galway", "limerick"],
  online: ["online"],
};

function buildSampleCatalogue() {
  const courses = [];
  FIELDS.forEach(([directionId, titles, skills], fieldIndex) => {
    for (const [kind, title] of Object.entries(titles)) {
      const base = KINDS[kind];
      const cities = CITY_ROTATION[base.providerType];
      const city = cities[fieldIndex % cities.length];
      // Every third postgrad is full-time; every other short course is free
      // (Springboard-style funded places) — variety for the budget filter.
      const mode = kind === "postgrad" && fieldIndex % 3 === 0 ? "full_time" : base.mode;
      const feeEur = kind === "short" && fieldIndex % 2 === 0 ? 0 : base.feeEur;
      const years = Math.max(1, Math.round(base.durationMonths / 12));
      courses.push({
        id: `${directionId}-${kind}`,
        title,
        provider: PROVIDERS[base.providerType][city],
        providerType: base.providerType,
        award: base.award,
        nfqLevel: base.nfqLevel,
        kind,
        directionIds: [directionId],
        city,
        mode,
        durationMonths: base.durationMonths,
        feeEur,
        totalFeeEur: base.durationMonths <= 12 ? feeEur : feeEur * years,
        startMonth: kind === "short" ? 1 + (fieldIndex % 4) * 3 : base.startMonth,
        // Short and PLC courses build the first three skills; degrees all five.
        skills: kind === "short" || kind === "plc" ? skills.slice(0, 3) : skills.slice(),
        url: null,
        sample: true,
      });
    }

    // Two variants per field so rebuilds and scenarios have a real
    // alternative: an in-person evening short course and an online,
    // part-time postgrad (slower but cheaper per year).
    const fetCity = CITY_ROTATION.fet[(fieldIndex + 1) % CITY_ROTATION.fet.length];
    courses.push({
      id: `${directionId}-short-evening`,
      title: `${titles.short} (Evening)`,
      provider: PROVIDERS.fet[fetCity],
      providerType: "fet",
      award: "QQI Level 5 Minor Award",
      nfqLevel: 5,
      kind: "short",
      directionIds: [directionId],
      city: fetCity,
      mode: "part_time",
      durationMonths: 4,
      feeEur: 200,
      totalFeeEur: 200,
      startMonth: 2 + (fieldIndex % 3) * 3,
      skills: skills.slice(1, 4),
      url: null,
      sample: true,
    });
    courses.push({
      id: `${directionId}-postgrad-online`,
      title: `${titles.postgrad} (Online)`,
      provider: PROVIDERS.online.online,
      providerType: "online",
      award: "Level 9 Postgraduate Certificate",
      nfqLevel: 9,
      kind: "postgrad",
      directionIds: [directionId],
      city: "online",
      mode: "online",
      durationMonths: 24,
      feeEur: 2500,
      totalFeeEur: 5000,
      startMonth: 1,
      skills: skills.slice(0, 4),
      url: null,
      sample: true,
    });
  });
  return courses;
}

module.exports = { buildSampleCatalogue, KINDS };
