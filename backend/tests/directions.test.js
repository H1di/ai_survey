const test = require("node:test");
const assert = require("node:assert/strict");
const { DIRECTIONS, DIRECTION_IDS, getDirection } = require("../directions");

test("catalog has 15 directions, each with id/label/examples and 3 profession seeds", () => {
  assert.equal(DIRECTIONS.length, 15);
  for (const dir of DIRECTIONS) {
    assert.ok(dir.id && typeof dir.id === "string");
    assert.ok(dir.label && typeof dir.label === "string");
    assert.ok(dir.examples && typeof dir.examples === "string");
    assert.equal(dir.professionSeeds.length, 3);
    for (const seed of dir.professionSeeds) {
      assert.ok(seed.title);
      assert.ok(seed.summary);
    }
  }
  assert.deepEqual(DIRECTION_IDS, DIRECTIONS.map((d) => d.id));
});

test("catalog order is alphabetical by label so no deterministic walk favors tech", () => {
  const labels = DIRECTIONS.map((d) => d.label);
  assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b)));
  assert.notEqual(DIRECTIONS[0].id, "tech");
});

test("getDirection finds by id and returns null for unknown", () => {
  assert.equal(getDirection("tech").label, "Programming & Technology");
  assert.equal(getDirection("nope"), null);
});

test("direction-tally era is gone", () => {
  const directions = require("../directions");
  assert.equal(directions.computeDirection, undefined);
  assert.equal(directions.REFINE_REASONS, undefined);
  assert.equal(directions.REFINE_REASON_VALUES, undefined);
});
