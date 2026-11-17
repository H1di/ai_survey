// Thin painter for the mind graph behind an assessment question. The layout and
// every frame come from mindGraph.js; this file only owns the arrival clock and
// maps unit-disc coordinates to pixels, washing the graph out of any text.
//
// Decoration under the question, never information: aria-hidden, no pointer
// events, and pale enough that the question stays fully legible. It never gates
// anything — it reads the answered count and draws it.
import { useEffect, useMemo, useRef, useState } from "react";
import { setupCanvas } from "../setupCanvas";
import { useCanvasBox, readTokens } from "../useCanvasBox";
import { usePlayOnce } from "../usePlayOnce";
import { buildMindGraph, mindFrame, ARRIVAL_S } from "./mindGraph";
import "./mind.css";

const TOKENS = {
  node: "--line-15",
  edge: "--line-15",
  // The flare: the field drawn a few steps darker for a moment after an answer.
  flareNode: "--line-50",
  flareEdge: "--line-30",
  accent: "--accent",
};

// Edges are fainter than the dots: hairlines, not strokes.
const EDGE_ALPHA = 0.6;
const NODE_R = 3.6;

// Text the graph must never strike through. Line boxes of these (and the boxes
// of form fields) are washed almost clean; the CSS halo softens what is left.
const TEXT_SELECTOR =
  "h1, h2, h3, p, label, button, .likert-end, .eyebrow, input, textarea";
const HOLE_PAD = 5;
const HOLE_KEEP = 0.15; // what survives inside a text box

// Line boxes of the screen's text, in the canvas's CSS-pixel space. A Range
// gives one rect per rendered line, so a centred paragraph masks its words,
// not its whole block.
function textHoles(canvas) {
  const scope = canvas.closest(".screen") || canvas.parentElement;
  if (!scope || typeof document.createRange !== "function") return [];
  const origin = canvas.getBoundingClientRect();
  const holes = [];
  const push = (r) => {
    if (r.width && r.height) {
      holes.push({ x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height });
    }
  };
  for (const el of scope.querySelectorAll(TEXT_SELECTOR)) {
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      push(el.getBoundingClientRect());
      continue;
    }
    const range = document.createRange();
    range.selectNodeContents(el);
    for (const r of range.getClientRects()) push(r);
  }
  return holes;
}

function paint(canvas, frame) {
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, width, height } = setup;
  ctx.clearRect(0, 0, width, height);
  if (!frame.nodes.length) return;
  const tk = readTokens(TOKENS);

  // A soft field behind the whole question block: ~two thirds of the content
  // width on a desktop, nearly all of it on a phone, and tall enough to reach
  // above the statement and below the scale.
  const hw = width < 600 ? width * 0.47 : Math.min(470, width * 0.37);
  const hh = Math.min(250, height * 0.43);
  const X = (x) => width / 2 + x * hw;
  const Y = (y) => height / 2 + y * hh;

  const flare = frame.flare || 0;
  ctx.lineWidth = 0.75;
  // Resting hairlines first, then (while an answer lands) the darker flare ink
  // over them by the flare's amount — one pass per tone, no per-edge colour mix.
  for (const [style, weight] of [
    [tk.edge, EDGE_ALPHA],
    [tk.flareEdge, flare],
  ]) {
    if (weight <= 0) continue;
    ctx.strokeStyle = style;
    for (const e of frame.edges) {
      if (e.alpha <= 0) continue;
      const a = frame.nodes[e.a];
      const b = frame.nodes[e.b];
      ctx.globalAlpha = e.alpha * weight;
      ctx.beginPath();
      ctx.moveTo(X(a.x), Y(a.y));
      ctx.lineTo(X(b.x), Y(b.y));
      ctx.stroke();
    }
  }

  for (const n of frame.nodes) {
    if (n.alpha <= 0) continue;
    const r = NODE_R * n.size * n.scale;
    ctx.globalAlpha = n.alpha;
    ctx.fillStyle = tk.node;
    ctx.beginPath();
    ctx.arc(X(n.x), Y(n.y), r, 0, Math.PI * 2);
    ctx.fill();
    if (flare > 0 && n.accent < 1) {
      ctx.globalAlpha = n.alpha * flare * (1 - n.accent);
      ctx.fillStyle = tk.flareNode;
      ctx.beginPath();
      ctx.arc(X(n.x), Y(n.y), r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (n.accent > 0) {
      ctx.globalAlpha = n.alpha * n.accent;
      ctx.fillStyle = tk.accent;
      ctx.beginPath();
      ctx.arc(X(n.x), Y(n.y), r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Wash the graph out of the text: erase most of it inside every line box,
  // with a soft edge so a line fades into the word instead of stopping at it.
  const holes = textHoles(canvas);
  if (holes.length) {
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = 1 - HOLE_KEEP;
    ctx.fillStyle = tk.node;
    if ("filter" in ctx) ctx.filter = "blur(4px)";
    ctx.beginPath();
    for (const h of holes) {
      ctx.rect(h.x - HOLE_PAD, h.y - HOLE_PAD, h.w + HOLE_PAD * 2, h.h + HOLE_PAD * 2);
    }
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// `seed` names the step (one graph per step), `total` is its question count and
// `answered` how many are behind the user. A fresh mount paints the settled
// frame — a reload looks exactly like the moment before it; only an answer
// given while the screen is up plays the newest cluster's arrival.
export default function MindGraph({ seed, total, answered, reducedMotion }) {
  const canvasRef = useRef(null);
  const { box, fontsReady } = useCanvasBox(canvasRef);
  const graph = useMemo(() => buildMindGraph(seed, total), [seed, total]);

  const [seen, setSeen] = useState({ seed, answered });
  const [arriving, setArriving] = useState(null);
  if (seen.seed !== seed || seen.answered !== answered) {
    setSeen({ seed, answered });
    setArriving(seen.seed === seed && answered > seen.answered ? answered : null);
  }

  const { T } = usePlayOnce(ARRIVAL_S, {
    targetRef: canvasRef,
    restartKey: `${seed}:${answered}`,
    reducedMotion,
  });
  const arrival = arriving === answered ? T / ARRIVAL_S : 1;
  const frame = useMemo(() => mindFrame(graph, answered, arrival), [graph, answered, arrival]);

  useEffect(() => {
    if (canvasRef.current) paint(canvasRef.current, frame);
  }, [frame, box, fontsReady]);

  return (
    <canvas
      ref={canvasRef}
      className="mind-graph"
      aria-hidden="true"
      data-answered={Math.min(graph.total, Math.max(0, answered))}
      data-nodes={frame.nodes.length}
      data-edges={frame.edges.length}
      data-arriving={arrival < 1 ? "true" : "false"}
      data-flare={frame.flare > 0 ? "true" : "false"}
    />
  );
}
