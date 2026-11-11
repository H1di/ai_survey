// Refine shift — the pure half of the scene. A frame is a function of
// (T, model) only: no accumulation, no canvas, no DOM.
//
// What it shows is the backend's real "No" (POST /api/output/refine): the
// route takes only { outputId } and regenerates from a field family no earlier
// output used — every shown family is excluded, so one "No" rules out a whole
// field, not one job. The trace is demo-profile.json → refineTrace, produced
// by the real ranking code for the dev persona.
//
// Coordinates are unit-hexagon space (kit/riasecPlane). The camera is
// { x, y, zoom } in the same space; project() maps it to pixels.
import { clamp, lerp, mulberry32, smoothstep, stageProgress } from "../kit/timeline";
import { projectRiasec } from "../kit/riasecPlane";

export const DEFAULT_SEED = 923;
export const TRANSITION = 2.2; // s of motion per round
const HOLD = 0.6; // s the settled state rests before the next round (autoplay)
const FIRST_DUR = 1.6;

const JITTER = 0.028; // same scatter as occupation-funnel, so the maps agree
const BASE_ALPHA = 0.16; // every family: a faint cloud
const LIVE_ALPHA = 0.85; // the family the current pick comes from
const OUT_ALPHA = 0.06; // a ruled-out family
const ELLIPSE_SIGMA = 1.2; // outline radius in standard deviations
const ZOOM_MIN = 1.05;
const ZOOM_MAX = 1.35;
const ZOOM_FIT = 0.62; // unit distance that should stay on screen around the centroid
const ZOOM_DIP = 0.12; // the camera pulls back this much mid-flight
const BASE_R = 0.4; // hexagon radius at zoom 1, as a share of min(width, height)

// Thresholds inside a round (u = 0..1 over TRANSITION).
export const RULED_AT = 0.25; // from here the family counts as ruled out

// cubic-bezier(x1, y1, x2, y2) as an easing function t → y. Newton steps on x(s)
// with a bisection fallback; exact at 0 and 1.
export function cubicBezier(x1, y1, x2, y2) {
  const bez = (a, b, s) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  const dBez = (a, b, s) => 3 * a * (1 - s) ** 2 + 6 * (b - a) * s * (1 - s) + 3 * (1 - b) * s * s;
  return (t) => {
    const x = clamp(t);
    if (x === 0 || x === 1) return x;
    let s = x;
    for (let i = 0; i < 8; i += 1) {
      const d = dBez(x1, x2, s);
      if (Math.abs(d) < 1e-6) break;
      s = clamp(s - (bez(x1, x2, s) - x) / d);
    }
    if (Math.abs(bez(x1, x2, s) - x) > 1e-5) {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 40; i += 1) {
        s = (lo + hi) / 2;
        if (bez(x1, x2, s) < x) lo = s;
        else hi = s;
      }
    }
    return bez(y1, y2, s);
  };
}

// "cubic-bezier(0.22, 1, 0.36, 1)" → easing function; null if it is not one.
export function parseCubicBezier(value) {
  const m = /cubic-bezier\(([^)]+)\)/.exec(value ?? "");
  if (!m) return null;
  const n = m[1].split(",").map(Number);
  return n.length === 4 && n.every(Number.isFinite) ? cubicBezier(...n) : null;
}

// Fallback only — Demo.jsx passes the live --ease-out token from tokens.css.
const EASE_OUT_FALLBACK = cubicBezier(0.22, 1, 0.36, 1);

// Mean and covariance of a family's dots → a centroid and a rotated ellipse.
function familyShape(points) {
  const n = points.length;
  const cx = points.reduce((s, p) => s + p.x, 0) / n;
  const cy = points.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.x - cx) ** 2;
    syy += (p.y - cy) ** 2;
    sxy += (p.x - cx) * (p.y - cy);
  }
  sxx /= n;
  syy /= n;
  sxy /= n;
  const mid = (sxx + syy) / 2;
  const diff = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy ** 2);
  return {
    x: cx,
    y: cy,
    rx: ELLIPSE_SIGMA * Math.sqrt(mid + diff),
    ry: ELLIPSE_SIGMA * Math.sqrt(Math.max(0, mid - diff)),
    angle: Math.atan2(2 * sxy, sxx - syy) / 2,
  };
}

