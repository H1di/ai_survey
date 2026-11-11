// Occupation map — the ambient field behind the hero. All 923 O*NET
// occupations sit at their measured interest profile projected onto the RIASEC
// hexagon; nothing about a dot's place is invented except a few pixels of
// seeded jitter (so identical profiles do not stack) and a tiny orbit.
//
// Pure: every function maps (field, layout, T) → numbers. No tick state, so any
// T is a valid frame and the loop is seamless (orbit periods divide LOOP_S).
import { clamp, mulberry32, smoothstep } from "../kit/timeline";
import { projectRiasec } from "../kit/riasecPlane";

export const LOOP_S = 240;
// One stage: the scene is ambient. The clock still needs a duration to loop.
export const STAGES = [{ id: "field", label: "The measured space of work", dur: LOOP_S }];

// LOOP_S / k for k = 6..12 → 40 s … 20 s, so every orbit closes at T = LOOP_S.
const ORBIT_DIVISORS = [6, 7, 8, 9, 10, 11, 12];
const JITTER_PX = 3;

export const HIGHLIGHT = { slot: 4, fadeIn: 0.5, hold: 2, fadeOut: 0.7 };
export const HIGHLIGHT_VISIBLE = HIGHLIGHT.fadeIn + HIGHLIGHT.hold + HIGHLIGHT.fadeOut;

export const OPACITY = { full: 0.55, masked: 0.2 };
// Plex Mono advance is 0.6 em → an 11 px label is 6.6 px per character.
export const LABEL = { size: 11, charW: 6.6, gap: 8, margin: 12 };
export const MOBILE_MAX_W = 640;

// Per-occupation constants. Everything random comes from one seeded stream in
// file order, so the field is identical on every load.
export function buildField(occupations, seed = 923) {
  const rnd = mulberry32(seed);
  return occupations.map((o) => {
    const p = projectRiasec(o.riasec);
    const ja = rnd() * Math.PI * 2;
    const jr = Math.sqrt(rnd()) * JITTER_PX;
    return {
      title: o.title,
      ux: p.x,
      uy: p.y,
      jx: Math.cos(ja) * jr,
      jy: Math.sin(ja) * jr,
      orbitR: 1.5 + rnd() * 1.5,
      period: LOOP_S / ORBIT_DIVISORS[Math.floor(rnd() * ORBIT_DIVISORS.length)],
      phase: rnd() * Math.PI * 2,
      dir: rnd() < 0.5 ? -1 : 1,
    };
  });
}

// Geometry for a canvas size. Desktop: hero copy in the left 45%, hexagon to
// the right. Mobile: copy in the top 55%, hexagon below (its upper tip runs
// under the copy and is masked).
export function layoutFor(width, height) {
  if (width < MOBILE_MAX_W) {
    const R = Math.min(width * 0.42, height * 0.24);
    return {
      mode: "mobile",
      width,
      height,
      cx: width / 2,
      cy: height - R - 34,
      R,
      copy: { x: 16, y: height * 0.06, w: width - 32, h: height * 0.49 },
    };
  }
  const R = height * 0.4;
  return {
    mode: "desktop",
    width,
    height,
    cx: width * 0.74,
    cy: height / 2,
    R,
    copy: { x: width * 0.06, y: height * 0.22, w: width * 0.39, h: height * 0.56 },
  };
}

export function basePosition(dot, lay) {
  return { x: lay.cx + dot.ux * lay.R + dot.jx, y: lay.cy + dot.uy * lay.R + dot.jy };
}

export function position(field, i, T, lay) {
  const d = field[i];
  const b = basePosition(d, lay);
  const a = d.phase + d.dir * ((2 * Math.PI * T) / d.period);
  return { x: b.x + Math.cos(a) * d.orbitR, y: b.y + Math.sin(a) * d.orbitR };
}

// Soft radial (superelliptic, p = 4) falloff around the copy box. The box's
// corners sit at distance 2^(1/4) ≈ 1.19, so everything inside it is at the
// masked opacity; the field returns to full over the next 0.4.
const MASK_IN = 1.2;
const MASK_OUT = 1.6;
export function maskDistance(x, y, lay) {
  const { copy } = lay;
  const dx = (x - (copy.x + copy.w / 2)) / (copy.w / 2);
  const dy = (y - (copy.y + copy.h / 2)) / (copy.h / 2);
  return (dx ** 4 + dy ** 4) ** 0.25;
}

