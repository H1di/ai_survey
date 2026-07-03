const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DIRECTIONS,
  DIRECTION_IDS,
  getDirection,
  computeDirection,
} = require("../directions");

test("catalog has 8 directions, each with id/label/examples and 3 profession seeds", () => {
  assert.equal(DIRECTIONS.length, 8);
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

test("getDirection finds by id and returns null for unknown", () => {
  assert.equal(getDirection("tech").label, "Programming & Technology");
  assert.equal(getDirection("nope"), null);
});

const QUESTIONS = [
  { id: "dir_q1", text: "q1", options: [
    { value: "a", label: "A", directionId: "tech" },
    { value: "b", label: "B", directionId: "design" },
  ]},
  { id: "dir_q2", text: "q2", options: [
    { value: "a", label: "A", directionId: "tech" },
    { value: "b", label: "B", directionId: "healthcare" },
  ]},
  { id: "dir_q3", text: "q3", options: [
    { value: "a", label: "A", directionId: "design" },
    { value: "b", label: "B", directionId: "business" },
  ]},
];

test("computeDirection: majority of option votes wins", () => {
  const result = computeDirection(QUESTIONS, { dir_q1: "a", dir_q2: "a", dir_q3: "b" });
  assert.deepEqual(result, { id: "tech", label: "Programming & Technology" });
});

test("computeDirection: tie broken by DIRECTIONS catalog order", () => {
  // tech gets 1 vote (q1), design gets 1 vote (q3): tech is earlier in the catalog
  const result = computeDirection(QUESTIONS, { dir_q1: "a", dir_q3: "a" });
  assert.equal(result.id, "tech");
});

test("computeDirection: no valid answers falls back to first catalog direction", () => {
  const result = computeDirection(QUESTIONS, {});
  assert.equal(result.id, DIRECTIONS[0].id);
});
