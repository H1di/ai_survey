const { test } = require("node:test");
const assert = require("node:assert");

const {
  startTournament,
  nextComparison,
  finalOrder,
  recordAnswer,
} = require("../valuesTournament");

const ITEMS = ["a", "b", "c", "d", "e", "f"];

// Permutations of ITEMS: each defines a ground-truth ranking (index 0 = best).
function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  for (let i = 0; i < arr.length; i += 1) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

// Drive a full tournament against a ground-truth ranking; return {order, count}.
function runToCompletion(truth) {
  const rankOf = new Map(truth.map((k, i) => [k, i])); // lower = better
  let state = startTournament(ITEMS);
  let count = 0;
  for (;;) {
    const cmp = nextComparison(state);
    if (!cmp) break;
    count += 1;
    assert.ok(count <= 100, "tournament must terminate");
    // winner = whichever of the pair ranks higher (lower index) in the truth
    const winner = rankOf.get(cmp.a) < rankOf.get(cmp.b) ? cmp.a : cmp.b;
    const res = recordAnswer(state, { comparisonId: cmp.comparisonId, winner });
    assert.ok(res.ok, `answer must be accepted: ${res.reason}`);
    state = res.state;
  }
  return { order: finalOrder(state), count };
}

test("recovers the exact ranking for all 720 permutations in <=10 comparisons", () => {
  let max = 0;
  for (const truth of permutations(ITEMS)) {
    const { order, count } = runToCompletion(truth);
    assert.deepEqual(order, truth, `wrong order for ${truth.join("")}`);
    max = Math.max(max, count);
  }
  assert.ok(max <= 10, `worst-case comparisons ${max} must be <= 10`);
});

test("nextComparison returns null and finalOrder is set once sorted", () => {
  const { order } = runToCompletion(["c", "a", "f", "b", "e", "d"]);
  assert.equal(order.length, 6);
});

test("recordAnswer rejects a stale/duplicate comparisonId", () => {
  const state = startTournament(ITEMS);
  const cmp = nextComparison(state);
  const first = recordAnswer(state, { comparisonId: cmp.comparisonId, winner: cmp.a });
  assert.ok(first.ok);
  // replaying the same comparisonId against the ALREADY-advanced state is stale
  const stale = recordAnswer(first.state, { comparisonId: cmp.comparisonId, winner: cmp.a });
  assert.equal(stale.ok, false);
  assert.match(stale.reason, /stale|comparison/i);
});

test("recordAnswer rejects a winner not in the pending pair", () => {
  const state = startTournament(ITEMS);
  const cmp = nextComparison(state);
  const bad = recordAnswer(state, { comparisonId: cmp.comparisonId, winner: "zzz" });
  assert.equal(bad.ok, false);
});

test("state is serializable (survives JSON round-trip mid-tournament)", () => {
  let state = startTournament(ITEMS);
  const cmp = nextComparison(state);
  state = recordAnswer(state, { comparisonId: cmp.comparisonId, winner: cmp.a }).state;
  const revived = JSON.parse(JSON.stringify(state));
  // engine keeps working on the revived plain object
  const cmp2 = nextComparison(revived);
  assert.ok(cmp2 && cmp2.comparisonId);
});
