// Painter for the occupation map. Geometry, timing and the mask live in
// mapEngine.js; this file turns one frame into canvas calls and owns only view
// state (size, fonts, hovered dot).
//
//   variant "hero"   — the ambient field behind `children` (a block of copy);
//   variant "figure" — a captioned map carrying `marks` (the shortlist and the
//                      pick) and `you` (the profile's point on the hexagon).
import { useEffect, useMemo, useRef, useState } from "react";
import { setupCanvas } from "../setupCanvas";
import { useCanvasBox, readTokens } from "../useCanvasBox";
import { HEX_VERTICES } from "../riasecPlane";
import {
  BUCKETS,
  FIGURE_CAPTION_H,
  LABEL,
  OPACITY,
  basePosition,
  bucketOf,
  bucketOpacity,
  captionFor,
  figureLayout,
  highlightAt,
  highlightOrder,
  labelBox,
  layoutFor,
  markOrder,
  nearestDot,
  opacityAt,
  position,
} from "./mapEngine";

const TOKENS = {
  ink: "--ink-page",
  screen: "--ink-screen",
  bone: "--bone",
  gold: "--gold",
  gold60: "--gold-60",
  gold40: "--gold-40",
  text30: "--text-30",
  text72: "--text-72",
  mono: "--font-mono",
};

const HEX_SUBDIV = 12;
const FIGURE_DOT_ALPHA = 0.26; // the field recedes behind the marks
const NO_MARKS = { shortlist: [], chosen: -1 };

// Cut `text` to `maxWidth` with an ellipsis (canvas has no text-overflow).
function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text.length;
  while (cut > 1 && ctx.measureText(`${text.slice(0, cut)}…`).width > maxWidth) cut -= 1;
  return `${text.slice(0, cut).trimEnd()}…`;
}

export default function MapCanvas({
  field,
  T,
  reducedMotion,
  ariaLabel,
  variant = "hero",
  marks = NO_MARKS,
  you = null,
  children,
}) {
  const canvasRef = useRef(null);
  const posRef = useRef(null);
  const { box, fontsReady } = useCanvasBox(canvasRef);
  const [hover, setHover] = useState(-1);
  const figure = variant === "figure";

  // Everything that depends only on the canvas size, not on T.
  const scene = useMemo(() => {
    if (!box) return null;
    const lay = figure ? figureLayout(box.width, box.height) : layoutFor(box.width, box.height);
    const buckets = Array.from({ length: BUCKETS }, () => []);
    field.forEach((d, i) => {
      const b = basePosition(d, lay);
      buckets[bucketOf(opacityAt(b.x, b.y, lay))].push(i);
    });
    return { lay, buckets, order: figure ? markOrder(marks) : highlightOrder(field, lay) };
  }, [field, box, figure, marks]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const surface = canvas && scene ? setupCanvas(canvas) : null;
    if (!surface) return;
    const { ctx, width, height } = surface;
    const tk = readTokens(TOKENS);
    const { lay, buckets, order } = scene;
    const dotR = lay.mode === "desktop" ? 1.4 : 1.15;

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
      ctx.globalAlpha = figure ? FIGURE_DOT_ALPHA : bucketOpacity(b);
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
    const letterGap = figure ? 12 : 16;
    HEX_VERTICES.forEach((v) => {
      const x = lay.cx + v.x * (lay.R + letterGap);
      const y = lay.cy + v.y * (lay.R + letterGap);
      ctx.globalAlpha = opacityAt(x, y, lay) / OPACITY.full;
      ctx.fillText(v.key, x, y);
    });

    // One named occupation at a time: the hovered dot wins over the schedule;
    // with no motion the figure names the pick.
    let h = hover >= 0 ? { index: hover, alpha: 1 } : highlightAt(T, order, reducedMotion);
    if (!h && figure && reducedMotion && order.length) {
      h = { index: marks.chosen >= 0 ? marks.chosen : order[0], alpha: 1 };
    }

    if (figure) {
      const yx = you ? lay.cx + you.x * lay.R : 0;
      const yy = you ? lay.cy + you.y * lay.R : 0;

      // You → the pick: the one line on the map.
      if (you && marks.chosen >= 0) {
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = tk.gold40;
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(yx, yy);
        ctx.lineTo(pos[marks.chosen * 2], pos[marks.chosen * 2 + 1]);
        ctx.stroke();
      }

      // The shortlist, then the pick over it.
      ctx.globalAlpha = 1;
      ctx.fillStyle = tk.gold60;
      ctx.beginPath();
      for (const s of marks.shortlist) {
        if (s.index === marks.chosen) continue;
        const x = pos[s.index * 2];
        const y = pos[s.index * 2 + 1];
        ctx.moveTo(x + 2.2, y);
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      }
      ctx.fill();
      if (marks.chosen >= 0) {
        const x = pos[marks.chosen * 2];
        const y = pos[marks.chosen * 2 + 1];
        ctx.fillStyle = tk.gold;
        ctx.beginPath();
        ctx.arc(x, y, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = tk.gold60;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (you) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = tk.screen;
        ctx.strokeStyle = tk.gold;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(yx, yy, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.font = `500 10px ${tk.mono}`;
        // The label sits on the side away from the pick so the line stays clear.
        const away = marks.chosen >= 0 && pos[marks.chosen * 2] > yx;
        ctx.textAlign = away ? "right" : "left";
        const lx = away ? yx - 9 : yx + 9;
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.strokeStyle = tk.screen;
        ctx.strokeText("YOU", lx, yy);
        ctx.fillStyle = tk.gold;
        ctx.fillText("YOU", lx, yy);
      }

      // The named dot gets a ring; its title goes on the caption line, where a
      // 40-character O*NET title cannot collide with anything.
      if (h) {
        const x = pos[h.index * 2];
        const y = pos[h.index * 2 + 1];
        ctx.globalAlpha = h.alpha;
        ctx.strokeStyle = tk.bone;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, h.index === marks.chosen ? 10 : 5.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = `400 ${LABEL.size}px ${tk.mono}`;
        ctx.textAlign = "center";
        ctx.fillStyle = h.index === marks.chosen ? tk.gold : tk.text72;
        // A long title gives way; the "· r 0.93" after it never does.
        const full = captionFor(field, marks, h.index);
        const cut = full.lastIndexOf(" · r ");
        const tail = cut < 0 ? "" : full.slice(cut);
        const head = fitText(ctx, cut < 0 ? full : full.slice(0, cut), width - 8 - ctx.measureText(tail).width);
        ctx.fillText(head + tail, width / 2, height - FIGURE_CAPTION_H / 2);
      }
    } else if (h) {
      const x = pos[h.index * 2];
      const y = pos[h.index * 2 + 1];
      const title = field[h.index].title;
      ctx.globalAlpha = h.alpha;
      ctx.fillStyle = tk.gold;
      ctx.beginPath();
      ctx.arc(x, y, dotR + 1.1, 0, Math.PI * 2);
      ctx.fill();
      const labelSpot = labelBox(title, x, y, lay);
      const right = labelSpot ? labelSpot.side === "right" : x < width / 2;
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
  }, [T, scene, field, hover, reducedMotion, fontsReady, figure, marks, you]);

  const onPointerMove = (e) => {
    if (e.pointerType !== "mouse" || !scene || !posRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const i = nearestDot(
      posRef.current,
      e.clientX - rect.left,
      e.clientY - rect.top,
      scene.lay,
      12,
      figure ? scene.order : null
    );
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
