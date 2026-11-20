// Step 2 of the free flow (report §01): "The case. The platform sorts the
// answers into a case — choosing a first course, already studying, or planning
// the next step — and selects what applies." Pure and deterministic.
//
// A case is a list of slots; each slot is one roadmap step and names the
// course kinds that can fill it, best first. The path engine fills slots from
// the catalogue; the AI may only choose among the candidates it is handed.

const CASES = {
  first_course: {
    id: "first_course",
    label: "Choosing a first course",
    summary: "You're picking your first course after school, so the path starts with a taster and leads to a main programme.",
  },
  studying: {
    id: "studying",
    label: "Already studying",
    summary: "You're studying now, so the path adds skills alongside your course and plans the step after it.",
  },
  next_step: {
    id: "next_step",
    label: "Planning the next step",
    summary: "You've finished a course or are working, so the path tests the field quickly and then builds a qualification.",
  },
};

function detectCase(profile) {
  switch (profile.status) {
    case "school":
    case "school_leaver":
      return "first_course";
    case "studying":
      return "studying";
    default:
      return "next_step";
  }
}

// The main programme's kinds for each target level.
const MAIN_KINDS = {
  foundation: ["plc", "higher_cert"],
  bachelor: ["undergrad", "higher_cert"],
  postgrad: ["postgrad"],
  short: ["short", "plc"],
  unsure: ["undergrad", "higher_cert", "plc"],
};

// What naturally follows a main programme of a given target level.
const FOLLOW_ON_KINDS = {
  foundation: ["higher_cert", "undergrad"],
  bachelor: ["postgrad"],
  postgrad: [],
  short: ["higher_cert", "plc"],
  unsure: ["postgrad", "undergrad"],
};

function slotsFor(caseId, profile) {
  const level = profile.level || "unsure";
  const slots = [];
  if (caseId === "first_course") {
    slots.push({
      id: "prepare",
      label: "Prepare: a taster or foundation course",
      kinds: level === "foundation" || level === "short" ? ["short"] : ["short", "plc"],
    });
    slots.push({ id: "main", label: "Main programme", kinds: MAIN_KINDS[level] });
    if (FOLLOW_ON_KINDS[level].length) {
      slots.push({ id: "next", label: "After that: the next level", kinds: FOLLOW_ON_KINDS[level] });
    }
  } else if (caseId === "studying") {
    slots.push({ id: "alongside", label: "Alongside your studies: a skill booster", kinds: ["short"] });
    const nextKinds = level === "unsure" ? ["postgrad", "undergrad"] : MAIN_KINDS[level];
    slots.push({ id: "next", label: "After your current course", kinds: nextKinds });
  } else {
    slots.push({ id: "bridge", label: "Bridge: a short course to test the field", kinds: ["short"] });
    const mainKinds = level === "unsure" ? ["postgrad", "higher_cert"] : MAIN_KINDS[level];
    slots.push({ id: "main", label: "Main qualification", kinds: mainKinds });
    if (!mainKinds.includes("postgrad")) {
      slots.push({ id: "grow", label: "Grow: specialise further", kinds: ["postgrad"] });
    }
  }
  return slots;
}

function describeCase(caseId) {
  return CASES[caseId] || null;
}

module.exports = { CASES, detectCase, slotsFor, describeCase };
