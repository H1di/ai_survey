const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DIRECTIONS,
  DIRECTION_IDS,
  getDirection,
  computeDirection,
  REFINE_REASON_VALUES,
} = require("../directions");

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

test("catalog order is alphabetical by label so ties never structurally favor tech", () => {
  const labels = DIRECTIONS.map((d) => d.label);
  assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b)));
  assert.notEqual(DIRECTIONS[0].id, "tech");
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

test("computeDirection: shared top count returns tie candidates in catalog order", () => {
  // tech gets 1 vote (q1), design gets 1 vote (q3): no silent alphabet
  // tie-break — both candidates come back for the user to resolve.
  const result = computeDirection(QUESTIONS, { dir_q1: "a", dir_q3: "a" });
  assert.equal(result.tie, true);
  assert.deepEqual(
    result.candidates.map((c) => c.id),
    ["design", "tech"]
  );
  for (const c of result.candidates) assert.ok(c.label);
});

test("computeDirection: 1-1-1 vote (the common case) is a three-way tie", () => {
  const result = computeDirection(QUESTIONS, { dir_q1: "a", dir_q2: "b", dir_q3: "b" });
  assert.equal(result.tie, true);
  assert.deepEqual(
    result.candidates.map((c) => c.id),
    ["business", "healthcare", "tech"]
  );
});

test("computeDirection: excludeIds can turn a tie into a unique winner", () => {
  const result = computeDirection(QUESTIONS, { dir_q1: "a", dir_q3: "a" }, ["design"]);
  assert.deepEqual(result, { id: "tech", label: "Programming & Technology" });
});

test("computeDirection: no valid answers falls back to first catalog direction", () => {
  const result = computeDirection(QUESTIONS, {});
  assert.equal(result.id, DIRECTIONS[0].id);
});

test("computeDirection excludeIds: excluded direction gets no votes and cannot win", () => {
  const result = computeDirection(QUESTIONS, { dir_q1: "a", dir_q2: "a", dir_q3: "b" }, ["tech"]);
  // tech's two votes are discarded; business holds the only remaining vote
  assert.deepEqual(result, { id: "business", label: "Business & Sales" });
});

test("computeDirection excludeIds: no votes left falls back to first non-excluded catalog direction", () => {
  const result = computeDirection(QUESTIONS, {}, ["agriculture"]);
  assert.equal(result.id, "arts");
});

test("REFINE_REASON_VALUES is the fixed four-value list", () => {
  assert.deepEqual(REFINE_REASON_VALUES, ["environment", "interests", "too_technical", "prospects"]);
});
