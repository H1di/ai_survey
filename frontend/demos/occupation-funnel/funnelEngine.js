// Occupation funnel — the pure half of the scene. The frame is a function of
// (T, model, holdUntil) only: no accumulation, no canvas, no DOM.
//
// What it shows is the backend's real grounding path for the first result:
// 923 O*NET occupations → the 5 field families rankDirections picks from the
// interest scores → the 15 occupations rankOccupations ranks closest by
// Pearson r inside them → the one the pick lands on.
//
// Waiting is data, not a renderer branch. `holdUntil` is the clock time at
// which the response arrived:
//   HOLD_AT (default)  no wait — the scene plays straight through;
//   a later time       stage 3 holds until then, then stages 4–5 play;
//   null               still waiting — stage 3 holds indefinitely.
// sceneTime() folds the hold out of the clock, so every other function sees a
// plain 0..12 s scene time.
import { clamp, easeOutCubic, lerp, mulberry32, smoothstep, stageProgress } from "../kit/timeline";
import { projectRiasec } from "../kit/riasecPlane";

export const STAGES = [
  { id: "catalog", label: "923 occupations from O*NET", dur: 2.4 },
  { id: "families", label: "Five field families that match your interests", dur: 2.6 },
  { id: "shortlist", label: "The 15 closest profiles", dur: 3.0 },
  { id: "pick", label: "One pick", dur: 2.5 },
  { id: "ready", label: "Ready", dur: 1.5 },
];

// End of "shortlist": where the scene waits for the response.
export const HOLD_AT = 8.0;
export const WAIT_STAGE = { id: "waiting", label: "Weighing the shortlist" };

export const DEFAULT_SEED = 923;
export const R_LABEL_COUNT = 5;

const JITTER = 0.028; // unit-hexagon radius of the per-dot scatter
const DOT_R = 1.6;
const SHORT_R = 3.5;
const PICK_R = 7;
const BASE_ALPHA = 0.55;
const OUT_OF_FAMILY = 0.08;
const FAMILY_REST = 0.2;
const FADED = 0.04;
const LINE_ALPHA = 0.42;
const BREATH_PERIOD = 3.2; // s
const BREATH_DEPTH = 0.55; // lines dip to 45% at the bottom of a breath
const BREATH_RELEASE = 0.5; // s to settle back once the response arrives

// The stage list the clock plays. A hold of (holdEnd − HOLD_AT) seconds is
// inserted after "shortlist"; holdEnd ≤ HOLD_AT is the plain 12 s scene.
export function stagesFor(holdEnd = HOLD_AT) {
  const hold = Math.max(0, holdEnd - HOLD_AT);
  if (hold === 0) return STAGES;
  const i = STAGES.findIndex((s) => s.id === "shortlist") + 1;
  return [...STAGES.slice(0, i), { ...WAIT_STAGE, dur: hold }, ...STAGES.slice(i)];
}

// Clock time → scene time. `held` = seconds spent holding so far, `since` =
// seconds since the hold released (both 0 when there is no hold).
export function sceneTime(T, holdUntil = HOLD_AT) {
  const end = Math.max(HOLD_AT, holdUntil ?? Infinity);
  if (T <= HOLD_AT) return { s: T, held: 0, since: 0 };
  if (T <= end) return { s: HOLD_AT, held: T - HOLD_AT, since: 0 };
  return { s: T - (end - HOLD_AT), held: end - HOLD_AT, since: T - end };
}

// 1 → 1 − BREATH_DEPTH → 1 over one period, starting at full strength so the
// hold begins without a jump.
const breathAt = (held) => 1 - (BREATH_DEPTH * (1 - Math.cos((2 * Math.PI * held) / BREATH_PERIOD))) / 2;

// Static layout: every occupation projected onto the hexagon plus seeded
// jitter, tagged with its family rank (-1 = outside the top 5) and shortlist
// rank (-1 = not shortlisted).
export function buildModel(occupations, profile, seed = DEFAULT_SEED) {
  const rng = mulberry32(seed);
  const familyIds = profile.topDirections.map((d) => d.id);
  const shortRank = new Map(profile.shortlist.map((s, i) => [s.soc, i]));

  const dots = occupations.map((o) => {
    const p = projectRiasec(o.riasec);
    const a = rng() * Math.PI * 2;
    const d = JITTER * Math.sqrt(rng());
    return {
      soc: o.soc,
      x: p.x + Math.cos(a) * d,
      y: p.y + Math.sin(a) * d,
      family: familyIds.indexOf(o.directionId),
      short: shortRank.get(o.soc) ?? -1,
    };
  });
  const maxD = Math.max(...dots.map((d) => Math.hypot(d.x, d.y)));
  for (const d of dots) d.delay = Math.hypot(d.x, d.y) / maxD;

  const families = profile.topDirections.map((dir, i) => {
    const members = dots.filter((d) => d.family === i);
    const n = members.length || 1;
    return {
      id: dir.id,
      text: dir.id.toUpperCase(),
      x: members.reduce((s, d) => s + d.x, 0) / n,
      y: members.reduce((s, d) => s + d.y, 0) / n,
    };
  });

  const shortlist = profile.shortlist.map((s) => ({
    soc: s.soc,
    r: s.r,
    dot: dots.findIndex((d) => d.soc === s.soc),
  }));

  return {
    dots,
    families,
    shortlist,
    you: projectRiasec(profile.riasecScores),
    chosen: dots.findIndex((d) => d.soc === profile.chosen.soc),
    title: profile.chosen.title,
  };
}

