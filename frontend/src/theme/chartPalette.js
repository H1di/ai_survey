// recharts takes colours as JS props — they end up as SVG `fill`/`stroke`
// attributes, not as styles — so a chart cannot write `var(--gold)` the way a
// stylesheet can. It can, however, ask the document what that token resolved
// to. This is that question, so theme/tokens.css stays the one place a colour
// is written down and the charts cannot drift from the rest of the app.
//
// Every name here must exist in theme/tokens.css; chartPalette.test.js reads
// that file and fails if one goes missing.
export const CHART_TOKENS = {
  accent: "--gold",
  accentSoft: "--gold-18",
  grid: "--gold-25",
  job: "--positive",
  jobSoft: "--positive-16",
  muted: "--text-55",
};

// Reached only by a document with no stylesheet — jsdom under vitest, where
// CSS imports are stubbed. Deliberately not a copy of the palette: a duplicate
// set of hexes is exactly what this module exists to remove, and inheriting
// the current text colour degrades a chart's colour rather than its shape.
export const FALLBACK_COLOR = "currentColor";

// Resolves the chart palette off `root` (the document element by default).
// Cheap enough to call per mount: one getComputedStyle and six lookups.
export function readChartPalette(root) {
  const element = root || (typeof document === "undefined" ? null : document.documentElement);
  if (!element) {
    return Object.fromEntries(Object.keys(CHART_TOKENS).map((key) => [key, FALLBACK_COLOR]));
  }
  const styles = getComputedStyle(element);
  return Object.fromEntries(
    Object.entries(CHART_TOKENS).map(([key, token]) => [
      key,
      styles.getPropertyValue(token).trim() || FALLBACK_COLOR,
    ])
  );
}
