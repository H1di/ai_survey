// Adaptive pairwise-comparison tournament over a small set of items (the six
// work values), producing a strict full ranking. Ford-Johnson merge-insertion
// sorts n=6 in <=10 comparisons — the information-theoretic minimum, matching
// the "10 questions" budget.
//
// The engine is a PURE function of (items, decided answers): each call replays
// the sort, feeding it the answers recorded so far; the first comparison the
// sort still needs becomes the pending question. This makes it trivially
// resumable and serializable over HTTP, and immune to stale/double answers.

// Unordered-pair key: the comparisonId a client must echo back.
const pairKey = (a, b) => [a, b].slice().sort().join("|");

class NeedComparison {
  constructor(a, b) {
    this.a = a;
    this.b = b;
  }
}

// Build `less(x, y)` from the decided answers. Returns true when x ranks BELOW
// y (y won). Throws NeedComparison for the first undecided pair encountered.
function makeComparator(decided) {
  const winners = new Map();
  for (const d of decided) winners.set(pairKey(d.a, d.b), d.winner);
  return (x, y) => {
    const w = winners.get(pairKey(x, y));
    if (w === undefined) throw new NeedComparison(x, y);
    return w === y; // x < y iff y won
  };
}

// Pend insertion order (0-based): largest-partner-first. `pend` is in ascending
// partner-big order, so inserting from the back means each loser is placed while
// its partner big still sits at its original (leftmost-possible) index — keeping
// every bounded binary insertion within a 2^k-slot range. For the fixed n=6 (and
// its n=3/n=1 sub-sorts) this reaches the Ford-Johnson optimum of 10 comparisons,
// proven exhaustively over all 720 permutations in the test suite.
function insertionOrder(m) {
  const order = [];
  for (let i = m - 1; i >= 0; i -= 1) order.push(i);
  return order;
}

// Ford-Johnson, ascending under `less` (worst first). May throw NeedComparison.
function fjAscending(items, less) {
  const n = items.length;
  if (n <= 1) return items.slice();

  const pairs = [];
  for (let i = 0; i + 1 < n; i += 2) {
    const x = items[i];
    const y = items[i + 1];
    pairs.push(less(x, y) ? { big: y, small: x } : { big: x, small: y });
  }
  const straggler = n % 2 === 1 ? items[n - 1] : undefined;

  const sortedBigs = fjAscending(pairs.map((p) => p.big), less);
  const pairByBig = new Map(pairs.map((p) => [p.big, p]));
  const chain = sortedBigs.map((b) => pairByBig.get(b)); // ascending by big

  const main = [chain[0].small, ...chain.map((c) => c.big)];
  const pend = chain.slice(1).map((c) => ({ value: c.small, big: c.big }));
  if (straggler !== undefined) pend.push({ value: straggler, big: undefined });

  for (const idx of insertionOrder(pend.length)) {
    const item = pend[idx];
    let hi = item.big === undefined ? main.length : main.indexOf(item.big);
    let lo = 0;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (less(item.value, main[mid])) hi = mid;
      else lo = mid + 1;
    }
    main.splice(lo, 0, item.value);
  }
  return main;
}

// --- Public engine ---------------------------------------------------------

function startTournament(items) {
  return { items: items.slice(), decided: [] };
}

// The next comparison the sort needs, or null once fully ordered.
function nextComparison(state) {
  const less = makeComparator(state.decided);
  try {
    fjAscending(state.items, less);
    return null;
  } catch (e) {
    if (e instanceof NeedComparison) {
      return { comparisonId: pairKey(e.a, e.b), a: e.a, b: e.b };
    }
    throw e;
  }
}

// Final ranking (best first), or null if not yet fully sorted.
function finalOrder(state) {
  const less = makeComparator(state.decided);
  try {
    return fjAscending(state.items, less).reverse(); // ascending -> best first
  } catch (e) {
    if (e instanceof NeedComparison) return null;
    throw e;
  }
}

// Record an answer to the CURRENT pending comparison. Rejects (ok:false) a
// stale/duplicate comparisonId or a winner outside the pending pair.
function recordAnswer(state, { comparisonId, winner } = {}) {
  const pending = nextComparison(state);
  if (!pending) return { ok: false, reason: "tournament already complete", state };
  if (comparisonId !== pending.comparisonId) {
    return { ok: false, reason: "stale or unknown comparison", state };
  }
  if (winner !== pending.a && winner !== pending.b) {
    return { ok: false, reason: "winner is not in the pending pair", state };
  }
  return {
    ok: true,
    state: {
      items: state.items.slice(),
      decided: [...state.decided, { a: pending.a, b: pending.b, winner }],
    },
  };
}

module.exports = {
  startTournament,
  nextComparison,
  finalOrder,
  recordAnswer,
};
