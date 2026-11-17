// Roadmap path — pure layout. The accepted occupation's roadmap drawn as one
// line through time: x (or y on a phone) is months from now, each stage is a
// marker at the month it should be done by, and the line waves gently between
// them. Everything here is a function of the stages and the orientation; the
// renderer (RoadmapPath.jsx) only paints it and the reveal clock only clips it.
import { clamp } from "../timeline";
import { RIASEC_NAMES } from "../settle/settleEngine";

// ---------------------------------------------------------------------------
// Timeframes. The AI writes them as free text ("2-3 months", "6 weeks",
// "1 year", "0-3 months of searching", sometimes nothing). A range is its
// midpoint; weeks/days/years convert to months; anything unreadable is a
// default — the axis is an estimate and says so (every label carries "≈").

export const DEFAULT_STAGE_MONTHS = 3;
// Very short stages still get a visible stretch of line.
export const MIN_STAGE_MONTHS = 0.5;
export const MAX_STAGE_MONTHS = 120;

const WORD_NUMBERS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  eighteen: 18,
  twenty: 20,
  couple: 2,
  few: 3,
  several: 4,
};

const MONTHS_PER = { d: 1 / 30.44, w: 12 / 52, m: 1, y: 12 };

const NUMBER = String.raw`(\d+(?:\.\d+)?)`;
const UNIT = String.raw`(days?|weeks?|wks?|w|months?|mos?|mths?|m|years?|yrs?|y)`;
const SPAN = new RegExp(
  String.raw`${NUMBER}\s*(?:(?:-|–|—|to)\s*${NUMBER})?\s*\+?\s*${UNIT}?(?![a-z])`
);

export function parseTimeframeMonths(text) {
  let s = String(text ?? "").toLowerCase().trim();
  if (!s) return DEFAULT_STAGE_MONTHS;
  s = s
    .replace(/half\s+(?:a\s+)?year/g, "6 months")
    .replace(/\ban?\s+(day|week|month|year)\b/g, "1 $1")
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|eighteen|twenty|couple|few|several)\b(?:\s+of)?/g, (w) =>
      String(WORD_NUMBERS[w.split(/\s/)[0]])
    )
    .replace(/(\d),(\d)/g, "$1.$2");

  const match = s.match(SPAN);
  if (!match) return DEFAULT_STAGE_MONTHS;
  const lo = Number(match[1]);
  const hi = match[2] === undefined ? lo : Number(match[2]);
  // No unit right after the number: a later "year" decides, otherwise months.
  const unitWord = match[3] || (/\b(years?|yrs?)\b/.test(s) ? "y" : /\bweeks?\b/.test(s) ? "w" : "m");
  const months = ((lo + hi) / 2) * MONTHS_PER[unitWord[0]];
  if (!Number.isFinite(months) || months <= 0) return DEFAULT_STAGE_MONTHS;
  return clamp(months, MIN_STAGE_MONTHS, MAX_STAGE_MONTHS);
}

// Cumulative schedule: stage i runs from `start` to `end` months from now.
export function scheduleStages(stages = []) {
  let t = 0;
  return stages.map((stage) => {
    const months = parseTimeframeMonths(stage.timeframe);
    const start = t;
    t += months;
    return { start, end: t, months };
  });
}

// ---------------------------------------------------------------------------
// Axis ticks: the smallest round step that keeps the axis to `maxTicks`
// intervals, with a little room after the last stage for the line to run on.

const TICK_STEPS = [1, 2, 3, 6, 12, 24, 36, 60, 120];

export function chooseTicks(totalMonths, maxTicks = 8) {
  const target = Math.max(totalMonths * 1.08, 1);
  let step = TICK_STEPS[TICK_STEPS.length - 1];
  for (const s of TICK_STEPS) {
    if (Math.ceil(target / s) <= maxTicks) {
      step = s;
      break;
    }
  }
  const end = Math.ceil(target / step) * step;
  const months = [];
  for (let m = 0; m <= end; m += step) months.push(m);
  return { step, end, months };
}

export const tickLabel = (month) => (month === 0 ? "now" : `${month}m`);

// "≈3m" — the approximate month a stage should be done by.
export const approxMonths = (months) => `≈${Math.max(1, Math.round(months))}m`;

const STOP_WORDS = new Set(["a", "an", "the", "of", "to", "and", "for", "in", "on", "your", "with", "at", "&"]);

