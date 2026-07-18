// Minnesota / O*NET Work Values — pure derivation module.
//
// Six independent 0-100 scales (no circular structure, unlike the Schwartz
// model this replaced): a profession's values come from measured O*NET data
// (snapshot `workValues`, from the 28.0 Work Values file) with a per-direction
// prototype fallback here; a user's values come from the explicit pairwise
// tournament (see valuesTournament.js), never from AI inference.

const WORK_VALUES_ORDER = [
  "achievement",
  "independence",
  "recognition",
  "relationships",
  "support",
  "working_conditions",
];

const WORK_VALUES_META = [
  { id: "achievement", label: "Achievement" },
  { id: "independence", label: "Independence" },
  { id: "recognition", label: "Recognition" },
  { id: "relationships", label: "Relationships" },
  { id: "support", label: "Support" },
  { id: "working_conditions", label: "Working Conditions" },
];

// Rank -> intensity curve for the user's confirmed hierarchy. An ordinal
// instrument can't measure magnitudes, so rank position maps to a fixed,
// evenly-spaced curve (rank 1 = 100 ... rank 6 = 20). Bump the version if the
// numbers change — it is stored on session.userValues for reproducibility.
const WORK_VALUE_CURVE = [100, 84, 68, 52, 36, 20];
const WORK_VALUE_CURVE_VERSION = 1;

// order: the six keys, most important first. Backend computes and stores these
// scores (the server snapshot is the single source of truth); the UI renders.
function rankToWorkValueScores(order) {
  const scores = {};
  order.forEach((key, i) => {
    scores[key] = WORK_VALUE_CURVE[i] ?? WORK_VALUE_CURVE[WORK_VALUE_CURVE.length - 1];
  });
  return scores;
}

function deriveTopValues(v) {
  return WORK_VALUES_ORDER
    .map((key, index) => ({ key, index, score: v[key] ?? 0 }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3)
    .map((e) => e.key);
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

// Fit between a user values vector and a profession values vector: centered
// cosine (centering removes scale-use bias), mapped -1..1 -> 0..100. Single
// `overall` field — the six MWV scales have no axes/planes to blend in.
function valuesFit(userV, jobV) {
  const cu = center(WORK_VALUES_ORDER.map((k) => userV[k] ?? 0));
  const cj = center(WORK_VALUES_ORDER.map((k) => jobV[k] ?? 0));
  const cosFit = ((cosine(cu, cj) + 1) / 2) * 100;
  return { overall: Math.round(cosFit) };
}

// ---------------------------------------------------------------------------
// Deterministic fallbacks (occupations with no measured O*NET work values —
// 40 of 923 — and any keyless profession profile)
// ---------------------------------------------------------------------------

// Per-direction prototypes = the mean measured O*NET work-value profile of the
// occupations in each direction family (from the 28.0 data baked into the
// snapshot). Data-grounded, not hand-guessed.
const P = (achievement, independence, recognition, relationships, support, working_conditions) => ({
  achievement, independence, recognition, relationships, support, working_conditions,
});

const WORK_VALUES_DIRECTION_PROTOTYPES = {
  agriculture: P(31, 46, 22, 39, 53, 34),
  arts: P(70, 69, 58, 59, 36, 57),
  business: P(56, 60, 49, 64, 55, 55),
  design: P(71, 67, 49, 57, 38, 55),
  education: P(74, 74, 63, 74, 40, 68),
  finance: P(52, 57, 45, 61, 56, 50),
  healthcare: P(66, 63, 57, 77, 64, 60),
  hospitality: P(30, 42, 25, 66, 45, 30),
  law: P(59, 63, 52, 61, 64, 55),
  media: P(67, 64, 56, 54, 48, 56),
  science: P(68, 65, 60, 50, 48, 63),
  social: P(71, 68, 51, 91, 49, 58),
  sports: P(74, 68, 51, 76, 51, 51),
  tech: P(70, 67, 61, 44, 60, 69),
  trades: P(32, 42, 25, 46, 63, 37),
};

// Neutral base for unknown/absent directions (overall mean, never flat).
const GENERIC_PROTOTYPE = P(58, 61, 47, 61, 51, 54);

// How each of the user's 7 job-characteristic targets nudges a work value,
// following the MIQ need groupings (Compensation/Security -> Working
// Conditions & Support; Advancement/Recognition -> Recognition; Ability
// Utilization -> Achievement; Autonomy/Creativity -> Independence; Co-workers/
// Social Service -> Relationships).
const JOB_CHAR_VALUE_INFLUENCE = {
  compensation: [["working_conditions", 0.3], ["achievement", 0.15]],
  job_security: [["working_conditions", 0.25], ["support", 0.2]],
  meaning_impact: [["relationships", 0.3]],
  complexity: [["achievement", 0.25], ["independence", 0.2]],
  work_mode: [["independence", 0.2], ["working_conditions", 0.1]],
  social: [["relationships", 0.25]],
  career_growth: [["recognition", 0.25], ["achievement", 0.15]],
};

const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(n)));

// Fallback profession profile: the direction prototype pulled toward the user's
// stated targets (the fallback job is generated to match them).
function buildFallbackProfessionValues(directionId, jobCharProfile = {}) {
  const proto = WORK_VALUES_DIRECTION_PROTOTYPES[directionId] || GENERIC_PROTOTYPE;
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

module.exports = {
  WORK_VALUES_ORDER,
  WORK_VALUES_META,
  WORK_VALUE_CURVE_VERSION,
  rankToWorkValueScores,
  deriveTopValues,
  valuesFit,
  WORK_VALUES_DIRECTION_PROTOTYPES,
  buildFallbackProfessionValues,
};
