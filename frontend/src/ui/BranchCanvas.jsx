import { useEffect, useRef } from "react";
import { BRANCH_PRESETS, seedTips, tickTips, tickDrops, samplePath, pathSlice } from "./branchEngine";
import markSvg from "../assets/invector-mark.svg?raw";
import "./ui.css";

// How many frames of growth a reduced-motion viewer sees painted at once —
// roughly one full trunk life, so the still frame reads as a finished branch.
const STATIC_FRAMES = 300;

// Colour roles in a preset are token names; resolve them once per mount.
function resolveColors(opt) {
  const css = getComputedStyle(document.documentElement);
  const read = (name) => css.getPropertyValue(name).trim() || "currentColor";
  const names = [opt.mainHue, opt.branchHue, opt.dropHue, opt.path?.color, opt.path?.accent].filter(Boolean);
  return Object.fromEntries(names.map((name) => [name, read(name)]));
}

// Ink on white: plain source-over strokes, no blur. Butt caps, because the
// segments are contiguous and a round cap would double the alpha at every
// joint and bead the line.
function drawSegments(ctx, segments, colors, alphaScale) {
  ctx.globalCompositeOperation = "source-over";
  ctx.lineCap = "butt";
  for (const s of segments) {
    ctx.globalAlpha = Math.min(1, s.alpha * alphaScale);
    ctx.strokeStyle = colors[s.hue];
    ctx.lineWidth = s.width;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Drops read as small fading ink points, the nodes of the field.
function drawDrops(ctx, drops, dropLife, colors, alphaScale) {
  ctx.globalCompositeOperation = "source-over";
  for (const d of drops) {
    ctx.globalAlpha = Math.min(1, d.life / dropLife) * alphaScale * 1.6;
    ctx.fillStyle = colors[d.hue];
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function strokePolyline(ctx, pts) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

// The one emphasised path: ink up to `accentFrom`, then the accent tip, with
// a point where the two meet. `progress` (0–1) is how much of it is drawn.
function drawPath(ctx, sampled, path, progress, colors) {
  if (!sampled || progress <= 0) return;
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = path.width;
  ctx.strokeStyle = colors[path.color];
  strokePolyline(ctx, pathSlice(sampled, 0, Math.min(progress, path.accentFrom)));
  if (progress > path.accentFrom) {
    ctx.strokeStyle = colors[path.accent];
    ctx.lineWidth = path.width + 0.4;
    strokePolyline(ctx, pathSlice(sampled, path.accentFrom, progress));
    const [joint] = pathSlice(sampled, path.accentFrom, 1);
    ctx.fillStyle = colors[path.accent];
    ctx.beginPath();
    ctx.arc(joint.x, joint.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// The branch: one canvas accumulates the growing line, a second one clears
// every frame for the drifting points. Decorative — hidden from assistive
// tech.
export default function BranchCanvas({ preset = "hero", className = "", reducedMotion = false }) {
  const branchRef = useRef(null);
  const dropRef = useRef(null);

  useEffect(() => {
    const branchCv = branchRef.current;
    const dropCv = dropRef.current;
    if (!branchCv || !dropCv) return undefined;

    const opt = BRANCH_PRESETS[preset] || BRANCH_PRESETS.hero;
    const bctx = branchCv.getContext("2d");
    const dctx = dropCv.getContext("2d");
    if (!bctx || !dctx) return undefined;
    const colors = resolveColors(opt);
    const alphaScale = opt.alphaScale ?? 1;

    let W = 0;
    let H = 0;
    let tips = [];
    let drops = [];
    let restartTimer = 0;
    let raf = 0;
    let sampled = null;
    let pathFrame = 0;
    let pathDone = false;

    const pathProgress = () => {
      if (!sampled) return 0;
      if (pathDone) return 1;
      const t = Math.min(1, Math.max(0, (pathFrame - opt.path.delay) / opt.path.duration));
      return easeInOut(t);
    };

    // The per-frame layer: drifting points plus the path as far as it has got.
    const overlay = (withDrops = true) => {
      dctx.clearRect(0, 0, W, H);
      if (withDrops) drawDrops(dctx, drops, opt.dropLife, colors, alphaScale);
      drawPath(dctx, sampled, opt.path, pathProgress(), colors);
    };

    const paintGround = () => {
      if (opt.bg === "transparent") {
        bctx.clearRect(0, 0, W, H);
      } else {
        bctx.fillStyle = opt.bg;
        bctx.fillRect(0, 0, W, H);
      }
    };

    const sizeCanvas = (cv, ctx) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = (cv.clientWidth || 800) * dpr;
      cv.height = (cv.clientHeight || 400) * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const frame = () => {
      const result = tickTips(tips, opt, W, H);
      tips = result.tips;
      drawSegments(bctx, result.segments, colors, alphaScale);
      drops = tickDrops([...drops, ...result.drops]);
    };

    let sized = false;
    const resize = () => {
      W = branchCv.clientWidth || 800;
      H = branchCv.clientHeight || 400;
      sizeCanvas(branchCv, bctx);
      sizeCanvas(dropCv, dctx);
      paintGround();
      tips = seedTips(opt, W, H);
      drops = [];
      restartTimer = 0;
      sampled = opt.path && W >= opt.path.minWidth ? samplePath(opt.path, W, H) : null;
      // A field that grows only once is repainted finished on a resize (a
      // phone's URL bar fires one on scroll) instead of regrowing.
      const settled = opt.loop === false && sized;
      sized = true;
      if (reducedMotion || settled) {
        for (let i = 0; i < STATIC_FRAMES && tips.length; i += 1) frame();
        // The still frame is the finished field and the whole path; drifting
        // points are motion, so they are left out.
        pathDone = true;
        overlay(false);
      }
    };

    resize();
    window.addEventListener("resize", resize);

    if (!reducedMotion) {
      const loop = () => {
        pathFrame += 1;
        if (sampled && pathProgress() >= 1) pathDone = true;
        if (!tips.length && opt.loop === false) {
          // Grown once and left standing: let the last points fade and the
          // path finish, then stop.
          drops = tickDrops(drops);
          overlay();
          if (drops.length || (sampled && !pathDone)) raf = requestAnimationFrame(loop);
          return;
        }
        if (!tips.length) {
          restartTimer += 1;
          if (restartTimer > opt.pause) {
            restartTimer = 0;
            paintGround();
            tips = seedTips(opt, W, H);
          }
          drops = tickDrops(drops);
          overlay();
        } else {
          restartTimer = 0;
          frame();
          overlay();
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [preset, reducedMotion]);

  const path = (BRANCH_PRESETS[preset] || BRANCH_PRESETS.hero).path;
  const tip = path?.curves[path.curves.length - 1][2];

  return (
    <div className={`branch-canvas ${className}`} aria-hidden="true">
      <canvas ref={branchRef} />
      <canvas ref={dropRef} />
      {tip && (
        <span
          className={`branch-bird ${reducedMotion ? "branch-bird--still" : ""}`}
          style={{ left: `${tip[0] * 100}%`, top: `${tip[1] * 100}%` }}
          // Local, checked-in asset — not user content.
          dangerouslySetInnerHTML={{ __html: markSvg }}
        />
      )}
    </div>
  );
}
