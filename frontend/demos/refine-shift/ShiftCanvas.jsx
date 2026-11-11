// Thin painter for shiftEngine frames. No timing logic: it maps the frame's
// camera to pixels (project) and draws. Reduced motion swaps the camera move
// for a crossfade: on a state change the previous frame is copied to a ghost
// canvas that fades out over the new one.
import { useEffect, useRef, useState } from "react";
import { setupCanvas } from "../kit/setupCanvas";
import { HEX_VERTICES } from "../kit/riasecPlane";
import { project, stackLabels } from "./shiftEngine";

// tokens.css is the only place a colour is defined; canvas reads it at draw time.
function readTokens() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  return {
    gold: v("--gold"),
    gold60: v("--gold-60"),
    gold70: v("--gold-70"),
    bone: v("--bone"),
    text30: v("--text-30"),
    text45: v("--text-45"),
    void: v("--ink-void"),
    mono: v("--font-mono"),
    body: v("--font-body"),
  };
}

const ALPHA_STEPS = 64;
const DOT_R = 1.6;
const LIVE_R = 2.1;
const PILL_H = 26;
const PILL_PAD_X = 13;
const EDGE = 10; // px a pill keeps from the canvas edge
const CROSSFADE_MS = 420;

// 923 dots: one path per (colour, quantised alpha, radius) bucket.
function drawDots(ctx, dots, X, Y, tk) {
  const buckets = new Map();
  const add = (color, alpha, r, d) => {
    const q = Math.round(alpha * ALPHA_STEPS);
    if (q <= 0) return;
    const key = `${color}|${q}|${r}`;
    if (!buckets.has(key)) buckets.set(key, { color, alpha: q / ALPHA_STEPS, r, dots: [] });
    buckets.get(key).dots.push(d);
  };
  for (const d of dots) {
    const r = d.tint > 0.5 ? LIVE_R : DOT_R;
    if (d.tint < 1) add(tk.bone, d.alpha * (1 - d.tint), r, d);
    if (d.tint > 0) add(tk.gold60, d.alpha * d.tint, r, d);
  }
  for (const b of buckets.values()) {
    ctx.globalAlpha = b.alpha;
    ctx.fillStyle = b.color;
    ctx.beginPath();
    for (const d of b.dots) {
      const x = X(d.x);
      const y = Y(d.y);
      ctx.moveTo(x + b.r, y);
      ctx.arc(x, y, b.r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Text with a black knockout so it stays legible over the dot cloud.
function label(ctx, text, x, y, color, tk) {
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = tk.void;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function paint(canvas, f) {
  const { ctx, width, height } = setupCanvas(canvas);
  const tk = readTokens();
  ctx.clearRect(0, 0, width, height);
  const { X, Y, scale } = project(f.camera, width, height);
  ctx.textBaseline = "middle";

  // Hexagon + type letters.
  ctx.strokeStyle = tk.text30;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  HEX_VERTICES.forEach((v, i) => (i ? ctx.lineTo(X(v.x), Y(v.y)) : ctx.moveTo(X(v.x), Y(v.y))));
  ctx.closePath();
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = tk.text30;
  ctx.font = `500 11px ${tk.mono}`;
  ctx.textAlign = "center";
  HEX_VERTICES.forEach((v) => ctx.fillText(v.key, X(v.x) + v.x * 15, Y(v.y) + v.y * 15));

  drawDots(ctx, f.dots, X, Y, tk);

  // Ruled-out outlines: thin dashed ellipse around the family's cloud.
  ctx.setLineDash([3, 4]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = tk.text45;
  for (const fam of f.families) {
    if (fam.outline <= 0) continue;
    ctx.globalAlpha = fam.outline;
    ctx.beginPath();
    ctx.ellipse(X(fam.x), Y(fam.y), fam.rx * scale, Math.max(2, fam.ry * scale), fam.angle, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // You.
  ctx.strokeStyle = tk.gold;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(X(f.you.x), Y(f.you.y), 5, 0, Math.PI * 2);
  ctx.stroke();

  // Pills first (they win the space), then family labels stacked clear of them.
  ctx.font = `600 13px ${tk.body}`;
  const pills = [];
  for (const fam of f.families) {
    if (fam.pill <= 0) continue;
    const w = ctx.measureText(fam.pick.title).width + PILL_PAD_X * 2;
    const ax = X(fam.pick.x);
    const ay = Y(fam.pick.y);
    const px = Math.min(width - EDGE - w / 2, Math.max(EDGE + w / 2, ax));
    // Hang the pill on the side of its dot away from YOU, so it never hides it.
    const side = Y(f.you.y) < ay - 4 ? 1 : -1;
    pills.push({ fam, ax, ay, side, x: px, y: ay + side * (PILL_H / 2 + 8), w, h: PILL_H });
  }
  const hits = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
  let you = { x: X(f.you.x) + 18, y: Y(f.you.y) + 12, w: 24, h: 12 };
  if (pills.some((p) => hits(p, you))) you = { ...you, y: Y(f.you.y) - 12 };

  ctx.font = `500 10px ${tk.mono}`;
  const famLabels = f.families
    .filter((fam) => fam.live > 0 || fam.outline > 0)
    .map((fam) => {
      const text = fam.label.toUpperCase();
      const w = Math.max(ctx.measureText(text).width, ctx.measureText("RULED OUT").width) + 8;
      // Above the cloud's top edge (bounding box of the rotated ellipse).
      const top = Math.hypot(fam.rx * Math.sin(fam.angle), fam.ry * Math.cos(fam.angle));
      return { fam, text, x: X(fam.x), y: Math.max(16, Y(fam.y - top) - 14), w, h: 26 };
    });
  const placed = stackLabels([
    ...pills.map((p) => ({ ...p, fixed: true })),
    { ...you, fixed: true },
    ...famLabels,
  ], 6).slice(pills.length + 1);

  ctx.textAlign = "center";
  for (const b of placed) {
    const { fam } = b;
    const x = Math.min(width - EDGE - b.w / 2, Math.max(EDGE + b.w / 2, b.x));
    if (fam.live > 0) {
      ctx.globalAlpha = fam.live;
      label(ctx, b.text, x, b.y - 6, tk.gold70, tk);
    }
    if (fam.outline > 0) {
      ctx.globalAlpha = fam.outline;
      label(ctx, b.text, x, b.y - 6, tk.text45, tk);
      label(ctx, "RULED OUT", x, b.y + 7, tk.text30, tk);
    }
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
  label(ctx, "YOU", you.x - you.w / 2, you.y, tk.gold, tk);

  // The pick: gold pill above its occupation's dot, tied by a short stem.
  for (const p of pills) {
    const a = p.fam.pill;
    const grow = 0.92 + 0.08 * a; // settles in place; no bounce
    const w = p.w * grow;
    const h = p.h * grow;
    ctx.globalAlpha = a;
    ctx.strokeStyle = tk.gold;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.ax, p.ay);
    ctx.lineTo(p.ax, p.y - (p.side * h) / 2);
    ctx.stroke();
    ctx.fillStyle = tk.gold;
    ctx.beginPath();
    ctx.arc(p.ax, p.ay, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(p.x - w / 2, p.y - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = tk.void;
    ctx.font = `600 13px ${tk.body}`;
    ctx.textAlign = "center";
    ctx.fillText(p.fam.pick.title, p.x, p.y + 0.5);
  }
  ctx.globalAlpha = 1;
}

export default function ShiftCanvas({ frame, stateKey, crossfade, ariaLabel }) {
  const canvasRef = useRef(null);
  const ghostRef = useRef(null);
  const lastKey = useRef(stateKey);
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
    const ghost = ghostRef.current;
    if (crossfade && lastKey.current !== stateKey && canvas.width > 0) {
      ghost.width = canvas.width;
      ghost.height = canvas.height;
      ghost.getContext("2d").drawImage(canvas, 0, 0);
      ghost.style.transition = "none";
      ghost.style.opacity = "1";
      void ghost.offsetWidth; // commit opacity 1 before transitioning away
      ghost.style.transition = `opacity ${CROSSFADE_MS}ms var(--ease-out)`;
      ghost.style.opacity = "0";
    }
    lastKey.current = stateKey;
    paint(canvas, frame);
  }, [frame, stateKey, crossfade, size, fontsReady]);

  return (
    <div className="shift-canvas-box">
      <canvas ref={canvasRef} className="shift-canvas" role="img" aria-label={ariaLabel} />
      <canvas ref={ghostRef} className="shift-ghost" aria-hidden="true" />
    </div>
  );
}
