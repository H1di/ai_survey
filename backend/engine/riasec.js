// Holland RIASEC grounding.
//
// Since question-engine v2 the primary interest signal is the measured RIASEC
// quiz (see riasecItems.js + computeRiasecScores). This module keeps two
// things: the per-direction Holland weights used to rank the catalog, and a
// Big Five–only heuristic used ONLY when the user skips the quiz and the AI
// inference is unavailable.

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

// Big Five–only heuristic for the quiz-skip path. Direction and rough
// magnitude follow the Barrick, Mount & Gupta (2003) and Larson et al. (2002)
// meta-analytic links (O→Artistic/Investigative, E→Enterprising/Social,
// C→Conventional); Realistic has no solid Big Five anchor, so it leans on low
// Openness + introversion. Missing input → neutral midpoint.
function inferRiasecScores(bigFiveScores) {
  const O = bigFiveScores?.O ?? 50;
  const C = bigFiveScores?.C ?? 50;
  const E = bigFiveScores?.E ?? 50;
  const A = bigFiveScores?.A ?? 50;

  return {
    R: clamp(0.5 * (100 - O) + 0.5 * (100 - E)),
    I: clamp(0.7 * O + 0.3 * (100 - E)),
    A: clamp(0.8 * O + 0.2 * (100 - C)),
    S: clamp(0.55 * A + 0.45 * E),
    E: clamp(0.65 * E + 0.35 * C),
    C: clamp(0.7 * C + 0.3 * (100 - O)),
  };
}

// Rank catalog directions against a measured (or inferred) RIASEC score
// vector — weighted dot product, high to low. excludeIds drops rejected ids.
function rankDirections(riasecScores, { excludeIds = [] } = {}) {
  const excluded = new Set(excludeIds);
  return Object.entries(DIRECTION_RIASEC)
    .filter(([id]) => !excluded.has(id))
    .map(([id, weights]) => {
      let score = 0;
      for (const [key, weight] of Object.entries(weights)) {
        score += weight * (riasecScores?.[key] ?? 50);
      }
      return { id, score: Math.round(score) };
    })
    .sort((a, b) => b.score - a.score);
}

module.exports = { RIASEC_KEYS, DIRECTION_RIASEC, inferRiasecScores, rankDirections };
