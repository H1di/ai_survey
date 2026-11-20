// Builds backend/data/esco-snapshot.json from the official ESCO CSV package
// (classification, one folder per language) and the official ESCO ↔ O*NET-SOC
// crosswalk (version 1, Sep-22 — the one without "related" matches).
//
//   node scripts/build-esco-snapshot.js <esco dir with en/ uk/ …> <crosswalk csv>
//
// Only occupations reachable from a SOC in onet-snapshot.json are kept. An
// occupation with no surviving crosswalk pair inherits the SOC most of its
// ISCO 4-digit siblings map to (match "broad", inherited: true).
const fs = require("fs");
const path = require("path");
const { parseCsv } = require("./lib/csv");

const CROSSWALK_VERSION = "ESCO-O*NET crosswalk v1 (Sep-22)";
const LANGUAGES = ["en", "uk", "fr", "de", "es", "pt"];
const ATTRIBUTION =
  "This service uses the ESCO classification of the European Commission. " +
  "Adapted: skill lists shortened, descriptions trimmed, some occupations linked to O*NET by ISCO group.";
const MATCH = { exactMatch: "exact", closeMatch: "close", narrowMatch: "narrow", broadMatch: "broad" };
const MATCH_RANK = { exact: 0, close: 1, narrow: 2, broad: 3 };
const REUSE = { "occupation-specific": "o", "sector-specific": "s", "cross-sector": "c", transversal: "t" };
const REUSE_RANK = { o: 0, s: 1, c: 2, t: 3 };
const MAX_ESSENTIAL = 25;
const MAX_OPTIONAL = 15;
const MAX_DESCRIPTION = 300;

const uuidTail = (uri) => uri.slice(uri.lastIndexOf("/") + 1);

// Header row → array of {column: value} objects; every `required` column must exist.
function records(rows, required, file) {
  const [header, ...body] = rows;
  const index = {};
  for (const name of required) {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`Missing column ${name} in ${file}`);
    index[name] = i;
  }
  return body
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(required.map((name) => [name, r[index[name]] ?? ""])));
}

