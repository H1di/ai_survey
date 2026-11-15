// Size a canvas backing store to its CSS box × devicePixelRatio (capped at 2 —
// beyond that the fill cost grows faster than anyone can see) and return a
// context drawing in CSS pixels. Call at the start of every draw: the backing
// store is only reallocated when the box or DPR actually changed. Returns null
// where there is no 2D context (jsdom) — painters treat that as "cannot draw".
export function setupCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const pw = Math.round(width * dpr);
  const ph = Math.round(height * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height, dpr };
}
