// The one RIASEC hexagon every demo projects onto. Keep it the single source:
// two scenes that disagree on where "Artistic" sits would contradict each other.
//
// Unit hexagon, radius 1, screen orientation (y grows downward). R sits at the
// top and the types run clockwise: R, I, A, S, E, C — Holland's order, so
// adjacent types are the psychologically closest ones.

export const RIASEC_ORDER = ["R", "I", "A", "S", "E", "C"];

export const HEX_VERTICES = RIASEC_ORDER.map((key, i) => {
  const angle = -Math.PI / 2 + (i * Math.PI) / 3;
  return { key, angle, x: Math.cos(angle), y: Math.sin(angle) };
});

// RIASEC scores (any scale; 0-100 in this app) → a point inside the hexagon.
// Weights are min-subtracted (only the profile's shape matters, not how high
// someone rates everything) then sum-normalised; the point is the weighted
// mean of the vertices. A flat profile carries no direction → centre.
export function projectRiasec(riasec) {
  const values = RIASEC_ORDER.map((k) => riasec?.[k] ?? 0);
  const min = Math.min(...values);
  const weights = values.map((v) => v - min);
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  weights.forEach((w, i) => {
    x += (w / sum) * HEX_VERTICES[i].x;
    y += (w / sum) * HEX_VERTICES[i].y;
  });
  return { x, y };
}
