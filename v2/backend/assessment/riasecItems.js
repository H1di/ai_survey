// Static Holland RIASEC interest items (public-domain style, written for this
// app) — the fixed interests instrument. Activity statements rated 1–5 for
// enjoyment, never job titles.

const RIASEC_POOL = [
  // Realistic
  { type: "R", text: "Assembling or repairing a physical device until it works" },
  { type: "R", text: "Working outdoors with tools, plants, or animals" },
  { type: "R", text: "Operating machines or vehicles with real skill" },
  // Investigative
  { type: "I", text: "Analysing data to find the pattern behind it" },
  { type: "I", text: "Running a small experiment to test an idea" },
  { type: "I", text: "Digging into research to understand how something really works" },
  // Artistic
  { type: "A", text: "Shaping how something looks, feels, or reads" },
  { type: "A", text: "Writing, composing, or performing for an audience" },
  { type: "A", text: "Inventing an original concept where nothing existed before" },
  // Social
  { type: "S", text: "Helping someone work through a difficult situation" },
  { type: "S", text: "Teaching a skill until the learner truly gets it" },
  { type: "S", text: "Caring for someone's health or wellbeing" },
  // Enterprising
  { type: "E", text: "Pitching an idea and winning people over" },
  { type: "E", text: "Organizing a team toward an ambitious goal" },
  { type: "E", text: "Negotiating a deal where the stakes are real" },
  // Conventional
  { type: "C", text: "Bringing order to messy records or information" },
  { type: "C", text: "Planning a detailed schedule or budget" },
  { type: "C", text: "Checking work carefully for errors before it ships" },
];

const TYPE_ORDER = ["R", "I", "A", "S", "E", "C"];

// Interleave R,I,A,S,E,C so same-type items never sit in a block (less
// pattern-y for the respondent). Fixed instrument: 2 per type = 12 items.
function getStaticRiasecItems() {
  const byType = Object.fromEntries(
    TYPE_ORDER.map((t) => [t, RIASEC_POOL.filter((i) => i.type === t)])
  );
  const items = [];
  for (let round = 0; round < 2; round += 1) {
    for (const type of TYPE_ORDER) {
      items.push(byType[type][round]);
    }
  }
  return items.map((item, index) => ({ id: `ri_${index + 1}`, ...item }));
}

module.exports = { RIASEC_POOL, getStaticRiasecItems };
