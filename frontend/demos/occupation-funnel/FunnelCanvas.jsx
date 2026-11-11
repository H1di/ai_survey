// Thin painter for funnelEngine frames. No timing logic lives here: it maps
// unit-hexagon coordinates to pixels and draws what frameAt() returned.
import { useEffect, useRef, useState } from "react";
import { setupCanvas } from "../kit/setupCanvas";
import { HEX_VERTICES } from "../kit/riasecPlane";
import { stackLabels } from "./funnelEngine";

// tokens.css is the only place a colour is defined; canvas reads it at draw time.
function readTokens() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  return {
    gold: v("--gold"),
    gold60: v("--gold-60"),
    gold70: v("--gold-70"),
    gold40: v("--gold-40"),
    bone: v("--bone"),
    text30: v("--text-30"),
    void: v("--ink-void"),
    screen: v("--ink-screen"),
    mono: v("--font-mono"),
    body: v("--font-body"),
  };
}

const ALPHA_STEPS = 64;
const PILL_PAD_X = 16;
const PILL_H = 28;
const TITLE_GAP = 22; // px between the travelling dot and its title, stage 4

// 923 tiny dots: one path per (colour, quantised alpha) bucket instead of one
// fill per dot — the difference between 60 fps and not on a mid phone.
function drawDots(ctx, dots, X, Y, tk) {
  const buckets = new Map();
  const add = (color, alpha, d) => {
    const q = Math.round(alpha * ALPHA_STEPS);
    if (q <= 0) return;
    const key = `${color}|${q}`;
    if (!buckets.has(key)) buckets.set(key, { color, alpha: q / ALPHA_STEPS, dots: [] });
    buckets.get(key).dots.push(d);
  };
  for (const d of dots) {
    if (d.tint < 1) add(tk.bone, d.alpha * (1 - d.tint), d);
    if (d.tint > 0) add(tk.gold60, d.alpha * d.tint, d);
  }
  for (const b of buckets.values()) {
    ctx.globalAlpha = b.alpha;
    ctx.fillStyle = b.color;
    ctx.beginPath();
    for (const d of b.dots) {
      const x = X(d.x);
      const y = Y(d.y);
      ctx.moveTo(x + d.r, y);
      ctx.arc(x, y, d.r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Text with a black knockout so it stays legible over the dot cloud.
function label(ctx, text, x, y, color, tk) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = tk.void;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function paint(canvas, f) {
  const { ctx, width, height } = setupCanvas(canvas);
  const tk = readTokens();
  ctx.clearRect(0, 0, width, height);

  const R = Math.min(width, height) * 0.4;
  const cx = width / 2;
  const cy = height / 2;
  const X = (x) => cx + x * R;
  const Y = (y) => cy + y * R;
  ctx.textBaseline = "middle";

  // Hexagon + type letters.
  ctx.globalAlpha = f.hexAlpha;
  ctx.strokeStyle = tk.text30;
  ctx.lineWidth = 1;
  ctx.beginPath();
  HEX_VERTICES.forEach((v, i) => (i ? ctx.lineTo(X(v.x), Y(v.y)) : ctx.moveTo(X(v.x), Y(v.y))));
  ctx.closePath();
  ctx.globalAlpha = f.hexAlpha * 0.5;
  ctx.stroke();
  ctx.globalAlpha = f.hexAlpha;
  ctx.fillStyle = tk.text30;
  ctx.font = `500 11px ${tk.mono}`;
  ctx.textAlign = "center";
  HEX_VERTICES.forEach((v) => ctx.fillText(v.key, cx + v.x * (R + 15), cy + v.y * (R + 15)));

  // You → shortlist lines, under the dots.
  ctx.strokeStyle = tk.gold40;
  ctx.lineWidth = 0.75;
  for (const l of f.lines) {
    if (l.grow <= 0 || l.alpha <= 0) continue;
    ctx.globalAlpha = l.alpha;
    ctx.beginPath();
    ctx.moveTo(X(l.x1), Y(l.y1));
    ctx.lineTo(X(l.x1 + (l.x2 - l.x1) * l.grow), Y(l.y1 + (l.y2 - l.y1) * l.grow));
    ctx.stroke();
  }

  drawDots(ctx, f.dots, X, Y, tk);

  // You.
  if (f.you.alpha > 0) {
    ctx.globalAlpha = f.you.alpha;
    ctx.strokeStyle = tk.gold;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(X(f.you.x), Y(f.you.y), 5.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `500 10px ${tk.mono}`;
    ctx.textAlign = "left";
    label(ctx, "YOU", X(f.you.x) + 10, Y(f.you.y) - 10, tk.gold, tk);
  }

  // Family names at their centroids, de-overlapped in pixel space.
  if (f.families[0].alpha > 0) {
    ctx.font = `500 10px ${tk.mono}`;
    ctx.textAlign = "center";
    const boxes = stackLabels(
      f.families.map((fam) => ({ ...fam, x: X(fam.x), y: Y(fam.y), w: ctx.measureText(fam.text).width + 8, h: 12 }))
    );
    for (const b of boxes) {
      ctx.globalAlpha = b.alpha;
      label(ctx, b.text, b.x, b.y, tk.gold70, tk);
    }
  }

  // Pearson r beside the five closest, on the side away from You, kept clear
  // of each other and of the YOU label.
  if (f.rLabels[0]?.alpha > 0) {
    ctx.font = `400 10px ${tk.mono}`;
    ctx.textAlign = "center";
    const youBox = { x: X(f.you.x) + 19, y: Y(f.you.y) - 10, w: 26, h: 12, fixed: true };
    const boxes = stackLabels([
      youBox,
      ...f.rLabels.map((r) => {
        const w = ctx.measureText(r.text).width + 4;
        const ax = X(r.x) + r.dx * 8;
        return { ...r, x: ax + (r.dx >= 0 ? w / 2 : -w / 2), y: Y(r.y) + r.dy * 8, w, h: 12 };
      }),
    ]).slice(1);
    for (const b of boxes) {
      ctx.globalAlpha = b.alpha;
      label(ctx, b.text, b.x, b.y, tk.gold, tk);
    }
  }

  // The pick: a dot that travels to the centre, then becomes the output pill.
  const p = f.pick;
  if (p.visible) {
    const px = X(p.x);
    const py = Y(p.y);
    ctx.font = `600 14px ${tk.body}`;
    const textW = ctx.measureText(p.title).width;
    const m = p.morph;
    const w = p.r * 2 + (textW + PILL_PAD_X * 2 - p.r * 2) * m;
    const h = p.r * 2 + (PILL_H - p.r * 2) * m;

    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.roundRect(px - w / 2, py - h / 2, w, h, h / 2);
    ctx.fillStyle = tk.gold;
    ctx.globalAlpha = 1 - m;
    ctx.fill();
    ctx.fillStyle = tk.screen;
    ctx.globalAlpha = m;
    ctx.fill();
    ctx.strokeStyle = tk.gold60;
    ctx.lineWidth = 1;
    ctx.stroke();

    if (p.chars > 0) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = tk.bone;
      ctx.textAlign = "left";
      // Laid out against the full title so typing never shifts the line.
      ctx.fillText(p.title.slice(0, p.chars), px - textW / 2, py + TITLE_GAP * (1 - m));
    }
  }
  ctx.globalAlpha = 1;
}

export default function FunnelCanvas({ frame, ariaLabel }) {
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
    if (canvasRef.current && size) paint(canvasRef.current, frame);
  }, [frame, size, fontsReady]);

  return <canvas ref={canvasRef} className="funnel-canvas" role="img" aria-label={ariaLabel} />;
}
