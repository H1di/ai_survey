// ESCO occupation content. Pure lookups over the checked-in snapshot
// (backend/data/esco-snapshot.json, built by scripts/build-esco-snapshot.js).
// O*NET still ranks (RIASEC + work values); once a SOC is chosen, one ESCO
// occupation among its crosswalk matches supplies everything the person reads:
// title, description, skills, education level. No network, no key.
const snapshot = require("../data/esco-snapshot.json");

const ESCO_ATTRIBUTION = snapshot.attribution;
const ESCO_VERSION = snapshot.version;
const ESCO_OCCUPATION_COUNT = snapshot.occupations.length;
const ESCO_URI_PREFIX = "http://data.europa.eu/esco/occupation/";
const MATCH_RANK = { exact: 0, close: 1, narrow: 2, broad: 3 };

// soc → occupations, best match first: exact → close → narrow → broad,
// crosswalked before ISCO-inherited, then English title.
const bySoc = new Map();
for (const occ of snapshot.occupations) {
  for (const [soc, match] of occ.soc) {
    if (!bySoc.has(soc)) bySoc.set(soc, []);
    bySoc.get(soc).push({ occ, rank: MATCH_RANK[match] * 2 + (occ.inherited ? 1 : 0) });
  }
}
for (const [soc, list] of bySoc) {
  list.sort((a, b) => a.rank - b.rank || a.occ.titles.en.localeCompare(b.occ.titles.en, "en"));
  bySoc.set(soc, list.map((entry) => entry.occ));
}

function escoForSoc(soc) {
  return bySoc.get(soc) || [];
}

function hasEsco(soc) {
  return bySoc.has(soc);
}

// The AI may name an ESCO occupation; only one of this SOC's own matches is
// accepted, anything else falls back to the best match.
function pickEsco(soc, escoId) {
  const list = escoForSoc(soc);
  return list.find((o) => o.id === escoId) || list[0] || null;
}

function escoTitle(occ, lang = "en") {
  return occ.titles[lang] || occ.titles.en;
}

// ISCO-08 skill levels per major group, and the EQF range each level spans.
const ISCO_SKILL_LEVELS = {
  1: [3, 4], 2: [4], 3: [3], 4: [2], 5: [2], 6: [2], 7: [2], 8: [2], 9: [1], 0: [1, 2, 3, 4],
};
const SKILL_LEVEL_EQF = { 1: [1, 1], 2: [2, 4], 3: [5, 5], 4: [6, 8] };
const JOB_ZONE_EQF = { 1: [1, 2], 2: [3, 3], 3: [4, 5], 4: [6, 6], 5: [7, 8] };

// ESCO side sets the range (ISCO skill level); the O*NET job zone only
// narrows it when the two overlap — it never moves it.
function educationLevel(isco, jobZone) {
  const levels = ISCO_SKILL_LEVELS[String(isco || "")[0]] || ISCO_SKILL_LEVELS[0];
  const eqfMin = Math.min(...levels.map((l) => SKILL_LEVEL_EQF[l][0]));
  const eqfMax = Math.max(...levels.map((l) => SKILL_LEVEL_EQF[l][1]));
  const zone = JOB_ZONE_EQF[jobZone];
  if (zone) {
    const lo = Math.max(eqfMin, zone[0]);
    const hi = Math.min(eqfMax, zone[1]);
    if (lo <= hi) return { eqfMin: lo, eqfMax: hi, source: "isco+jobzone" };
  }
  return { eqfMin, eqfMax, source: "isco" };
}

const skillLabel = (index) => snapshot.skills[index][1];

// The `output.esco` block. `soc` names which crosswalk pair to report as the match.
function escoBlock(occ, { jobZone, soc } = {}) {
  const pair = occ.soc.find(([s]) => s === soc) || occ.soc[0];
  return {
    id: occ.id,
    uri: ESCO_URI_PREFIX + occ.id,
    code: occ.code,
    isco: occ.isco,
    title: escoTitle(occ, "en"),
    titles: occ.titles,
    description: occ.description,
    essentialSkills: occ.essential.map(skillLabel),
    optionalSkills: occ.optional.map(skillLabel),
    match: pair[1],
    inherited: occ.inherited,
    education: educationLevel(occ.isco, jobZone),
    attribution: ESCO_ATTRIBUTION,
  };
}

module.exports = {
  escoForSoc,
  pickEsco,
  escoTitle,
  educationLevel,
  escoBlock,
  hasEsco,
  ESCO_ATTRIBUTION,
  ESCO_VERSION,
  ESCO_OCCUPATION_COUNT,
};