function trimDescription(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= MAX_DESCRIPTION) return clean;
  const cut = clean.slice(0, MAX_DESCRIPTION - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > MAX_DESCRIPTION / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function transformEsco({ crosswalkRows, occupationsByLang, skillRows, relationRows, socs, packageVersion = "" }) {
  const socSet = new Set(socs);
  const languages = LANGUAGES.filter((lang) => occupationsByLang[lang]);
  const occupationCols = ["conceptUri", "iscoGroup", "preferredLabel", "description", "code"];
  const byLang = {};
  for (const lang of languages) {
    byLang[lang] = records(occupationsByLang[lang], occupationCols, `occupations_${lang}.csv`);
  }
  const enOccupations = byLang.en;
  const enByUri = new Map(enOccupations.map((o) => [o.conceptUri, o]));

  // Crosswalk: header found by its first cell.
  const headerAt = crosswalkRows.findIndex((r) => r[0] === "O*NET Id");
  if (headerAt === -1) throw new Error("Missing column O*NET Id in crosswalk");
  const crosswalk = records(
    crosswalkRows.slice(headerAt),
    ["O*NET Id", "ESCO or ISCO URI", "Type of Match"],
    "crosswalk"
  );
  const report = {
    crosswalkRows: 0,
    iscoRowsIgnored: 0,
    urisMissingFromPackage: 0,
    socsWithoutEsco: 0,
    inheritedOccupations: 0,
    droppedOccupations: 0,
  };
  const pairs = new Map(); // uri → Map(soc → match)
  const missing = new Set();
  for (const row of crosswalk) {
    const uri = row["ESCO or ISCO URI"];
    if (uri.includes("/isco/")) {
      report.iscoRowsIgnored += 1;
      continue;
    }
    report.crosswalkRows += 1;
    if (!enByUri.has(uri)) {
      missing.add(uri);
      continue;
    }
    const soc = row["O*NET Id"];
    const match = MATCH[row["Type of Match"]];
    if (!socSet.has(soc) || !match) continue;
    if (!pairs.has(uri)) pairs.set(uri, new Map());
    const socs = pairs.get(uri);
    if (!socs.has(soc) || MATCH_RANK[match] < MATCH_RANK[socs.get(soc)]) socs.set(soc, match);
  }
  report.urisMissingFromPackage = missing.size;

  // ISCO-group inheritance for occupations without a surviving pair.
  const groupCounts = new Map(); // isco → Map(soc → occupation count)
  for (const [uri, socs] of pairs) {
    const isco = enByUri.get(uri).iscoGroup;
    if (!groupCounts.has(isco)) groupCounts.set(isco, new Map());
    const counts = groupCounts.get(isco);
    for (const soc of socs.keys()) counts.set(soc, (counts.get(soc) || 0) + 1);
  }
  const inheritedSoc = (isco) => {
    const counts = groupCounts.get(isco);
    if (!counts) return null;
    return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
  };

  // Skills: only the ones a kept occupation references end up in the table.
  const skillInfo = new Map(
    records(skillRows, ["conceptUri", "preferredLabel", "reuseLevel"], "skills_en.csv").map((s) => [
      s.conceptUri,
      { label: s.preferredLabel, reuse: REUSE[s.reuseLevel] || "t" },
    ])
  );
  const relations = new Map(); // occupationUri → {essential: [], optional: []}
  for (const r of records(relationRows, ["occupationUri", "relationType", "skillUri"], "occupationSkillRelations_en.csv")) {
    if (!skillInfo.has(r.skillUri) || (r.relationType !== "essential" && r.relationType !== "optional")) continue;
    if (!relations.has(r.occupationUri)) relations.set(r.occupationUri, { essential: [], optional: [] });
    relations.get(r.occupationUri)[r.relationType].push(r.skillUri);
  }
  const skills = [];
  const skillIndex = new Map();
  const indexOf = (uri) => {
    if (!skillIndex.has(uri)) {
      const { label, reuse } = skillInfo.get(uri);
      skillIndex.set(uri, skills.length);
      skills.push([uuidTail(uri), label, reuse]);
    }
    return skillIndex.get(uri);
  };
  const orderedSkills = (uris, cap) =>
    [...new Set(uris)]
      .sort((a, b) => {
        const x = skillInfo.get(a);
        const y = skillInfo.get(b);
        return REUSE_RANK[x.reuse] - REUSE_RANK[y.reuse] || x.label.localeCompare(y.label, "en");
      })
      .slice(0, cap)
      .map(indexOf);

  const titleMaps = Object.fromEntries(
    languages.map((lang) => [lang, new Map(byLang[lang].map((o) => [o.conceptUri, o.preferredLabel]))])
  );

  const occupations = [];
  const coveredSocs = new Set();
  for (const occ of enOccupations) {
    let soc;
    let inherited = false;
    if (pairs.has(occ.conceptUri)) {
      soc = [...pairs.get(occ.conceptUri)].sort(
        (a, b) => MATCH_RANK[a[1]] - MATCH_RANK[b[1]] || (a[0] < b[0] ? -1 : 1)
      );
    } else {
      const parent = inheritedSoc(occ.iscoGroup);
      if (!parent) {
        report.droppedOccupations += 1;
        continue;
      }
      soc = [[parent, "broad"]];
      inherited = true;
      report.inheritedOccupations += 1;
    }
    soc.forEach(([s]) => coveredSocs.add(s));
    const titles = {};
    for (const lang of languages) {
      const title = titleMaps[lang].get(occ.conceptUri);
      if (title) titles[lang] = title;
    }
    const rel = relations.get(occ.conceptUri) || { essential: [], optional: [] };
    occupations.push({
      id: uuidTail(occ.conceptUri),
      code: occ.code,
      isco: occ.iscoGroup,
      titles,
      description: trimDescription(occ.description),
      essential: orderedSkills(rel.essential, MAX_ESSENTIAL),
      optional: orderedSkills(rel.optional, MAX_OPTIONAL),
      soc,
      inherited,
    });
  }
  report.socsWithoutEsco = socs.filter((s) => !coveredSocs.has(s)).length;

  const snapshot = {
    version: `ESCO ${packageVersion || "unknown"} + ${CROSSWALK_VERSION}`,
    generated: new Date().toISOString().slice(0, 10),
    attribution: ATTRIBUTION,
    languages,
    skills,
    occupations,
  };
  return { snapshot, report };
}

function main(escoDir, crosswalkPath) {
  if (!escoDir || !crosswalkPath) {
    console.error("Usage: node scripts/build-esco-snapshot.js <esco dir> <esco-onet crosswalk csv>");
    process.exit(1);
  }
  const read = (file) => parseCsv(fs.readFileSync(file, "utf8"));
  const occupationsByLang = {};
  for (const lang of LANGUAGES) {
    const file = path.join(escoDir, lang, `occupations_${lang}.csv`);
    if (fs.existsSync(file)) occupationsByLang[lang] = read(file);
  }
  if (!occupationsByLang.en) throw new Error(`Missing ${path.join(escoDir, "en", "occupations_en.csv")}`);
  const onet = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "onet-snapshot.json"), "utf8"));
  const packageVersion = (path.resolve(escoDir).match(/v\d+(?:\.\d+)+/) || [""])[0];

  const { snapshot, report } = transformEsco({
    crosswalkRows: read(crosswalkPath),
    occupationsByLang,
    skillRows: read(path.join(escoDir, "en", "skills_en.csv")),
    relationRows: read(path.join(escoDir, "en", "occupationSkillRelations_en.csv")),
    socs: onet.occupations.map((o) => o.soc),
    packageVersion,
  });

  const outPath = path.join(__dirname, "..", "data", "esco-snapshot.json");
  fs.writeFileSync(outPath, JSON.stringify(snapshot));
  const kb = Math.round(fs.statSync(outPath).size / 1024);
  console.log(
    `Wrote ${snapshot.occupations.length} ESCO occupations, ${snapshot.skills.length} skills ` +
      `(${snapshot.languages.join(", ")}) to ${outPath} (${kb} KB)`
  );
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main(process.argv[2], process.argv[3]);
}

module.exports = { transformEsco, ATTRIBUTION, LANGUAGES };
