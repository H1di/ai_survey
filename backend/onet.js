// O*NET occupation grounding. Pure lookups + ranking over the checked-in
// snapshot (backend/data/onet-snapshot.json, built by
// scripts/build-onet-snapshot.js). No network, no key — this is the
// deterministic base every AI path and keyless fallback stands on; the live
// enrichment lives in services/onetApi.js.
const { RIASEC_KEYS } = require("./riasec");

let snapshot = { version: "0", attribution: "", occupations: [] };
try {
  snapshot = require("./data/onet-snapshot.json");
} catch (error) {
  console.error("[onet] snapshot missing — occupation grounding disabled:", error.message);
}

const bySoc = new Map(snapshot.occupations.map((o) => [o.soc, o]));

const SNAPSHOT_VERSION = snapshot.version;
const ONET_ATTRIBUTION =
  snapshot.attribution ||
  "This product includes information from the O*NET Database and O*NET Web Services by " +
    "the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA). " +
    "O*NET® is a trademark of USDOL/ETA. Used under the CC BY 4.0 license.";

// O*NET Job Zone preparation levels (Job Zone Reference).
const JOB_ZONE_LABELS = {
  1: "Little or no preparation needed",
  2: "Some preparation needed",
  3: "Medium preparation needed",
  4: "Considerable preparation needed",
  5: "Extensive preparation needed",
};

function getOccupation(soc) {
  return bySoc.get(soc) || null;
}

function getRelated(soc) {
  const occupation = bySoc.get(soc);
  if (!occupation) return [];
  return occupation.related
    .map((relSoc) => {
      const rel = bySoc.get(relSoc);
      return rel ? { soc: rel.soc, title: rel.title } : null;
    })
    .filter(Boolean);
}

// Pearson correlation — profile SHAPE match, deliberately insensitive to
// elevation so an occupation with uniformly high interest ratings cannot
// outrank one whose highs and lows mirror the user's. Zero variance on either
// side carries no shape signal -> 0.
function pearson(a, b) {
  const n = a.length;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA === 0 || varB === 0) return 0;
  return cov / Math.sqrt(varA * varB);
}

// Rank snapshot occupations against a 0-100 RIASEC vector, high to low.
// directionIds narrows to catalog families; excludeSocs drops already-shown
// occupations. Ties break on SOC code so the order is fully deterministic.
function rankOccupations(riasecScores, { directionIds, excludeSocs = [], limit = 15 } = {}) {
  const userVector = RIASEC_KEYS.map((k) => riasecScores?.[k] ?? 50);
  const families = directionIds ? new Set(directionIds) : null;
  const excluded = new Set(excludeSocs);

  return snapshot.occupations
    .filter(
      (o) => !excluded.has(o.soc) && (!families || families.has(o.directionId))
    )
    .map((o) => ({
      soc: o.soc,
      title: o.title,
      blurb: o.blurb,
      directionId: o.directionId,
      jobZone: o.jobZone,
      score: pearson(userVector, RIASEC_KEYS.map((k) => o.riasec[k] ?? 0)),
    }))
    .sort((a, b) => b.score - a.score || (a.soc < b.soc ? -1 : 1))
    .slice(0, limit);
}

module.exports = {
  getOccupation,
  getRelated,
  rankOccupations,
  pearson,
  ONET_ATTRIBUTION,
  JOB_ZONE_LABELS,
  SNAPSHOT_VERSION,
};
