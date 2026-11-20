const test = require("node:test");
const assert = require("node:assert/strict");
const { transformEsco } = require("../scripts/build-esco-snapshot");

const OCC = "http://data.europa.eu/esco/occupation/";
const SK = "http://data.europa.eu/esco/skill/";
const OCC_HEADER = ["conceptType", "conceptUri", "iscoGroup", "preferredLabel", "description", "code"];
const occRow = (id, isco, label, description = `${label} does things.`) => [
  "Occupation", OCC + id, isco, label, description, `${isco}.1`,
];

const CROSSWALK_HEADER = [
  "O*NET Id", "O*NET Title", "O*NET Description", "ESCO or ISCO URI",
  "ESCO or ISCO Title", "ESCO or ISCO Description", "Type of Match",
];
const cw = (soc, uri, match) => [soc, "t", "d", uri, "e", "d", match];

function fixture(overrides = {}) {
  return {
    socs: ["A", "B"],
    crosswalkRows: [
      ["Mapping project name", "ESCO-O*NET Crosswalk", "", "", "", "", ""],
      ["", "", "", "", "", "", ""],
      CROSSWALK_HEADER,
      cw("A", OCC + "o1", "exactMatch"),
      cw("A", OCC + "o2", "closeMatch"),
      cw("B", OCC + "o3", "broadMatch"),
      cw("B", OCC + "o1", "narrowMatch"),
      cw("A", "http://data.europa.eu/esco/isco/C1111", "exactISCO"),
      cw("A", OCC + "gone", "closeMatch"),
      cw("Z", OCC + "o2", "exactMatch"),
    ],
    occupationsByLang: {
      en: [
        OCC_HEADER,
        occRow("o1", "1111", "nurse", "x".repeat(400)),
        occRow("o2", "1111", "carer"),
        occRow("o3", "1111", "aide"),
        occRow("o4", "1111", "helper"),
        occRow("o5", "2222", "loner"),
      ],
      uk: [OCC_HEADER, occRow("o1", "1111", "медсестра")],
      ru: [OCC_HEADER, occRow("o1", "1111", "медсестра-ru")],
    },
    skillRows: [
      ["conceptUri", "preferredLabel", "reuseLevel"],
      [SK + "s1", "zeta", "occupation-specific"],
      [SK + "s2", "alpha", "transversal"],
      [SK + "s3", "beta", "sector-specific"],
      [SK + "s4", "gamma", "cross-sector"],
      [SK + "s5", "delta", ""],
    ],
    relationRows: [
      ["occupationUri", "relationType", "skillUri"],
      [OCC + "o1", "essential", SK + "s2"],
      [OCC + "o1", "essential", SK + "s1"],
      [OCC + "o1", "essential", SK + "s4"],
      [OCC + "o1", "essential", SK + "s3"],
      [OCC + "o1", "optional", SK + "s5"],
    ],
    ...overrides,
  };
}

const byId = (snapshot) => Object.fromEntries(snapshot.occupations.map((o) => [o.id, o]));

test("match types map, /isco/ rows ignored, SOCs outside the O*NET set dropped", () => {
  const { snapshot, report } = transformEsco(fixture());
  const occ = byId(snapshot);
  assert.deepEqual(occ.o1.soc, [["A", "exact"], ["B", "narrow"]]);
  assert.deepEqual(occ.o2.soc, [["A", "close"]]);
  assert.deepEqual(occ.o3.soc, [["B", "broad"]]);
  assert.equal(occ.o1.inherited, false);
  assert.equal(report.iscoRowsIgnored, 1);
  assert.equal(report.crosswalkRows, 6);
});

test("a crosswalk URI absent from the package is counted, not fatal", () => {
  const { report } = transformEsco(fixture());
  assert.equal(report.urisMissingFromPackage, 1);
});

test("unpaired occupation inherits the most frequent SOC of its ISCO group", () => {
  const { snapshot, report } = transformEsco(fixture());
  const o4 = byId(snapshot).o4;
  // siblings: o1 → A,B; o2 → A; o3 → B — A and B tie at 2? o1 counts once per SOC.
  // A: o1, o2 = 2; B: o1, o3 = 2 → tie → lowest SOC string "A".
  assert.deepEqual(o4.soc, [["A", "broad"]]);
  assert.equal(o4.inherited, true);
  assert.equal(report.inheritedOccupations, 1);
});

test("inheritance takes the majority SOC when there is one", () => {
  const base = fixture();
  const { snapshot } = transformEsco({
    ...base,
    crosswalkRows: base.crosswalkRows.filter((r) => !(r[0] === "B" && r[3] === OCC + "o1")),
  });
  // A: o1, o2 = 2; B: o3 = 1
  assert.deepEqual(byId(snapshot).o4.soc, [["A", "broad"]]);
  const flipped = transformEsco({
    ...base,
    crosswalkRows: [
      ...base.crosswalkRows.slice(0, 3),
      cw("B", OCC + "o1", "exactMatch"),
      cw("B", OCC + "o2", "exactMatch"),
      cw("A", OCC + "o3", "exactMatch"),
    ],
  });
  assert.deepEqual(byId(flipped.snapshot).o4.soc, [["B", "broad"]]);
});

test("unpaired occupation with no crosswalked sibling is dropped", () => {
  const { snapshot, report } = transformEsco(fixture());
  assert.equal(byId(snapshot).o5, undefined);
  assert.equal(report.droppedOccupations, 1);
});

test("essential skills ordered occupation-specific → transversal; description capped at 300", () => {
  const { snapshot } = transformEsco(fixture());
  const o1 = byId(snapshot).o1;
  const labels = o1.essential.map((i) => snapshot.skills[i][1]);
  assert.deepEqual(labels, ["zeta", "beta", "gamma", "alpha"]);
  assert.deepEqual(o1.essential.map((i) => snapshot.skills[i][2]), ["o", "s", "c", "t"]);
  assert.deepEqual(o1.optional.map((i) => snapshot.skills[i]), [["s5", "delta", "t"]]);
  assert.ok(o1.description.length <= 300);
  assert.equal(snapshot.skills[o1.essential[0]][0], "s1");
});

test("titles carry ESCO languages present in the input, never ru", () => {
  const { snapshot } = transformEsco(fixture());
  const o1 = byId(snapshot).o1;
  assert.equal(o1.titles.en, "nurse");
  assert.equal(o1.titles.uk, "медсестра");
  assert.equal("ru" in o1.titles, false);
  assert.equal(byId(snapshot).o2.titles.uk, undefined);
  assert.deepEqual(snapshot.languages, ["en", "uk"]);
});

test("a missing input column names itself and its file", () => {
  const base = fixture();
  const en = base.occupationsByLang.en.map((r) => r.filter((_, i) => i !== 2));
  assert.throws(
    () => transformEsco({ ...base, occupationsByLang: { en } }),
    { message: "Missing column iscoGroup in occupations_en.csv" }
  );
});