export function opacityAt(x, y, lay) {
  const t = smoothstep(MASK_IN, MASK_OUT, maskDistance(x, y, lay));
  return OPACITY.masked + (OPACITY.full - OPACITY.masked) * t;
}

// Where a title goes next to its dot: right if it fits, else left. Null when
// it fits on neither side, or would touch the copy or the mask.
export function labelBox(title, x, y, lay) {
  const w = title.length * LABEL.charW;
  const h = LABEL.size + 4;
  const right = x + LABEL.gap;
  const left = x - LABEL.gap - w;
  const side =
    right + w <= lay.width - LABEL.margin ? "right" : left >= LABEL.margin ? "left" : null;
  if (!side || y - h / 2 < LABEL.margin || y + h / 2 > lay.height - LABEL.margin) return null;
  const box = { side, x: side === "right" ? right : left, y: y - h / 2, w, h };
  const corners = [
    [box.x, box.y],
    [box.x + box.w, box.y],
    [box.x, box.y + box.h],
    [box.x + box.w, box.y + box.h],
  ];
  // Orbit moves the dot ≤ 3 px; demand the whole label clears the falloff.
  if (corners.some(([cx, cy]) => maskDistance(cx, cy, lay) < MASK_OUT)) return null;
  return box;
}

// Seeded highlight order for a layout: a fixed shuffle of all occupations,
// filtered to those whose dot and label sit fully in the clear area.
export function highlightOrder(field, lay, seed = 2026) {
  const rnd = mulberry32(seed);
  const idx = field.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.filter((i) => {
    const b = basePosition(field[i], lay);
    return opacityAt(b.x, b.y, lay) >= OPACITY.full && labelBox(field[i].title, b.x, b.y, lay);
  });
}

// The one occupation highlighted at T, or null. Slot k (k·slot … (k+1)·slot)
// shows order[k]: fade in, hold, fade out, then a gap — the visible window is
// shorter than the slot, so two highlights can never overlap.
export function highlightAt(T, order, reducedMotion = false) {
  if (reducedMotion || order.length === 0) return null;
  const t = ((T % LOOP_S) + LOOP_S) % LOOP_S;
  const k = Math.floor(t / HIGHLIGHT.slot);
  const local = t - k * HIGHLIGHT.slot;
  if (local >= HIGHLIGHT_VISIBLE) return null;
  const alpha =
    local < HIGHLIGHT.fadeIn
      ? smoothstep(0, HIGHLIGHT.fadeIn, local)
      : 1 - smoothstep(HIGHLIGHT.fadeIn + HIGHLIGHT.hold, HIGHLIGHT_VISIBLE, local);
  if (alpha <= 0) return null;
  return { index: order[k % order.length], alpha: clamp(alpha) };
}

// Nearest dot within `radius` px of the pointer, restricted to the clear area
// (under the copy the pointer belongs to the text).
export function nearestDot(positions, px, py, lay, radius = 12) {
  let best = -1;
  let bestD = radius * radius;
  for (let i = 0; i < positions.length; i += 2) {
    const dx = positions[i] - px;
    const dy = positions[i + 1] - py;
    const d = dx * dx + dy * dy;
    if (d <= bestD) {
      bestD = d;
      best = i / 2;
    }
  }
  if (best < 0) return -1;
  return opacityAt(positions[best * 2], positions[best * 2 + 1], lay) >= OPACITY.full ? best : -1;
}

// Opacity quantised to a few buckets so the painter fills one path per bucket.
export const BUCKETS = 8;
export function bucketOf(opacity) {
  const t = (opacity - OPACITY.masked) / (OPACITY.full - OPACITY.masked);
  return Math.round(clamp(t) * (BUCKETS - 1));
}
export const bucketOpacity = (b) =>
  OPACITY.masked + ((OPACITY.full - OPACITY.masked) * b) / (BUCKETS - 1);
