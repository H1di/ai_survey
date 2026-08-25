import { useEffect, useRef } from "react";
import { BRANCH_PRESETS, seedTips, tickTips, tickDrops } from "./branchEngine";
import "./ui.css";

// How many frames of growth a reduced-motion viewer sees painted at once —
// roughly one full trunk life, so the still frame reads as a finished branch.
const STATIC_FRAMES = 300;

function drawSegments(ctx, segments) {
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (const s of segments) {
    const [r, g, b] = s.hue;
    ctx.shadowBlur = s.main ? 26 : 10;
    ctx.shadowColor = `rgba(${r},${g},${b},${s.main ? 0.9 : 0.6})`;
    ctx.strokeStyle = `rgba(${r},${g},${b},${s.alpha})`;
    ctx.lineWidth = s.width;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
}

function drawDrops(ctx, drops, dropLife) {
  ctx.globalCompositeOperation = "lighter";
  for (const d of drops) {
    const [r, g, b] = d.hue;
    const al = Math.min(1, d.life / dropLife);
    const gradient = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r * 5);
    gradient.addColorStop(0, `rgba(${r},${g},${b},${0.9 * al})`);
    gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r * 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.85 * al})`;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

// The glowing branch: one canvas accumulates the growing line, a second one
// clears every frame for the rising light drops. Decorative — hidden from
// assistive tech.
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

    let W = 0;
    let H = 0;
    let tips = [];
    let drops = [];
    let restartTimer = 0;
    let raf = 0;

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
      drawSegments(bctx, result.segments);
      drops = tickDrops([...drops, ...result.drops]);
      dctx.clearRect(0, 0, W, H);
      drawDrops(dctx, drops, opt.dropLife);
    };

    const resize = () => {
      W = branchCv.clientWidth || 800;
      H = branchCv.clientHeight || 400;
      sizeCanvas(branchCv, bctx);
      sizeCanvas(dropCv, dctx);
      paintGround();
      tips = seedTips(opt, W, H);
      drops = [];
      restartTimer = 0;
      if (reducedMotion) {
        for (let i = 0; i < STATIC_FRAMES && tips.length; i += 1) frame();
      }
    };

    resize();
    window.addEventListener("resize", resize);

    if (!reducedMotion) {
      const loop = () => {
        if (!tips.length) {
          restartTimer += 1;
          if (restartTimer > opt.pause) {
            restartTimer = 0;
            paintGround();
            tips = seedTips(opt, W, H);
          }
          dctx.clearRect(0, 0, W, H);
          drops = tickDrops(drops);
          drawDrops(dctx, drops, opt.dropLife);
        } else {
          restartTimer = 0;
          frame();
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

  return (
    <div className={`branch-canvas ${className}`} aria-hidden="true">
      <canvas ref={branchRef} />
      <canvas ref={dropRef} />
    </div>
  );
}
