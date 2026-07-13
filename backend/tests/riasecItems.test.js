const test = require("node:test");
const assert = require("node:assert/strict");
const { getStaticRiasecItems, RIASEC_POOL } = require("../riasecItems");

const TYPES = ["R", "I", "A", "S", "E", "C"];

test("pool has 3 items per type, unique texts, all under 90 chars", () => {
  assert.equal(RIASEC_POOL.length, 18);
  for (const type of TYPES) {
    assert.equal(RIASEC_POOL.filter((i) => i.type === type).length, 3);
  }
  const texts = new Set(RIASEC_POOL.map((i) => i.text.toLowerCase()));
  assert.equal(texts.size, 18);
  for (const item of RIASEC_POOL) assert.ok(item.text.length < 90);
});

test("static set = 12 items, 2 per type, interleaved, sequential ids", () => {
  const items = getStaticRiasecItems();
  assert.equal(items.length, 12);
  for (const type of TYPES) {
    assert.equal(items.filter((i) => i.type === type).length, 2);
  }
  assert.deepEqual(items.slice(0, 6).map((i) => i.type), TYPES);
  assert.deepEqual(items.map((i) => i.id), items.map((_, n) => `ri_${n + 1}`));
});
