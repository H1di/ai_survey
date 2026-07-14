const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getOccupation,
  getRelated,
  rankOccupations,
  pearson,
  ONET_ATTRIBUTION,
  JOB_ZONE_LABELS,
  SNAPSHOT_VERSION,
} = require("../onet");
const { DIRECTION_IDS } = require("../directions");

test("getOccupation returns a snapshot entry by SOC code", () => {
  const dev = getOccupation("15-1252.00");
  assert.equal(dev.title, "Software Developers");
  assert.equal(dev.directionId, "tech");
  assert.deepEqual(Object.keys(dev.riasec).sort(), ["A", "C", "E", "I", "R", "S"]);
  assert.equal(getOccupation("00-0000.00"), null);
  assert.equal(getOccupation(undefined), null);
});

test("getRelated resolves related SOCs to {soc, title} pairs", () => {
  const related = getRelated("15-1252.00");
  assert.ok(related.length >= 1 && related.length <= 5);
  for (const r of related) {
    assert.match(r.soc, /^\d{2}-\d{4}\.\d{2}$/);
    assert.equal(typeof r.title, "string");
    assert.ok(r.title.length > 0);
  }
  assert.deepEqual(getRelated("00-0000.00"), []);
});

test("pearson measures shape: perfect, inverse, and flat profiles", () => {
  assert.equal(pearson([1, 2, 3], [2, 4, 6]), 1);
  assert.equal(pearson([1, 2, 3], [6, 4, 2]), -1);
  // Zero variance on either side carries no shape signal.
  assert.equal(pearson([5, 5, 5], [1, 2, 3]), 0);
  assert.equal(pearson([1, 2, 3], [7, 7, 7]), 0);
});

test("rankOccupations sorts by descending correlation and respects limit", () => {
  const investigative = { R: 40, I: 95, A: 30, S: 15, E: 20, C: 55 };
  const ranked = rankOccupations(investigative, { limit: 10 });
  assert.equal(ranked.length, 10);
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(ranked[i - 1].score >= ranked[i].score);
  }
  for (const r of ranked) {
    assert.ok(r.score >= -1 && r.score <= 1);
    assert.ok(DIRECTION_IDS.includes(r.directionId));
    assert.equal(typeof r.title, "string");
    assert.equal(typeof r.blurb, "string");
  }
  // An investigative-dominant profile should surface investigative work:
  // every top-10 occupation has I among its two strongest letters.
  for (const r of ranked) {
    const occ = getOccupation(r.soc);
    const top2 = Object.entries(occ.riasec)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([k]) => k);
    assert.ok(top2.includes("I"), `${r.title} top letters ${top2}`);
  }
});

test("rankOccupations filters by direction families and excludes SOCs", () => {
  const social = { R: 20, I: 40, A: 45, S: 90, E: 50, C: 30 };
  const healthcareOnly = rankOccupations(social, {
    directionIds: ["healthcare"],
    limit: 15,
  });
  assert.ok(healthcareOnly.length > 0);
  for (const r of healthcareOnly) assert.equal(r.directionId, "healthcare");

  const [first] = rankOccupations(social, { limit: 1 });
  const without = rankOccupations(social, { excludeSocs: [first.soc], limit: 50 });
  assert.ok(!without.some((r) => r.soc === first.soc));
});

test("rankOccupations is deterministic for the same input", () => {
  const scores = { R: 60, I: 60, A: 40, S: 40, E: 55, C: 45 };
  const a = rankOccupations(scores, { limit: 20 }).map((r) => r.soc);
  const b = rankOccupations(scores, { limit: 20 }).map((r) => r.soc);
  assert.deepEqual(a, b);
});

test("attribution, version, and job zone labels are exported", () => {
  assert.match(ONET_ATTRIBUTION, /O\*NET/);
  assert.match(ONET_ATTRIBUTION, /CC BY 4\.0/);
  // O*NET Web Services developer terms: name Web Services + USDOL/ETA and
  // acknowledge the trademark wherever the data shows.
  assert.match(ONET_ATTRIBUTION, /O\*NET Web Services/);
  assert.match(ONET_ATTRIBUTION, /trademark of USDOL\/ETA/);
  assert.equal(SNAPSHOT_VERSION, "30.3");
  for (const zone of [1, 2, 3, 4, 5]) {
    assert.equal(typeof JOB_ZONE_LABELS[zone], "string");
  }
});
