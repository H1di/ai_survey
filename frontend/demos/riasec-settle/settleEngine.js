// RIASEC settle — what the three-letter interest code means and where it
// comes from. Shown only after the quiz is finished: live scores while
// answering would bias the answers.
//
// Spokes = the six enjoyment scores (0-100). The point = projectRiasec, the
// weighted balance of all six on Holland's hexagon. The code = the three
// highest scores, strongest first, ties broken in R-I-A-S-E-C order — the
// same rule as deriveRiasecCode in backend/assessment/questionEngine.js.
//
// Pure: frame = f(T, profile). Positions are in unit-hexagon coordinates.
import { clamp, easeOutCubic, smoothstep, stageProgress, totalDuration } from "../kit/timeline";
import { RIASEC_ORDER, projectRiasec } from "../kit/riasecPlane";

export const STAGES = [
  { id: "answers", label: "Your answers", dur: 1.2 },
  { id: "sit", label: "Where you sit", dur: 1.8 },
  { id: "code", label: "Your code", dur: 2.0 },
  { id: "hold", label: "Settled", dur: 1.0 },
];
export const DURATION = totalDuration(STAGES); // 6.0
export const SIT_END = 3.0;

export const RIASEC_NAMES = {
  R: "Realistic",
  I: "Investigative",
  A: "Artistic",
  S: "Social",
  E: "Enterprising",
  C: "Conventional",
};

// Mirror of the backend's deriveRiasecCode (the test pins it to the real
// persona's stored code).
export function deriveCode(scores) {
  return RIASEC_ORDER.map((key, index) => ({ key, index, score: scores[key] ?? 0 }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3)
    .map((e) => e.key)
    .join("");
}

// Two synthetic profiles chosen to pull the point to other sides of the
// hexagon than the persona's Investigative-Artistic lean. No ties.
const SYNTHETIC = [
  { id: "rci", tag: "Synthetic", scores: { R: 94, I: 58, A: 15, S: 22, E: 36, C: 80 } },
  { id: "sea", tag: "Synthetic", scores: { R: 18, I: 30, A: 62, S: 92, E: 74, C: 40 } },
];

export function buildProfiles(persona) {
  return [{ id: "persona", tag: "Demo persona", scores: persona.riasecScores }, ...SYNTHETIC].map((p) => ({
    ...p,
    code: deriveCode(p.scores),
    target: projectRiasec(p.scores),
  }));
}

const SPOKE_STAGGER = 0.07; // spoke i starts i·7% into "answers"
const TRAIL_LAG = 0.45; // tail trails the head by 45% of the move, catches up on arrival
const LIGHT_START = 3.05;
const LIGHT_STEP = 0.55; // one code letter every 0.55 s
const LIGHT_FADE = 0.25;
const TYPE_DELAY = 0.1;
const TYPE_DUR = 0.45;

// When code letter k lights up.
export const lightStart = (k) => LIGHT_START + k * LIGHT_STEP;

export function frameAt(T, profile) {
  const grow = stageProgress(T, STAGES, "answers");
  const spokes = RIASEC_ORDER.map((key, i) => {
    const local = clamp((grow - i * SPOKE_STAGGER) / (1 - (RIASEC_ORDER.length - 1) * SPOKE_STAGGER));
    return { key, len: ((profile.scores[key] ?? 0) / 100) * easeOutCubic(local), alpha: smoothstep(0, 0.35, local) };
  });

  const move = stageProgress(T, STAGES, "sit");
  const head = smoothstep(0, 1, move);
  const tail = smoothstep(0, 1, clamp((move - TRAIL_LAG) / (1 - TRAIL_LAG)));
  const at = (q) => ({ x: profile.target.x * q, y: profile.target.y * q });

  const lit = Object.fromEntries(RIASEC_ORDER.map((key) => [key, 0]));
  const letters = profile.code.split("").map((key, k) => {
    const s = lightStart(k);
    lit[key] = smoothstep(s, s + LIGHT_FADE, T);
    const name = RIASEC_NAMES[key];
    return { key, name, alpha: lit[key], chars: Math.round(name.length * clamp((T - s - TYPE_DELAY) / TYPE_DUR)) };
  });

  return {
    spokes,
    point: at(head),
    pointAlpha: smoothstep(0, 0.06, move),
    settled: smoothstep(SIT_END - 0.15, SIT_END + 0.1, T), // ring around the arrived point
    trail: { from: at(tail), to: at(head), alpha: 0.7 * (1 - smoothstep(0.8, 1, move)) },
    lit, // per type, 0..1
    letters, // the code, strongest first
    captionAlpha: smoothstep(lightStart(2) + 0.5, lightStart(2) + 0.8, T),
  };
}
