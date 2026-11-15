// Builds frontend/src/motion/data/onet-field.json — the slice of the backend's
// O*NET snapshot the shipped scenes draw: every occupation's measured RIASEC
// profile, title and field family, plus the per-family Holland weights the
// backend ranks families with. It is reference data, identical for every
// user; everything personal still comes from the session snapshot.
//
//   node frontend/scripts/build-onet-field.cjs
//
// Regenerate whenever backend/data/onet-snapshot.json, engine/riasec.js or
// engine/directions.js changes — src/motion/onetField.test.js fails on drift.
const fs = require("node:fs");
const path = require("node:path");

const backend = path.join(__dirname, "..", "..", "backend");
const snapshot = require(path.join(backend, "data", "onet-snapshot.json"));
const { RIASEC_KEYS, DIRECTION_RIASEC } = require(path.join(backend, "engine", "riasec.js"));
const { DIRECTIONS } = require(path.join(backend, "engine", "directions.js"));
const { ONET_ATTRIBUTION } = require(path.join(backend, "engine", "onet.js"));

function buildField() {
  const directions = DIRECTIONS.map((d) => ({
    id: d.id,
    label: d.label,
    weights: DIRECTION_RIASEC[d.id] || {},
  }));
  const index = new Map(directions.map((d, i) => [d.id, i]));
  return {
    version: snapshot.version,
    attribution: ONET_ATTRIBUTION,
    riasecKeys: RIASEC_KEYS,
    directions,
    // [soc, title, R, I, A, S, E, C, directionIndex] in snapshot order.
    occupations: snapshot.occupations.map((o) => [
      o.soc,
      o.title,
      ...RIASEC_KEYS.map((k) => o.riasec[k] ?? 0),
      index.get(o.directionId) ?? -1,
    ]),
  };
}

module.exports = { buildField };

if (require.main === module) {
  const out = path.join(__dirname, "..", "src", "motion", "data", "onet-field.json");
  fs.writeFileSync(out, `${JSON.stringify(buildField())}\n`);
  console.log(`wrote ${path.relative(process.cwd(), out)} (${fs.statSync(out).size} bytes)`);
}
