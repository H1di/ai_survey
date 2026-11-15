// Pure timeline math shared by every demo scene. A scene's frame is a function
// of the clock T (seconds) and its data — nothing here keeps state.
//
// Stages are [{ id, label, dur }] in play order. Stage i covers the half-open
// interval (start, end]: T = end still belongs to stage i at progress 1, so a
// screenshot at a stage boundary shows that stage finished. T <= 0 is stage 0.

export const lerp = (a, b, t) => a + (b - a) * t;

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

// Hermite smoothstep of x between edges e0 and e1, clamped to 0..1.
export function smoothstep(e0, e1, x) {
  if (e0 === e1) return x < e0 ? 0 : 1;
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

export const easeOutCubic = (t) => 1 - (1 - clamp(t)) ** 3;

// Seeded PRNG (mulberry32). Same seed → same sequence; returns floats in [0, 1).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const totalDuration = (stages) => stages.reduce((s, st) => s + st.dur, 0);

// The stage T falls in: { stage, index, start, end, progress 0..1 }.
// T past the end clamps to the last stage at progress 1.
export function stageAt(T, stages) {
  let start = 0;
  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index];
    const end = start + stage.dur;
    if (T <= end || index === stages.length - 1) {
      const progress = stage.dur > 0 ? clamp((T - start) / stage.dur) : 1;
      return { stage, index, start, end, progress };
    }
    start = end;
  }
  return null;
}

// Local 0..1 progress of the stage `id`: 0 before it starts, 1 once it ends.
export function stageProgress(T, stages, id) {
  let start = 0;
  for (const stage of stages) {
    if (stage.id === id) return stage.dur > 0 ? clamp((T - start) / stage.dur) : T >= start ? 1 : 0;
    start += stage.dur;
  }
  throw new Error(`Unknown stage "${id}"`);
}
