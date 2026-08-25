import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CHART_TOKENS, FALLBACK_COLOR, readChartPalette } from "./chartPalette";

// Read as text off disk, next to this file: vitest runs with `css: false`, so
// importing the stylesheet (even as ?raw) yields an empty stub, and the point
// of the last test is to assert against the very file the browser loads.
const tokensCss = readFileSync(join(import.meta.dirname, "tokens.css"), "utf8");

afterEach(() => {
  document.head.querySelectorAll("style[data-test]").forEach((el) => el.remove());
});

function styleRoot(css) {
  const style = document.createElement("style");
  style.setAttribute("data-test", "palette");
  style.textContent = css;
  document.head.appendChild(style);
}

describe("readChartPalette", () => {
  it("resolves every chart colour from the document's tokens", () => {
    styleRoot(`:root {
      --gold: #ffd98c;
      --gold-18: rgba(255, 217, 140, 0.18);
      --gold-25: rgba(255, 217, 140, 0.25);
      --positive: #7cffb2;
      --positive-16: rgba(124, 255, 178, 0.16);
      --text-55: rgba(255, 255, 255, 0.55);
    }`);

    // The values come back as the engine serialises them — jsdom drops the
    // spaces inside rgba(), a browser keeps the author's text. Both are the
    // same colour, and both are valid in an SVG fill/stroke.
    expect(readChartPalette()).toEqual({
      accent: "#ffd98c",
      accentSoft: "rgba(255,217,140,0.18)",
      grid: "rgba(255,217,140,0.25)",
      job: "#7cffb2",
      jobSoft: "rgba(124,255,178,0.16)",
      muted: "rgba(255,255,255,0.55)",
    });
  });

  it("reads from the element it is given, not only the document", () => {
    const el = document.createElement("div");
    el.style.setProperty("--gold", "#111111");
    document.body.appendChild(el);

    expect(readChartPalette(el).accent).toBe("#111111");
    document.body.removeChild(el);
  });

  // A document without the stylesheet must still render a chart. The fallback
  // is a single inherited colour on purpose — never a second copy of the ramp.
  it("falls back to an inherited colour when a token is not defined", () => {
    const palette = readChartPalette();
    for (const key of Object.keys(CHART_TOKENS)) {
      expect(palette[key]).toBe(FALLBACK_COLOR);
    }
  });

  // The anti-drift guard: this module names tokens as strings, so nothing but
  // a test can catch one being renamed or dropped from the stylesheet.
  it("names only tokens that theme/tokens.css actually defines", () => {
    for (const token of Object.values(CHART_TOKENS)) {
      expect(tokensCss).toMatch(new RegExp(`^\\s*${token}:`, "m"));
    }
  });
});
