// The "mind graph" behind an assessment question: a pale field of nodes that
// grows with the answers. Each answer adds a small cluster (a hub and a few
// satellites, 2–6 nodes depending on the step's length), every new node joined
// by 1–3 edges to nodes already there; a finished step holds ~40–60 nodes (a
// four-question step ~20). Pure: the layout is a function of (seed, total)
// alone, so the same step and the same answered count always paint the same
// picture — across re-renders and reloads.
//
// Coordinates are normalised to the unit disc (x, y in [-1, 1]); the renderer
// stretches them to its box. Nodes are generated in answer order, so the state
// after k answers is the prefix `nodes.slice(0, graph.cut[k])` plus every edge
// whose later endpoint (`b`) is inside it — no edge reaches an undrawn node.

// FNV-1a: a stable 32-bit seed from any string.
function hashSeed(seed) {
  let h = 0x811c9dc5;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32: small, fast, good enough for a layout.
function rng(seed) {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CANDIDATES = 24;
const OUTLIER_P = 0.14;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// How many nodes a finished step holds: a four-question step ends as a small
// knot of ~20, anything longer as a field of 42–56.
export function nodeTotal(total) {
  if (total <= 0) return 0;
  if (total <= 4) return total * 5;
  return Math.round(Math.min(56, Math.max(42, total * 2.5)));
}

// A short step's field is a little smaller than a long one's.
export function clusterRadius(total) {
  const t = Math.min(1, Math.max(0, (total - 4) / 16));
  return 0.78 + 0.22 * t;
}

function place(rand, nodes, { reach, R, spacing, outlier, near }) {
  let best = null;
  let bestScore = Infinity;
  for (let c = 0; c < CANDIDATES; c++) {
    const angle = rand() * Math.PI * 2;
    let p;
    if (near) {
      // A satellite: a step or two away from its hub.
      const d = spacing * (0.8 + rand() * 0.9);
      p = { x: near.x + Math.cos(angle) * d, y: near.y + Math.sin(angle) * d };
    } else {
      // A hub: centre-heavy inside the reach; an outlier sits at the rim.
      const rad = outlier
        ? Math.min(R, reach * (0.9 + rand() * 0.15))
        : reach * Math.pow(rand(), 1.05) * 0.84;
      p = { x: Math.cos(angle) * rad, y: Math.sin(angle) * rad };
    }
    const r = Math.hypot(p.x, p.y);
    if (r > R) continue;
    if (!nodes.length) return p;
    let nearest = Infinity;
    for (const q of nodes) nearest = Math.min(nearest, dist(p, q));
    // Too close reads as a clump; too far reads as a stray.
    const crowd = nearest < spacing * 0.65 ? 10 : 0;
    const target = outlier ? spacing * 1.8 : spacing;
    const score = crowd + Math.abs(nearest - target) / spacing + (outlier ? 0 : (r / R) * 0.3);
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  // Every candidate fell outside the disc (a satellite of a rim hub): pull the
  // hub's neighbourhood inwards instead.
  return best ?? (near ? { x: near.x * 0.85, y: near.y * 0.85 } : { x: 0, y: 0 });
}

export function buildMindGraph(seed, total) {
  const n = Math.max(0, Math.floor(total) || 0);
  const count = nodeTotal(n);
  const rand = rng(`mind:${seed}:${n}`);
  const R = clusterRadius(n);
  // Target spacing: the disc's area shared out among the nodes.
  const spacing = (R * 1.5) / Math.sqrt(Math.max(1, count));
  // cut[k] = how many nodes stand after k answers.
  const cut = Array.from({ length: n + 1 }, (_, k) => Math.round((k * count) / Math.max(1, n)));
  const nodes = [];
  const edges = [];

  for (let answer = 1; answer <= n; answer++) {
    // The field grows with the answers: early clusters sit near the centre and
    // later ones reach further, so every prefix reads as a whole.
    const reach = R * (0.68 + 0.32 * Math.sqrt(answer / n));
    let hub = null;
    for (let i = cut[answer - 1]; i < cut[answer]; i++) {
      const outlier = nodes.length >= 4 && rand() < OUTLIER_P;
      const p = place(rand, nodes, { reach, R, spacing, outlier, near: outlier ? null : hub });
      nodes.push({ x: p.x, y: p.y, size: 0.75 + rand() * 0.5, answer });
      if (!hub) hub = p;
      if (i === 0) continue;

      const near = nodes
        .slice(0, i)
        .map((q, j) => ({ j, d: dist(p, q) }))
        .sort((a, b) => a.d - b.d || a.j - b.j);
      // Always the nearest; a second and third only when close and the dice say so.
      let links = 1;
      if (!outlier) {
        if (near[1] && near[1].d < spacing * 2.2 && rand() < 0.65) links++;
        if (links === 2 && near[2] && near[2].d < spacing * 2.4 && rand() < 0.3) links++;
      }
      for (let k = 0; k < links; k++) edges.push({ a: near[k].j, b: i });
    }
  }

  return { seed: String(seed), total: n, nodeTotal: count, cut, nodes, edges };
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOut = (t) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

// Seconds one answer's response takes: the graph flares and settles again.
export const ARRIVAL_S = 0.9;
// The flare's shape inside that window: lit within FLARE_RISE_S, held to
// FLARE_HOLD_S, eased back to the pale resting state by ARRIVAL_S.
export const FLARE_RISE_S = 0.12;
export const FLARE_HOLD_S = 0.3;

// How lit the whole graph is `t` seconds after an answer: 0 at rest, 1 at the
// peak. Pure timing, no layout — the renderer mixes a darker ink in by it.
export function flareLevel(t) {
  if (!(t > 0) || t >= ARRIVAL_S) return 0;
  if (t < FLARE_RISE_S) return easeOut(t / FLARE_RISE_S);
  if (t < FLARE_HOLD_S) return 1;
  return 1 - easeInOut((t - FLARE_HOLD_S) / (ARRIVAL_S - FLARE_HOLD_S));
}

// What to draw after `answered` answers. `arrival` is how far the newest
// answer's response has run (0..1 of ARRIVAL_S; 1, the default, is the settled
// frame — the one reduced motion and a fresh mount paint). The newest cluster
// fades in while the whole graph flares: `flare` (0..1) is how much darker the
// field is drawn, and the new cluster's nodes are turquoise by the same amount,
// so they hand back to the same pale ink as the rest as the flare ebbs.
export function mindFrame(graph, answered, arrival = 1) {
  const k = Math.min(graph.total, Math.max(0, Math.floor(answered) || 0));
  const shown = graph.cut[k] ?? 0;
  const a = clamp01(arrival);
  const fresh = a < 1 && k > 0 ? graph.cut[k - 1] : shown;
  const flare = a < 1 && k > 0 ? flareLevel(a * ARRIVAL_S) : 0;
  const appear = easeOut(a / 0.3);

  const nodes = graph.nodes.slice(0, shown).map((node, i) => {
    if (i < fresh) return { ...node, alpha: 1, accent: 0, scale: 1 };
    return {
      ...node,
      alpha: appear,
      accent: flare,
      scale: 0.6 + 0.4 * appear + (i === fresh ? 0.3 * flare : 0),
    };
  });
  const edges = graph.edges
    .filter((e) => e.b < shown)
    .map((e) => ({ ...e, alpha: e.b >= fresh ? easeOut((a - 0.05) / 0.35) : 1 }));
  return { nodes, edges, flare, newest: fresh < shown ? fresh : -1 };
}
