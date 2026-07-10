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

// ---------------------------------------------------------------------------
// Deterministic fallbacks (keyless mode / rejected AI payloads)
// ---------------------------------------------------------------------------

// Hand-written circumplex-respecting Schwartz profile per catalog direction —
// what each field structurally rewards, not any single employer's culture.
// Keys: sd st he ach pow sec conf trad ben uni (see SCHWARTZ_ORDER).
const P = (sd, st, he, ach, pow, sec, conf, trad, ben, uni) => ({
  self_direction: sd, stimulation: st, hedonism: he, achievement: ach, power: pow,
  security: sec, conformity: conf, tradition: trad, benevolence: ben, universalism: uni,
});

const SCHWARTZ_DIRECTION_PROTOTYPES = {
  agriculture: P(55, 40, 35, 45, 30, 70, 60, 70, 55, 65),
  arts: P(90, 80, 65, 55, 30, 20, 15, 25, 45, 55),
  business: P(55, 55, 50, 85, 80, 45, 45, 35, 35, 25),
  design: P(85, 70, 60, 60, 35, 30, 25, 20, 40, 45),
  education: P(50, 40, 35, 50, 40, 60, 55, 55, 85, 75),
  finance: P(40, 35, 40, 80, 70, 70, 65, 45, 25, 20),
  healthcare: P(40, 40, 30, 55, 40, 65, 60, 50, 90, 75),
  hospitality: P(40, 55, 70, 50, 35, 45, 50, 45, 70, 45),
  law: P(45, 45, 35, 75, 75, 60, 60, 55, 40, 50),
  media: P(75, 75, 60, 65, 50, 25, 25, 20, 40, 50),
  tech: P(75, 65, 45, 70, 45, 50, 35, 20, 30, 35),
  science: P(80, 60, 30, 65, 35, 45, 35, 25, 40, 65),
  trades: P(55, 45, 40, 55, 35, 70, 60, 60, 45, 35),
  social: P(45, 40, 30, 45, 30, 55, 50, 45, 90, 90),
  sports: P(50, 75, 55, 85, 55, 35, 45, 40, 50, 35),
};

// Varied generic base for unknown/absent directions — never flat.
const GENERIC_PROTOTYPE = P(65, 55, 45, 60, 40, 50, 40, 35, 55, 50);

// How each of the user's 7 job-characteristic targets nudges a value score.
// weight = how far the prototype moves toward the target on that value.
const JOB_CHAR_VALUE_INFLUENCE = {
  compensation: [["power", 0.3], ["achievement", 0.2]],
  job_security: [["security", 0.3], ["conformity", 0.15], ["tradition", 0.1]],
  meaning_impact: [["universalism", 0.3], ["benevolence", 0.2]],
  complexity: [["self_direction", 0.25], ["stimulation", 0.25]],
  work_mode: [["self_direction", 0.15], ["hedonism", 0.15]],
  social: [["benevolence", 0.15]],
  career_growth: [["achievement", 0.25], ["power", 0.15]],
};

const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(n)));

// Fallback profession profile: the direction prototype pulled toward the
// user's stated targets (the fallback job is generated to match them, so the
// modulation keeps the score honest to what that job would reward).
function buildFallbackProfessionValues(directionId, jobCharProfile = {}) {
  const proto = SCHWARTZ_DIRECTION_PROTOTYPES[directionId] || GENERIC_PROTOTYPE;
  const scores = { ...proto };
  for (const [param, influences] of Object.entries(JOB_CHAR_VALUE_INFLUENCE)) {
    const target = jobCharProfile[param];
    if (typeof target !== "number") continue;
    for (const [valueKey, weight] of influences) {
      scores[valueKey] = clamp100(scores[valueKey] * (1 - weight) + target * weight);
    }
  }
  return scores;
}

// Keyless user-values inference: documented heuristic over Big Five (O,C,E,A),
// RIASEC (E,S,C types), and the 7 targets. Every input defaults to the
// neutral midpoint, so a fully empty profile yields all-50 (and stays flagged
// low-confidence upstream).
function inferUserValuesFallback({ bigFiveScores, riasecScores, jobCharProfile } = {}) {
  const O = bigFiveScores?.O ?? 50;
  const C = bigFiveScores?.C ?? 50;
  const E = bigFiveScores?.E ?? 50;
  const A = bigFiveScores?.A ?? 50;
  const rE = riasecScores?.E ?? 50;
  const rS = riasecScores?.S ?? 50;
  const rC = riasecScores?.C ?? 50;
  const jc = (k) => jobCharProfile?.[k] ?? 50;

  return {
    self_direction: clamp100(0.5 * O + 0.25 * jc("complexity") + 0.25 * jc("work_mode")),
    stimulation: clamp100(0.4 * O + 0.35 * E + 0.25 * (100 - jc("job_security"))),
    hedonism: clamp100(0.4 * E + 0.35 * jc("work_mode") + 0.25 * (100 - C)),
    achievement: clamp100(0.4 * C + 0.35 * jc("career_growth") + 0.25 * jc("compensation")),
    power: clamp100(0.4 * rE + 0.35 * jc("compensation") + 0.25 * (100 - A)),
    security: clamp100(0.5 * jc("job_security") + 0.3 * C + 0.2 * (100 - O)),
    conformity: clamp100(0.4 * rC + 0.35 * A + 0.25 * (100 - O)),
    tradition: clamp100(0.4 * (100 - O) + 0.3 * A + 0.3 * jc("job_security")),
    benevolence: clamp100(0.5 * A + 0.3 * rS + 0.2 * jc("social")),
    universalism: clamp100(0.4 * jc("meaning_impact") + 0.35 * O + 0.25 * A),
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
  SCHWARTZ_DIRECTION_PROTOTYPES,
  buildFallbackProfessionValues,
  inferUserValuesFallback,
};
