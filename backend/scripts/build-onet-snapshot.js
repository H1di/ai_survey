// Build backend/data/onet-snapshot.json from the O*NET database text download
// (https://www.onetcenter.org/database.html, "text" format). Run manually when
// bumping the O*NET version — the snapshot is checked in, deploys never fetch:
//
//   node scripts/build-onet-snapshot.js /path/to/db_30_3_text /path/to/"Work Values.txt"
//
// O*NET 30.3 dropped the Work Values descriptor, so the six Minnesota work
// values are merged in by SOC from the O*NET 28.0 "Work Values.txt" (second
// arg). The snapshot keeps only what the Life Path Engine needs per occupation:
// RIASEC profile, job zone, top skills/technology, related SOCs, the six
// work-value scores, and the mapping into the 15-direction catalog
// (work-value prototypes + notSuitable exclusions run on direction families).
const fs = require("node:fs");
const path = require("node:path");
const { DIRECTION_IDS } = require("../directions");

const ONET_VERSION = "30.3";

// SOC prefix -> direction family, longest prefix wins. Major groups map
// wholesale except where one group genuinely spans families (27 arts/design/
// sports/media, 13 business/finance, 39 personal services).
const SOC_DIRECTION_RULES = {
  11: "business", // Management
  "13-2": "finance", // Financial specialists
  13: "business", // Business operations specialists
  "15-2011": "finance", // Actuaries — a finance archetype
  "15-2": "science", // Mathematical occupations
  15: "tech", // Computer occupations
  17: "tech", // Architecture & engineering
  19: "science", // Life, physical, social science
  21: "social", // Community & social service
  23: "law", // Legal
  25: "education", // Education & library
  "27-101": "arts", // Art directors, fine artists, animators
  "27-1": "design", // Designers
  "27-202": "sports", // Athletes, coaches, umpires
  "27-2": "arts", // Performers
  "27-3": "media", // Media & communication
  "27-4": "arts", // Media equipment (photographers, sound techs)
  "29-9091": "sports", // Athletic trainers
  29: "healthcare", // Healthcare practitioners
  31: "healthcare", // Healthcare support
  33: "law", // Protective service (public service family)
  35: "hospitality", // Food preparation & serving
  "37-3": "agriculture", // Grounds maintenance
  37: "trades", // Building cleaning & maintenance
  "39-2": "agriculture", // Animal care
  "39-9011": "social", // Childcare workers
  "39-903": "sports", // Fitness trainers & instructors
  39: "hospitality", // Personal care & service
  41: "business", // Sales
  "43-3": "finance", // Financial clerks
  43: "business", // Office & administrative support
  45: "agriculture", // Farming, fishing, forestry
  47: "trades", // Construction & extraction
  49: "trades", // Installation, maintenance, repair
  51: "trades", // Production
  53: "trades", // Transportation & material moving
  55: "law", // Military specific (public service family)
};

const PREFIXES_BY_LENGTH = Object.keys(SOC_DIRECTION_RULES).sort(
  (a, b) => b.length - a.length
);

function mapSocToDirection(soc) {
  const code = String(soc || "");
  const prefix = PREFIXES_BY_LENGTH.find((p) => code.startsWith(p));
  const direction = prefix ? SOC_DIRECTION_RULES[prefix] : null;
  return direction && DIRECTION_IDS.includes(direction) ? direction : null;
}

function parseTsv(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.length > 0);
  const headers = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const cells = line.split("\t");
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    return row;
  });
}

const RIASEC_BY_NAME = {
  Realistic: "R",
  Investigative: "I",
  Artistic: "A",
  Social: "S",
  Enterprising: "E",
  Conventional: "C",
};

// OI scale is 1-7; the app's RIASEC vectors are 0-100.
const normalizeOi = (value) => Math.round(((Number(value) - 1) / 6) * 100);

