// Refine shift — the pure half of the scene. A frame is a function of
// (T, model, waiting) only: no accumulation, no canvas, no DOM.
//
// What it shows is the backend's real "No" (POST /api/output/refine): the
// route takes only { outputId } and regenerates from a field family no earlier
// output used — every shown family is excluded, so one "No" rules out a whole
// field, not one job.
//
// A round has two halves, because the product does not know the next pick
// until the response arrives:
//   leave  (LEAVE s)  — the current family is ruled out and the camera pulls
//                       back to the whole hexagon;
//   arrive (ARRIVE s) — the camera flies to the next family and its pick lands.
// Waiting is data, not a renderer branch: with `waiting` the clock holds at
// the end of the last round's leave and only a slow breath of the remaining
// field moves. A `pending` model has that last round without a destination.
//
// Coordinates are unit-hexagon space (riasecPlane). The camera is
// { x, y, zoom } in the same space; project() maps it to pixels.
import { clamp, lerp, mulberry32, smoothstep, stageProgress } from "../timeline";
import { projectRiasec } from "../riasecPlane";

export const DEFAULT_SEED = 923;
export const LEAVE = 0.9; // s
export const ARRIVE = 1.3; // s
export const TRANSITION = LEAVE + ARRIVE; // s of motion per round
const HOLD = 0.6; // s the settled state rests before the next round (autoplay)
export const FIRST_DUR = 1.6;

const JITTER = 0.028; // same scatter as occupation-funnel, so the maps agree
const BASE_ALPHA = 0.16; // every family: a faint cloud
const LIVE_ALPHA = 0.85; // the family the current pick comes from
const OUT_ALPHA = 0.06; // a ruled-out family
const ELLIPSE_SIGMA = 1.2; // outline radius in standard deviations
const ZOOM_MIN = 1.05;
const ZOOM_MAX = 1.35;
const ZOOM_FIT = 0.62; // unit distance that should stay on screen around the centroid
const BASE_R = 0.4; // hexagon radius at zoom 1, as a share of min(width, height)
const OVERVIEW = { x: 0, y: 0, zoom: 1 };
const BREATH_PERIOD = 3.2; // s
const BREATH_LIFT = 0.75; // the remaining field brightens by up to this share

// From this share of the leave on, the family counts as ruled out.
export const RULED_AT = 0.5;

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

// Fallback only — callers pass the live --ease-out token from tokens.css.
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

// The demo fixture (first pick + refineTrace) as the engine's input.
export function traceSource(profile) {
  const labels = new Map(
    [profile.topDirections, ...profile.refineTrace.map((r) => r.topDirections)].flat().map((d) => [d.id, d.label])
  );
  const pick = (c) => ({ soc: c.soc, title: c.title, directionId: c.directionId, label: labels.get(c.directionId) });
  return {
    picks: [profile.chosen, ...profile.refineTrace.map((r) => r.chosen)].map(pick),
    riasecScores: profile.riasecScores,
  };
}

// Static layout: every occupation on the hexagon (seeded jitter) and the
// families visited so far, each with its centroid, outline, pick and camera.
//
// `source` is { picks: [{ soc, title, directionId, label }], riasecScores,
// pending? } — the outputs shown so far, oldest first. `pending` adds one more
// round whose destination is not known yet (a "No" in flight). Returns null
// when a pick is not on the map (an output with no SOC): there is no honest
// scene to draw then.
export function buildModel(occupations, source, { seed = DEFAULT_SEED, ease = EASE_OUT_FALLBACK } = {}) {
  const { picks, riasecScores, pending = false } = source;
  const order = picks.map((p) => p.directionId);

  const rng = mulberry32(seed);
  const dots = occupations.map((o) => {
    const p = projectRiasec(o.riasec);
    const a = rng() * Math.PI * 2;
    const d = JITTER * Math.sqrt(rng());
    return { soc: o.soc, x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, family: order.indexOf(o.directionId) };
  });

  const bySoc = new Map(dots.map((d) => [d.soc, d]));
  if (!picks.length || picks.some((p) => !bySoc.has(p.soc))) return null;

  const families = picks.map((pick, i) => {
    const shape = familyShape(dots.filter((d) => d.family === i));
    const pickDot = bySoc.get(pick.soc);
    const reach = Math.max(shape.rx, Math.hypot(pickDot.x - shape.x, pickDot.y - shape.y)) + 0.08;
    return {
      id: pick.directionId,
      label: pick.label ?? pick.directionId,
      ...shape,
      pick: { soc: pick.soc, title: pick.title, x: pickDot.x, y: pickDot.y },
      camera: { x: shape.x, y: shape.y, zoom: clamp(ZOOM_FIT / reach, ZOOM_MIN, ZOOM_MAX) },
    };
  });

  const rounds = families.length - 1 + (pending ? 1 : 0);
  const stages = [
    { id: "first", label: `First pick · ${families[0].pick.title}`, dur: FIRST_DUR },
    ...Array.from({ length: rounds }, (_, k) => ({
      id: `round${k + 1}`,
      label: `No → ${families[k].label} ruled out`,
      dur: TRANSITION + HOLD,
    })),
  ];

  return { dots, families, rounds, pending, stages, ease, you: projectRiasec(riasecScores) };
}