export function frameAt(T, model, holdUntil = HOLD_AT) {
  const { s, held, since } = sceneTime(T, holdUntil);
  const p1 = stageProgress(s, STAGES, "catalog");
  const p2 = stageProgress(s, STAGES, "families");
  const p3 = stageProgress(s, STAGES, "shortlist");
  const p4 = stageProgress(s, STAGES, "pick");
  const p5 = stageProgress(s, STAGES, "ready");
  const e2 = easeOutCubic(p2);
  const e3 = easeOutCubic(p3);
  const fade = easeOutCubic(clamp(p4 / 0.6)); // everything but the pick → FADED
  const travel = smoothstep(0, 0.55, p4);
  const picking = p4 > 0;

  const dots = model.dots.map((d, i) => {
    const t0 = d.delay * 0.7;
    let alpha = BASE_ALPHA * smoothstep(t0, t0 + 0.3, p1);
    let tint = 0;
    let r = DOT_R;
    if (d.family < 0) {
      alpha = lerp(alpha, OUT_OF_FAMILY, e2);
    } else {
      tint = e2;
      if (d.short < 0) {
        alpha = lerp(alpha, FAMILY_REST, e3);
      } else {
        alpha = lerp(alpha, 1, e3);
        r = lerp(DOT_R, SHORT_R, e3);
      }
    }
    alpha = i === model.chosen && picking ? 0 : lerp(alpha, FADED, fade);
    return { soc: d.soc, x: d.x, y: d.y, r, alpha, tint };
  });

  const c = model.dots[model.chosen];
  const pick = {
    visible: picking,
    x: lerp(c.x, 0, travel),
    y: lerp(c.y, 0, travel),
    r: lerp(SHORT_R, PICK_R, travel),
    chars: Math.round(model.title.length * clamp((p4 - 0.4) / 0.5)),
    morph: easeOutCubic(smoothstep(0, 0.65, p5)), // dot → pill, title → inside
    title: model.title,
  };

  const breathEnd = breathAt(held);
  const breath = since > 0 ? lerp(breathEnd, 1, smoothstep(0, BREATH_RELEASE, since)) : breathEnd;
  const lines = model.shortlist.map((sl, rank) => {
    const end = sl.dot === model.chosen && picking ? pick : model.dots[sl.dot];
    const g0 = 0.06 + rank * 0.025;
    return {
      x1: model.you.x,
      y1: model.you.y,
      x2: end.x,
      y2: end.y,
      grow: easeOutCubic(smoothstep(g0, g0 + 0.35, p3)),
      alpha: LINE_ALPHA * breath * (1 - fade),
    };
  });

  const rAlpha = smoothstep(0.55, 0.85, p3) * (1 - smoothstep(0, 0.25, p4));
  const rLabels = model.shortlist.slice(0, R_LABEL_COUNT).map((sl) => {
    const d = model.dots[sl.dot];
    const len = Math.hypot(d.x - model.you.x, d.y - model.you.y) || 1;
    return {
      text: sl.r.toFixed(2),
      x: d.x,
      y: d.y,
      dx: (d.x - model.you.x) / len, // label sits on the far side from You
      dy: (d.y - model.you.y) / len,
      alpha: rAlpha,
    };
  });

  // Family names step aside once the shortlist takes over (their dots dim too).
  const famAlpha = smoothstep(0.3, 0.9, p2) * (1 - smoothstep(0, 0.35, p3));
  const outline = easeOutCubic(clamp(p1 * 1.6));

  return {
    s,
    hexAlpha: outline * lerp(1, 0.35, fade),
    dots,
    you: { ...model.you, alpha: smoothstep(0.5, 1, p1) * lerp(1, FADED, fade) },
    families: model.families.map((f) => ({ text: f.text, x: f.x, y: f.y, alpha: famAlpha })),
    lines,
    rLabels,
    pick,
  };
}

// Pixel-space label de-overlap: labels keep their x, and any label whose box
// hits an already placed one moves down below it. Pure; boxes are
// { x, y, w, h, fixed? } centred on (x, y); `fixed` boxes are obstacles that
// never move. Returns new objects in input order.
export function stackLabels(labels, gap = 2) {
  const order = labels
    .map((l, i) => i)
    .sort((a, b) => (labels[b].fixed ? 1 : 0) - (labels[a].fixed ? 1 : 0) || labels[a].y - labels[b].y);
  const placed = [];
  const out = labels.map((l) => ({ ...l }));
  for (const i of order) {
    const l = out[i];
    let moved = true;
    while (moved) {
      moved = false;
      for (const p of placed) {
        const overlapX = Math.abs(l.x - p.x) < (l.w + p.w) / 2;
        const overlapY = Math.abs(l.y - p.y) < (l.h + p.h) / 2 + gap;
        if (overlapX && overlapY) {
          l.y = p.y + (l.h + p.h) / 2 + gap;
          moved = true;
        }
      }
    }
    placed.push(l);
  }
  return out;
}
