// Holland RIASEC grounding (prototype / research track).
//
// Turns the survey profile (Big Five + 8 values) into a six-dimension Holland
// interest vector, then ranks the direction catalog by fit. This gives the
// direction step a data-derived signal — grounded in the vocational-psychology
// literature on Big Five <-> RIASEC links — instead of leaving the whole
// interest inference to the LLM. The model still writes the questions and
// narrative; this only orders which directions are most worth surfacing.
//
// Big Five <-> RIASEC weights follow the direction and rough magnitude of the
// Barrick, Mount & Gupta (2003) and Larson et al. (2002) meta-analyses:
//   Openness        -> Artistic (strong), Investigative (moderate)
//   Extraversion    -> Enterprising (strong), Social (moderate)
//   Agreeableness   -> Social (moderate)
//   Conscientiousness -> Conventional (modest)
//   Neuroticism     -> ~null (unused)
//   Realistic       -> weakly/negatively tied to Big Five; leans hands-on
// The 8 values dimensions (0-5) add interest signal the Big Five miss.

const { VALUES_DIMENSIONS } = require("./questionPool");

const RIASEC_KEYS = ["R", "I", "A", "S", "E", "C"];

// Dominant Holland codes for each catalog direction, from the Holland/O*NET
// codes of the representative occupations in each group. Weights sum loosely
// to 1 per direction; the first letter is the primary theme.
const DIRECTION_RIASEC = {
  agriculture: { R: 0.6, I: 0.3, C: 0.1 },
  arts: { A: 0.8, E: 0.2 },
  business: { E: 0.6, C: 0.4 },
  design: { A: 0.6, I: 0.2, R: 0.2 },
  education: { S: 0.7, A: 0.15, I: 0.15 },
  finance: { C: 0.6, I: 0.3, E: 0.1 },
  healthcare: { S: 0.6, I: 0.3, R: 0.1 },
  hospitality: { E: 0.5, S: 0.3, C: 0.2 },
  law: { E: 0.5, I: 0.3, S: 0.2 },
  media: { A: 0.5, E: 0.4, I: 0.1 },
  tech: { I: 0.6, R: 0.2, C: 0.2 },
  science: { I: 0.8, R: 0.2 },
  trades: { R: 0.8, C: 0.2 },
  social: { S: 0.8, E: 0.2 },
  sports: { R: 0.4, S: 0.4, E: 0.2 },
};

const clamp = (n) => Math.max(0, Math.min(100, n));

// values scores are 0-5; scale to 0-100 to sit alongside the Big Five.
function valuePct(valuesScores, id) {
  const raw = valuesScores && valuesScores[id];
  return typeof raw === "number" ? (raw / 5) * 100 : 50;
}

// Six-dimension interest vector (0-100 each) from the profile. Missing inputs
// default to the neutral midpoint so a partial profile still ranks sanely.
function deriveRiasecScores({ bigFiveScores, valuesScores } = {}) {
  const O = bigFiveScores?.O ?? 50;
  const C = bigFiveScores?.C ?? 50;
  const E = bigFiveScores?.E ?? 50;
  const A = bigFiveScores?.A ?? 50;

  const v = (id) => valuePct(valuesScores, id);

  return {
    // Hands-on/practical: Big Five link is weak, so lean on independence and a
    // mild inverse of Openness (abstract thinkers skew away from Realistic).
    R: clamp(0.5 * (100 - O) + 0.5 * v("independence")),
    I: clamp(0.55 * O + 0.45 * v("intellectual_stimulation")),
    A: clamp(0.7 * O + 0.3 * v("intellectual_stimulation")),
    S: clamp(0.35 * A + 0.25 * E + 0.2 * v("meaning_impact") + 0.2 * v("social_environment")),
    E: clamp(0.4 * E + 0.35 * v("achievement") + 0.25 * v("economic_return")),
    C: clamp(0.6 * C + 0.4 * v("structure")),
  };
}

// Rank catalog directions by how well their Holland profile matches the
// person's interest vector (weighted dot product). excludeIds drops rejected
// directions. Returns [{ id, score }] high-to-low.
function rankDirections(profile, { excludeIds = [] } = {}) {
  const riasec = deriveRiasecScores(profile);
  const excluded = new Set(excludeIds);

  return Object.entries(DIRECTION_RIASEC)
    .filter(([id]) => !excluded.has(id))
    .map(([id, weights]) => {
      let score = 0;
      for (const [key, weight] of Object.entries(weights)) {
        score += weight * (riasec[key] ?? 0);
      }
      return { id, score: Math.round(score) };
    })
    .sort((a, b) => b.score - a.score);
}

module.exports = {
  RIASEC_KEYS,
  DIRECTION_RIASEC,
  deriveRiasecScores,
  rankDirections,
  // exported for tests
  _valueDimensionIds: VALUES_DIMENSIONS.map((d) => d.id),
};