// O*NET removed the Work Values descriptor after 28.0; we merge the 28.0
// "Work Values.txt" onto the 30.3 occupation set by SOC. Each SOC carries six
// EX (Extent, 1-7 importance) rows plus three VH high-point rows we ignore.
const WORK_VALUE_KEY_BY_ELEMENT_ID = {
  "1.B.2.a": "achievement",
  "1.B.2.b": "working_conditions",
  "1.B.2.c": "recognition",
  "1.B.2.d": "relationships",
  "1.B.2.e": "support",
  "1.B.2.f": "independence",
};

// EX scale is 1-7; work-value vectors are 0-100 to match the rest of the app.
const normalizeEx = (value) => Math.round(((Number(value) - 1) / 6) * 100);

// soc -> { 6 work-value keys }. Only complete six-value entries are kept.
function parseWorkValues(rows) {
  const bySoc = new Map();
  for (const r of rows) {
    if (r["Scale ID"] !== "EX") continue;
    const key = WORK_VALUE_KEY_BY_ELEMENT_ID[r["Element ID"]];
    if (!key) continue;
    const soc = r["O*NET-SOC Code"];
    if (!bySoc.has(soc)) bySoc.set(soc, {});
    bySoc.get(soc)[key] = normalizeEx(r["Data Value"]);
  }
  for (const [soc, v] of bySoc) {
    if (Object.keys(v).length !== 6) bySoc.delete(soc);
  }
  return bySoc;
}

// Exact SOC first; fall back to the base occupation code (before the ".detail"
// suffix) so 30.3 detail codes absent from 28.0 still inherit their base values.
function buildWorkValuesLookup(bySoc) {
  const baseIndex = new Map();
  for (const [soc, v] of bySoc) {
    const base = soc.split(".")[0];
    if (!baseIndex.has(base)) baseIndex.set(base, v);
  }
  return (soc) => bySoc.get(soc) || baseIndex.get(String(soc).split(".")[0]) || null;
}

const firstSentence = (text) => {
  const match = String(text || "").match(/^.*?\.(?=\s|$)/);
  return match ? match[0] : String(text || "");
};

function groupBySoc(rows) {
  const map = new Map();
  for (const row of rows) {
    const soc = row["O*NET-SOC Code"];
    if (!map.has(soc)) map.set(soc, []);
    map.get(soc).push(row);
  }
  return map;
}

const MAX_SKILLS = 8;
const MAX_TECH = 8;
const MAX_RELATED = 5;

function topSkills(rows) {
  return rows
    .filter((r) => r["Scale ID"] === "IM" && r["Recommend Suppress"] !== "Y")
    .sort((a, b) => Number(b["Data Value"]) - Number(a["Data Value"]))
    .slice(0, MAX_SKILLS)
    .map((r) => r["Element Name"]);
}

function topTech(rows) {
  const tier = (r) =>
    (r["Hot Technology"] === "Y" ? 0 : 2) + (r["In Demand"] === "Y" ? 0 : 1);
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => tier(a.r) - tier(b.r) || a.i - b.i)
    .slice(0, MAX_TECH)
    .map(({ r }) => r["Workplace Example"]);
}

function topRelated(rows) {
  return rows
    .filter((r) => r["Relatedness Tier"] === "Primary-Short")
    .sort((a, b) => Number(a.Index) - Number(b.Index))
    .slice(0, MAX_RELATED)
    .map((r) => r["Related O*NET-SOC Code"]);
}