// Static layout: every occupation on the hexagon (seeded jitter), the families
// the trace visits in order, each with its centroid, outline, pick and camera.
export function buildModel(occupations, profile, { seed = DEFAULT_SEED, ease = EASE_OUT_FALLBACK } = {}) {
  const picks = [profile.chosen, ...profile.refineTrace.map((r) => r.chosen)];
  const order = picks.map((p) => p.directionId);
  const labels = new Map(
    [profile.topDirections, ...profile.refineTrace.map((r) => r.topDirections)]
      .flat()
      .map((d) => [d.id, d.label])
  );

  const rng = mulberry32(seed);
  const dots = occupations.map((o) => {
    const p = projectRiasec(o.riasec);
    const a = rng() * Math.PI * 2;
    const d = JITTER * Math.sqrt(rng());
    return { soc: o.soc, x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, family: order.indexOf(o.directionId) };
  });

  const families = order.map((id, i) => {
    const shape = familyShape(dots.filter((d) => d.family === i));
    const pickDot = dots.find((d) => d.soc === picks[i].soc);
    const reach = Math.max(shape.rx, Math.hypot(pickDot.x - shape.x, pickDot.y - shape.y)) + 0.08;
    return {
      id,
      label: labels.get(id) ?? id,
      ...shape,
      pick: { soc: picks[i].soc, title: picks[i].title, x: pickDot.x, y: pickDot.y },
      camera: { x: shape.x, y: shape.y, zoom: clamp(ZOOM_FIT / reach, ZOOM_MIN, ZOOM_MAX) },
    };
  });

  const rounds = families.length - 1;
  const stages = [
    { id: "first", label: `First pick · ${families[0].pick.title}`, dur: FIRST_DUR },
    ...families.slice(1).map((f, k) => ({
      id: `round${k + 1}`,
      label: `No → ${families[k].label} ruled out`,
      dur: TRANSITION + HOLD,
    })),
  ];

  return { dots, families, rounds, stages, ease, you: projectRiasec(profile.riasecScores) };
}

// Clock time at which round k (1-based) settles / starts. Round 0 = first pick.
export function roundEnd(model, k) {
  return model.stages.slice(0, k + 1).reduce((s, st) => s + st.dur, 0);
}

export const roundStart = (model, k) => roundEnd(model, k - 1);

// Rounds fully settled at T (0..rounds).
export function settledRounds(T, model) {
  let k = 0;
  while (k < model.rounds && T >= roundEnd(model, k + 1) - 1e-6) k += 1;
  return k;
}

// Motion progress 0..1 of round k at T (the hold after TRANSITION stays at 1).
const roundU = (T, model, k) => clamp((T - roundStart(model, k)) / TRANSITION);

// Camera between family a and b at eased progress e: straight pan, with a
// gentle pull-back in the middle so the move reads as leaving one field.
function flyTo(a, b, e) {
  return {
    x: lerp(a.x, b.x, e),
    y: lerp(a.y, b.y, e),
    zoom: lerp(a.zoom, b.zoom, e) * (1 - ZOOM_DIP * Math.sin(Math.PI * e)),
  };
}

export function frameAt(T, model) {
  const { families, ease } = model;
  const first = stageProgress(T, model.stages, "first");
  const us = families.map((_, i) => (i === 0 ? 0 : roundU(T, model, i)));

  // Per family: how "live" (bright) and how "out" (dimmed + outlined) it is.
  const state = families.map((f, i) => {
    const arrive = i === 0 ? smoothstep(0, 0.6, first) : smoothstep(0.5, 0.9, us[i]);
    const leave = i + 1 < families.length ? us[i + 1] : 0;
    const out = smoothstep(0, 0.45, leave);
    return {
      id: f.id,
      label: f.label,
      live: arrive * (1 - out),
      out,
      outline: smoothstep(0.2, 0.6, leave),
      ruledOut: leave >= RULED_AT,
      pill: (i === 0 ? smoothstep(0.35, 0.85, first) : smoothstep(0.75, 1, us[i])) * (1 - smoothstep(0, 0.25, leave)),
    };
  });

  const dots = model.dots.map((d) => {
    if (d.family < 0) return { x: d.x, y: d.y, alpha: BASE_ALPHA, tint: 0 };
    const s = state[d.family];
    const base = lerp(BASE_ALPHA, OUT_ALPHA, s.out);
    return { x: d.x, y: d.y, alpha: lerp(base, LIVE_ALPHA, s.live), tint: s.live };
  });

  // Camera: rests on family k, flies to k+1 during round k+1's motion.
  let camera = families[0].camera;
  for (let k = 1; k < families.length; k += 1) {
    const u = us[k];
    if (u <= 0) break;
    camera = flyTo(families[k - 1].camera, families[k].camera, ease(clamp((u - 0.1) / 0.8)));
  }

  const ruledOut = state.filter((s) => s.ruledOut).map((s) => s.id);
  return {
    camera,
    dots,
    you: model.you,
    families: families.map((f, i) => ({ ...f, ...state[i] })),
    ruledOut,
    settled: settledRounds(T, model),
  };
}

// Camera → pixel mapping for a width × height viewport. The camera centre
// lands on the viewport centre; `scale` is pixels per unit-hexagon radius.
export function project(camera, width, height) {
  const scale = Math.min(width, height) * BASE_R * camera.zoom;
  return {
    scale,
    X: (x) => width / 2 + (x - camera.x) * scale,
    Y: (y) => height / 2 + (y - camera.y) * scale,
  };
}

// Pixel-space label de-overlap (copied from occupation-funnel — demos do not
// import each other): labels keep x; one that hits a placed box moves below it.
// Boxes are { x, y, w, h, fixed? } centred on (x, y); fixed boxes never move.
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
        // The 1e-6 slack matters: after l.y = p.y + d, float rounding can leave
        // |l.y − p.y| a hair under d, which would re-collide forever.
        if (Math.abs(l.x - p.x) < (l.w + p.w) / 2 && Math.abs(l.y - p.y) < (l.h + p.h) / 2 + gap - 1e-6) {
          l.y = p.y + (l.h + p.h) / 2 + gap;
          moved = true;
        }
      }
    }
    placed.push(l);
  }
  return out;
}
