// Archetype emblem — the pure half. The summary screen's three measured layers
// (Big Five, RIASEC, work-value ranks) become one deterministic mark:
//   buildEmblem(profile) → geometry, a pure function of the profile, seeded by
//   a hash of its scores (same profile → same emblem, bit for bit);
//   frameAt(T)           → how much of each layer is drawn at time T.
// Geometry lives in unit space (outer radius ≈ 1, angles in radians, 0 = up,
// clockwise, screen y-down); the renderer only scales and strokes it.
import { clamp, easeOutCubic, mulberry32, stageProgress } from "../kit/timeline";
import { HEX_VERTICES } from "../kit/riasecPlane";
import { deriveArchetype } from "../../src/lifePath";

export const STAGES = [
  { id: "personality", label: "Personality", dur: 2 },
  { id: "interests", label: "Interests", dur: 2 },
  { id: "priorities", label: "Priorities", dur: 1.5 },
  { id: "you", label: "You", dur: 1.5 },
];

// Big Five in display form: Neuroticism is shown as Emotional Steadiness
// (100 − N), exactly as bigFiveTakeaways does on the summary screen.
export const BIG_FIVE_AXES = [
  { key: "O", abbr: "OPN", label: "Openness", value: (s) => s.O },
  { key: "C", abbr: "CON", label: "Conscientiousness", value: (s) => s.C },
  { key: "E", abbr: "EXT", label: "Extraversion", value: (s) => s.E },
  { key: "A", abbr: "AGR", label: "Agreeableness", value: (s) => s.A },
  { key: "S", abbr: "STB", label: "Emotional Steadiness", value: (s) => 100 - s.N },
];

const RIASEC_KEYS = HEX_VERTICES.map((v) => v.key); // R I A S E C, clockwise from top

// The six Minnesota work values in WORK_VALUES_ORDER (fixed angular slots).
export const WORK_VALUE_SLOTS = [
  { key: "achievement", abbr: "ACH" },
  { key: "independence", abbr: "IND" },
  { key: "recognition", abbr: "REC" },
  { key: "relationships", abbr: "REL" },
  { key: "support", abbr: "SUP" },
  { key: "working_conditions", abbr: "WC" },
];

// Radii of the three layers (unit space).
export const LAYOUT = {
  lobeMax: 0.4, // Big Five 100 reaches here
  lobeMin: 0.06,
  lobeHalfWidth: (Math.PI / 5) * 0.82, // 72° slots, ~13° clear between lobes
  ringBase: 0.53, // RIASEC segments grow outward from this circle
  ringMin: 0.018,
  ringMax: 0.13,
  ringGap: (4 * Math.PI) / 180,
  tickBase: 0.76,
  tickMin: 0.045, // rank 6
  tickMax: 0.19, // rank 1
};

const TAU = Math.PI * 2;
const round = (v) => Math.round(v * 1e6) / 1e6;

// FNV-1a over the canonical score string. Only the measured inputs go in, so
// the seed — and therefore the mark — changes iff the profile does.
export function profileHash(profile) {
  const b = profile.bigFiveScores;
  const r = profile.riasecScores;
  const text = [
    ["O", "C", "E", "A", "N"].map((k) => b[k]).join(","),
    RIASEC_KEYS.map((k) => r[k]).join(","),
    profile.valuesOrder.join(","),
  ].join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// Petal from the centre to `tip` and back, centred on `angle`: r = tip·sin(πu)^0.7.
function lobePoints(angle, tip, halfWidth, steps = 48) {
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const a = angle - halfWidth + 2 * halfWidth * u;
    const rr = tip * Math.sin(Math.PI * u) ** 0.7;
    pts.push({ x: round(Math.sin(a) * rr), y: round(-Math.cos(a) * rr) });
  }
  return pts;
}