// tables: parsed rows of the seven source files (+ optional workValues rows).
// Occupations without an OI interest profile are dropped — the snapshot exists
// to be ranked by RIASEC.
function transform(tables) {
  const interestsBySoc = groupBySoc(
    tables.interests.filter((r) => r["Scale ID"] === "OI")
  );
  const jobZoneBySoc = new Map(
    tables.jobZones.map((r) => [r["O*NET-SOC Code"], Number(r["Job Zone"])])
  );
  const skillsBySoc = groupBySoc([
    ...tables.essentialSkills,
    ...tables.transferableSkills,
  ]);
  const techBySoc = groupBySoc(tables.softwareSkills);
  const relatedBySoc = groupBySoc(tables.relatedOccupations);
  const lookupWorkValues = buildWorkValuesLookup(
    tables.workValues ? parseWorkValues(tables.workValues) : new Map()
  );

  const occupations = [];
  for (const row of tables.occupationData) {
    const soc = row["O*NET-SOC Code"];
    const interestRows = interestsBySoc.get(soc);
    if (!interestRows || interestRows.length < 6) continue;

    const directionId = mapSocToDirection(soc);
    if (!directionId) {
      throw new Error(`No direction mapping for O*NET-SOC code ${soc} (${row.Title})`);
    }

    const riasec = {};
    for (const r of interestRows) {
      const key = RIASEC_BY_NAME[r["Element Name"]];
      if (key) riasec[key] = normalizeOi(r["Data Value"]);
    }

    occupations.push({
      soc,
      title: row.Title,
      blurb: firstSentence(row.Description),
      riasec,
      jobZone: jobZoneBySoc.get(soc) ?? null,
      skills: topSkills(skillsBySoc.get(soc) || []),
      tech: topTech(techBySoc.get(soc) || []),
      related: topRelated(relatedBySoc.get(soc) || []),
      directionId,
      workValues: lookupWorkValues(soc),
    });
  }

  return { occupations };
}

const SOURCE_FILES = {
  occupationData: "Occupation Data.txt",
  interests: "Career Interest Types.txt",
  jobZones: "Job Zones.txt",
  essentialSkills: "Essential Skills.txt",
  transferableSkills: "Transferable Skills.txt",
  softwareSkills: "Software Skills.txt",
  relatedOccupations: "Related Occupations.txt",
};

// O*NET version whose Work Values.txt is merged in (30.3 dropped the descriptor).
const WORK_VALUES_VERSION = "28.0";

function main() {
  const sourceDir = process.argv[2];
  const workValuesFile = process.argv[3];
  if (!sourceDir) {
    console.error(
      "Usage: node scripts/build-onet-snapshot.js <db_30_3_text dir> [<28.0 Work Values.txt>]"
    );
    process.exit(1);
  }

  const tables = {};
  for (const [key, file] of Object.entries(SOURCE_FILES)) {
    tables[key] = parseTsv(fs.readFileSync(path.join(sourceDir, file), "utf8"));
  }
  if (workValuesFile) {
    tables.workValues = parseTsv(fs.readFileSync(workValuesFile, "utf8"));
  }

  const { occupations } = transform(tables);
  const withValues = occupations.filter((o) => o.workValues).length;
  const attribution = workValuesFile
    ? `This product includes information from the O*NET ${ONET_VERSION} Database ` +
      `(occupations, interests, skills) and the O*NET ${WORK_VALUES_VERSION} Database ` +
      "(work values), plus O*NET Web Services, by the U.S. Department of Labor, Employment " +
      "and Training Administration (USDOL/ETA). O*NET® is a trademark of USDOL/ETA. " +
      "Used under the CC BY 4.0 license."
    : `This product includes information from the O*NET ${ONET_VERSION} Database and ` +
      "O*NET Web Services by the U.S. Department of Labor, Employment and Training " +
      "Administration (USDOL/ETA). O*NET® is a trademark of USDOL/ETA. " +
      "Used under the CC BY 4.0 license.";
  const snapshot = {
    version: ONET_VERSION,
    workValuesVersion: workValuesFile ? WORK_VALUES_VERSION : null,
    generated: new Date().toISOString().slice(0, 10),
    attribution,
    occupations,
  };

  const outPath = path.join(__dirname, "..", "data", "onet-snapshot.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(snapshot));
  const kb = Math.round(fs.statSync(outPath).size / 1024);
  console.log(
    `Wrote ${occupations.length} occupations to ${outPath} (${kb} KB); ` +
      `${withValues} with work values, ${occupations.length - withValues} on prototype fallback`
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  mapSocToDirection,
  parseTsv,
  transform,
  parseWorkValues,
  buildWorkValuesLookup,
  ONET_VERSION,
};
