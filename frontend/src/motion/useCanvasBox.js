import { useEffect, useState } from "react";

// What every canvas painter needs before it can draw: the element's CSS box
// (observed, so a resize repaints) and whether the web fonts have loaded
// (canvas text metrics are wrong until they have). `box` stays null where
// there is nothing to measure — jsdom, or before the first layout.
export function useCanvasBox(ref) {
  const [box, setBox] = useState(null);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let alive = true;
    document.fonts?.ready.then(() => alive && setFontsReady(true));
    if (typeof ResizeObserver === "undefined") return () => (alive = false);
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox({ width, height });
    });
    ro.observe(el);
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, [ref]);

  return { box, fontsReady };
}

// tokens.css is the only place a colour is defined; canvas cannot read CSS
// variables, so painters resolve the ones they need at draw time.
export function readTokens(names) {
  const css = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    Object.entries(names).map(([key, name]) => [key, css.getPropertyValue(name).trim()])
  );
}