export function buildEmblem(profile) {
  const seed = profileHash(profile);
  const rng = mulberry32(seed);
  // The seed sets only the mark's orientation; every length is measured data.
  const rotation = round(rng() * TAU);
  const serial = seed.toString(16).toUpperCase().padStart(8, "0");

  const lobes = BIG_FIVE_AXES.map((axis, i) => {
    const value = clamp(axis.value(profile.bigFiveScores), 0, 100);
    const angle = round(rotation + (i * TAU) / 5);
    const tip = round(LAYOUT.lobeMin + (LAYOUT.lobeMax - LAYOUT.lobeMin) * (value / 100));
    return { key: axis.key, abbr: axis.abbr, label: axis.label, value, angle, tip, points: lobePoints(angle, tip, LAYOUT.lobeHalfWidth) };
  });

  const code = profile.riasecCode.split("");
  const segments = RIASEC_KEYS.map((key, i) => {
    const value = clamp(profile.riasecScores[key], 0, 100);
    const mid = rotation + (i * TAU) / 6;
    return {
      key,
      value,
      codeRank: code.indexOf(key), // -1 when not in the top-3 code
      start: round(mid - TAU / 12 + LAYOUT.ringGap / 2),
      end: round(mid + TAU / 12 - LAYOUT.ringGap / 2),
      mid: round(mid),
      inner: LAYOUT.ringBase,
      outer: round(LAYOUT.ringBase + LAYOUT.ringMin + (LAYOUT.ringMax - LAYOUT.ringMin) * (value / 100)),
    };
  });

  // Ticks sit between the RIASEC segments (offset half a slot); length by rank.
  const ticks = WORK_VALUE_SLOTS.map((slot, i) => {
    const rank = profile.valuesOrder.indexOf(slot.key) + 1;
    return {
      key: slot.key,
      abbr: slot.abbr,
      rank,
      angle: round(rotation + (i * TAU) / 6 + TAU / 12),
      inner: LAYOUT.tickBase,
      outer: round(LAYOUT.tickBase + LAYOUT.tickMax - ((rank - 1) / 5) * (LAYOUT.tickMax - LAYOUT.tickMin)),
    };
  });

  return {
    seed,
    serial: `${serial.slice(0, 4)}-${serial.slice(4)}`,
    rotation,
    lobes,
    segments,
    ticks,
    archetype: deriveArchetype(profile),
    riasecCode: profile.riasecCode,
  };
}

// Stagger n items across a stage's 0..1 progress: item i starts at i·step and
// each takes `span` of the stage.
function stagger(p, n, span) {
  const step = n > 1 ? (1 - span) / (n - 1) : 0;
  return Array.from({ length: n }, (_, i) => easeOutCubic(clamp((p - i * step) / span)));
}

export function frameAt(T) {
  const p1 = stageProgress(T, STAGES, "personality");
  const p2 = stageProgress(T, STAGES, "interests");
  const p3 = stageProgress(T, STAGES, "priorities");
  const p4 = stageProgress(T, STAGES, "you");
  return {
    scaleAlpha: easeOutCubic(clamp(p1 * 3)), // reference circles of the inner layer
    lobes: stagger(p1, 5, 0.6), // 0..1 of each lobe's outline drawn
    ringAlpha: easeOutCubic(clamp(p2 * 3)),
    segments: stagger(p2, 6, 0.55), // 0..1 of each segment's sweep
    tickAlpha: easeOutCubic(clamp(p3 * 3)),
    ticks: stagger(p3, 6, 0.6), // 0..1 of each tick's length
    nameAlpha: easeOutCubic(clamp(p4 / 0.6)),
    taglineAlpha: easeOutCubic(clamp((p4 - 0.3) / 0.6)),
  };
}

// Two synthetic profiles beside the dev persona, chosen to differ on every
// layer. Synthetic: not produced by the backend scoring pipeline.
export const SYNTHETIC_PROFILES = [
  {
    id: "helper",
    kind: "Synthetic",
    bigFiveScores: { O: 52, C: 61, E: 82, A: 88, N: 41 },
    riasecScores: { R: 22, I: 35, A: 47, S: 96, E: 79, C: 58 },
    riasecCode: "SEC",
    valuesOrder: ["relationships", "support", "achievement", "working_conditions", "recognition", "independence"],
  },
  {
    id: "maker",
    kind: "Synthetic",
    bigFiveScores: { O: 31, C: 91, E: 28, A: 46, N: 18 },
    riasecScores: { R: 94, I: 66, A: 12, S: 25, E: 33, C: 81 },
    riasecCode: "RCI",
    valuesOrder: ["working_conditions", "achievement", "support", "independence", "relationships", "recognition"],
  },
];
