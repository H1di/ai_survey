// Painter for the emblem. drawEmblem is shared by the live canvas and the
// 1080×1350 PNG export, so the saved file is exactly the final frame.
import { useEffect, useRef, useState } from "react";
import { setupCanvas } from "../kit/setupCanvas";
import { LAYOUT } from "./emblemEngine";

export function readTokens() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  return {
    bg: v("--ink-page"),
    gold: v("--gold"),
    gold70: v("--gold-70"),
    gold40: v("--gold-40"),
    gold15: v("--gold-15"),
    goldWash: v("--gold-wash"),
    bone: v("--bone"),
    bone50: v("--bone-50"),
    bone40: v("--bone-40"),
    text60: v("--text-60"),
    mono: v("--font-mono"),
    body: v("--font-body"),
  };
}

// Stroke the first `fraction` of an open polyline's length.
function strokePartial(ctx, pts, fraction) {
  if (fraction <= 0) return;
  const lens = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
  let budget = fraction * lens.reduce((s, l) => s + l, 0);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < lens.length && budget > 0; i += 1) {
    const t = Math.min(1, budget / lens[i]);
    ctx.lineTo(pts[i].x + (pts[i + 1].x - pts[i].x) * t, pts[i].y + (pts[i + 1].y - pts[i].y) * t);
    budget -= lens[i];
  }
  ctx.stroke();
}

// Canvas arcs measure from +x; the engine measures from "up", clockwise.
const toCanvas = (a) => a - Math.PI / 2;

function circle(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}

// Draw the emblem centred on (cx, cy) with unit radius R px.
export function drawEmblem(ctx, { cx, cy, R, emblem, frame, tk }) {
  const lw = Math.max(1, R / 150);
  const at = (a, r) => ({ x: cx + Math.sin(a) * r * R, y: cy - Math.cos(a) * r * R });
  const fontPx = Math.max(9, Math.round(R * 0.052));
  ctx.font = `500 ${fontPx}px ${tk.mono}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // --- Inner layer: Big Five lobes over a two-circle scale (50 / 100). ---
  ctx.globalAlpha = frame.scaleAlpha;
  ctx.strokeStyle = tk.gold15;
  ctx.lineWidth = lw;
  const mid = LAYOUT.lobeMin + (LAYOUT.lobeMax - LAYOUT.lobeMin) / 2;
  circle(ctx, cx, cy, mid * R);
  circle(ctx, cx, cy, LAYOUT.lobeMax * R);
  emblem.lobes.forEach((l) => {
    const p = at(l.angle, LAYOUT.lobeMax);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  });

  emblem.lobes.forEach((l, i) => {
    const f = frame.lobes[i];
    if (f <= 0) return;
    const pts = l.points.map((p) => ({ x: cx + p.x * R, y: cy + p.y * R }));
    if (f >= 1) {
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = tk.bone;
      ctx.beginPath();
      pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = tk.bone;
    ctx.lineWidth = lw * 1.25;
    strokePartial(ctx, pts, f);
    ctx.globalAlpha = f;
    ctx.fillStyle = tk.bone50;
    const lp = at(l.angle, (LAYOUT.lobeMax + LAYOUT.ringBase) / 2);
    ctx.fillText(l.abbr, lp.x, lp.y);
  });

  // --- Middle ring: six RIASEC segments; the code letters in gold. ---
  ctx.globalAlpha = frame.ringAlpha;
  ctx.strokeStyle = tk.gold15;
  ctx.lineWidth = lw;
  circle(ctx, cx, cy, LAYOUT.ringBase * R);

  emblem.segments.forEach((g, i) => {
    const f = frame.segments[i];
    if (f <= 0) return;
    const a0 = toCanvas(g.start);
    const a1 = toCanvas(g.start + (g.end - g.start) * f);
    const inCode = g.codeRank >= 0;
    ctx.beginPath();
    ctx.arc(cx, cy, g.inner * R, a0, a1);
    ctx.arc(cx, cy, g.outer * R, a1, a0, true);
    ctx.closePath();
    ctx.globalAlpha = 1;
    if (inCode) {
      ctx.fillStyle = tk.goldWash;
      ctx.fill();
    }
    ctx.strokeStyle = inCode ? tk.gold : tk.bone40;
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.globalAlpha = f;
    ctx.fillStyle = inCode ? tk.gold : tk.bone40;
    const lp = at(g.mid, LAYOUT.ringBase + LAYOUT.ringMax + 0.05);
    ctx.fillText(g.key, lp.x, lp.y);
  });

  // --- Outer ring: graduated circle + six work-value ticks, length by rank. ---
  ctx.globalAlpha = frame.tickAlpha;
  ctx.strokeStyle = tk.gold15;
  ctx.lineWidth = lw;
  circle(ctx, cx, cy, LAYOUT.tickBase * R);
  for (let k = 0; k < 60; k += 1) {
    const a = emblem.rotation + (k * Math.PI * 2) / 60;
    const p0 = at(a, LAYOUT.tickBase);
    const p1 = at(a, LAYOUT.tickBase + (k % 5 === 0 ? 0.028 : 0.014));
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }

  emblem.ticks.forEach((t, i) => {
    const f = frame.ticks[i];
    if (f <= 0) return;
    const lead = t.rank === 1;
    const p0 = at(t.angle, t.inner);
    const p1 = at(t.angle, t.inner + (t.outer - t.inner) * f);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = lead ? tk.gold : tk.bone;
    ctx.lineWidth = lw * 1.5;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
    ctx.globalAlpha = f;
    ctx.fillStyle = lead ? tk.gold : tk.bone50;
    const lp = at(t.angle, t.outer + 0.06);
    ctx.fillText(t.abbr, lp.x, lp.y);
  });

  ctx.globalAlpha = 1;
}

// Unit radius for a square canvas of side `size`: leaves room for the outer
// labels (tick tips reach ~0.95, labels sit 0.06 past them).
export const radiusFor = (size) => size * 0.43;

export default function EmblemCanvas({ emblem, frame, ariaLabel }) {
  const canvasRef = useRef(null);
  const [size, setSize] = useState(null);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => setSize(entry.contentRect.width));
    ro.observe(canvasRef.current);
    document.fonts?.ready.then(() => setFontsReady(true));
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size) return;
    const { ctx, width, height } = setupCanvas(canvas);
    ctx.clearRect(0, 0, width, height);
    drawEmblem(ctx, { cx: width / 2, cy: height / 2, R: radiusFor(width), emblem, frame, tk: readTokens() });
  }, [emblem, frame, size, fontsReady]);

  return <canvas ref={canvasRef} className="emb-canvas" role="img" aria-label={ariaLabel} />;
}
