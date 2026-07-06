const test = require("node:test");
const assert = require("node:assert/strict");
const { MINI_IPIP_20, IPIP_50, getFallbackItems } = require("../bigFiveItems");
const { computeBigFiveScores } = require("../questionEngine");

const TRAITS = ["O", "C", "E", "A", "N"];

function byTrait(items) {
  const groups = Object.fromEntries(TRAITS.map((t) => [t, []]));
  for (const item of items) groups[item.trait].push(item);
  return groups;
}

test("Mini-IPIP-20 matches the published instrument: 20 items, 4 per trait", () => {
  assert.equal(MINI_IPIP_20.length, 20);
  const groups = byTrait(MINI_IPIP_20);
  for (const trait of TRAITS) {
    assert.equal(groups[trait].length, 4, `trait ${trait} must have 4 items`);
  }
});

test("Mini-IPIP-20 reverse keys match the published scoring key", () => {
  const groups = byTrait(MINI_IPIP_20);
  const reversedIds = (trait) =>
    groups[trait].filter((i) => i.reverse).map((i) => i.id).sort();

  assert.deepEqual(reversedIds("E"), ["mip_16", "mip_6"].sort());
  assert.deepEqual(reversedIds("A"), ["mip_17", "mip_7"].sort());
  assert.deepEqual(reversedIds("C"), ["mip_13", "mip_18"].sort());
  assert.deepEqual(reversedIds("N"), ["mip_19", "mip_9"].sort());
  // Openness carries three reversed items in the real Mini-IPIP.
  assert.deepEqual(reversedIds("O"), ["mip_10", "mip_15", "mip_20"].sort());
});

test("no item text is keyed to two different traits across both sets", () => {
  const traitByText = new Map();
  for (const item of [...MINI_IPIP_20, ...IPIP_50]) {
    const text = item.text.toLowerCase();
    if (traitByText.has(text)) {
      assert.equal(
        traitByText.get(text),
        item.trait,
        `"${item.text}" is keyed to both ${traitByText.get(text)} and ${item.trait}`
      );
    }
    traitByText.set(text, item.trait);
  }
});

test("IPIP-50 has 10 items per trait", () => {
  assert.equal(IPIP_50.length, 50);
  const groups = byTrait(IPIP_50);
  for (const trait of TRAITS) {
    assert.equal(groups[trait].length, 10, `trait ${trait} must have 10 items`);
  }
});

test("getFallbackItems maps depth to the right set", () => {
  assert.equal(getFallbackItems("short"), MINI_IPIP_20);
  assert.equal(getFallbackItems("deep"), IPIP_50);
});

test("an all-neutral answer sheet scores 50 on every trait, both depths", () => {
  for (const items of [MINI_IPIP_20, IPIP_50]) {
    const session = {
      bigFiveItems: items,
      bigFiveAnswers: Object.fromEntries(items.map((i) => [i.id, 3])),
    };
    const scores = computeBigFiveScores(session);
    for (const trait of TRAITS) {
      assert.equal(scores[trait], 50, `trait ${trait} should be 50 for all-3s`);
    }
  }
});
