// Thin canvas host for the emblem; the drawing itself lives in drawEmblem.js.
import { useEffect, useRef } from "react";
import { setupCanvas } from "../setupCanvas";
import { useCanvasBox } from "../useCanvasBox";
import { drawEmblem, radiusFor, readTokens } from "./drawEmblem";

export default function EmblemCanvas({ emblem, frame, ariaLabel }) {
  const canvasRef = useRef(null);
  const { box, fontsReady } = useCanvasBox(canvasRef);

  useEffect(() => {
    const canvas = canvasRef.current;
    const surface = canvas && box ? setupCanvas(canvas) : null;
    if (!surface) return;
    const { ctx, width, height } = surface;
    ctx.clearRect(0, 0, width, height);
    drawEmblem(ctx, { cx: width / 2, cy: height / 2, R: radiusFor(width), emblem, frame, tk: readTokens() });
  }, [emblem, frame, box, fontsReady]);

  return <canvas ref={canvasRef} className="emb-canvas" role="img" aria-label={ariaLabel} />;
}
