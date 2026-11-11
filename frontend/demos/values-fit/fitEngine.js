// Values fit — where the "fit %" on the output card comes from.
//
// The number is the backend's valuesFit (backend/engine/workValues.js): a
// CENTERED cosine of the two six-value vectors, mapped -1..1 → 0..100. It
// compares the shape of the two profiles, not their size or overlap area. The
// drawn intersection is an illustration only — the number shown is always the
// precomputed value, never derived from the geometry here.
//
// Pure: frame = f(T, preset). Radii are unit-scaled (100 = 1).
import { WORK_VALUE_AXES } from "../../src/lifePath";
import { clamp, easeOutCubic, smoothstep, stageProgress, totalDuration } from "../kit/timeline";

export const AXES = WORK_VALUE_AXES; // WORK_VALUES_ORDER with display labels

export const STAGES = [
  { id: "you", label: "Your priorities", dur: 1.5 },
  { id: "occupation", label: "This occupation", dur: 1.5 },
  { id: "agree", label: "Where they agree", dur: 1.5 },
  { id: "fit", label: "Fit", dur: 1.0 },
];
export const DURATION = totalDuration(STAGES); // 5.5

// The count-up starts inside "Where they agree" and lands on the stage end.
export const COUNT_START = 3.6;
export const COUNT_END = DURATION;

// ≥ 360 and a multiple of 6, so every axis angle is sampled exactly.
export const RAYS = 360;

// The lowest-fit occupation with measured O*NET work values for the demo
// persona. Precomputed with the backend's valuesFit; fitEngine.test.js
// re-derives both the pick and the number from the real function.
export const POOR_FIT = { soc: "29-1051.00", overall: 8 };

const STEP = (2 * Math.PI) / AXES.length;
const TOP = -Math.PI / 2;

// Axis i, clockwise from 12 o'clock (screen y-down).
export const axisAngle = (i) => TOP + i * STEP;

export const radiiOf = (values) => AXES.map(({ key }) => clamp((values[key] ?? 0) / 100));

// Radius of the closed radar polygon (vertex i at radius r[i] on axis i) along
// the ray at `angle`: the ray meets the straight edge between the two axes it
// falls between — polar form of the line through both vertices.
export function radiusOnRay(radii, angle) {
  const rel = (((angle - TOP) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const i = Math.min(AXES.length - 1, Math.floor(rel / STEP));
  const t = rel - i * STEP;
  const a = radii[i];
  const b = radii[(i + 1) % AXES.length];
  const den = a * Math.sin(t) + b * Math.sin(STEP - t);
  return den > 0 ? (a * b * Math.sin(STEP)) / den : 0;
}

// The region both polygons cover: along each ray, the nearer of the two edges.
export function intersection(userRadii, jobRadii, rays = RAYS) {
  return Array.from({ length: rays }, (_, k) => {
    const angle = TOP + (k * 2 * Math.PI) / rays;
    return { angle, r: Math.min(radiusOnRay(userRadii, angle), radiusOnRay(jobRadii, angle)) };
  });
}

// The axes where the two shapes lean the same way the most: the largest
// positive terms of the centered dot product the fit is built on (both above
// their own mean, or both below). Ties keep WORK_VALUES_ORDER. A poor fit can
// have none — then nothing is ticked.
export function agreeAxes(user, job, n = 2) {
  const center = (arr) => {
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    return arr.map((v) => v - mean);
  };
  const cu = center(AXES.map(({ key }) => user[key] ?? 0));
  const cj = center(AXES.map(({ key }) => job[key] ?? 0));
  return AXES.map(({ key }, i) => ({ key, i, term: cu[i] * cj[i] }))
    .filter((e) => e.term > 0)
    .sort((a, b) => b.term - a.term || a.i - b.i)
    .slice(0, n)
    .map((e) => e.key);
}

// Both presets, with the fit number taken as given (never recomputed here).
export function buildPresets(profile, occupations) {
  const poor = occupations.find((o) => o.soc === POOR_FIT.soc);
  const make = (id, kind, occ, fit) => {
    const userRadii = radiiOf(profile.valuesScores);
    const jobRadii = radiiOf(occ.workValues);
    return {
      id,
      kind,
      soc: occ.soc,
      title: occ.title,
      user: profile.valuesScores,
      job: occ.workValues,
      fit,
      userRadii,
      jobRadii,
      region: intersection(userRadii, jobRadii),
      agree: agreeAxes(profile.valuesScores, occ.workValues),
    };
  };
  return [
    make("chosen", "Your result", profile.chosen, profile.valuesFit.overall),
    make("poor", "Poor fit", poor, POOR_FIT.overall),
  ];
}

// The integer on screen at T: 0 until COUNT_START, eases out, lands exactly
// on `fit` at COUNT_END.
export function countAt(T, fit) {
  const p = clamp((T - COUNT_START) / (COUNT_END - COUNT_START));
  return p >= 1 ? fit : Math.round(fit * easeOutCubic(p));
}

export function frameAt(T, preset) {
  return {
    userScale: easeOutCubic(stageProgress(T, STAGES, "you")),
    jobScale: easeOutCubic(stageProgress(T, STAGES, "occupation")),
    // Fraction of the rays filled, swept clockwise from 12 o'clock.
    sweep: easeOutCubic(stageProgress(T, STAGES, "agree")),
    userValuesAlpha: smoothstep(1.0, 1.5, T),
    jobValuesAlpha: smoothstep(2.5, 3.0, T),
    readoutAlpha: smoothstep(COUNT_START, COUNT_START + 0.3, T),
    tickAlpha: smoothstep(4.6, 5.1, T),
    count: countAt(T, preset.fit),
  };
}
