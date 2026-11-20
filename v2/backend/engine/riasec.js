// Holland RIASEC grounding.
//
// Since question-engine v2 the primary interest signal is the measured RIASEC
// quiz (see riasecItems.js + computeRiasecScores). This module keeps two
// things: the per-direction Holland weights used to rank the catalog, and a
// Big Five–only heuristic used when the user skips the quiz and the AI
// inference is unavailable, and to steady a near-flat quiz (rankingRiasec).

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

// Below this spread (max − min of the six scores, in points) a measured
// profile has too little shape to rank families by: answering every item alike
// ties all fifteen, and a tie used to fall to catalog — alphabetical — order,
// so Agriculture won by default. Under it the measured scores are blended
// toward the Big Five inference in proportion to how flat they are: a flat
// quiz ranks by personality alone, a spread of 40+ by the quiz alone.
const RIASEC_MIN_SPREAD = 40;

// The scores family/occupation ranking uses. Pure; the snapshot exposes the
// result (rankingRiasecScores) so the frontend scenes rank exactly the same.
function rankingRiasec(riasecScores, bigFiveScores) {
  const inferred = inferRiasecScores(bigFiveScores);
  if (!riasecScores) return inferred;
  const measured = RIASEC_KEYS.map((k) => riasecScores[k] ?? 50);
  const spread = Math.max(...measured) - Math.min(...measured);
  const w = Math.min(1, spread / RIASEC_MIN_SPREAD);
  if (w === 1) return riasecScores;
  return Object.fromEntries(
    RIASEC_KEYS.map((k, i) => [k, Math.round(w * measured[i] + (1 - w) * inferred[k])])
  );
}

// Rank catalog directions against a measured (or inferred) RIASEC score
// vector — weighted dot product, high to low. excludeIds drops rejected ids.
// Sorted on the unrounded score: rounding first manufactured ties that then
// fell to catalog order.
function rankDirections(riasecScores, { excludeIds = [] } = {}) {
  const excluded = new Set(excludeIds);
  return Object.entries(DIRECTION_RIASEC)
    .filter(([id]) => !excluded.has(id))
    .map(([id, weights]) => {
      let raw = 0;
      for (const [key, weight] of Object.entries(weights)) {
        raw += weight * (riasecScores?.[key] ?? 50);
      }
      return { id, raw };
    })
    .sort((a, b) => b.raw - a.raw)
    .map(({ id, raw }) => ({ id, score: Math.round(raw) }));
}

module.exports = {
  RIASEC_KEYS,
  DIRECTION_RIASEC,
  RIASEC_MIN_SPREAD,
  inferRiasecScores,
  rankingRiasec,
  rankDirections,
};
