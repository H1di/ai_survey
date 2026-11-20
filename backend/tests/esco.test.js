const test = require("node:test");
const assert = require("node:assert/strict");
const {
  escoForSoc,
  pickEsco,
  escoTitle,
  educationLevel,
  escoBlock,
  hasEsco,
  ESCO_ATTRIBUTION,
  ESCO_OCCUPATION_COUNT,
} = require("../engine/esco");

const SOC = "15-1252.00";
const stems = (t) =>
  new Set(
    t.toLowerCase().split(/[^a-z]+/)
      .filter((w) => w.length > 2 && !["and", "the", "for", "all", "other", "except", "with"].includes(w))
      .map((w) => w.slice(0, 5))
  );
const sharesWord = (a, b) => [...stems(a)].some((w) => stems(b).has(w));
const MATCH_RANK = { exact: 0, close: 1, narrow: 2, broad: 3 };
const rankOf = (occ, soc) => {
  const match = occ.soc.find(([s]) => s === soc)[1];
  return MATCH_RANK[match] * 2 + (occ.inherited ? 1 : 0);
};

test("escoForSoc lists the SOC's occupations best match first", () => {
  const list = escoForSoc(SOC);
  assert.ok(list.length > 0);
  assert.ok(hasEsco(SOC));
  assert.ok(ESCO_OCCUPATION_COUNT > 2000);
  // Title-overlapping candidates first; inside each group, match type decides.
  const onetTitle = require("../data/onet-snapshot.json").occupations.find((o) => o.soc === SOC).title;
  const shares = (o) => sharesWord(o.titles.en, onetTitle);
  const firstMiss = list.findIndex((o) => !shares(o));
  if (firstMiss !== -1) assert.ok(list.slice(firstMiss).every((o) => !shares(o)));
  for (const group of [list.filter(shares), list.filter((o) => !shares(o))]) {
    for (let i = 1; i < group.length; i += 1) {
      assert.ok(rankOf(group[i - 1], SOC) <= rankOf(group[i], SOC));
    }
  }
});

// Review I1: alphabetical order inside a match type put "database developer"
// on Software Developers and "timber trader" on farm-product buyers.
test("the best match is the one whose title names the O*NET occupation", () => {
  assert.equal(escoForSoc("15-1252.00")[0].titles.en, "software developer");
  assert.equal(escoForSoc("13-1021.00")[0].titles.en, "purchaser");
});

test("escoForSoc of an unknown SOC is empty", () => {
  assert.deepEqual(escoForSoc("00-0000.00"), []);
  assert.equal(hasEsco("00-0000.00"), false);
  assert.equal(pickEsco("00-0000.00"), null);
});

test("pickEsco never returns another SOC's occupation", () => {
  const own = escoForSoc(SOC);
  const foreign = escoForSoc("29-1141.00").find((o) => !own.includes(o));
  assert.ok(foreign);
  assert.equal(pickEsco(SOC, foreign.id), own[0]);
  assert.equal(pickEsco(SOC, "garbage"), own[0]);
  assert.equal(pickEsco(SOC), own[0]);
  const last = own[own.length - 1];
  assert.equal(pickEsco(SOC, last.id), last);
});

// Review I2: ESCO labels are lowercase and some are "a/b" gendered pairs.
test("escoTitle returns a headline form: capitalised, spaced slash, acronyms kept", () => {
  assert.equal(escoTitle({ titles: { en: "choirmaster/choirmistress" } }), "Choirmaster / choirmistress");
  assert.equal(escoTitle({ titles: { en: "ICT system analyst" } }), "ICT system analyst");
  assert.equal(escoTitle({ titles: { en: "nurse responsible for general care" } }), "Nurse responsible for general care");
});

test("escoTitle falls back to English for a language ESCO lacks", () => {
  assert.equal(escoTitle({ titles: { en: "Nurse" } }, "ru"), "Nurse");
  assert.equal(escoTitle({ titles: { en: "Nurse", uk: "Медсестра" } }, "uk"), "Медсестра");
  assert.equal(escoTitle({ titles: { en: "Nurse" } }), "Nurse");
});

test("educationLevel: ISCO range, refined by job zone only when they overlap", () => {
  assert.deepEqual(educationLevel("2512", 4), { eqfMin: 6, eqfMax: 6, source: "isco+jobzone" });
  assert.deepEqual(educationLevel("2512", 2), { eqfMin: 6, eqfMax: 8, source: "isco" });
  assert.deepEqual(educationLevel("9112"), { eqfMin: 1, eqfMax: 1, source: "isco" });
  assert.deepEqual(educationLevel("1120"), { eqfMin: 5, eqfMax: 8, source: "isco" });
  assert.deepEqual(educationLevel("0110"), { eqfMin: 1, eqfMax: 8, source: "isco" });
});

test("escoBlock carries skill labels, a resolvable URI and the attribution", () => {
  const occ = pickEsco(SOC);
  const block = escoBlock(occ, { jobZone: 4, soc: SOC });
  assert.equal(block.uri, `http://data.europa.eu/esco/occupation/${occ.id}`);
  assert.ok(block.essentialSkills.length > 0);
  assert.ok(block.essentialSkills.every((s) => typeof s === "string" && s.length > 0));
  assert.ok(block.optionalSkills.every((s) => typeof s === "string"));
  assert.equal(block.title, escoTitle(occ));
  assert.equal(block.match, occ.soc.find(([s]) => s === SOC)[1]);
  assert.equal(block.inherited, occ.inherited);
  assert.equal(typeof block.education.eqfMin, "number");
  assert.equal(block.attribution, ESCO_ATTRIBUTION);
});