// Clock time at which round k (1-based) settles / starts. Round 0 = first pick.
export function roundEnd(model, k) {
  return model.stages.slice(0, k + 1).reduce((s, st) => s + st.dur, 0);
}

export const roundStart = (model, k) => roundEnd(model, k - 1);

// Where the last round's leave ends — the point a waiting scene holds at, and
// the point an arriving one resumes from.
export const holdAt = (model) => (model.rounds ? roundStart(model, model.rounds) + LEAVE : roundEnd(model, 0));

// Rounds fully settled at T (0..rounds).
export function settledRounds(T, model) {
  let k = 0;
  while (k < model.rounds && T >= roundEnd(model, k + 1) - 1e-6) k += 1;
  return k;
}

// Exact at both ends: a + (b − a)·1 is not always b in floats, and a camera
// that has "arrived" must sit exactly on its target.
function mix(a, b, e) {
  if (e <= 0) return { x: a.x, y: a.y, zoom: a.zoom };
  if (e >= 1) return { x: b.x, y: b.y, zoom: b.zoom };
  return { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), zoom: lerp(a.zoom, b.zoom, e) };
}

// 0..1, snapped at the ends: (start + LEAVE − start) / LEAVE is 0.999… in
// floats, and "the leave is over" has to mean exactly 1.
const unit = (v) => (v > 1 - 1e-9 ? 1 : v < 1e-9 ? 0 : v);

export function frameAt(T, model, { waiting = false } = {}) {
  const { families, ease, rounds } = model;
  // A pending round has no arrive: the scene can never pass its hold.
  const hold = holdAt(model);
  const holding = (waiting || model.pending) && T > hold;
  const s = holding ? hold : T;
  const held = holding ? T - hold : 0;

  const first = stageProgress(s, model.stages, "first");
  const leaveU = [0];
  const arriveU = [0];
  for (let k = 1; k <= rounds; k += 1) {
    const start = roundStart(model, k);
    leaveU.push(unit((s - start) / LEAVE));
    arriveU.push(unit((s - start - LEAVE) / ARRIVE));
  }

  // Per family: how "live" (bright) and how "out" (dimmed + outlined) it is.
  const state = families.map((f, i) => {
    const arrive = i === 0 ? smoothstep(0, 0.6, first) : smoothstep(0.3, 0.8, arriveU[i]);
    const leave = i + 1 <= rounds ? leaveU[i + 1] : 0;
    const out = smoothstep(0, 0.7, leave);
    return {
      id: f.id,
      label: f.label,
      live: arrive * (1 - out),
      out,
      outline: smoothstep(0.3, 0.9, leave),
      ruledOut: leave >= RULED_AT,
      pill:
        (i === 0 ? smoothstep(0.35, 0.85, first) : smoothstep(0.6, 1, arriveU[i])) *
        (1 - smoothstep(0, 0.4, leave)),
    };
  });

  // While waiting, the families still in play breathe: slowly brighter and
  // back, starting from rest so the hold begins without a jump.
  const breath = (BREATH_LIFT * (1 - Math.cos((2 * Math.PI * held) / BREATH_PERIOD))) / 2;
  const dots = model.dots.map((d) => {
    if (d.family < 0) return { x: d.x, y: d.y, alpha: BASE_ALPHA * (1 + breath), tint: 0 };
    const st = state[d.family];
    const base = lerp(BASE_ALPHA, OUT_ALPHA, st.out);
    return { x: d.x, y: d.y, alpha: lerp(base, LIVE_ALPHA, st.live), tint: st.live };
  });

  // Camera: rests on family k; a round pulls it back to the whole hexagon,
  // then (once there is somewhere to go) flies it to family k + 1.
  let camera = families[0].camera;
  for (let k = 1; k <= rounds; k += 1) {
    if (leaveU[k] <= 0) break;
    camera = mix(families[k - 1].camera, OVERVIEW, ease(leaveU[k]));
    if (arriveU[k] > 0 && families[k]) camera = mix(OVERVIEW, families[k].camera, ease(arriveU[k]));
  }

  const ruledOut = state.filter((st) => st.ruledOut).map((st) => st.id);
  return {
    camera,
    dots,
    you: model.you,
    families: families.map((f, i) => ({ ...f, ...state[i] })),
    ruledOut,
    settled: settledRounds(s, model),
    held,
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

// Pixel-space label de-overlap: labels keep x; one that hits a placed box moves
// below it. Boxes are { x, y, w, h, fixed? } centred on (x, y); fixed boxes
// never move.
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