// Two letters for the marker: the first letters of the first two meaningful
// words, or the first two letters of a single word.
export function stageInitials(title) {
  const words = String(title || "")
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}-]/gu, ""))
    .filter((w) => w && !STOP_WORDS.has(w.toLowerCase()));
  if (!words.length) return "··";
  if (words.length === 1) return words[0].replace(/-/g, "").slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function truncate(text, max) {
  const s = String(text || "").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// Geometry. All numbers are CSS px at zoom 1 — the node is drawn 1:1 and
// React Flow scales it. Pills use the mono face, so their width is knowable.

export const HORIZONTAL = {
  plotW: 880,
  padL: 30,
  padR: 18,
  amp: 36,
  period: 600,
  phase: 0.3 * Math.PI,
  r: 15,
  nowR: 6,
  pillH: 26,
  pitch: 36,
  waveGap: 26,
  belowRows: 2,
  maxAboveRows: 10,
  // IBM Plex Mono is 0.6em, but rendered advances measure up to ~0.64em
  // (hinting, DPR); budget for the wide end so text never clips.
  charW: 7.6, // 12px
  pillPadX: 12,
  pillSlack: 6, // borders (1–1.5 px a side) + rounding
  gapX: 10,
  maxTitle: 26,
  top: 12,
  tickSpace: 34,
  maxTicks: 8,
};

export const VERTICAL = {
  plotW: 328,
  tickX: 40,
  waveX: 74,
  amp: 9,
  period: 300,
  phase: 0,
  r: 13,
  nowR: 6,
  labelX: 104,
  pillH: 26,
  pillGap: 8,
  charW: 7.0, // 11px, same budget as above
  pillPadX: 11,
  pillSlack: 6,
  top: 22,
  bottom: 26,
  perStage: 66,
  minLen: 360,
  maxLen: 620,
  maxTicks: 7,
};

// A point on the wave at time-axis coordinate `t` (x when horizontal, y when
// vertical).
export function wavePoint(layout, t) {
  const w = layout.wave;
  const off = w.amp * Math.sin((2 * Math.PI * (t - w.origin)) / w.period + w.phase);
  return layout.orientation === "vertical" ? { x: w.mid + off, y: t } : { x: t, y: w.mid + off };
}

// SVG path along the wave between two time-axis coordinates. Sampled densely
// enough (4 px) that straight segments read as a smooth curve.
export function wavePath(layout, from, to, stepPx = 4) {
  if (!(to > from)) return "";
  const n = Math.max(1, Math.ceil((to - from) / stepPx));
  const parts = [];
  for (let i = 0; i <= n; i += 1) {
    const p = wavePoint(layout, from + ((to - from) * i) / n);
    parts.push(`${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
  }
  return parts.join(" ");
}

// Marker positions along the time axis, pushed apart just enough that the
// circles never touch (display only — the label keeps the true month).
function spreadTrack(raw, start, minGap) {
  const out = [];
  let prev = start;
  raw.forEach((t, i) => {
    const next = Math.max(t, prev + (i === 0 ? minGap * 0.75 : minGap));
    out.push(next);
    prev = next;
  });
  return out;
}

const overlaps = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;

function layoutHorizontal(stages, schedule, ticks) {
  const g = HORIZONTAL;
  const span = g.plotW - g.padL - g.padR;
  const toX = (m) => g.padL + (m / ticks.end) * span;
  const nowX = toX(0);
  const track = spreadTrack(schedule.map((s) => toX(s.end)), nowX, g.r * 2 + 6);
  const endX = Math.max(toX(ticks.end), track.length ? track[track.length - 1] + g.r : nowX);

  // Lay out with the wave's centre at y = 0, then shift everything down.
  const layout = {
    orientation: "horizontal",
    wave: { mid: 0, amp: g.amp, period: g.period, phase: g.phase, origin: nowX },
  };

  const rowCentre = (side, k) => {
    const d = g.amp + g.waveGap + g.pillH / 2 + k * g.pitch;
    return side === "above" ? -d : d;
  };
  const candidates = [];
  for (let k = 0; k < g.maxAboveRows; k += 1) {
    candidates.push({ side: "above", row: k });
    if (k < g.belowRows) candidates.push({ side: "below", row: k });
  }

  const placed = []; // { side, row, x0, x1 }
  const leaders = []; // { side, row, x } — a leader crossing that row
  const labels = [];

  schedule.forEach((s, i) => {
    const text = `${truncate(stages[i].title, g.maxTitle)} · ${approxMonths(s.end)}`;
    const w = Math.round(text.length * g.charW + g.pillPadX * 2 + g.pillSlack);
    const mx = track[i];
    const aligns = [mx - w / 2, mx - g.r, mx + g.r - w];
    const fits = (side, row, x0, strict) => {
      const x1 = x0 + w;
      const sameRow = (p) => p.side === side && p.row === row;
      if (placed.some((p) => sameRow(p) && overlaps(x0 - g.gapX, x1 + g.gapX, p.x0, p.x1))) return false;
      if (!strict) return true;
      if (leaders.some((l) => sameRow(l) && l.x > x0 - 4 && l.x < x1 + 4)) return false;
      return !placed.some((p) => p.side === side && p.row < row && mx > p.x0 - 4 && mx < p.x1 + 4);
    };
    let spot = null;
    for (const strict of [true, false]) {
      for (const c of candidates) {
        if (!strict && c.side === "below") continue;
        for (const a of aligns) {
          const x0 = clamp(a, 0, g.plotW - w);
          if (fits(c.side, c.row, x0, strict)) {
            spot = { ...c, x0 };
            break;
          }
        }
        if (spot) break;
      }
      if (spot) break;
    }
    // Ten rows full is beyond any real roadmap; stack above the last one.
    if (!spot) spot = { side: "above", row: g.maxAboveRows + i, x0: clamp(mx - w / 2, 0, g.plotW - w) };

    placed.push({ side: spot.side, row: spot.row, x0: spot.x0, x1: spot.x0 + w });
    for (let k = 0; k < spot.row; k += 1) leaders.push({ side: spot.side, row: k, x: mx });
    const cy = rowCentre(spot.side, spot.row);
    labels.push({ index: i, text, side: spot.side, row: spot.row, x: spot.x0, y: cy - g.pillH / 2, w, h: g.pillH });
  });

  const markers = schedule.map((s, i) => ({ index: i, ...wavePoint(layout, track[i]) }));
  labels.forEach((l) => {
    const m = markers[l.index];
    l.leader =
      l.side === "above"
        ? { x1: m.x, y1: m.y - g.r, x2: m.x, y2: l.y + l.h }
        : { x1: m.x, y1: m.y + g.r, x2: m.x, y2: l.y };
  });

  // Shift so the highest pill (or the wave crest) sits at `top`.
  const minY = Math.min(-g.amp - g.r, ...labels.map((l) => l.y));
  const dy = g.top - minY;
  const axisY = g.amp + g.waveGap + g.belowRows * g.pitch + 6 + dy;
  layout.wave.mid = dy;
  const shiftY = (o, keys) => keys.forEach((k) => (o[k] += dy));
  labels.forEach((l) => {
    shiftY(l, ["y"]);
    shiftY(l.leader, ["y1", "y2"]);
  });
  markers.forEach((m) => shiftY(m, ["y"]));

  return {
    ...layout,
    width: g.plotW,
    height: Math.round(axisY + g.tickSpace),
    r: g.r,
    nowR: g.nowR,
    now: wavePoint(layout, nowX),
    track: [nowX, ...track, endX],
    axis: { x1: g.padL, y1: axisY, x2: g.plotW - g.padR, y2: axisY },
    ticks: ticks.months.map((m) => ({ month: m, label: tickLabel(m), x: toX(m), y: axisY })),
    markers,
    labels,
  };
}

function layoutVertical(stages, schedule, ticks) {
  const g = VERTICAL;
  const len = clamp(stages.length * g.perStage, g.minLen, g.maxLen);
  const toY = (m) => g.top + (m / ticks.end) * len;
  const nowY = toY(0);
  const track = spreadTrack(schedule.map((s) => toY(s.end)), nowY, g.r * 2 + 4);
  const layout = {
    orientation: "vertical",
    wave: { mid: g.waveX, amp: g.amp, period: g.period, phase: g.phase, origin: nowY },
  };
  const markers = schedule.map((s, i) => ({ index: i, ...wavePoint(layout, track[i]) }));

  const maxW = g.plotW - g.labelX;
  let prevBottom = -Infinity;
  const labels = schedule.map((s, i) => {
    const suffix = ` · ${approxMonths(s.end)}`;
    const room = Math.floor((maxW - g.pillPadX * 2 - g.pillSlack) / g.charW) - suffix.length;
    const text = `${truncate(stages[i].title, room)}${suffix}`;
    const w = Math.min(maxW, Math.round(text.length * g.charW + g.pillPadX * 2 + g.pillSlack));
    const y = Math.max(markers[i].y - g.pillH / 2, prevBottom + g.pillGap);
    prevBottom = y + g.pillH;
    const m = markers[i];
    return {
      index: i,
      text,
      side: "right",
      row: i,
      x: g.labelX,
      y,
      w,
      h: g.pillH,
      leader: { x1: m.x + g.r, y1: m.y, x2: g.labelX, y2: y + g.pillH / 2 },
    };
  });

  const lastTrack = track.length ? track[track.length - 1] : nowY;
  const endY = Math.max(toY(ticks.end), lastTrack + g.r * 2, prevBottom);
  return {
    ...layout,
    width: g.plotW,
    height: Math.round(Math.max(endY, prevBottom) + g.bottom),
    r: g.r,
    nowR: g.nowR,
    now: wavePoint(layout, nowY),
    track: [nowY, ...track, endY],
    axis: { x1: g.tickX, y1: nowY, x2: g.tickX, y2: toY(ticks.end) },
    ticks: ticks.months.map((m) => ({ month: m, label: tickLabel(m), x: g.tickX, y: toY(m) })),
    markers,
    labels,
  };
}

// stages → everything the renderer draws. `orientation` is "horizontal" (the
// desktop graph) or "vertical" (a phone: time runs down the screen).
export function layoutPath(stages = [], { orientation = "horizontal" } = {}) {
  const schedule = scheduleStages(stages);
  const total = schedule.length ? schedule[schedule.length - 1].end : 0;
  const g = orientation === "vertical" ? VERTICAL : HORIZONTAL;
  const ticks = chooseTicks(total, g.maxTicks);
  const base =
    orientation === "vertical"
      ? layoutVertical(stages, schedule, ticks)
      : layoutHorizontal(stages, schedule, ticks);
  base.markers = base.markers.map((m, i) => ({
    ...m,
    id: stages[i].id,
    title: stages[i].title,
    initials: stageInitials(stages[i].title),
    ...schedule[i],
  }));
  return { ...base, totalMonths: total, axisEnd: ticks.end, tickStep: ticks.step };
}

// ---------------------------------------------------------------------------
// Reveal. `frames` are the roadmap clock's per-stage { edge, node, label }
// (motion/roadmap/roadmapTimeline), or null outside a reveal. The line is
// drawn up to the returned time-axis coordinate: stage i's edge window draws
// the stretch into marker i, and the last label's window runs out the tail.
export function revealExtent(layout, frames) {
  const t = layout.track;
  const end = t[t.length - 1];
  if (!frames || !frames.length) return end;
  for (let i = 0; i < frames.length; i += 1) {
    if (frames[i].edge < 1) return t[i] + frames[i].edge * (t[i + 1] - t[i]);
  }
  const last = frames[frames.length - 1];
  const from = t[t.length - 2];
  return from + last.label * (end - from);
}

// "now → ≈3m" for the stage detail.
export function stageWindow({ start, end }) {
  return `${start < 0.25 ? "now" : approxMonths(start)} → ${approxMonths(end)}`;
}

// ---------------------------------------------------------------------------
// Side panel rows.

// Big Five as displayed: Neuroticism shows as Steadiness (100 − N), the same
// convention as bigFiveTakeaways in lifePath.js; the stored score stays raw N.
export function testScoreRows(bigFive) {
  if (!bigFive) return [];
  const v = (x) => Math.round(x ?? 0);
  return [
    { key: "O", label: "Openness", value: v(bigFive.O) },
    { key: "C", label: "Conscientiousness", value: v(bigFive.C) },
    { key: "E", label: "Extraversion", value: v(bigFive.E) },
    { key: "A", label: "Agreeableness", value: v(bigFive.A) },
    { key: "N", label: "Steadiness", value: v(100 - (bigFive.N ?? 50)) },
  ];
}

// The strongest Holland types, highest first (ties keep RIASEC order).
export function topInterestRows(riasec, count = 4) {
  if (!riasec) return [];
  return Object.keys(RIASEC_NAMES)
    .filter((k) => Number.isFinite(riasec[k]))
    .map((k) => ({ key: k, label: RIASEC_NAMES[k], value: Math.round(riasec[k]) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, count);
}
