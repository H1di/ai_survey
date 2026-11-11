// Template scene — how a demo plugs into DemoShell. Copy the folder to
// demos/<slug>/ and frontend/demos/_template.html to demos/<slug>.html.
//
// Split: engine.js computes the frame from (T, data); this file only paints it.
import { useEffect, useRef, useState } from "react";
import DemoShell from "../kit/DemoShell";
import { setupCanvas } from "../kit/setupCanvas";
import { HEX_VERTICES } from "../kit/riasecPlane";
import profile from "../data/demo-profile.json";
import { STAGES, frameAt } from "./engine";

// Canvas cannot read CSS variables, so resolve the tokens once — tokens.css
// stays the only place a colour is defined.
function readTokens() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  return { gold: v("--gold"), gold40: v("--gold-40"), gold70: v("--gold-70"), mono: v("--font-mono") };
}

// Draw `fraction` of the closed polyline's perimeter.
function strokePartial(ctx, pts, fraction) {
  const segs = pts.map((p, i) => [p, pts[(i + 1) % pts.length]]);
  const lens = segs.map(([a, b]) => Math.hypot(b.x - a.x, b.y - a.y));
  let budget = fraction * lens.reduce((s, l) => s + l, 0);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < segs.length && budget > 0; i += 1) {
    const [a, b] = segs[i];
    const t = Math.min(1, budget / lens[i]);
    ctx.lineTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    budget -= lens[i];
  }
  ctx.stroke();
}

function Scene({ T }) {
  const canvasRef = useRef(null);
  const [size, setSize] = useState(null);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ro = new ResizeObserver(([entry]) => setSize(entry.contentRect.width));
    ro.observe(canvas);
    document.fonts?.ready.then(() => setFontsReady(true));
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size) return;
    const { ctx, width, height } = setupCanvas(canvas);
    const tk = readTokens();
    const f = frameAt(T, profile.riasecScores);

    ctx.clearRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width, height) * 0.34;
    const pts = HEX_VERTICES.map((v) => ({ x: cx + v.x * r, y: cy + v.y * r }));

    ctx.lineWidth = 1;
    ctx.strokeStyle = tk.gold40;
    strokePartial(ctx, pts, f.outline);

    ctx.globalAlpha = f.labelAlpha;
    ctx.fillStyle = tk.gold70;
    ctx.font = `500 12px ${tk.mono}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    HEX_VERTICES.forEach((v) => ctx.fillText(v.key, cx + v.x * (r + 18), cy + v.y * (r + 18)));

    ctx.globalAlpha = f.pointAlpha;
    const px = cx + f.point.x * r;
    const py = cy + f.point.y * r;
    ctx.strokeStyle = tk.gold40;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.fillStyle = tk.gold;
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }, [T, size, fontsReady]);

  return (
    <canvas
      ref={canvasRef}
      className="template-canvas"
      role="img"
      aria-label={`Interest profile ${profile.riasecCode} placed on the six-type RIASEC hexagon, leaning toward ${profile.riasecCode[0]} and ${profile.riasecCode[1]}.`}
      style={{ display: "block", width: "100%", aspectRatio: "16 / 10", minHeight: 300 }}
    />
  );
}

export default function Demo() {
  return (
    <DemoShell
      slug="_template"
      title="Template scene"
      explains="Reference wiring: the profile's interest scores, projected onto the RIASEC hexagon."
      stages={STAGES}
    >
      {(clock) => <Scene T={clock.T} />}
    </DemoShell>
  );
}
