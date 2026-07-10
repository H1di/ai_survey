// Schwartz Basic Human Values — pure derivation module.
//
// The AI only ever outputs the 10 raw scores (0–100) plus a short rationale;
// EVERY aggregate (higher-order poles, plane axes, top values, fit) is derived
// here deterministically so the model can't produce inconsistent numbers.
//
// Circular order (adjacent = compatible, opposite = conflicting):
// self_direction → stimulation → hedonism → achievement → power → security →
// conformity → tradition → benevolence → universalism → (back to start).

const SCHWARTZ_ORDER = [
  "self_direction",
  "stimulation",
  "hedonism",
  "achievement",
  "power",
  "security",
  "conformity",
  "tradition",
  "benevolence",
  "universalism",
];

const SCHWARTZ_VALUE_META = [
  { id: "self_direction", label: "Self-Direction" },
  { id: "stimulation", label: "Stimulation" },
  { id: "hedonism", label: "Hedonism" },
  { id: "achievement", label: "Achievement" },
  { id: "power", label: "Power" },
  { id: "security", label: "Security" },
  { id: "conformity", label: "Conformity" },
  { id: "tradition", label: "Tradition" },
  { id: "benevolence", label: "Benevolence" },
  { id: "universalism", label: "Universalism" },
];

// Four higher-order poles; hedonism sits between Openness and Enhancement and
// is split 50/50 (standard treatment of its dual membership).
function deriveHigherOrder(v) {
  const openness = (v.self_direction + v.stimulation + v.hedonism * 0.5) / 2.5;
  const enhance = (v.achievement + v.power + v.hedonism * 0.5) / 2.5;
  const conserv = (v.security + v.conformity + v.tradition) / 3;
  const transc = (v.universalism + v.benevolence) / 2;
  return {
    openness_to_change: Math.round(openness),
    self_enhancement: Math.round(enhance),
    conservation: Math.round(conserv),
    self_transcendence: Math.round(transc),
  };
}

// The two bipolar axes of the circumplex plane (−100..+100 each).
function deriveAxes(h) {
  return {
    x_open_vs_conserv: h.openness_to_change - h.conservation,
    y_transc_vs_enhance: h.self_transcendence - h.self_enhancement,
  };
}

function deriveTopValues(v) {
  return SCHWARTZ_ORDER
    .map((key, index) => ({ key, index, score: v[key] ?? 0 }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3)
    .map((e) => e.key);
}

function dominantPole(h) {
  return Object.entries(h).sort((a, b) => b[1] - a[1])[0][0];
}

function center(arr) {
  const mean = arr.reduce((s, n) => s + n, 0) / arr.length;
  return arr.map((n) => n - mean);
}

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0; // a flat (all-equal) vector has no direction
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Fit between a user values vector and a profession values vector: blend an
// interpretable 2D-axis distance with a fine-grained centered-cosine match
// (centering removes scale-use bias — standard for Schwartz data).
function valuesFit(userV, jobV) {
  const uh = deriveAxes(deriveHigherOrder(userV));
  const jh = deriveAxes(deriveHigherOrder(jobV));
  const dist = Math.hypot(
    uh.x_open_vs_conserv - jh.x_open_vs_conserv,
    uh.y_transc_vs_enhance - jh.y_transc_vs_enhance
  );
  const axisFit = Math.max(0, 100 - (dist / (200 * Math.SQRT2)) * 100);

  const cu = center(SCHWARTZ_ORDER.map((k) => userV[k] ?? 0));
  const cj = center(SCHWARTZ_ORDER.map((k) => jobV[k] ?? 0));
  const cosFit = ((cosine(cu, cj) + 1) / 2) * 100; // −1..1 → 0..100

  return {
    overall: Math.round(0.6 * axisFit + 0.4 * cosFit),
    axisFit: Math.round(axisFit),
    detailFit: Math.round(cosFit),
    userPoint: uh,
    jobPoint: jh,
  };
}

module.exports = {
  SCHWARTZ_ORDER,
  SCHWARTZ_VALUE_META,
  deriveHigherOrder,
  deriveAxes,
  deriveTopValues,
  dominantPole,
  valuesFit,
};
