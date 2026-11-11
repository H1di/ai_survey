// Painter for the occupation map. Geometry, timing and the mask live in
// mapEngine.js; this file turns one frame into canvas calls and owns only view
// state (size, fonts, hovered dot).
import { useEffect, useMemo, useRef, useState } from "react";
import { setupCanvas } from "../kit/setupCanvas";
import { HEX_VERTICES } from "../kit/riasecPlane";
import {
  BUCKETS,
  LABEL,
  OPACITY,
  basePosition,
  bucketOf,
  bucketOpacity,
  highlightAt,
  highlightOrder,
  labelBox,
  layoutFor,
  nearestDot,
  opacityAt,
  position,
} from "./mapEngine";

function readTokens() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  return { ink: v("--ink-page"), bone: v("--bone"), gold: v("--gold"), text30: v("--text-30"), text72: v("--text-72"), mono: v("--font-mono") };
}

// Rolling draw-time sample for the perf report (read via window.__occupationMapPerf).
function recordDraw(ms) {
  const perf = (window.__occupationMapPerf ??= { samples: [] });
  perf.samples.push(ms);
  if (perf.samples.length > 600) perf.samples.shift();
}

const HEX_SUBDIV = 12;

// `children` is the hero copy; it is placed in the layout's copy box, the same
// box the mask is built around.
export default function MapCanvas({ field, T, reducedMotion, ariaLabel, children }) {
  const canvasRef = useRef(null);
  const posRef = useRef(null);
  const [size, setSize] = useState(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [hover, setHover] = useState(-1);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    ro.observe(canvas);
    document.fonts?.ready.then(() => setFontsReady(true));
    return () => ro.disconnect();
  }, []);

  // Everything that depends only on the canvas size, not on T.
  const scene = useMemo(() => {
    if (!size) return null;
    const lay = layoutFor(size.width, size.height);
    const buckets = Array.from({ length: BUCKETS }, () => []);
    field.forEach((d, i) => {
      const b = basePosition(d, lay);
      buckets[bucketOf(opacityAt(b.x, b.y, lay))].push(i);
    });
    return { lay, buckets, order: highlightOrder(field, lay) };
  }, [field, size]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene) return;
    const t0 = performance.now();
    const { ctx, width, height } = setupCanvas(canvas);
    const tk = readTokens();
    const { lay, buckets, order } = scene;
    const dotR = lay.mode === "mobile" ? 1.15 : 1.4;

    ctx.clearRect(0, 0, width, height);

    const pos = posRef.current?.length === field.length * 2 ? posRef.current : new Float32Array(field.length * 2);
    for (let i = 0; i < field.length; i += 1) {
      const p = position(field, i, T, lay);
      pos[i * 2] = p.x;
      pos[i * 2 + 1] = p.y;
    }
    posRef.current = pos;

    // Dots: one path per opacity bucket.
    ctx.fillStyle = tk.bone;
    buckets.forEach((members, b) => {
      if (members.length === 0) return;
      ctx.globalAlpha = bucketOpacity(b);
      ctx.beginPath();
      for (const i of members) {
        const x = pos[i * 2];
        const y = pos[i * 2 + 1];
        ctx.moveTo(x + dotR, y);
        ctx.arc(x, y, dotR, 0, Math.PI * 2);
      }
      ctx.fill();
    });

    // Hexagon outline + letters, faded by the same mask as the dots.
    const pts = HEX_VERTICES.map((v) => ({ x: lay.cx + v.x * lay.R, y: lay.cy + v.y * lay.R }));
    ctx.strokeStyle = tk.text30;
    ctx.lineWidth = 0.75;
    pts.forEach((a, k) => {
      const b = pts[(k + 1) % pts.length];
      for (let s = 0; s < HEX_SUBDIV; s += 1) {
        const x0 = a.x + ((b.x - a.x) * s) / HEX_SUBDIV;
        const y0 = a.y + ((b.y - a.y) * s) / HEX_SUBDIV;
        const x1 = a.x + ((b.x - a.x) * (s + 1)) / HEX_SUBDIV;
        const y1 = a.y + ((b.y - a.y) * (s + 1)) / HEX_SUBDIV;
        ctx.globalAlpha = 0.6 * (opacityAt((x0 + x1) / 2, (y0 + y1) / 2, lay) / OPACITY.full);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
    });
    ctx.fillStyle = tk.text30;
    ctx.font = `500 11px ${tk.mono}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    HEX_VERTICES.forEach((v) => {
      const x = lay.cx + v.x * (lay.R + 16);
      const y = lay.cy + v.y * (lay.R + 16);
      ctx.globalAlpha = opacityAt(x, y, lay) / OPACITY.full;
      ctx.fillText(v.key, x, y);
    });

    // One named occupation at a time: the hovered dot wins over the schedule.
    const h = hover >= 0 ? { index: hover, alpha: 1 } : highlightAt(T, order, reducedMotion);
    if (h) {
      const x = pos[h.index * 2];
      const y = pos[h.index * 2 + 1];
      const title = field[h.index].title;
      ctx.globalAlpha = h.alpha;
      ctx.fillStyle = tk.gold;
      ctx.beginPath();
      ctx.arc(x, y, dotR + 1.1, 0, Math.PI * 2);
      ctx.fill();
      const box = labelBox(title, x, y, lay);
      const right = box ? box.side === "right" : x < width / 2;
      ctx.fillStyle = tk.text72;
      ctx.font = `400 ${LABEL.size}px ${tk.mono}`;
      ctx.textAlign = right ? "left" : "right";
      // A page-coloured halo knocks out the dots under the title.
      const lx = right ? x + LABEL.gap : x - LABEL.gap;
      ctx.strokeStyle = tk.ink;
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.strokeText(title, lx, y);
      ctx.fillText(title, lx, y);
    }
    ctx.globalAlpha = 1;
    recordDraw(performance.now() - t0);
  }, [T, scene, field, hover, reducedMotion, fontsReady]);

  const onPointerMove = (e) => {
    if (e.pointerType !== "mouse" || !scene || !posRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const i = nearestDot(posRef.current, e.clientX - rect.left, e.clientY - rect.top, scene.lay);
    if (i !== hover) setHover(i);
  };

  const copy = scene?.lay.copy;
  return (
    <>
        <canvas
        ref={canvasRef}
        className="omap-canvas"
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onPointerMove}
      onPointerLeave={() => setHover(-1)}
      />
      {copy ? (
        <div
          className={`omap-copy omap-copy--${scene.lay.mode}`}
          style={{ left: copy.x, top: copy.y, width: copy.w, height: copy.h }}
        >
          {children}
        </div>
      ) : null}
    </>
  );
}
