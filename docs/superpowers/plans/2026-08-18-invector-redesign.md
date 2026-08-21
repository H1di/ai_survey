# Invector Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Life Path Explorer frontend's light/Inter/purple presentation layer with the Invector design — near-black surfaces, a gold hairline system, Archivo/Manrope/IBM Plex Mono type, and a canvas-drawn glowing branch — across all eleven screens, without touching the backend.

**Architecture:** A token file (`theme/tokens.css`) holds every colour, font and timing. A small primitive layer (`ui/`) expresses the composition the design repeats on every screen — wordmark, eyebrow, headline, hairline-ruled body — so each screen file only describes what is unique to it. The screens themselves move out of the 1736-line `App.jsx` into `screens/` as presentational components; `App.jsx` keeps every piece of state, every API call and `applySessionSnapshot`, so the server-snapshot-is-truth rule is untouched. Growth simulation for the branch animation lives in a pure module (`ui/branchEngine.js`) that returns line segments; the canvas component only draws them, which keeps the maths unit-testable.

**Deviation from the spec's file plan:** the spec lists eight primitives including a `HairlineGrid`. Only two screens use a ruled grid (demographics and the output columns) and their rules differ, so that primitive is folded into the two screens' CSS rather than abstracted. Everything else in §4 of the spec is built as listed.

**Tech Stack:** React 19, Vite 8, Vitest 4 + jsdom + @testing-library/react (already installed), plain CSS with custom properties, canvas 2D, `@xyflow/react` 12, recharts 3, framer-motion 12. **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-08-18-invector-design-design.md`

## Global Constraints

- **Backend is untouched.** No file under `backend/` changes. `cd backend && npm test` must stay green at every commit.
- **No new dependencies.** Drag uses native HTML5 DnD; the branch uses canvas 2D; charts stay on recharts; transitions stay on the installed framer-motion.
- **Copy is verbatim from the design artifact**, except the ten deviations in §6 of the spec. Do not paraphrase, re-capitalise, or "improve" a string.
- **O\*NET licence conditions do not change:** the official badge hotlinked from `https://www.onetcenter.org/image/link/onet-in-it.svg` inside a link to `https://services.onetcenter.org/`, and the exact sentence "This site incorporates information from O\*NET Web Services by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA). O\*NET® is a trademark of USDOL/ETA." must render on the entry screen and in the details panel. Styling may adapt; wording and artwork may not.
- **Colour is only ever a token.** No hex literal in a component or screen stylesheet — `var(--gold)`, `var(--text-60)`, etc. Two carve-outs, and only these: the colour fields of `ui/branchEngine.js`'s preset objects — the `mainHue`/`branchHue`/`dropHue` RGB triples and the `bg` canvas fill, which is a CSS colour string in one preset and the sentinel `"transparent"` in the other, so it cannot be a triple; and the inline `rgba()` values this plan writes for shadows and the dotted SVG stroke — the gold glows, and the black `rgba(0, 0, 0, α)` behind the hero headline — which are lighting effects rather than palette entries. Any colour that paints a surface, a rule, or type is a token.
- **The server snapshot stays the single source of truth.** Screens receive data as props and report intent through callbacks; they never call the API, and they never hold session state.
- **Product name is Invector** in every user-visible string, the `<title>`, and the wordmark.
- **Accessibility floor:** interactive elements are real `<button>`/`<label>`/`<input>` with a visible focus ring (`outline: 2px solid var(--gold); outline-offset: 2px`); the branch canvases are `aria-hidden="true"`.
- **Reduced motion:** where `prefers-reduced-motion: reduce` is set, the branch paints one finished frame and no `requestAnimationFrame` loop starts.

---

### Task 1: Design tokens, fonts, test setup, Wordmark

Establishes the visual foundation everything else consumes, and turns on component testing (jsdom and @testing-library are installed but no setup file registers the jest-dom matchers).

**Files:**
- Create: `frontend/src/theme/tokens.css`
- Create: `frontend/src/setupTests.js`
- Create: `frontend/src/ui/Wordmark.jsx`
- Create: `frontend/src/ui/ui.css`
- Create: `frontend/src/ui/Wordmark.test.jsx`
- Modify: `frontend/vite.config.js` (add `setupFiles` to the `test` block)
- Modify: `frontend/index.html` (title, font links)
- Modify: `frontend/src/index.css` (drop the Inter import and the light palette)
- Replace: `frontend/public/favicon.svg`

**Interfaces:**
- Consumes: nothing.
- Produces: every custom property listed in `tokens.css`; `Wordmark` — `export default function Wordmark({ tone = "screen" })` rendering the text `invector` inside an element carrying the classes `wordmark wordmark--{tone}`.

- [ ] **Step 1: Register the jest-dom matchers so component tests can run**

Create `frontend/src/setupTests.js`:

```js
import "@testing-library/jest-dom";
```

In `frontend/vite.config.js`, extend the existing `test` block:

```js
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js',
  },
```

- [ ] **Step 2: Write the failing test**

Create `frontend/src/ui/Wordmark.test.jsx`:

```jsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Wordmark from "./Wordmark";

describe("Wordmark", () => {
  it("renders the product name in lower case, as the design draws it", () => {
    render(<Wordmark />);
    expect(screen.getByText("invector")).toBeInTheDocument();
  });

  it("defaults to the screen tone and accepts the hero tone", () => {
    const { container, rerender } = render(<Wordmark />);
    expect(container.firstChild).toHaveClass("wordmark--screen");
    rerender(<Wordmark tone="hero" />);
    expect(container.firstChild).toHaveClass("wordmark--hero");
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cd frontend && npm test -- --run src/ui/Wordmark.test.jsx`
Expected: FAIL — `Failed to resolve import "./Wordmark"`.

- [ ] **Step 4: Write the token file**

Create `frontend/src/theme/tokens.css`:

```css
/* Invector design tokens. Values are transcribed from the design artifact —
   do not invent shades. Every colour used anywhere in the app resolves to one
   of these. */
:root {
  /* Surfaces — three related blacks, used deliberately for depth. */
  --ink-void: #000000;
  --ink-page: #0a0a0a;
  --ink-screen: #0e0e0e;
  --ink-graph: #050308;
  --ink-on-gold: #05070b;

  /* Gold ramp. The alpha steps are the hairline system. */
  --gold: #ffd98c;
  --gold-70: rgba(255, 217, 140, 0.7);
  --gold-60: rgba(255, 217, 140, 0.6);
  --gold-50: rgba(255, 217, 140, 0.5);
  --gold-40: rgba(255, 217, 140, 0.4);
  --gold-35: rgba(255, 217, 140, 0.35);
  --gold-30: rgba(255, 217, 140, 0.3);
  --gold-25: rgba(255, 217, 140, 0.25);
  --gold-20: rgba(255, 217, 140, 0.2);
  --gold-18: rgba(255, 217, 140, 0.18);
  --gold-15: rgba(255, 217, 140, 0.15);
  --gold-wash: rgba(255, 217, 140, 0.06);
  --gold-hover: rgba(255, 217, 140, 0.05);
  --gold-focus: rgba(255, 217, 140, 0.18);

  /* Text */
  --bone: #f4f0e7;
  --bone-50: rgba(244, 240, 231, 0.5);
  --bone-40: rgba(244, 240, 231, 0.4);
  --text: #ffffff;
  --text-72: rgba(255, 255, 255, 0.72);
  --text-60: rgba(255, 255, 255, 0.6);
  --text-55: rgba(255, 255, 255, 0.55);
  --text-45: rgba(255, 255, 255, 0.45);
  --text-40: rgba(255, 255, 255, 0.4);
  --text-30: rgba(255, 255, 255, 0.3);
  --field: rgba(255, 255, 255, 0.07);
  --field-border: rgba(255, 217, 140, 0.32);
  --pill-idle: rgba(255, 255, 255, 0.06);

  /* State */
  --positive: #7cffb2;
  --error: #ff9b9b;

  /* Backgrounds composed from the ramp */
  --glow-corners:
    radial-gradient(ellipse 480px 320px at 100% 0%, rgba(255, 217, 140, 0.07), transparent 60%),
    radial-gradient(ellipse 420px 280px at 0% 100%, rgba(163, 120, 255, 0.06), transparent 60%);
  --glow-center:
    radial-gradient(ellipse 600px 360px at 50% 0%, rgba(255, 217, 140, 0.08), transparent 65%);

  /* Type */
  --font-display: "Archivo", "Helvetica Neue", Arial, sans-serif;
  --font-body: "Manrope", system-ui, -apple-system, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", monospace;

  /* Shape */
  --radius-pill: 999px;
  --radius-field: 16px;
  --radius-surface: 14px;

  /* Motion */
  --t-fast: 140ms;
  --t-base: 220ms;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
}
```

- [ ] **Step 5: Rewrite the global stylesheet**

Replace the whole of `frontend/src/index.css` with:

```css
@import "./theme/tokens.css";

*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body,
#root {
  margin: 0;
  width: 100%;
  min-height: 100%;
}

body {
  font-family: var(--font-body);
  background: var(--ink-page);
  color: var(--text);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

button,
textarea,
input,
select {
  font: inherit;
  color: inherit;
}

button {
  border: none;
  background: none;
  cursor: pointer;
}

:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}
```

- [ ] **Step 6: Load the three families and rename the document**

In `frontend/index.html`, set the title and add the font links inside `<head>`:

```html
    <title>Invector</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;700;900&family=Manrope:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
      rel="stylesheet"
    />
```

- [ ] **Step 7: Replace the favicon with the branch mark from the design artifact**

Write `frontend/public/favicon.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" fill="#0a0a0a"/>
  <path d="M100 190 L100 100 M100 100 L70 60 M100 100 L130 60 M70 60 L55 30 M70 60 L85 30 M130 60 L115 30 M130 60 L145 30"
        stroke="#ffd98c" stroke-width="4" fill="none" stroke-linecap="round"/>
  <circle cx="100" cy="100" r="5" fill="#ffd98c"/>
</svg>
```

- [ ] **Step 8: Implement the Wordmark**

Create `frontend/src/ui/Wordmark.jsx`:

```jsx
import "./ui.css";

// The mark in the top-left of every screen: a glowing dot plus the product
// name. `hero` is the bone-white variant on the black hero; every step screen
// uses the gold-dimmed default.
export default function Wordmark({ tone = "screen" }) {
  return (
    <div className={`wordmark wordmark--${tone}`}>
      <span className="wordmark-dot" aria-hidden="true" />
      <span className="wordmark-text">invector</span>
    </div>
  );
}
```

Create `frontend/src/ui/ui.css` with its styles:

```css
.wordmark {
  display: flex;
  align-items: center;
  gap: 11px;
}

.wordmark-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--gold);
  box-shadow: 0 0 14px var(--gold);
  flex-shrink: 0;
}

.wordmark-text {
  font: 500 13px/1 var(--font-mono);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.wordmark--hero .wordmark-text {
  color: var(--bone);
}

.wordmark--screen .wordmark-text {
  color: var(--gold-60);
}
```

- [ ] **Step 9: Run the test and watch it pass**

Run: `cd frontend && npm test -- --run src/ui/Wordmark.test.jsx`
Expected: PASS, 2 tests.

- [ ] **Step 10: Run the whole frontend suite — nothing else may break**

Run: `cd frontend && npm test -- --run`
Expected: all existing `lifePath.test.js` and `devMode.test.js` tests still pass.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/theme frontend/src/ui frontend/src/setupTests.js \
        frontend/src/index.css frontend/index.html frontend/public/favicon.svg \
        frontend/vite.config.js
git commit -m "feat(ui): add Invector design tokens, fonts and the wordmark"
```

---

### Task 2: Eyebrow and ScreenShell primitives

The design repeats one composition on every step screen. Expressing it once is what keeps the eleven screens from drifting.

**Files:**
- Create: `frontend/src/ui/Eyebrow.jsx`
- Create: `frontend/src/ui/ScreenShell.jsx`
- Create: `frontend/src/ui/ScreenShell.test.jsx`
- Modify: `frontend/src/ui/ui.css`

**Interfaces:**
- Consumes: `Wordmark` from Task 1.
- Produces:
  - `Eyebrow` — `export default function Eyebrow({ children })`, renders `<p class="eyebrow">`.
  - `ScreenShell` — `export default function ScreenShell({ eyebrow, title, sub, glow = "corners", align = "center", headerSlot = null, children })`. `glow` is one of `corners | center | none`; `align` is `center | left`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/ui/ScreenShell.test.jsx`:

```jsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ScreenShell from "./ScreenShell";

describe("ScreenShell", () => {
  it("renders the wordmark, eyebrow, headline, sub-headline and body", () => {
    render(
      <ScreenShell eyebrow="step 1 · demographics" title="A little about you" sub="Four quick questions.">
        <p>body</p>
      </ScreenShell>
    );
    expect(screen.getByText("invector")).toBeInTheDocument();
    expect(screen.getByText("step 1 · demographics")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "A little about you" })).toBeInTheDocument();
    expect(screen.getByText("Four quick questions.")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("omits the optional slots when they are not given", () => {
    render(<ScreenShell title="Only a title"><p>body</p></ScreenShell>);
    expect(screen.queryByText("step 1 · demographics")).not.toBeInTheDocument();
    expect(document.querySelector(".screen-sub")).toBeNull();
  });

  it("selects the glow variant and the alignment", () => {
    const { container } = render(
      <ScreenShell glow="center" align="left" title="t"><p>body</p></ScreenShell>
    );
    expect(container.firstChild).toHaveClass("screen--glow-center");
    expect(container.firstChild).toHaveClass("screen--left");
  });

  it("renders a header slot above the eyebrow", () => {
    render(
      <ScreenShell headerSlot={<button type="button">← Back</button>} title="t">
        <p>body</p>
      </ScreenShell>
    );
    expect(screen.getByRole("button", { name: "← Back" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npm test -- --run src/ui/ScreenShell.test.jsx`
Expected: FAIL — `Failed to resolve import "./ScreenShell"`.

- [ ] **Step 3: Implement both primitives**

Create `frontend/src/ui/Eyebrow.jsx`:

```jsx
import "./ui.css";

// The mono step marker: "step 2 · big five · item 1 of 20".
export default function Eyebrow({ children }) {
  return <p className="eyebrow">{children}</p>;
}
```

Create `frontend/src/ui/ScreenShell.jsx`:

```jsx
import Wordmark from "./Wordmark";
import Eyebrow from "./Eyebrow";
import "./ui.css";

// Every assessment screen is the same composition: a glow background, the
// wordmark, a mono eyebrow, a display headline, an optional sub-headline and
// the step's body. Screens describe only what is unique to them.
export default function ScreenShell({
  eyebrow,
  title,
  sub,
  glow = "corners",
  align = "center",
  headerSlot = null,
  children,
}) {
  return (
    <section className={`screen screen--glow-${glow} screen--${align}`}>
      <Wordmark />
      {headerSlot}
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      {title && <h2 className="screen-title">{title}</h2>}
      {sub && <p className="screen-sub">{sub}</p>}
      <div className="screen-body">{children}</div>
    </section>
  );
}
```

- [ ] **Step 4: Style them**

Append to `frontend/src/ui/ui.css`:

```css
.screen {
  position: relative;
  min-height: 100vh;
  padding: 84px 48px 64px;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--ink-screen);
}

.screen--glow-corners {
  background: var(--glow-corners), var(--ink-screen);
}

.screen--glow-center {
  background: var(--glow-center), var(--ink-screen);
  justify-content: center;
}

.screen > .wordmark {
  position: absolute;
  top: 24px;
  left: 32px;
}

.screen--center {
  text-align: center;
}

.screen--left {
  text-align: left;
}

.eyebrow {
  margin: 0 0 18px;
  font: 500 10px/1 var(--font-mono);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--gold-70);
}

.screen-title {
  margin: 0 0 8px;
  font: 900 40px/1.1 var(--font-display);
  letter-spacing: -0.02em;
  color: var(--text);
}

.screen-sub {
  margin: 0 0 30px;
  max-width: 600px;
  font: 400 14px/1.6 var(--font-body);
  color: var(--text-72);
}

.screen-body {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* The Back control the mockup omits but the product needs. */
.screen-back {
  position: absolute;
  top: 56px;
  left: 32px;
  font: 400 11px/1 var(--font-mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-40);
  transition: color var(--t-fast) ease;
}

.screen-back:hover:enabled {
  color: var(--gold);
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `cd frontend && npm test -- --run src/ui/ScreenShell.test.jsx`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/ui
git commit -m "feat(ui): add the Eyebrow and ScreenShell screen primitives"
```

---

### Task 3: Branch growth engine and canvas layer

The animation is the design's signature. Splitting the simulation from the drawing makes the growth rules testable and the component thin.

**Files:**
- Create: `frontend/src/ui/branchEngine.js`
- Create: `frontend/src/ui/branchEngine.test.js`
- Create: `frontend/src/ui/BranchCanvas.jsx`
- Modify: `frontend/src/ui/ui.css`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `BRANCH_PRESETS` — `{ hero, graph }`, each the full option object.
  - `MAX_TIPS = 260`.
  - `seedTips(opt, W, H, rng = Math.random) -> Tip[]` where `Tip = { x, y, a, w, life, depth, main, hue }`.
  - `tickTips(tips, opt, W, H, rng = Math.random) -> { tips, segments, drops }` where `segments` are `{ x1, y1, x2, y2, hue, main, width, alpha }` and `drops` are `{ x, y, vx, vy, life, r, hue }`.
  - `tickDrops(drops) -> Drop[]` (advanced and expired-filtered).
  - `BranchCanvas` — `export default function BranchCanvas({ preset = "hero", className = "", reducedMotion = false })`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/ui/branchEngine.test.js`:

```js
import { describe, it, expect } from "vitest";
import { BRANCH_PRESETS, MAX_TIPS, seedTips, tickTips, tickDrops } from "./branchEngine";

// A deterministic stand-in for Math.random: 0.5 is the "no wander, no branch,
// no drop" midpoint, which makes growth exactly predictable.
const mid = () => 0.5;

describe("seedTips", () => {
  it("seeds one tip per origin, just below the frame, pointing up", () => {
    const tips = seedTips(BRANCH_PRESETS.hero, 1000, 500, mid);
    expect(tips).toHaveLength(1);
    expect(tips[0].x).toBe(720);
    expect(tips[0].y).toBe(504);
    expect(tips[0].a).toBeCloseTo(-Math.PI / 2);
    expect(tips[0].main).toBe(true);
    expect(tips[0].depth).toBe(0);
  });
});

describe("tickTips", () => {
  it("advances a tip along its angle and reports the segment it drew", () => {
    const opt = BRANCH_PRESETS.hero;
    const tips = seedTips(opt, 1000, 500, mid);
    const { tips: next, segments } = tickTips(tips, opt, 1000, 500, mid);
    expect(segments).toHaveLength(1);
    expect(segments[0].y2).toBeCloseTo(504 - opt.trunkSpeed);
    expect(segments[0].main).toBe(true);
    expect(next[0].y).toBeCloseTo(504 - opt.trunkSpeed);
    expect(next[0].life).toBe(opt.trunkLife - 1);
    expect(next[0].w).toBeCloseTo(opt.trunkWidth * opt.taper);
  });

  it("does not mutate the tips it is given", () => {
    const opt = BRANCH_PRESETS.hero;
    const tips = seedTips(opt, 1000, 500, mid);
    const before = { ...tips[0] };
    tickTips(tips, opt, 1000, 500, mid);
    expect(tips[0]).toEqual(before);
  });

  it("drops a tip that has run out of life", () => {
    const opt = BRANCH_PRESETS.hero;
    const spent = [{ ...seedTips(opt, 1000, 500, mid)[0], life: 1 }];
    const { tips: next } = tickTips(spent, opt, 1000, 500, mid);
    expect(next).toHaveLength(0);
  });

  it("drops a tip that has left the frame", () => {
    const opt = BRANCH_PRESETS.hero;
    const escaped = [{ ...seedTips(opt, 1000, 500, mid)[0], y: -30 }];
    const { tips: next } = tickTips(escaped, opt, 1000, 500, mid);
    expect(next).toHaveLength(0);
  });

  it("spawns a child with the branch hue when the roll succeeds, and never past maxDepth", () => {
    const opt = BRANCH_PRESETS.hero;
    const always = () => 0; // 0 is below every threshold, so every roll succeeds
    const tips = seedTips(opt, 1000, 500, mid);
    const { tips: next } = tickTips(tips, opt, 1000, 500, always);
    expect(next).toHaveLength(2);
    expect(next[1].depth).toBe(1);
    expect(next[1].main).toBe(false);
    expect(next[1].hue).toEqual(opt.branchHue);
    expect(next[1].w).toBeCloseTo(next[0].w * opt.childWidthMul);

    const deep = [{ ...tips[0], depth: opt.maxDepth }];
    const { tips: capped } = tickTips(deep, opt, 1000, 500, always);
    expect(capped).toHaveLength(1);
  });

  it("emits a drop when the roll succeeds", () => {
    const opt = BRANCH_PRESETS.hero;
    const always = () => 0;
    const { drops } = tickTips(seedTips(opt, 1000, 500, mid), opt, 1000, 500, always);
    expect(drops).toHaveLength(1);
    expect(drops[0].vy).toBeLessThan(0); // drops rise
    expect(drops[0].hue).toEqual(opt.dropHue);
  });

  it("stays bounded under a branch-every-frame roll", () => {
    // The cap gates child spawning, not the parents already alive: the frame
    // that crosses it still pushes every remaining parent, so the population
    // overshoots MAX_TIPS once and then can only shrink. Bounded, not capped.
    const opt = BRANCH_PRESETS.graph;
    const always = () => 0;
    let tips = seedTips(opt, 1000, 500, mid);
    let peak = 0;
    for (let i = 0; i < 200; i += 1) {
      tips = tickTips(tips, opt, 1000, 500, always).tips;
      peak = Math.max(peak, tips.length);
    }
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(2 * MAX_TIPS);
  });
});

describe("tickDrops", () => {
  it("moves each drop, ages it, and forgets the expired ones", () => {
    const alive = [{ x: 10, y: 10, vx: 1, vy: -2, life: 2, r: 2, hue: [1, 2, 3] }];
    const once = tickDrops(alive);
    expect(once[0]).toMatchObject({ x: 11, y: 8, life: 1 });
    expect(tickDrops(once)).toHaveLength(0);
  });
});

describe("BRANCH_PRESETS", () => {
  it("carries both presets with the artifact's values", () => {
    expect(BRANCH_PRESETS.hero.origins).toEqual([0.72]);
    expect(BRANCH_PRESETS.hero.maxDepth).toBe(4);
    expect(BRANCH_PRESETS.hero.pause).toBe(270);
    expect(BRANCH_PRESETS.graph.origins).toEqual([0.5]);
    expect(BRANCH_PRESETS.graph.maxDepth).toBe(6);
    expect(BRANCH_PRESETS.graph.bg).toBe("transparent");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd frontend && npm test -- --run src/ui/branchEngine.test.js`
Expected: FAIL — `Failed to resolve import "./branchEngine"`.

- [ ] **Step 3: Implement the engine**

Create `frontend/src/ui/branchEngine.js`:

```js
// Pure growth simulation for the Invector branch. No canvas and no DOM: a
// tick returns the segments to draw, so the growth rules stay testable and
// the component below stays a renderer.
//
// Parameters are transcribed from the design artifact.

export const BRANCH_PRESETS = {
  hero: {
    bg: "#000000",
    origins: [0.72],
    mainHue: [255, 225, 170],
    branchHue: [200, 165, 255],
    dropHue: [255, 235, 190],
    trunkWidth: 5.5,
    trunkLife: 280,
    trunkSpeed: 4.6,
    branchSpeed: 2.8,
    wander: 0.32,
    maxDepth: 4,
    branchRate: 0.018,
    splitAngle: 0.45,
    childWidthMul: 0.66,
    childLifeMul: 0.7,
    taper: 0.997,
    dropRate: 0.03,
    dropSpeed: 0.7,
    dropLife: 90,
    pause: 270,
  },
  graph: {
    bg: "transparent",
    origins: [0.5],
    mainHue: [255, 225, 170],
    branchHue: [163, 120, 255],
    dropHue: [255, 235, 190],
    trunkWidth: 3.5,
    trunkLife: 260,
    trunkSpeed: 3.6,
    branchSpeed: 2.4,
    wander: 0.4,
    maxDepth: 6,
    branchRate: 0.03,
    splitAngle: 0.55,
    childWidthMul: 0.68,
    childLifeMul: 0.74,
    taper: 0.997,
    dropRate: 0.03,
    dropSpeed: 0.6,
    dropLife: 90,
    pause: 100,
  },
};

// Ceiling on live tips: the branch rate compounds, and an uncapped run melts
// a laptop fan within a minute. The design artifact gates on its per-frame
// accumulator, which does not actually bound anything across frames; this
// engine gates on the frame's input population instead. Below the ceiling the
// two are identical, so the animation looks the same.
export const MAX_TIPS = 260;

export function seedTips(opt, W, H, rng = Math.random) {
  return opt.origins.map((fx) => ({
    x: W * fx,
    y: H + 4,
    a: -Math.PI / 2 + (rng() - 0.5) * 0.25,
    w: opt.trunkWidth,
    life: opt.trunkLife,
    depth: 0,
    main: true,
    hue: opt.mainHue,
  }));
}

// One frame of growth. Returns the surviving tips, the segments drawn this
// frame, and any drops thrown off. The input array is never mutated.
export function tickTips(tips, opt, W, H, rng = Math.random) {
  const next = [];
  const segments = [];
  const drops = [];

  for (const source of tips) {
    const t = { ...source };
    const speed = t.main ? opt.trunkSpeed : opt.branchSpeed;
    const nx = t.x + Math.cos(t.a) * speed;
    const ny = t.y + Math.sin(t.a) * speed;

    segments.push({
      x1: t.x,
      y1: t.y,
      x2: nx,
      y2: ny,
      hue: t.hue,
      main: t.main,
      width: Math.max(0.6, t.w),
      alpha: t.main ? 0.9 : Math.max(0.25, 0.75 - t.depth * 0.12),
    });

    t.x = nx;
    t.y = ny;
    t.a += (rng() - 0.5) * opt.wander - 0.002;
    t.w *= opt.taper;
    t.life -= 1;

    if (rng() < opt.dropRate * (t.main ? 2.2 : 1)) {
      drops.push({
        x: t.x,
        y: t.y,
        vy: -(opt.dropSpeed * (0.7 + rng() * 0.6)),
        vx: (rng() - 0.5) * 0.3,
        life: opt.dropLife,
        r: t.main ? 2.2 : 1.3,
        hue: opt.dropHue,
      });
    }

    if (t.life > 0 && t.y > -20 && t.x > -20 && t.x < W + 20 && t.w > 0.4) {
      next.push(t);
      // Gate on the frame's INPUT size, not on `next`: `next` resets every
      // frame, so gating on it lets each frame add another MAX_TIPS children
      // and the population grows without bound (measured: 7224 tips over 200
      // frames of always-branch, against a 520 ceiling).
      if (t.depth < opt.maxDepth && tips.length < MAX_TIPS && rng() < opt.branchRate) {
        const dir = rng() < 0.5 ? 1 : -1;
        next.push({
          x: t.x,
          y: t.y,
          a: t.a + dir * (opt.splitAngle * (0.7 + rng() * 0.6)),
          w: t.w * opt.childWidthMul,
          life: t.life * opt.childLifeMul,
          depth: t.depth + 1,
          main: false,
          hue: opt.branchHue,
        });
      }
    }
  }

  return { tips: next, segments, drops };
}

export function tickDrops(drops) {
  const next = [];
  for (const source of drops) {
    const d = { ...source, x: source.x + source.vx, y: source.y + source.vy, life: source.life - 1 };
    if (d.life > 0) next.push(d);
  }
  return next;
}
```

- [ ] **Step 4: Run the engine tests and watch them pass**

Run: `cd frontend && npm test -- --run src/ui/branchEngine.test.js`
Expected: PASS, 10 tests.

- [ ] **Step 5: Implement the canvas layer**

Create `frontend/src/ui/BranchCanvas.jsx`:

```jsx
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
```

Append to `frontend/src/ui/ui.css`:

```css
.branch-canvas {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.branch-canvas canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
```

- [ ] **Step 6: Run the full frontend suite**

Run: `cd frontend && npm test -- --run`
Expected: PASS. (jsdom has no 2D context, so `getContext` returns null and the component's effect exits early — it must not throw. If any suite renders it later, this early return is what keeps it safe.)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/ui
git commit -m "feat(ui): add the branch growth engine and its canvas layer"
```

---

### Task 4: Step rail pills

The rail is the only navigation in the product. Its labels come from the design; its reachability rules do not change.

**Files:**
- Modify: `frontend/src/lifePath.js:199-205` (the `JOURNEY_RAIL` labels)
- Modify: `frontend/src/lifePath.test.js:123-124` (the label assertion that pins the old copy)
- Create: `frontend/src/screens/StepRail.jsx`
- Create: `frontend/src/screens/StepRail.test.jsx`
- Create: `frontend/src/screens/screens.css`

**Interfaces:**
- Consumes: `JOURNEY_RAIL`, `railIndexForStep`, `railStepReachable` from `lifePath.js` (unchanged signatures).
- Produces: `StepRail` — `export default function StepRail({ step, furthestStep, busy, onNavigate })`, rendering an `<ol class="step-rail">` of pills; reachable non-active steps are `<button>`s calling `onNavigate(step)`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/screens/StepRail.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StepRail from "./StepRail";

describe("StepRail", () => {
  it("renders the design's six labels in order", () => {
    render(<StepRail step="demographics" furthestStep="demographics" onNavigate={() => {}} />);
    const labels = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(labels).toEqual([
      "Demographics",
      "Big Five",
      "Interests",
      "Values",
      "Experience",
      "Summary",
    ]);
  });

  it("marks the current step and never makes it a button", () => {
    render(<StepRail step="riasec" furthestStep="riasec" onNavigate={() => {}} />);
    expect(screen.queryByRole("button", { name: "Interests" })).not.toBeInTheDocument();
    expect(screen.getByText("Interests").closest("li")).toHaveClass("step-rail-item--active");
  });

  it("makes already-reached steps clickable and leaves later ones inert", () => {
    render(<StepRail step="values" furthestStep="values" onNavigate={() => {}} />);
    expect(screen.getByRole("button", { name: "Big Five" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Summary" })).not.toBeInTheDocument();
  });

  it("reports the step the user picked", async () => {
    const onNavigate = vi.fn();
    render(<StepRail step="values" furthestStep="values" onNavigate={onNavigate} />);
    await userEvent.click(screen.getByRole("button", { name: "Big Five" }));
    expect(onNavigate).toHaveBeenCalledWith("big_five");
  });

  it("disables navigation while a jump is in flight", () => {
    render(<StepRail step="values" furthestStep="values" busy onNavigate={() => {}} />);
    expect(screen.getByRole("button", { name: "Big Five" })).toBeDisabled();
  });
});
```

Note: `@testing-library/user-event` is not in `package.json`. Do **not** add it — rewrite the click as `fireEvent.click` from `@testing-library/react`:

```jsx
import { render, screen, fireEvent } from "@testing-library/react";
// ...
    fireEvent.click(screen.getByRole("button", { name: "Big Five" }));
```

Use `fireEvent` throughout this plan for the same reason.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npm test -- --run src/screens/StepRail.test.jsx`
Expected: FAIL — `Failed to resolve import "./StepRail"`.

- [ ] **Step 3: Re-label the rail**

In `frontend/src/lifePath.js`, replace the `JOURNEY_RAIL` labels with the design's, keeping the `step` keys and the `time` hints (the journey intro screen still shows them):

```js
export const JOURNEY_RAIL = [
  { step: "demographics", label: "Demographics", time: "~1 min" },
  { step: "big_five", label: "Big Five", time: "2–3 min" },
  { step: "riasec", label: "Interests", time: "2 min" },
  { step: "values", label: "Values", time: "1–2 min" },
  { step: "cv", label: "Experience", time: "1–2 min" },
  { step: "summary", label: "Summary", time: "~1 min" },
];
```

In `frontend/src/lifePath.test.js`, update the assertion that pins the old copy:

```js
  it("labels the work-values step 'Values'", () => {
    expect(JOURNEY_RAIL.find((r) => r.step === "values").label).toBe("Values");
  });
```

- [ ] **Step 4: Implement the rail**

Create `frontend/src/screens/StepRail.jsx`:

```jsx
import { JOURNEY_RAIL, railIndexForStep, railStepReachable } from "../lifePath";
import "./screens.css";

// The pill row. Reachability is the backend's rule, not the rail's: an entry
// is a button only when the user has already been there.
export default function StepRail({ step, furthestStep, busy = false, onNavigate }) {
  const active = railIndexForStep(step);
  if (active === -1) return null;

  return (
    <ol className="step-rail" aria-label="Assessment progress">
      {JOURNEY_RAIL.map((entry, index) => {
        const clickable = index !== active && railStepReachable(entry.step, furthestStep);
        return (
          <li
            key={entry.step}
            className={[
              "step-rail-item",
              index === active ? "step-rail-item--active" : "",
              index < active ? "step-rail-item--done" : "",
              clickable ? "" : "step-rail-item--inert",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {clickable ? (
              <button type="button" disabled={busy} onClick={() => onNavigate(entry.step)}>
                {entry.label}
              </button>
            ) : (
              entry.label
            )}
          </li>
        );
      })}
    </ol>
  );
}
```

Create `frontend/src/screens/screens.css`:

```css
.step-rail {
  list-style: none;
  margin: 0 0 36px;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.step-rail-item,
.step-rail-item > button {
  padding: 8px 16px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--gold-20);
  background: var(--pill-idle);
  color: var(--text-60);
  font: 600 12px/1 var(--font-display);
  letter-spacing: 0.01em;
  transition: color var(--t-fast) ease, border-color var(--t-fast) ease;
}

/* The button carries its own pill, so the wrapping li must not double it. */
.step-rail-item:has(> button) {
  padding: 0;
  border: none;
  background: none;
}

.step-rail-item > button:hover:enabled {
  border-color: var(--gold-50);
  color: var(--text);
}

.step-rail-item > button:disabled {
  opacity: 0.5;
  cursor: default;
}

.step-rail-item--active {
  background: var(--gold);
  border-color: var(--gold);
  color: var(--ink-on-gold);
}

.step-rail-item--inert:not(.step-rail-item--active):not(.step-rail-item--done) {
  opacity: 0.45;
}
```

- [ ] **Step 5: Run the rail test and watch it pass**

Run: `cd frontend && npm test -- --run src/screens/StepRail.test.jsx`
Expected: PASS, 5 tests.

- [ ] **Step 6: Run the full suite — the re-labelling must not break the rail tests**

Run: `cd frontend && npm test -- --run`
Expected: PASS, including the updated `lifePath.test.js` label assertion.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/screens frontend/src/lifePath.js frontend/src/lifePath.test.js
git commit -m "feat(ui): re-label the journey rail and render it as design pills"
```

---

### Task 5: Entry screen

The hero is the first three seconds of trust. It carries the headline, the dream answer, the branch, and the O*NET licence block.

**Files:**
- Create: `frontend/src/screens/EntryScreen.jsx`
- Create: `frontend/src/screens/EntryScreen.test.jsx`
- Create: `frontend/src/screens/OnetAttribution.jsx`
- Modify: `frontend/src/screens/screens.css`
- Modify: `frontend/src/setupTests.js` (stub the canvas context jsdom does not implement, so `BranchCanvas` stops printing a warning per render)
- Modify: `frontend/src/App.jsx` (render `EntryScreen` in the `stage === "entry"` branch; delete the inline entry markup at `1329-1357` and the `OnetAttribution` function at `456-482`)

**Interfaces:**
- Consumes: `ScreenShell` is *not* used here — the hero has its own full-bleed composition. Uses `Wordmark` (tone `hero`) and `BranchCanvas` (preset `hero`).
- Produces:
  - `OnetAttribution` — `export default function OnetAttribution()`, unchanged in substance from the current `App.jsx:456`.
  - `EntryScreen` — `export default function EntryScreen({ value, onChange, onStart, busy, error, reducedMotion, onOpenInfo })`. `onOpenInfo(key)` receives `"how-it-works"` or `"the-engine"`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/screens/EntryScreen.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EntryScreen from "./EntryScreen";

const base = {
  value: "",
  onChange: () => {},
  onStart: () => {},
  busy: false,
  error: "",
  reducedMotion: true,
  onOpenInfo: () => {},
};

describe("EntryScreen", () => {
  it("renders the headline with the last word set apart in gold", () => {
    render(<EntryScreen {...base} />);
    const heading = screen.getByRole("heading", { level: 1 });
    // The design breaks the line four ways, and <br> contributes no whitespace
    // to textContent — assert the fragments, not one flattened sentence.
    ["What would you do", "if you knew you", "would definitely"].forEach((fragment) =>
      expect(heading).toHaveTextContent(fragment)
    );
    expect(heading.querySelector(".hero-accent")).toHaveTextContent("succeed?");
  });

  it("carries the design's CTA and disclaimer verbatim", () => {
    render(<EntryScreen {...base} value="anything" />);
    expect(screen.getByRole("button", { name: "Start the assessment" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "This is a playful exploratory tool. Because of its simplified structure, it is not fully reliable."
      )
    ).toBeInTheDocument();
  });

  it("keeps the O*NET badge and the exact licence sentence", () => {
    render(<EntryScreen {...base} />);
    expect(screen.getByAltText("O*NET in-it")).toBeInTheDocument();
    expect(
      screen.getByText(/O\*NET® is a trademark of USDOL\/ETA\./)
    ).toBeInTheDocument();
  });

  it("blocks the CTA until something is written and while starting", () => {
    const { rerender } = render(<EntryScreen {...base} />);
    expect(screen.getByRole("button", { name: "Start the assessment" })).toBeDisabled();
    rerender(<EntryScreen {...base} value="   " />);
    expect(screen.getByRole("button", { name: "Start the assessment" })).toBeDisabled();
    rerender(<EntryScreen {...base} value="build things" busy />);
    expect(screen.getByRole("button", { name: "Entering…" })).toBeDisabled();
  });

  it("caps the answer at 500 characters", () => {
    render(<EntryScreen {...base} />);
    expect(screen.getByPlaceholderText("Write your honest answer")).toHaveAttribute("maxlength", "500");
  });

  it("opens the methodology panels from the nav", () => {
    const onOpenInfo = vi.fn();
    render(<EntryScreen {...base} onOpenInfo={onOpenInfo} />);
    fireEvent.click(screen.getByRole("button", { name: "how it works" }));
    expect(onOpenInfo).toHaveBeenCalledWith("how-it-works");
    fireEvent.click(screen.getByRole("button", { name: "the engine" }));
    expect(onOpenInfo).toHaveBeenCalledWith("the-engine");
    expect(screen.getByRole("link", { name: "github" })).toHaveAttribute("href");
  });

  it("starts the assessment on click", () => {
    const onStart = vi.fn();
    render(<EntryScreen {...base} value="build things" onStart={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: "Start the assessment" }));
    expect(onStart).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npm test -- --run src/screens/EntryScreen.test.jsx`
Expected: FAIL — `Failed to resolve import "./EntryScreen"`.

- [ ] **Step 3: Move the attribution out of App.jsx unchanged**

Create `frontend/src/screens/OnetAttribution.jsx` with the exact component currently at `frontend/src/App.jsx:456-482` — same markup, same wording, same badge URL, same `title` attribute. Only the surrounding stylesheet changes. Then delete that function from `App.jsx`.

- [ ] **Step 4: Implement the hero**

Create `frontend/src/screens/EntryScreen.jsx`:

```jsx
import Wordmark from "../ui/Wordmark";
import BranchCanvas from "../ui/BranchCanvas";
import OnetAttribution from "./OnetAttribution";
import "./screens.css";

const REPO_URL = "https://github.com/H1di/ai_survey";

// The first screen: the branch grows behind the question that starts
// everything. Line breaks follow the design exactly.
export default function EntryScreen({
  value,
  onChange,
  onStart,
  busy,
  error,
  reducedMotion,
  onOpenInfo,
}) {
  const ready = Boolean(value.trim()) && !busy;

  return (
    <section className="hero">
      <BranchCanvas preset="hero" reducedMotion={reducedMotion} />

      <div className="hero-bar">
        <Wordmark tone="hero" />
        <nav className="hero-nav">
          <button type="button" onClick={() => onOpenInfo("how-it-works")}>
            how it works
          </button>
          <button type="button" onClick={() => onOpenInfo("the-engine")}>
            the engine
          </button>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            github
          </a>
        </nav>
      </div>

      <div className="hero-body">
        <h1 className="hero-title">
          What would you do
          <br />
          if you knew you
          <br />
          would definitely
          <br />
          <span className="hero-accent">succeed?</span>
        </h1>

        <textarea
          className="hero-input"
          value={value}
          maxLength={500}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Write your honest answer"
        />

        <button type="button" className="btn btn--bone" onClick={onStart} disabled={!ready}>
          {busy ? "Entering…" : "Start the assessment"}
        </button>

        <p className="hero-disclaimer">
          This is a playful exploratory tool. Because of its simplified structure, it is not fully
          reliable.
        </p>

        {error && <p className="error-text">{error}</p>}

        <div className="hero-footer">
          <OnetAttribution />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Style the hero and the shared button set**

Append to `frontend/src/screens/screens.css`:

```css
/* --- Shared button set --- */
.btn {
  border-radius: var(--radius-pill);
  font: 700 14px/1 var(--font-display);
  letter-spacing: 0.01em;
  padding: 15px 30px;
  transition: background var(--t-fast) ease, transform var(--t-fast) ease,
    box-shadow var(--t-fast) ease, border-color var(--t-fast) ease;
}

.btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.btn--bone {
  background: var(--bone);
  color: var(--ink-on-gold);
  padding: 16px 30px;
}

.btn--bone:hover:enabled {
  background: var(--gold);
  transform: translateY(-2px);
  box-shadow: 0 12px 30px rgba(255, 217, 140, 0.35);
}

.btn--gold {
  background: var(--gold);
  color: var(--ink-on-gold);
  font-size: 13px;
  padding: 14px 28px;
}

.btn--gold:hover:enabled {
  transform: translateY(-2px);
  box-shadow: 0 12px 30px rgba(255, 217, 140, 0.35);
}

.btn--ghost {
  background: transparent;
  color: var(--text-72);
  border: 1px solid var(--text-30);
  font-weight: 500;
  padding: 14px 20px;
}

.btn--ghost:hover:enabled {
  color: var(--text);
  border-color: var(--gold-50);
}

/* --- Hero --- */
.hero {
  position: relative;
  min-height: 100vh;
  background: var(--ink-void);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.hero-bar {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 22px 40px;
}

.hero-nav {
  display: flex;
  gap: 26px;
}

.hero-nav button,
.hero-nav a {
  font: 400 12px/1 var(--font-mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--bone-50);
  text-decoration: none;
  transition: color var(--t-fast) ease;
}

.hero-nav button:hover,
.hero-nav a:hover {
  color: var(--gold);
}

.hero-body {
  position: relative;
  flex: 1;
  padding: 60px 48px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.hero-title {
  margin: 0;
  width: 100%;
  max-width: 1100px;
  text-align: left;
  font: 900 68px/1.05 var(--font-display);
  letter-spacing: -0.02em;
  text-transform: uppercase;
  color: var(--text);
  text-shadow: 0 4px 24px rgba(0, 0, 0, 0.6);
}

.hero-accent {
  color: var(--gold);
}

.hero-input {
  margin-top: 16px;
  width: 100%;
  max-width: 520px;
  min-height: 90px;
  resize: none;
  padding: 16px 18px;
  border-radius: var(--radius-field);
  background: var(--field);
  border: 1px solid var(--field-border);
  color: var(--text);
  font: 400 15px/1.5 var(--font-body);
  outline: none;
}

.hero-input:focus {
  border-color: var(--gold);
  box-shadow: 0 0 0 3px var(--gold-focus);
}

.hero-body > .btn {
  margin-top: 22px;
}

.hero-disclaimer {
  margin: 16px 0 0;
  max-width: 420px;
  text-align: center;
  font: 400 12.5px/1.5 var(--font-body);
  color: var(--text-60);
}

.hero-footer {
  margin-top: auto;
  padding-bottom: 24px;
}

/* Scoped under .hero on purpose. The legacy App.css still defines
   .onet-attribution and .error-text at single-class specificity, and it is
   imported after screens.css, so an unscoped rule here would lose the cascade
   and the licence-mandated attribution would ship in the old grey. Task 14
   deletes the legacy rules; the scoping stays correct either way. */
.hero .onet-attribution {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.hero .onet-attribution p {
  margin: 0;
  max-width: 480px;
  text-align: center;
  font: 300 10.5px/1.5 var(--font-body);
  color: var(--bone-40);
}

.hero .onet-attribution a {
  color: var(--gold-70);
}

.hero .error-text {
  margin: 12px 0 0;
  font: 400 13px/1.5 var(--font-body);
  color: var(--error);
  border: none;
  padding: 0;
  max-width: none;
  text-align: center;
}
```

- [ ] **Step 6: Wire it into App.jsx**

Replace the `stage === "entry"` block (currently `frontend/src/App.jsx:1328-1357`) with:

```jsx
      {stage === "entry" && (
        <EntryScreen
          value={dreamAnswer}
          onChange={setDreamAnswer}
          onStart={handleStartSession}
          busy={busy.start}
          error={error}
          reducedMotion={REDUCED_MOTION}
          onOpenInfo={handleOpenMethodology}
        />
      )}
```

Add the import (`import EntryScreen from "./screens/EntryScreen";`) and, next to the other handlers, the panel content the nav opens:

```jsx
  // The hero nav is real navigation: both entries open the same side panel the
  // graph uses, carrying the methodology rather than marketing copy.
  const METHODOLOGY_VIEWS = {
    "how-it-works": {
      archetype: "how it works",
      title: "Five instruments, one profile",
      sections: [
        {
          heading: "What you answer",
          items: [
            "Four demographic questions.",
            "The public-domain Mini-IPIP-20, rated 1–5, scored to OCEAN 0–100 plus Stability/Plasticity.",
            "Twelve fixed activity statements, rated for enjoyment — never job titles — scored to a Holland code.",
            "An adaptive Ford–Johnson merge-insertion tournament, ≤10 comparisons, ranking the six Minnesota work values.",
            "Your CV, or seven career-journey questions if you don't have one.",
          ],
        },
      ],
    },
    "the-engine": {
      archetype: "the engine",
      title: "Grounded in O*NET, traced to your answers",
      sections: [
        {
          heading: "How a suggestion is built",
          items: [
            "Your Holland code ranks the field families; the O*NET snapshot ranks occupations inside them by measured interest profile.",
            "The occupation must come from that shortlist — the engine cannot invent one.",
            "Its six measured work values are scored against your confirmed hierarchy as a single fit percentage.",
            "Every line of the explanation points back to a score, a rank, or a sentence you wrote.",
          ],
        },
      ],
    },
  };

  const handleOpenMethodology = (key) => setInfoView(METHODOLOGY_VIEWS[key] || null);
```

The entry stage must now render `infoView` too — move the existing `AnimatePresence`/`InfoPanel` block so it sits outside the `stage === "tree"` branch, at the end of the `<main>`.

- [ ] **Step 7: Run the tests**

Run: `cd frontend && npm test -- --run`
Expected: PASS, including the 7 new `EntryScreen` tests.

- [ ] **Step 8: See it in a browser**

Run: `npm run dev` from the repo root, open `http://localhost:5173`.
Expected: a black hero, the branch growing from the lower right with light drops rising, the gold "succeed?", and the O*NET badge at the bottom. Starting the assessment still advances to the survey.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/screens frontend/src/App.jsx
git commit -m "feat(ui): rebuild the entry screen as the Invector hero"
```

---

### Task 6: Likert scale primitive, Big Five and Interests screens

Two screens share one interaction, so they share one primitive. The Big Five anchors change to the design's (and IPIP's canonical) accurate/inaccurate wording.

**Files:**
- Create: `frontend/src/ui/LikertScale.jsx`
- Create: `frontend/src/ui/LikertScale.test.jsx`
- Create: `frontend/src/screens/BigFiveScreen.jsx`
- Create: `frontend/src/screens/RiasecScreen.jsx`
- Create: `frontend/src/screens/BigFiveScreen.test.jsx`
- Create: `frontend/src/screens/RiasecScreen.test.jsx`
- Modify: `frontend/src/ui/ui.css`, `frontend/src/screens/screens.css`
- Modify: `frontend/src/App.jsx` (replace `BigFiveQuestionCard` at `231-260` and `RiasecQuestionCard` at `263-299`; update the `LIKERT` constant at `57-63`)

**Interfaces:**
- Consumes: `ScreenShell`, `Eyebrow`.
- Produces:
  - `LikertScale` — `export default function LikertScale({ anchors, value, onSelect, disabled = false })` where `anchors` is `[{ value: 1..5, label }]`. Renders one `<button aria-pressed>` per anchor; selecting calls `onSelect(value)`.
  - `BigFiveScreen` — `({ item, savedValue, index, total, busy, onAnswer, onBack, canGoBack })`.
  - `RiasecScreen` — `({ item, savedValue, index, total, busy, onAnswer, onBack, canGoBack, onSkip, canSkip })`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/ui/LikertScale.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import LikertScale from "./LikertScale";

const anchors = [
  { value: 1, label: "Very inaccurate" },
  { value: 2, label: "Moderately inaccurate" },
  { value: 3, label: "Neither" },
  { value: 4, label: "Moderately accurate" },
  { value: 5, label: "Very accurate" },
];

describe("LikertScale", () => {
  it("renders one real button per anchor", () => {
    render(<LikertScale anchors={anchors} onSelect={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(5);
    expect(screen.getByRole("button", { name: /Very accurate/ })).toBeInTheDocument();
  });

  it("marks the saved answer as pressed", () => {
    render(<LikertScale anchors={anchors} value={4} onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /Moderately accurate/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: /Neither/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("reports the value that was picked", () => {
    const onSelect = vi.fn();
    render(<LikertScale anchors={anchors} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Neither/ }));
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("goes inert while an answer is in flight", () => {
    render(<LikertScale anchors={anchors} onSelect={() => {}} disabled />);
    screen.getAllByRole("button").forEach((b) => expect(b).toBeDisabled());
  });
});
```

Create `frontend/src/screens/BigFiveScreen.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BigFiveScreen from "./BigFiveScreen";

const base = {
  item: { id: "mip_1", text: "I am the life of the party." },
  savedValue: null,
  index: 0,
  total: 20,
  busy: false,
  onAnswer: () => {},
  onBack: () => {},
  canGoBack: false,
};

describe("BigFiveScreen", () => {
  it("carries the instrument copy verbatim", () => {
    render(<BigFiveScreen {...base} />);
    expect(screen.getByText("step 2 · big five · item 1 of 20")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mini-IPIP-20" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "The fixed public-domain Mini-IPIP-20, rated 1–5, scored to OCEAN 0–100 plus Stability/Plasticity."
      )
    ).toBeInTheDocument();
  });

  it("quotes the item statement", () => {
    render(<BigFiveScreen {...base} />);
    expect(screen.getByText('"I am the life of the party."')).toBeInTheDocument();
  });

  it("uses the design's accurate/inaccurate anchors", () => {
    render(<BigFiveScreen {...base} />);
    ["Very inaccurate", "Moderately inaccurate", "Neither", "Moderately accurate", "Very accurate"]
      .forEach((label) => expect(screen.getByText(label)).toBeInTheDocument());
  });

  it("submits the chosen rating", () => {
    const onAnswer = vi.fn();
    render(<BigFiveScreen {...base} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole("button", { name: /Very accurate/ }));
    expect(onAnswer).toHaveBeenCalledWith(5);
  });

  it("offers Back only when there is somewhere to go", () => {
    const { rerender } = render(<BigFiveScreen {...base} />);
    expect(screen.queryByRole("button", { name: "← Back" })).not.toBeInTheDocument();
    rerender(<BigFiveScreen {...base} canGoBack />);
    expect(screen.getByRole("button", { name: "← Back" })).toBeInTheDocument();
  });
});
```

Create `frontend/src/screens/RiasecScreen.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RiasecScreen from "./RiasecScreen";

const base = {
  item: { id: "r1", text: "Assembling or repairing a physical device until it works" },
  savedValue: null,
  index: 0,
  total: 12,
  busy: false,
  onAnswer: () => {},
  onBack: () => {},
  canGoBack: false,
  onSkip: () => {},
  canSkip: true,
};

describe("RiasecScreen", () => {
  it("carries the instrument copy verbatim", () => {
    render(<RiasecScreen {...base} />);
    expect(screen.getByText("step 3 · riasec interests · item 1 of 12")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How much would you enjoy this?" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Twelve fixed activity statements, rated for enjoyment — never job titles — scored to a Holland code. You can skip to infer interests from personality instead."
      )
    ).toBeInTheDocument();
  });

  it("quotes the activity, closing it with the period the design adds", () => {
    render(<RiasecScreen {...base} />);
    expect(
      screen.getByText('"Assembling or repairing a physical device until it works."')
    ).toBeInTheDocument();
  });

  it("keeps the enjoyment anchors, which the mockup does not show", () => {
    render(<RiasecScreen {...base} />);
    ["Not at all", "Not really", "Maybe", "Quite a bit", "Very much"].forEach((label) =>
      expect(screen.getByText(label)).toBeInTheDocument()
    );
  });

  it("offers the skip with the design's label, and only before the first answer", () => {
    const onSkip = vi.fn();
    const { rerender } = render(<RiasecScreen {...base} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip — infer from personality" }));
    expect(onSkip).toHaveBeenCalled();
    rerender(<RiasecScreen {...base} canSkip={false} />);
    expect(screen.queryByRole("button", { name: "Skip — infer from personality" })).not.toBeInTheDocument();
  });

  it("submits the chosen rating", () => {
    const onAnswer = vi.fn();
    render(<RiasecScreen {...base} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole("button", { name: /Maybe/ }));
    expect(onAnswer).toHaveBeenCalledWith(3);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd frontend && npm test -- --run src/ui/LikertScale.test.jsx src/screens/BigFiveScreen.test.jsx src/screens/RiasecScreen.test.jsx`
Expected: FAIL — three unresolved imports.

- [ ] **Step 3: Implement the scale**

Create `frontend/src/ui/LikertScale.jsx`:

```jsx
import "./ui.css";

// Five ringed options under a hairline. Picking one is the answer — there is
// no separate Continue, because twelve or twenty items make that a click tax.
export default function LikertScale({ anchors, value = null, onSelect, disabled = false }) {
  return (
    <div className="likert">
      {anchors.map((anchor) => (
        <button
          key={anchor.value}
          type="button"
          className={`likert-option ${value === anchor.value ? "likert-option--on" : ""}`}
          aria-pressed={value === anchor.value}
          disabled={disabled}
          onClick={() => onSelect(anchor.value)}
        >
          <span className="likert-ring" aria-hidden="true" />
          <span className="likert-label">{anchor.label}</span>
        </button>
      ))}
    </div>
  );
}
```

Append to `frontend/src/ui/ui.css`:

```css
.likert {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  width: 100%;
  max-width: 520px;
  border-top: 1px solid var(--gold-25);
  padding-top: 20px;
}

.likert-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 80px;
  background: none;
  padding: 0;
}

.likert-ring {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid var(--gold-50);
  transition: background var(--t-fast) ease, border-color var(--t-fast) ease,
    box-shadow var(--t-fast) ease;
}

.likert-option:hover:enabled .likert-ring {
  border-color: var(--gold);
}

.likert-option--on .likert-ring {
  background: var(--gold);
  border-color: var(--gold);
  box-shadow: 0 0 14px var(--gold-focus);
}

.likert-label {
  font: 400 11px/1.3 var(--font-body);
  color: var(--text-55);
  text-align: center;
}

.likert-option--on .likert-label {
  color: var(--text);
}

.likert-option:disabled {
  opacity: 0.5;
  cursor: default;
}

/* The quoted item statement both instruments show. */
.item-statement {
  font: 600 24px/1.3 var(--font-display);
  color: var(--text);
  margin-bottom: 30px;
}

.item-statement--italic {
  font-style: italic;
}

.item-statement--sm {
  font-size: 22px;
  margin-bottom: 20px;
}
```

- [ ] **Step 4: Implement both screens**

Create `frontend/src/screens/BigFiveScreen.jsx`:

```jsx
import ScreenShell from "../ui/ScreenShell";
import LikertScale from "../ui/LikertScale";
import "./screens.css";

// The canonical IPIP anchors, which is also what the design draws. Not
// exported: react-refresh/only-export-components is a hard error in this
// project, and nothing outside this screen needs them.
const ACCURACY_ANCHORS = [
  { value: 1, label: "Very inaccurate" },
  { value: 2, label: "Moderately inaccurate" },
  { value: 3, label: "Neither" },
  { value: 4, label: "Moderately accurate" },
  { value: 5, label: "Very accurate" },
];

export default function BigFiveScreen({
  item,
  savedValue,
  index,
  total,
  busy,
  onAnswer,
  onBack,
  canGoBack,
}) {
  return (
    <ScreenShell
      eyebrow={`step 2 · big five · item ${index + 1} of ${total}`}
      title="Mini-IPIP-20"
      sub="The fixed public-domain Mini-IPIP-20, rated 1–5, scored to OCEAN 0–100 plus Stability/Plasticity."
      headerSlot={
        canGoBack ? (
          <button type="button" className="screen-back" onClick={onBack} disabled={busy}>
            ← Back
          </button>
        ) : null
      }
    >
      <div className="instrument">
        <p className="item-statement item-statement--italic">&quot;{item.text}&quot;</p>
        <LikertScale
          anchors={ACCURACY_ANCHORS}
          value={savedValue}
          onSelect={onAnswer}
          disabled={busy}
        />
      </div>
    </ScreenShell>
  );
}
```

Create `frontend/src/screens/RiasecScreen.jsx`:

```jsx
import ScreenShell from "../ui/ScreenShell";
import LikertScale from "../ui/LikertScale";
import "./screens.css";

// The mockup shows no rating scale for this step, so its enjoyment anchors
// stay as the product already words them. Not exported, for the same reason
// as the Big Five set.
const ENJOYMENT_ANCHORS = [
  { value: 1, label: "Not at all" },
  { value: 2, label: "Not really" },
  { value: 3, label: "Maybe" },
  { value: 4, label: "Quite a bit" },
  { value: 5, label: "Very much" },
];

export default function RiasecScreen({
  item,
  savedValue,
  index,
  total,
  busy,
  onAnswer,
  onBack,
  canGoBack,
  onSkip,
  canSkip,
}) {
  return (
    <ScreenShell
      eyebrow={`step 3 · riasec interests · item ${index + 1} of ${total}`}
      title="How much would you enjoy this?"
      sub="Twelve fixed activity statements, rated for enjoyment — never job titles — scored to a Holland code. You can skip to infer interests from personality instead."
      headerSlot={
        canGoBack ? (
          <button type="button" className="screen-back" onClick={onBack} disabled={busy}>
            ← Back
          </button>
        ) : null
      }
    >
      <div className="instrument instrument--wide">
        <p className="item-statement item-statement--sm">&quot;{item.text}.&quot;</p>
        <LikertScale
          anchors={ENJOYMENT_ANCHORS}
          value={savedValue}
          onSelect={onAnswer}
          disabled={busy}
        />
        {canSkip && (
          <button type="button" className="btn btn--ghost skip-action" onClick={onSkip} disabled={busy}>
            Skip — infer from personality
          </button>
        )}
      </div>
    </ScreenShell>
  );
}
```

Append to `frontend/src/screens/screens.css`:

```css
.instrument {
  width: 100%;
  max-width: 520px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.instrument--wide {
  max-width: 640px;
}

.skip-action {
  margin-top: 24px;
}
```

- [ ] **Step 5: Wire both into App.jsx**

Delete `BigFiveQuestionCard` (`231-260`) and `RiasecQuestionCard` (`263-299`) and the now-unused `LIKERT` / `ENJOY_LIKERT` constants (`57-71`). Import the two screens and render them in place of the old cards:

```jsx
          {step === "big_five" && currentBigFiveItem && (
            <BigFiveScreen
              item={currentBigFiveItem}
              savedValue={bigFiveAnswers[currentBigFiveItem.id] ?? null}
              index={bigFiveIndex}
              total={bigFiveItems.length}
              busy={busy.bigFive}
              onAnswer={handleSubmitBigFive}
              onBack={handleBackBigFive}
              canGoBack={bigFiveIndex > 0}
            />
          )}

          {step === "riasec" && riasecItems[riasecIndex] && (
            <RiasecScreen
              item={riasecItems[riasecIndex]}
              savedValue={riasecAnswers[riasecItems[riasecIndex].id] ?? null}
              index={riasecIndex}
              total={riasecItems.length}
              busy={busy.riasec || busy.riasecSkip}
              onAnswer={handleSubmitRiasec}
              onBack={() => setRiasecIndex((i) => Math.max(0, i - 1))}
              canGoBack={riasecIndex > 0}
              onSkip={handleSkipRiasec}
              canSkip={Object.keys(riasecAnswers).length === 0}
            />
          )}
```

- [ ] **Step 6: Run the tests**

Run: `cd frontend && npm test -- --run`
Expected: PASS, including the 14 new tests.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/ui frontend/src/screens frontend/src/App.jsx
git commit -m "feat(ui): rebuild the Big Five and Interests steps on a shared Likert primitive"
```

---

### Task 7: Demographics on one screen

The only flow change in the redesign: four questions at once instead of four screens. The route still takes one answer per POST, so the screen collects and `App.jsx` sends them in order.

**Files:**
- Modify: `frontend/src/lifePath.js` (add two pure helpers next to `firstUnansweredIndex`)
- Modify: `frontend/src/lifePath.test.js` (tests for them)
- Create: `frontend/src/screens/DemographicsScreen.jsx`
- Create: `frontend/src/screens/DemographicsScreen.test.jsx`
- Modify: `frontend/src/screens/screens.css`
- Modify: `frontend/src/App.jsx` (delete `DemographicQuestionCard` at `167-229`, `handleSubmitDemographic` at `735-761`, `handleBackDemographic` at `763-768`, the `demoIndex`/`demoDraft` state at `535-536`, and `currentDemographicQuestion` at `1000`; add `demoDrafts` state and `handleSubmitDemographics`)

**Interfaces:**
- Consumes: `ScreenShell`.
- Produces:
  - `demographicsComplete(questions, drafts) -> boolean` — true when every question has a usable draft.
  - `demographicsPayloads(questions, drafts, saved = {}) -> [{ questionId, value }]` — in question order, numbers coerced, already-saved identical answers skipped.
  - `DemographicsScreen` — `({ questions, drafts, onDraftChange, busy, onSubmit })`; `onDraftChange(questionId, value)`. The screen never sees the saved answers: `App.jsx` holds them and passes them to `demographicsPayloads` when it submits.

- [ ] **Step 1: Write the failing helper tests**

Append to `frontend/src/lifePath.test.js` (and add `demographicsComplete, demographicsPayloads` to the import list at the top):

```js
describe("demographics one-screen helpers", () => {
  const questions = [
    { id: "sex", kind: "single" },
    { id: "age", kind: "number" },
    { id: "country", kind: "text" },
    { id: "city", kind: "text" },
  ];

  it("is incomplete until every question has a usable draft", () => {
    expect(demographicsComplete(questions, {})).toBe(false);
    expect(
      demographicsComplete(questions, { sex: "female", age: "32", country: "Ireland", city: "" })
    ).toBe(false);
    expect(
      demographicsComplete(questions, { sex: "female", age: "32", country: "Ireland", city: "  " })
    ).toBe(false);
    expect(
      demographicsComplete(questions, { sex: "female", age: "abc", country: "Ireland", city: "Dublin" })
    ).toBe(false);
    expect(
      demographicsComplete(questions, { sex: "female", age: "32", country: "Ireland", city: "Dublin" })
    ).toBe(true);
  });

  it("builds one payload per question, in order, coercing numbers", () => {
    expect(
      demographicsPayloads(questions, {
        sex: "female",
        age: "32",
        country: "Ireland",
        city: "Dublin",
      })
    ).toEqual([
      { questionId: "sex", value: "female" },
      { questionId: "age", value: 32 },
      { questionId: "country", value: "Ireland" },
      { questionId: "city", value: "Dublin" },
    ]);
  });

  it("skips answers the snapshot already holds, so a retry only sends the rest", () => {
    const drafts = { sex: "female", age: "32", country: "Ireland", city: "Dublin" };
    const saved = { sex: "female", age: 32 };
    expect(demographicsPayloads(questions, drafts, saved)).toEqual([
      { questionId: "country", value: "Ireland" },
      { questionId: "city", value: "Dublin" },
    ]);
  });

  it("sends nothing when every draft already matches the snapshot", () => {
    // This is the rail-revisit case. The empty result is correct here — it is
    // App.jsx's job to fall back to a single re-post so the step still advances.
    const drafts = { sex: "female", age: "32", country: "Ireland", city: "Dublin" };
    const saved = { sex: "female", age: 32, country: "Ireland", city: "Dublin" };
    expect(demographicsPayloads(questions, drafts, saved)).toEqual([]);
  });

  it("produces every payload when nothing is saved, which is that fallback's input", () => {
    const drafts = { sex: "female", age: "32", country: "Ireland", city: "Dublin" };
    expect(demographicsPayloads(questions, drafts, {})).toHaveLength(4);
  });

  it("drops empty and unparseable drafts rather than posting them", () => {
    expect(
      demographicsPayloads(questions, { sex: "", age: "abc", country: "Ireland", city: null })
    ).toEqual([{ questionId: "country", value: "Ireland" }]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd frontend && npm test -- --run src/lifePath.test.js`
Expected: FAIL — `demographicsComplete is not a function`.

- [ ] **Step 3: Implement the helpers**

In `frontend/src/lifePath.js`, after `firstUnansweredIndex`:

```js
// The demographics step collects all four answers before submitting, but the
// route takes one at a time. These two turn the screen's drafts into that
// sequence — and into the button's enabled state.
function usableDraft(question, raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return false;
  if (question.kind === "number") return Number.isFinite(Number(raw));
  return true;
}

export function demographicsComplete(questions, drafts = {}) {
  return questions.every((q) => usableDraft(q, drafts[q.id]));
}

export function demographicsPayloads(questions, drafts = {}, saved = {}) {
  const payloads = [];
  for (const q of questions) {
    const raw = drafts[q.id];
    if (!usableDraft(q, raw)) continue;
    const value = q.kind === "number" ? Number(raw) : raw;
    // A retry after a mid-chain failure must not re-post what already landed.
    if (saved[q.id] === value) continue;
    payloads.push({ questionId: q.id, value });
  }
  return payloads;
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `cd frontend && npm test -- --run src/lifePath.test.js`
Expected: PASS.

- [ ] **Step 5: Write the failing screen test**

Create `frontend/src/screens/DemographicsScreen.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DemographicsScreen from "./DemographicsScreen";

const questions = [
  {
    id: "sex",
    kind: "single",
    question: "What is your sex?",
    options: [
      { value: "female", label: "Female" },
      { value: "male", label: "Male" },
      { value: "other", label: "Other / non-binary" },
      { value: "prefer_not", label: "Prefer not to say" },
    ],
  },
  { id: "age", kind: "number", question: "How old are you?", placeholder: "e.g. 32" },
  { id: "country", kind: "text", question: "Which country are you currently based in?", placeholder: "Type your country" },
  { id: "city", kind: "text", question: "Which city are you based in?", placeholder: "Type your city" },
];

const base = {
  questions,
  drafts: {},
  onDraftChange: () => {},
  saved: {},
  busy: false,
  onSubmit: () => {},
};

describe("DemographicsScreen", () => {
  it("carries the step copy verbatim", () => {
    render(<DemographicsScreen {...base} />);
    expect(screen.getByText("step 1 · demographics")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "A little about you" })).toBeInTheDocument();
    expect(screen.getByText("Four quick questions — sex, age, country, city.")).toBeInTheDocument();
  });

  it("shows all four questions at once", () => {
    render(<DemographicsScreen {...base} />);
    questions.forEach((q) => expect(screen.getByText(q.question)).toBeInTheDocument());
    expect(screen.getByPlaceholderText("Type your city")).toBeInTheDocument();
    expect(screen.getByLabelText("Other / non-binary")).toBeInTheDocument();
  });

  it("reports drafts as they change", () => {
    const onDraftChange = vi.fn();
    render(<DemographicsScreen {...base} onDraftChange={onDraftChange} />);
    fireEvent.click(screen.getByLabelText("Male"));
    expect(onDraftChange).toHaveBeenCalledWith("sex", "male");
    fireEvent.change(screen.getByPlaceholderText("e.g. 32"), { target: { value: "32" } });
    expect(onDraftChange).toHaveBeenCalledWith("age", "32");
  });

  it("keeps the continue button locked until all four are answered", () => {
    const { rerender } = render(<DemographicsScreen {...base} />);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    rerender(
      <DemographicsScreen
        {...base}
        drafts={{ sex: "male", age: "32", country: "Ireland", city: "Dublin" }}
      />
    );
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("marks the chosen option as checked", () => {
    render(<DemographicsScreen {...base} drafts={{ sex: "female" }} />);
    expect(screen.getByLabelText("Female")).toBeChecked();
    expect(screen.getByLabelText("Male")).not.toBeChecked();
  });

  it("submits once", () => {
    const onSubmit = vi.fn();
    render(
      <DemographicsScreen
        {...base}
        drafts={{ sex: "male", age: "32", country: "Ireland", city: "Dublin" }}
        onSubmit={onSubmit}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `cd frontend && npm test -- --run src/screens/DemographicsScreen.test.jsx`
Expected: FAIL — unresolved import.

- [ ] **Step 7: Implement the screen**

Create `frontend/src/screens/DemographicsScreen.jsx`:

```jsx
import ScreenShell from "../ui/ScreenShell";
import { demographicsComplete } from "../lifePath";
import "./screens.css";

// Radios are real radios: one native input per option, hidden behind the
// ring so keyboard and screen-reader users get the grouping for free.
function ChoiceField({ question, value, onChange, busy }) {
  return (
    <div className="demo-choices" role="group" aria-label={question.question}>
      {question.options.map((option) => (
        <label key={option.value} className="demo-choice">
          <input
            type="radio"
            name={question.id}
            value={option.value}
            checked={value === option.value}
            disabled={busy}
            onChange={() => onChange(question.id, option.value)}
          />
          <span className="demo-choice-ring" aria-hidden="true" />
          <span className="demo-choice-label">{option.label}</span>
        </label>
      ))}
    </div>
  );
}

export default function DemographicsScreen({
  questions,
  drafts,
  onDraftChange,
  busy,
  onSubmit,
}) {
  const ready = demographicsComplete(questions, drafts) && !busy;

  return (
    <ScreenShell
      eyebrow="step 1 · demographics"
      title="A little about you"
      sub="Four quick questions — sex, age, country, city."
    >
      <div className="demo-grid">
        {questions.map((question) => (
          <div className="demo-field" key={question.id}>
            <div className="demo-question">{question.question}</div>
            {question.kind === "single" ? (
              <ChoiceField
                question={question}
                value={drafts[question.id] ?? null}
                onChange={onDraftChange}
                busy={busy}
              />
            ) : (
              <input
                className="demo-input"
                type={question.kind === "number" ? "number" : "text"}
                min={question.min}
                max={question.max}
                placeholder={question.placeholder}
                value={drafts[question.id] ?? ""}
                disabled={busy}
                onChange={(event) => onDraftChange(question.id, event.target.value)}
              />
            )}
          </div>
        ))}
      </div>

      <button type="button" className="btn btn--gold demo-submit" onClick={onSubmit} disabled={!ready}>
        {busy ? "Saving…" : "Continue"}
      </button>
    </ScreenShell>
  );
}
```

Append to `frontend/src/screens/screens.css`:

```css
.demo-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  max-width: 760px;
  width: 100%;
  text-align: left;
}

.demo-question {
  font: 600 15px/1.4 var(--font-body);
  color: var(--text);
  margin-bottom: 10px;
}

.demo-choices {
  display: flex;
  flex-direction: column;
}

.demo-choice {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--gold-15);
  cursor: pointer;
}

.demo-choice input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.demo-choice-ring {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid var(--gold-50);
  flex-shrink: 0;
  transition: background var(--t-fast) ease, box-shadow var(--t-fast) ease;
}

.demo-choice input:checked + .demo-choice-ring {
  background: var(--gold);
  box-shadow: 0 0 12px var(--gold-focus);
}

.demo-choice input:focus-visible + .demo-choice-ring {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}

.demo-choice-label {
  font: 400 14px/1 var(--font-body);
  color: var(--text-72);
}

.demo-choice input:checked ~ .demo-choice-label {
  color: var(--text);
}

.demo-input {
  width: 100%;
  padding: 10px 0;
  border: none;
  border-bottom: 1px solid var(--gold-35);
  background: transparent;
  color: var(--text);
  font: 400 15px/1.4 var(--font-body);
  border-radius: 0;
  outline: none;
}

.demo-input:focus {
  border-bottom-color: var(--gold);
}

.demo-submit {
  margin-top: 34px;
}
```

- [ ] **Step 8: Rewire App.jsx**

Replace the `demoIndex`/`demoDraft` state with one draft map, seeded from the snapshot so a rail revisit shows the saved answers:

```jsx
  const [demoDrafts, setDemoDrafts] = useState({});
```

In `hydrateFromSnapshot`, replace the `setDemoIndex(...)` line with:

```jsx
    setDemoDrafts(
      Object.fromEntries(
        Object.entries(data.demographics || {}).map(([id, value]) => [id, String(value)])
      )
    );
```

Replace `handleSubmitDemographic` and `handleBackDemographic` with:

```jsx
  const handleDemoDraftChange = (questionId, value) =>
    setDemoDrafts((drafts) => ({ ...drafts, [questionId]: value }));

  // All four answers land on one screen, but the route takes one at a time and
  // advances the step the moment all four are present. On a first pass that is
  // the last POST, and the loop is trivial. A rail revisit is where it bites:
  //   * Every answer is already saved, so the FIRST post advances the step and
  //     every later one 400s on the route's step guard — silently dropping the
  //     user's other edits. Stepping back through /goto keeps them all.
  //   * If the revisit changed nothing there is no post to make at all, and the
  //     user would sit on a Continue button that does nothing. Re-posting one
  //     unchanged answer is what makes the backend re-run its all-answered
  //     check and move forward, which is the documented rail invariant:
  //     completing a revisited step advances exactly as on the first pass.
  // A failure mid-chain leaves the earlier answers saved; re-submitting sends
  // only what the snapshot still lacks.
  const handleSubmitDemographics = async () => {
    if (!sessionId) return;
    const changed = demographicsPayloads(demographicQuestions, demoDrafts, demoAnswers);
    const payloads = changed.length
      ? changed
      : demographicsPayloads(demographicQuestions, demoDrafts, {}).slice(0, 1);
    if (!payloads.length) return;
    setError("");
    setBusy((p) => ({ ...p, demo: true }));
    try {
      let currentStep = step;
      for (const payload of payloads) {
        if (currentStep !== "demographics") {
          const back = await sessionGoto({ sessionId, step: "demographics" });
          applySessionSnapshot(back);
          currentStep = back.step;
        }
        const data = await submitDemographics({ sessionId, ...payload });
        applySessionSnapshot(data);
        currentStep = data.step;
      }
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setBusy((p) => ({ ...p, demo: false }));
    }
  };
```

Render it, replacing the `DemographicQuestionCard` block:

```jsx
          {!showRail && step === "demographics" && demographicQuestions.length > 0 && (
            <DemographicsScreen
              questions={demographicQuestions}
              drafts={demoDrafts}
              onDraftChange={handleDemoDraftChange}
              busy={busy.demo}
              onSubmit={handleSubmitDemographics}
            />
          )}
```

Add `demographicsPayloads` to the `./lifePath` import list and drop `firstUnansweredIndex`'s demographics call. Delete the now-unused `draftFromAnswer` if nothing else references it (check first — the journey step has its own draft handling).

- [ ] **Step 9: Run the tests**

Run: `cd frontend && npm test -- --run`
Expected: PASS, including the 4 helper tests and 6 screen tests.

- [ ] **Step 10: Exercise it against the real backend**

Run `npm run dev` from the repo root; start a session, fill all four fields, press Continue.
Expected: one screen, four POSTs, the app advances to Big Five. Reload mid-step: the saved answers come back in the fields.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/lifePath.js frontend/src/lifePath.test.js frontend/src/screens frontend/src/App.jsx
git commit -m "feat(ui): collect all four demographics on one screen"
```

---

### Task 8: Split choice primitive and the values tournament

**Files:**
- Create: `frontend/src/ui/SplitChoice.jsx`
- Create: `frontend/src/ui/SplitChoice.test.jsx`
- Create: `frontend/src/screens/ValuesTournamentScreen.jsx`
- Create: `frontend/src/screens/ValuesTournamentScreen.test.jsx`
- Modify: `frontend/src/ui/ui.css`
- Modify: `frontend/src/App.jsx` (delete `ValuesComparisonCard` at `370-405`; render the screen)

**Interfaces:**
- Consumes: `ScreenShell`, `WORK_VALUE_META` from `lifePath.js`.
- Produces:
  - `SplitChoice` — `({ a, b, onChoose, disabled = false, divider = "or" })` where `a`/`b` are `{ key, title, body }`; clicking a half calls `onChoose(key)`.
  - `ValuesTournamentScreen` — `({ comparison, progress, busy, onChoose })`; `comparison` is `{ a, b }` work-value keys, `progress` is `{ answered, total }` or null.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/ui/SplitChoice.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SplitChoice from "./SplitChoice";

const a = { key: "achievement", title: "Achievement", body: "Ability utilization and personal accomplishment in your work." };
const b = { key: "independence", title: "Independence", body: "Working on your own and making your own decisions." };

describe("SplitChoice", () => {
  it("renders both halves with their titles and blurbs", () => {
    render(<SplitChoice a={a} b={b} onChoose={() => {}} />);
    expect(screen.getByText("Achievement")).toBeInTheDocument();
    expect(screen.getByText("Working on your own and making your own decisions.")).toBeInTheDocument();
  });

  it("puts the divider label between them", () => {
    render(<SplitChoice a={a} b={b} onChoose={() => {}} />);
    expect(screen.getByText("or")).toBeInTheDocument();
  });

  it("reports the key of the half that was picked", () => {
    const onChoose = vi.fn();
    render(<SplitChoice a={a} b={b} onChoose={onChoose} />);
    fireEvent.click(screen.getByRole("button", { name: /Independence/ }));
    expect(onChoose).toHaveBeenCalledWith("independence");
  });

  it("goes inert while the answer is in flight", () => {
    render(<SplitChoice a={a} b={b} onChoose={() => {}} disabled />);
    screen.getAllByRole("button").forEach((button) => expect(button).toBeDisabled());
  });
});
```

Create `frontend/src/screens/ValuesTournamentScreen.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ValuesTournamentScreen from "./ValuesTournamentScreen";

const base = {
  comparison: { a: "achievement", b: "independence" },
  progress: { answered: 5, total: 10 },
  busy: false,
  onChoose: () => {},
};

describe("ValuesTournamentScreen", () => {
  it("carries the step copy verbatim", () => {
    render(<ValuesTournamentScreen {...base} />);
    expect(screen.getByText("step 4 · values tournament · comparison 6 of 10")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Which matters more?" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "An adaptive Ford–Johnson merge-insertion tournament, ≤10 comparisons, ranking the six Minnesota work values: Achievement, Independence, Recognition, Relationships, Support, Working Conditions."
      )
    ).toBeInTheDocument();
  });

  it("labels both halves from the shared work-value metadata", () => {
    render(<ValuesTournamentScreen {...base} />);
    expect(screen.getByText("Achievement")).toBeInTheDocument();
    expect(screen.getByText("Independence")).toBeInTheDocument();
  });

  it("passes the winner up as a work-value key", () => {
    const onChoose = vi.fn();
    render(<ValuesTournamentScreen {...base} onChoose={onChoose} />);
    fireEvent.click(screen.getByRole("button", { name: /Achievement/ }));
    expect(onChoose).toHaveBeenCalledWith("achievement");
  });

  it("falls back to a bare eyebrow when progress is unknown", () => {
    render(<ValuesTournamentScreen {...base} progress={null} />);
    expect(screen.getByText("step 4 · values tournament")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd frontend && npm test -- --run src/ui/SplitChoice.test.jsx src/screens/ValuesTournamentScreen.test.jsx`
Expected: FAIL — two unresolved imports.

- [ ] **Step 3: Implement the primitive**

Create `frontend/src/ui/SplitChoice.jsx`:

```jsx
import "./ui.css";

// Two halves of one decision, bounded by hairlines and split by a ruled
// divider carrying a small label. Used by the values tournament and the
// experience step.
export default function SplitChoice({ a, b, onChoose, disabled = false, divider = "or" }) {
  return (
    <div className="split">
      <button
        type="button"
        className="split-half"
        onClick={() => onChoose(a.key)}
        disabled={disabled}
      >
        <span className="split-title">{a.title}</span>
        <span className="split-body">{a.body}</span>
      </button>

      <div className="split-rule">
        <span className="split-rule-label">{divider}</span>
      </div>

      <button
        type="button"
        className="split-half"
        onClick={() => onChoose(b.key)}
        disabled={disabled}
      >
        <span className="split-title">{b.title}</span>
        <span className="split-body">{b.body}</span>
      </button>
    </div>
  );
}
```

Append to `frontend/src/ui/ui.css`:

```css
.split {
  display: flex;
  align-items: stretch;
  width: 100%;
  max-width: 820px;
  border-top: 1px solid var(--gold-25);
  border-bottom: 1px solid var(--gold-25);
}

.split-half {
  flex: 1;
  text-align: left;
  padding: 34px 30px;
  background: transparent;
  color: var(--text);
  transition: background var(--t-fast) ease;
}

.split-half:hover:enabled {
  background: var(--gold-hover);
}

.split-half:disabled {
  opacity: 0.5;
  cursor: default;
}

.split-title {
  display: block;
  font: 900 34px/1 var(--font-display);
  letter-spacing: -0.02em;
  color: var(--text);
}

.split-body {
  display: block;
  margin-top: 14px;
  font: 400 14px/1.5 var(--font-body);
  color: var(--text-60);
}

.split-rule {
  width: 1px;
  background: var(--gold-25);
  position: relative;
  flex-shrink: 0;
}

.split-rule-label {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--ink-screen);
  color: var(--gold-60);
  font: 600 11px/1 var(--font-mono);
  padding: 6px 4px;
}
```

- [ ] **Step 4: Implement the screen**

Create `frontend/src/screens/ValuesTournamentScreen.jsx`:

```jsx
import ScreenShell from "../ui/ScreenShell";
import SplitChoice from "../ui/SplitChoice";
import { WORK_VALUE_META } from "../lifePath";
import "./screens.css";

function half(key) {
  const meta = WORK_VALUE_META[key] || { label: key, blurb: "" };
  return { key, title: meta.label, body: meta.blurb };
}

export default function ValuesTournamentScreen({ comparison, progress, busy, onChoose }) {
  const eyebrow = progress
    ? `step 4 · values tournament · comparison ${progress.answered + 1} of ${progress.total}`
    : "step 4 · values tournament";

  return (
    <ScreenShell eyebrow={eyebrow} title="Which matters more?" glow="none">
      <SplitChoice
        a={half(comparison.a)}
        b={half(comparison.b)}
        onChoose={onChoose}
        disabled={busy}
      />
      <p className="screen-footnote">
        An adaptive Ford–Johnson merge-insertion tournament, ≤10 comparisons, ranking the six
        Minnesota work values: Achievement, Independence, Recognition, Relationships, Support,
        Working Conditions.
      </p>
    </ScreenShell>
  );
}
```

Append to `frontend/src/screens/screens.css`:

```css
.screen-footnote {
  margin: 24px 0 0;
  max-width: 600px;
  font: 400 12.5px/1.5 var(--font-body);
  color: var(--text-40);
}

/* The tournament headline is the one that runs uppercase and larger. */
.screen--tournament .screen-title {
  font-size: 44px;
  line-height: 1.05;
  text-transform: uppercase;
  margin-bottom: 34px;
}
```

Give the tournament shell that class by passing `className` through `ScreenShell` — add the prop:

```jsx
export default function ScreenShell({ /* … */ className = "", children }) {
  return (
    <section className={`screen screen--glow-${glow} screen--${align} ${className}`}>
```

and render the screen with `className="screen--tournament"`.

- [ ] **Step 5: Wire it into App.jsx**

Delete `ValuesComparisonCard` and render:

```jsx
          {step === "values" && valuesComparison && (
            <ValuesTournamentScreen
              comparison={valuesComparison}
              progress={progress?.values || null}
              busy={busy.values}
              onChoose={handleValuesAnswer}
            />
          )}
```

- [ ] **Step 6: Run the tests**

Run: `cd frontend && npm test -- --run`
Expected: PASS, including the 8 new tests. Update the `ScreenShell` test if the added `className` prop changed the root class string — it appends, so the existing assertions still hold.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/ui frontend/src/screens frontend/src/App.jsx
git commit -m "feat(ui): rebuild the values tournament on a split-choice primitive"
```

---

### Task 9: Drag-to-reorder hierarchy

The design labels the rows "drag to reorder", so they must actually drag. Keyboard reordering is the accessible path, not an afterthought.

**Files:**
- Modify: `frontend/src/lifePath.js` (add `moveRankItemTo` next to `moveRankItem`)
- Modify: `frontend/src/lifePath.test.js`
- Create: `frontend/src/ui/RankList.jsx`
- Create: `frontend/src/ui/RankList.test.jsx`
- Create: `frontend/src/screens/ValuesHierarchyScreen.jsx`
- Create: `frontend/src/screens/ValuesHierarchyScreen.test.jsx`
- Modify: `frontend/src/ui/ui.css`
- Modify: `frontend/src/App.jsx` (delete `ValuesHierarchyCard` at `407-454`; render the screen)

**Interfaces:**
- Consumes: `ScreenShell`.
- Produces:
  - `moveRankItemTo(list, from, to) -> list` — lift-and-insert; returns the input list unchanged for a no-op or out-of-range move.
  - `RankList` — `({ items, onReorder, disabled = false, hint = "drag to reorder" })` where `items` is `[{ id, label }]`; `onReorder(from, to)`.
  - `ValuesHierarchyScreen` — `({ ranking, onReorder, busy, onConfirm })`; `ranking` is the six work-value keys in order.

- [ ] **Step 1: Write the failing helper test**

Append to `frontend/src/lifePath.test.js` (adding `moveRankItemTo` to the imports):

```js
describe("moveRankItemTo", () => {
  const list = ["a", "b", "c", "d"];

  it("lifts an item and inserts it at the target index", () => {
    expect(moveRankItemTo(list, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveRankItemTo(list, 3, 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("is a no-op for the same index and for out-of-range moves", () => {
    expect(moveRankItemTo(list, 1, 1)).toBe(list);
    expect(moveRankItemTo(list, -1, 2)).toBe(list);
    expect(moveRankItemTo(list, 0, 9)).toBe(list);
  });

  it("does not mutate and always returns a permutation of the input", () => {
    const result = moveRankItemTo(list, 0, 3);
    expect(list).toEqual(["a", "b", "c", "d"]);
    expect([...result].sort()).toEqual([...list].sort());
    expect(result).toHaveLength(list.length);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npm test -- --run src/lifePath.test.js`
Expected: FAIL — `moveRankItemTo is not a function`.

- [ ] **Step 3: Implement the helper**

In `frontend/src/lifePath.js`, after `moveRankItem`:

```js
// Drag reorder: lift the item at `from` and insert it at `to`. Pure, and a
// no-op for a move that would not change anything.
export function moveRankItemTo(list, from, to) {
  if (from === to) return list;
  if (from < 0 || from >= list.length) return list;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd frontend && npm test -- --run src/lifePath.test.js`
Expected: PASS.

- [ ] **Step 5: Write the failing component tests**

Create `frontend/src/ui/RankList.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RankList from "./RankList";

const items = [
  { id: "achievement", label: "Achievement" },
  { id: "independence", label: "Independence" },
  { id: "recognition", label: "Recognition" },
];

describe("RankList", () => {
  it("numbers the rows from one and shows the design's hint", () => {
    render(<RankList items={items} onReorder={() => {}} />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getAllByText("drag to reorder")).toHaveLength(3);
  });

  it("exposes rows as a listbox so a screen reader can work the order", () => {
    render(<RankList items={items} onReorder={() => {}} />);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("reorders with the arrow keys", () => {
    const onReorder = vi.fn();
    render(<RankList items={items} onReorder={onReorder} />);
    const row = screen.getAllByRole("option")[1];
    fireEvent.keyDown(row, { key: "ArrowUp" });
    expect(onReorder).toHaveBeenCalledWith(1, 0);
    fireEvent.keyDown(row, { key: "ArrowDown" });
    expect(onReorder).toHaveBeenCalledWith(1, 2);
  });

  it("jumps to the ends with Home and End", () => {
    const onReorder = vi.fn();
    render(<RankList items={items} onReorder={onReorder} />);
    const row = screen.getAllByRole("option")[2];
    fireEvent.keyDown(row, { key: "Home" });
    expect(onReorder).toHaveBeenCalledWith(2, 0);
    fireEvent.keyDown(row, { key: "End" });
    expect(onReorder).toHaveBeenCalledWith(2, 2);
  });

  it("reorders on drop", () => {
    const onReorder = vi.fn();
    render(<RankList items={items} onReorder={onReorder} />);
    const rows = screen.getAllByRole("option");
    fireEvent.dragStart(rows[0]);
    fireEvent.dragOver(rows[2]);
    fireEvent.drop(rows[2]);
    expect(onReorder).toHaveBeenCalledWith(0, 2);
  });

  it("ignores keys and drags while disabled", () => {
    const onReorder = vi.fn();
    render(<RankList items={items} onReorder={onReorder} disabled />);
    const rows = screen.getAllByRole("option");
    fireEvent.keyDown(rows[1], { key: "ArrowUp" });
    // The drag half of this test's name has to be exercised too, or a
    // regression that drops the guard from the drag handlers goes unseen.
    fireEvent.dragStart(rows[0]);
    fireEvent.dragOver(rows[2]);
    fireEvent.drop(rows[2]);
    expect(onReorder).not.toHaveBeenCalled();
  });
});
```

Create `frontend/src/screens/ValuesHierarchyScreen.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ValuesHierarchyScreen from "./ValuesHierarchyScreen";

const ranking = [
  "achievement",
  "independence",
  "recognition",
  "relationships",
  "support",
  "working_conditions",
];

const base = { ranking, onReorder: () => {}, busy: false, onConfirm: () => {} };

describe("ValuesHierarchyScreen", () => {
  it("carries the step copy verbatim", () => {
    render(<ValuesHierarchyScreen {...base} />);
    expect(screen.getByText("step 4b · confirm your hierarchy")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your work values, ranked" })).toBeInTheDocument();
    expect(
      screen.getByText("The tournament result — reorder if something looks off, then confirm.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm hierarchy" })).toBeInTheDocument();
  });

  it("lists all six values with their human labels", () => {
    render(<ValuesHierarchyScreen {...base} />);
    expect(screen.getAllByRole("option")).toHaveLength(6);
    expect(screen.getByText("Working Conditions")).toBeInTheDocument();
  });

  it("confirms the hierarchy", () => {
    const onConfirm = vi.fn();
    render(<ValuesHierarchyScreen {...base} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm hierarchy" }));
    expect(onConfirm).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run them and watch them fail**

Run: `cd frontend && npm test -- --run src/ui/RankList.test.jsx src/screens/ValuesHierarchyScreen.test.jsx`
Expected: FAIL — two unresolved imports.

- [ ] **Step 7: Implement the list**

Create `frontend/src/ui/RankList.jsx`:

```jsx
import { useState } from "react";
import "./ui.css";

// A reorderable ranking. Drag is the advertised interaction; the arrow keys
// are the one that works without a mouse, so both go through the same
// onReorder(from, to) callback.
export default function RankList({ items, onReorder, disabled = false, hint = "drag to reorder" }) {
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const keyMove = (event, index) => {
    if (disabled) return;
    const targets = {
      ArrowUp: index - 1,
      ArrowDown: index + 1,
      Home: 0,
      End: items.length - 1,
    };
    if (!(event.key in targets)) return;
    event.preventDefault();
    const to = Math.max(0, Math.min(items.length - 1, targets[event.key]));
    onReorder(index, to);
  };

  return (
    <ol className="rank-list" role="listbox" aria-label="Your work values, ranked">
      {items.map((item, index) => (
        <li
          key={item.id}
          role="option"
          aria-selected={dragFrom === index}
          tabIndex={0}
          draggable={!disabled}
          className={[
            "rank-row",
            dragOver === index && dragFrom !== null ? "rank-row--over" : "",
            dragFrom === index ? "rank-row--dragging" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onDragStart={(event) => {
            if (disabled) return;
            // Firefox refuses to start a drag with no payload, and jsdom's
            // synthetic events carry no dataTransfer at all — hence the guard.
            event.dataTransfer?.setData?.("text/plain", String(index));
            setDragFrom(index);
          }}
          onDragOver={(event) => {
            if (disabled || dragFrom === null) return;
            event.preventDefault();
            setDragOver(index);
          }}
          onDrop={(event) => {
            if (disabled || dragFrom === null) return;
            event.preventDefault();
            onReorder(dragFrom, index);
            setDragFrom(null);
            setDragOver(null);
          }}
          onDragEnd={() => {
            setDragFrom(null);
            setDragOver(null);
          }}
          onKeyDown={(event) => keyMove(event, index)}
        >
          <span className="rank-number">{index + 1}</span>
          <span className="rank-label">{item.label}</span>
          <span className="rank-hint">{hint}</span>
        </li>
      ))}
    </ol>
  );
}
```

Append to `frontend/src/ui/ui.css`:

```css
/* Scoped under .screen for the same reason the hero's attribution is scoped:
   the legacy App.css still defines .rank-list, .rank-row and .rank-label at
   single-class specificity and is imported after ui.css, so unscoped rules
   here would lose outright — its `border` shorthand and padding would repaint
   these rows as the old grey boxes. Task 14 deletes the legacy rules; the
   scoping stays correct either way. */
.screen .rank-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 560px;
  text-align: left;
}

.screen .rank-row {
  display: flex;
  align-items: baseline;
  gap: 20px;
  padding: 16px 0;
  border-bottom: 1px solid var(--gold-18);
  cursor: grab;
  transition: background var(--t-fast) ease, border-color var(--t-fast) ease;
}

.screen .rank-row--dragging {
  opacity: 0.55;
}

.screen .rank-row--over {
  background: var(--gold-hover);
  border-bottom-color: var(--gold);
}

.screen .rank-number {
  font: 900 30px/1 var(--font-display);
  color: var(--gold-35);
  min-width: 1.2em;
}

.screen .rank-label {
  font: 600 17px/1 var(--font-body);
  color: var(--text);
  flex: 1;
}

.screen .rank-hint {
  font: 400 10px/1 var(--font-mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--gold-50);
}
```

- [ ] **Step 8: Implement the screen**

Create `frontend/src/screens/ValuesHierarchyScreen.jsx`:

```jsx
import ScreenShell from "../ui/ScreenShell";
import RankList from "../ui/RankList";
import { WORK_VALUE_META } from "../lifePath";
import "./screens.css";

export default function ValuesHierarchyScreen({ ranking, onReorder, busy, onConfirm }) {
  const items = ranking.map((id) => ({ id, label: WORK_VALUE_META[id]?.label || id }));

  return (
    <ScreenShell
      eyebrow="step 4b · confirm your hierarchy"
      title="Your work values, ranked"
      sub="The tournament result — reorder if something looks off, then confirm."
    >
      <RankList items={items} onReorder={onReorder} disabled={busy} />
      <button type="button" className="btn btn--gold rank-confirm" onClick={onConfirm} disabled={busy}>
        {busy ? "Saving…" : "Confirm hierarchy"}
      </button>
    </ScreenShell>
  );
}
```

Append to `frontend/src/screens/screens.css`:

```css
.rank-confirm {
  margin-top: 26px;
}
```

- [ ] **Step 9: Wire it into App.jsx**

Delete `ValuesHierarchyCard` and render, swapping the move callback for the index-pair one:

```jsx
          {step === "values" && !valuesComparison && valuesRankDraft.length === 6 && (
            <ValuesHierarchyScreen
              ranking={valuesRankDraft}
              onReorder={(from, to) => setValuesRankDraft((list) => moveRankItemTo(list, from, to))}
              busy={busy.valuesConfirm}
              onConfirm={handleValuesConfirm}
            />
          )}
```

Swap `moveRankItem` for `moveRankItemTo` in the `./lifePath` import list (`moveRankItem` keeps its tests and stays exported for now; Task 14 removes it if nothing uses it).

- [ ] **Step 10: Run the tests**

Run: `cd frontend && npm test -- --run`
Expected: PASS, including the 3 helper, 6 list and 3 screen tests.

- [ ] **Step 11: Verify the drag by hand**

Run `npm run dev`, reach the hierarchy step (or jump with the dev panel), drag row 4 onto row 1, then tab to a row and press ArrowUp/Home.
Expected: the order changes both ways, and Confirm posts the order the screen shows.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/lifePath.js frontend/src/lifePath.test.js frontend/src/ui frontend/src/screens frontend/src/App.jsx
git commit -m "feat(ui): make the work-values hierarchy actually draggable"
```

---

### Task 10: Experience step

**Files:**
- Create: `frontend/src/screens/ExperienceScreen.jsx`
- Create: `frontend/src/screens/ExperienceScreen.test.jsx`
- Modify: `frontend/src/screens/screens.css`
- Modify: `frontend/src/App.jsx` (delete `CvCard` at `301-368` and the inline journey-question block at `1481-1533`; render the screen)

**Interfaces:**
- Consumes: `ScreenShell`.
- Produces: `ExperienceScreen` — `({ intent, intentBusy, onSelectIntent, cvDraft, onCvDraftChange, onSubmitCvText, onUploadFile, uploadFormats, busy, journeyQuestion, journeyIndex, journeyTotal, journeyDraft, onJourneyDraftChange, onSubmitJourney, onStartJourney, mode })`. `mode` is `"choice" | "paste" | "journey"`, lifted unchanged from the current `cvMode` state.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/screens/ExperienceScreen.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ExperienceScreen from "./ExperienceScreen";

const base = {
  mode: "choice",
  intent: null,
  intentBusy: false,
  onSelectIntent: () => {},
  cvDraft: "",
  onCvDraftChange: () => {},
  onSubmitCvText: () => {},
  onUploadFile: () => {},
  uploadFormats: [".pdf", ".docx", ".html", ".txt", ".pptx"],
  busy: false,
  journeyQuestion: {
    id: "cj_role",
    question: "What is your current or most recent role?",
    placeholder: "e.g. shift manager at a cafe; student",
  },
  journeyIndex: 1,
  journeyTotal: 7,
  journeyDraft: "",
  onJourneyDraftChange: () => {},
  onSubmitJourney: () => {},
  onStartJourney: () => {},
};

describe("ExperienceScreen", () => {
  it("carries the step copy verbatim", () => {
    render(<ExperienceScreen {...base} />);
    expect(screen.getByText("step 5 · experience")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Where should we start from?" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Paste or upload a CV (.pdf/.docx/.html/.txt/.pptx, max 5 MB) — or answer seven career-journey questions if you don't have one."
      )
    ).toBeInTheDocument();
  });

  it("offers both intents and reports the pick", () => {
    const onSelectIntent = vi.fn();
    render(<ExperienceScreen {...base} onSelectIntent={onSelectIntent} />);
    fireEvent.click(screen.getByRole("button", { name: "Use the skills I already have" }));
    expect(onSelectIntent).toHaveBeenCalledWith("use_skills");
  });

  it("locks both paths until an intent is chosen", () => {
    const { rerender } = render(<ExperienceScreen {...base} />);
    expect(screen.getByRole("button", { name: /Paste its text/i })).toBeDisabled();
    rerender(<ExperienceScreen {...base} intent="new" />);
    expect(screen.getByRole("button", { name: /Paste its text/i })).toBeEnabled();
  });

  it("renders both halves of the split with the design's copy", () => {
    render(<ExperienceScreen {...base} intent="new" />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText('"What is your current or most recent role?"')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("e.g. shift manager at a cafe; student")
    ).toBeInTheDocument();
  });

  it("submits the B-side answer", () => {
    const onSubmitJourney = vi.fn();
    render(<ExperienceScreen {...base} intent="new" journeyDraft="barista" onSubmitJourney={onSubmitJourney} />);
    fireEvent.submit(screen.getByPlaceholderText("e.g. shift manager at a cafe; student").closest("form"));
    expect(onSubmitJourney).toHaveBeenCalled();
  });

  it("cancels a locked file drop so the browser cannot navigate away", () => {
    const onUploadFile = vi.fn();
    render(<ExperienceScreen {...base} onUploadFile={onUploadFile} />);
    const zone = screen.getByText("A").parentElement;
    // fireEvent returns false when a handler called preventDefault on a
    // cancelable event — which is the whole point here.
    expect(fireEvent.dragOver(zone)).toBe(false);
    expect(fireEvent.drop(zone)).toBe(false);
    expect(onUploadFile).not.toHaveBeenCalled();
  });

  it("shows the paste view when the mode says so", () => {
    render(<ExperienceScreen {...base} intent="new" mode="paste" cvDraft="my cv" />);
    expect(
      screen.getByPlaceholderText("Paste the text of your CV or a summary of your experience")
    ).toHaveValue("my cv");
    expect(screen.getByRole("button", { name: "Analyse my CV" })).toBeEnabled();
  });

  it("counts the journey questions in the eyebrow once they are running", () => {
    render(<ExperienceScreen {...base} intent="new" mode="journey" />);
    expect(screen.getByText("step 5 · experience · question 2 of 7")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npm test -- --run src/screens/ExperienceScreen.test.jsx`
Expected: FAIL — unresolved import.

- [ ] **Step 3: Implement the screen**

Create `frontend/src/screens/ExperienceScreen.jsx`:

```jsx
import ScreenShell from "../ui/ScreenShell";
import "./screens.css";

const CV_INTENT_OPTIONS = [
  { value: "new", label: "Something completely new" },
  { value: "use_skills", label: "Use the skills I already have" },
];

// A dotted rule, drawn the way the design draws it.
function DottedRule() {
  return (
    <svg className="dotted-rule" width="100%" height="2" aria-hidden="true">
      <line
        x1="0"
        y1="1"
        x2="100%"
        y2="1"
        stroke="rgba(255,217,140,.3)"
        strokeDasharray="1,7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function ExperienceScreen({
  mode,
  intent,
  intentBusy,
  onSelectIntent,
  cvDraft,
  onCvDraftChange,
  onStartPaste,
  onSubmitCvText,
  onUploadFile,
  uploadFormats,
  busy,
  journeyQuestion,
  journeyIndex,
  journeyTotal,
  journeyDraft,
  onJourneyDraftChange,
  onSubmitJourney,
  onStartJourney,
  footer,
}) {
  const eyebrow =
    mode === "journey"
      ? `step 5 · experience · question ${journeyIndex + 1} of ${journeyTotal}`
      : "step 5 · experience";

  if (mode === "paste") {
    return (
      <ScreenShell eyebrow={eyebrow} title="Paste your CV" footer={footer}>
        <textarea
          className="cv-paste"
          value={cvDraft}
          maxLength={6000}
          disabled={busy}
          placeholder="Paste the text of your CV or a summary of your experience"
          onChange={(event) => onCvDraftChange(event.target.value)}
        />
        <button
          type="button"
          className="btn btn--gold"
          onClick={onSubmitCvText}
          disabled={busy || !cvDraft.trim()}
        >
          {busy ? "Analysing…" : "Analyse my CV"}
        </button>
      </ScreenShell>
    );
  }

  // Both paths stay locked until the intent question above them is answered.
  const locked = !intent || busy;

  return (
    <ScreenShell
      eyebrow={eyebrow}
      title="Where should we start from?"
      sub="Paste or upload a CV (.pdf/.docx/.html/.txt/.pptx, max 5 MB) — or answer seven career-journey questions if you don't have one."
      footer={footer}
    >
      <div className="intent-row">
        {CV_INTENT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`intent-pill ${intent === option.value ? "intent-pill--on" : ""}`}
            disabled={intentBusy || busy}
            onClick={() => onSelectIntent(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className={`experience-split ${intent ? "" : "experience-split--locked"}`}>
        <DottedRule />

        <div className="experience-halves">
          <div
            className="experience-half"
            onDragOver={(event) => {
              // Cancel unconditionally, locked or not. An un-cancelled dragover
              // leaves the drop to the browser, which navigates the tab to the
              // dropped file and destroys the in-progress session.
              event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (locked) return;
              const file = event.dataTransfer?.files?.[0];
              if (file) onUploadFile(file);
            }}
          >
            <div className="ghost-numeral">A</div>
            <p className="experience-copy">
              Drop your CV file here,
              <br />
              or paste its text.
            </p>
            <div className="experience-actions">
              <button
                type="button"
                className="btn btn--ghost"
                disabled={locked}
                onClick={onStartPaste}
              >
                Paste its text
              </button>
              <label className={`btn btn--ghost ${locked ? "btn--locked" : ""}`}>
                Upload a file ({uploadFormats.join(", ")} — max 5 MB)
                <input
                  type="file"
                  accept={uploadFormats.join(",")}
                  hidden
                  disabled={locked}
                  onChange={(event) =>
                    event.target.files?.[0] && onUploadFile(event.target.files[0])
                  }
                />
              </label>
              <button
                type="button"
                className="link-action"
                disabled={locked}
                onClick={onStartJourney}
              >
                No CV — ask me 7 quick questions instead
              </button>
            </div>
          </div>

          <div className="experience-rule" />

          <div className="experience-half experience-half--b">
            <div className="ghost-numeral">B</div>
            <p className="item-statement item-statement--italic item-statement--sm">
              &quot;{journeyQuestion.question}&quot;
            </p>
            <form
              key={journeyQuestion.id}
              onSubmit={(event) => {
                event.preventDefault();
                onSubmitJourney();
              }}
            >
              <input
                className="demo-input"
                value={journeyDraft}
                maxLength={400}
                disabled={locked}
                placeholder={journeyQuestion.placeholder}
                onChange={(event) => onJourneyDraftChange(event.target.value)}
              />
            </form>
          </div>
        </div>

        <DottedRule />
      </div>
    </ScreenShell>
  );
}
```

- [ ] **Step 4: Style it**

Append to `frontend/src/screens/screens.css`:

```css
.intent-row {
  display: flex;
  gap: 12px;
  margin-bottom: 26px;
  flex-wrap: wrap;
  justify-content: center;
}

.intent-pill {
  padding: 10px 18px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--gold-20);
  background: var(--pill-idle);
  color: var(--text-60);
  font: 500 11px/1 var(--font-mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  transition: color var(--t-fast) ease, border-color var(--t-fast) ease, background var(--t-fast) ease;
}

.intent-pill--on {
  background: var(--gold);
  border-color: var(--gold);
  color: var(--ink-on-gold);
}

.experience-split {
  position: relative;
  width: 100%;
  max-width: 820px;
  transition: opacity var(--t-base) ease;
}

.experience-split--locked {
  opacity: 0.4;
}

.dotted-rule {
  display: block;
}

.experience-halves {
  display: flex;
  padding: 26px 0;
  text-align: left;
}

.experience-half {
  flex: 1;
  padding-right: 30px;
}

.experience-half--b {
  padding-right: 0;
  padding-left: 30px;
}

.experience-rule {
  width: 1px;
  align-self: stretch;
  background: var(--gold-25);
  flex-shrink: 0;
}

.ghost-numeral {
  font: 900 46px/1 var(--font-display);
  color: var(--gold-35);
  margin-bottom: 10px;
}

.experience-copy {
  margin: 0 0 18px;
  font: 400 15px/1.6 var(--font-body);
  color: var(--text-72);
}

.experience-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.experience-actions .btn {
  font-size: 12px;
  padding: 10px 16px;
}

.link-action {
  font: 400 12px/1.4 var(--font-body);
  color: var(--gold-70);
  text-decoration: underline;
  text-underline-offset: 3px;
  background: none;
  padding: 0;
}

.link-action:disabled {
  opacity: 0.4;
  cursor: default;
}

.btn--locked {
  opacity: 0.45;
  cursor: default;
}

.cv-paste {
  width: 100%;
  max-width: 640px;
  min-height: 220px;
  resize: vertical;
  padding: 16px 18px;
  margin-bottom: 22px;
  border-radius: var(--radius-field);
  background: var(--field);
  border: 1px solid var(--field-border);
  color: var(--text);
  font: 400 14px/1.6 var(--font-body);
  outline: none;
}

.cv-paste:focus {
  border-color: var(--gold);
  box-shadow: 0 0 0 3px var(--gold-focus);
}
```

- [ ] **Step 5: Wire it into App.jsx**

Delete `CvCard` and the inline journey block, then render one screen for the whole step:

```jsx
          {step === "cv" && careerJourneyQuestions.length > 0 && (
            <ExperienceScreen
              mode={cvMode}
              intent={cvIntent}
              intentBusy={busy.cvIntent}
              onSelectIntent={handleSelectCvIntent}
              cvDraft={cvDraft}
              onCvDraftChange={setCvDraft}
              onStartPaste={() => setCvMode("paste")}
              onSubmitCvText={handleSubmitCvText}
              onUploadFile={handleUploadCv}
              uploadFormats={cvUploadFormats}
              busy={busy.cv || busy.journey}
              journeyQuestion={careerJourneyQuestions[journeyIndex]}
              journeyIndex={journeyIndex}
              journeyTotal={careerJourneyQuestions.length}
              journeyDraft={journeyDraft}
              onJourneyDraftChange={setJourneyDraft}
              onSubmitJourney={() => {
                // Answering the B-side question is the commitment to the
                // journey path — without this the eyebrow's counter never
                // starts, even as journeyIndex advances underneath it.
                setCvMode("journey");
                handleSubmitJourney(journeyDraft);
              }}
              onStartJourney={() => setCvMode("journey")}
            />
          )}
```

The B-side of the split is the journey's first question even before the user commits to that path; answering it is what commits them. `handleSubmitJourney` already advances the index and posts to `/api/cv/journey`, so no handler changes are needed.

- [ ] **Step 6: Run the tests**

Run: `cd frontend && npm test -- --run`
Expected: PASS, including the 7 new tests.

- [ ] **Step 7: Verify both paths against the backend**

Run `npm run dev`. Path A: choose an intent, upload a small `.txt` CV — the step completes and advances to summary. Path B: choose an intent, answer the B-side question, then the remaining six.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/screens frontend/src/App.jsx
git commit -m "feat(ui): rebuild the experience step as the design's A/B split"
```

---

### Task 11: Survey shell, journey intro and summary

Until now the new screens have been rendering inside the old `questions-screen` header. This task removes that header, moves the rail and the progress bar into the screen chrome, and rebuilds the two remaining survey screens.

**Files:**
- Create: `frontend/src/screens/JourneyIntroScreen.jsx`
- Create: `frontend/src/screens/SummaryScreen.jsx`
- Create: `frontend/src/screens/SummaryScreen.test.jsx`
- Modify: `frontend/src/ui/ScreenShell.jsx` (accept a `footer` slot for the rail + progress)
- Modify: `frontend/src/components/ProfileCharts.jsx:17-21` (the colour constants)
- Modify: `frontend/src/components/ProfileCharts.css`
- Modify: `frontend/src/screens/screens.css`
- Modify: `frontend/src/App.jsx` (delete `stepHeading` at `73-77`, `JourneyRailCard` at `79-97`, `JourneyRailStrip` at `99-129`, `stepProgressText` at `131-147`, the `screen-header` block at `1362-1399`, and the summary block at `1535-1573`)

**Interfaces:**
- Consumes: `StepRail` (Task 4), `ScreenShell`, `overallProgress` (stays in `App.jsx`).
- Produces:
  - `JourneyIntroScreen` — `({ onBegin })`.
  - `SummaryScreen` — `({ archetype, bigFiveScores, personaSummary, userValues, busy, onContinue })`.
  - `ScreenShell` gains `footer` — rendered under the body, used for the rail and the progress bar.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/screens/SummaryScreen.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SummaryScreen from "./SummaryScreen";

const base = {
  archetype: { name: "The Analyst", tagline: "You test before you trust." },
  bigFiveScores: { O: 94, C: 75, E: 44, A: 75, N: 25 },
  personaSummary: "You work best when the question is still open.",
  userValues: { scores: { achievement: 90, independence: 80, recognition: 60, relationships: 50, support: 40, working_conditions: 30 } },
  busy: false,
  onContinue: () => {},
};

describe("SummaryScreen", () => {
  it("carries the step copy verbatim", () => {
    render(<SummaryScreen {...base} />);
    expect(screen.getByText("step 6 · summary")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Who you are" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "A deterministic named archetype, a Big Five radar chart, AI persona prose, and your confirmed work-values radar — brought together into one profile."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enter the Life Path Engine" })).toBeInTheDocument();
  });

  it("shows the archetype and the persona prose", () => {
    render(<SummaryScreen {...base} />);
    expect(screen.getByText("The Analyst")).toBeInTheDocument();
    expect(screen.getByText("You test before you trust.")).toBeInTheDocument();
    expect(screen.getByText("You work best when the question is still open.")).toBeInTheDocument();
  });

  it("survives a keyless session with no persona prose", () => {
    render(<SummaryScreen {...base} personaSummary={null} />);
    expect(screen.getByText("The Analyst")).toBeInTheDocument();
  });

  it("continues into the engine", () => {
    const onContinue = vi.fn();
    render(<SummaryScreen {...base} onContinue={onContinue} />);
    fireEvent.click(screen.getByRole("button", { name: "Enter the Life Path Engine" }));
    expect(onContinue).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npm test -- --run src/screens/SummaryScreen.test.jsx`
Expected: FAIL — unresolved import.

- [ ] **Step 3: Give ScreenShell a footer slot**

In `frontend/src/ui/ScreenShell.jsx`, add `footer = null` to the props and render it after the body:

```jsx
      <div className="screen-body">{children}</div>
      {footer && <div className="screen-footer">{footer}</div>}
```

Append to `frontend/src/ui/ui.css`:

```css
.screen-footer {
  margin-top: auto;
  padding-top: 48px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.screen-progress {
  width: 100%;
  max-width: 520px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.screen-progress-track {
  flex: 1;
  height: 2px;
  background: var(--gold-15);
  overflow: hidden;
}

.screen-progress-fill {
  height: 100%;
  background: var(--gold);
  transition: width var(--t-base) ease;
}

.screen-progress-percent {
  font: 500 10px/1 var(--font-mono);
  letter-spacing: 0.1em;
  color: var(--gold-60);
  min-width: 34px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 4: Implement the two screens**

Create `frontend/src/screens/JourneyIntroScreen.jsx`:

```jsx
import ScreenShell from "../ui/ScreenShell";
import { JOURNEY_RAIL } from "../lifePath";
import "./screens.css";

// Not in the mockup, but a real screen: what the assessment is about to ask,
// and how long each part takes.
export default function JourneyIntroScreen({ onBegin }) {
  return (
    <ScreenShell
      eyebrow="career discovery journey"
      title="Six short steps"
      sub="Each one feeds the final picture."
    >
      <ol className="journey-list">
        {JOURNEY_RAIL.map((entry, index) => (
          <li key={entry.step}>
            <span className="journey-number">{String(index + 1).padStart(2, "0")}</span>
            <span className="journey-label">{entry.label}</span>
            <span className="journey-time">{entry.time}</span>
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn--gold journey-begin" onClick={onBegin}>
        Start
      </button>
    </ScreenShell>
  );
}
```

Create `frontend/src/screens/SummaryScreen.jsx`:

```jsx
import ScreenShell from "../ui/ScreenShell";
import { PersonalityRadarChart, WorkValuesRadar } from "../components/ProfileCharts";
import "./screens.css";

export default function SummaryScreen({
  archetype,
  bigFiveScores,
  personaSummary,
  userValues,
  busy,
  onContinue,
}) {
  return (
    <ScreenShell
      eyebrow="step 6 · summary"
      title="Who you are"
      sub="A deterministic named archetype, a Big Five radar chart, AI persona prose, and your confirmed work-values radar — brought together into one profile."
      glow="center"
    >
      <p className="summary-archetype">{archetype.name}</p>
      <p className="summary-tagline">{archetype.tagline}</p>

      {bigFiveScores && <PersonalityRadarChart scores={bigFiveScores} />}
      {personaSummary && <p className="summary-persona">{personaSummary}</p>}
      {userValues?.scores && (
        <WorkValuesRadar user={userValues.scores} title="What matters to you" />
      )}

      <button type="button" className="btn btn--gold summary-cta" onClick={onContinue} disabled={busy}>
        {busy ? "Preparing…" : "Enter the Life Path Engine"}
      </button>

      <p className="screen-footnote">
        A preliminary sketch from a short self-report — not a clinical assessment.
      </p>
    </ScreenShell>
  );
}
```

Append to `frontend/src/screens/screens.css`:

```css
.journey-list {
  list-style: none;
  margin: 0;
  padding: 0;
  width: 100%;
  max-width: 560px;
  text-align: left;
}

.journey-list li {
  display: flex;
  align-items: baseline;
  gap: 20px;
  padding: 14px 0;
  border-bottom: 1px solid var(--gold-18);
}

.journey-number {
  font: 400 11px/1 var(--font-mono);
  letter-spacing: 0.1em;
  color: var(--gold-60);
}

.journey-label {
  flex: 1;
  font: 600 16px/1.3 var(--font-body);
  color: var(--text);
}

.journey-time {
  font: 400 11px/1 var(--font-mono);
  color: var(--text-40);
}

.journey-begin,
.summary-cta {
  margin-top: 30px;
}

/* Scoped under .screen: App.css still defines .summary-archetype,
   .summary-tagline and .summary-persona at single-class specificity and is
   imported after screens.css, so unscoped rules here would lose outright.
   Task 14 deletes the legacy rules; the scoping stays correct either way. */
.screen .summary-archetype {
  margin: 0;
  font: 900 34px/1.1 var(--font-display);
  letter-spacing: -0.02em;
  color: var(--gold);
}

.screen .summary-tagline {
  margin: 8px 0 24px;
  font: 400 14px/1.6 var(--font-body);
  color: var(--text-72);
}

.screen .summary-persona {
  margin: 24px 0;
  max-width: 520px;
  font: 400 14px/1.7 var(--font-body);
  color: var(--text-60);
}
```

- [ ] **Step 5: Recolour the charts**

In `frontend/src/components/ProfileCharts.jsx`, replace the palette constants at the top:

```js
// The design's ramp. Charts are the one place a soft fill earns its keep.
const ACCENT = "#ffd98c";
const ACCENT_SOFT = "rgba(255, 217, 140, 0.18)";
const JOB_ACCENT = "#7cffb2";
const JOB_SOFT = "rgba(124, 255, 178, 0.16)";
const MUTED = "rgba(255, 255, 255, 0.55)";
```

and both `<PolarGrid stroke="#e0e0e0" />` occurrences with `<PolarGrid stroke="rgba(255,217,140,.25)" />`. In `ProfileCharts.css`, work through the file and apply these substitutions, which cover every colour it currently sets:

| Current | Replacement |
|---|---|
| any white/`#f7f7f7` panel background | `var(--ink-screen)` |
| any `#e0e0e0`/`#d0d0d0` border or divider | `1px solid var(--gold-25)` |
| any `#0a0a0a`/`#111` heading colour | `var(--text)` |
| any `#666`/`#999` label colour | `var(--text-60)` / `var(--text-45)` |
| any `var(--color-accent)` reference | `var(--gold)` |
| any `border-radius` above 14px | `var(--radius-surface)` |

The chart titles take `font: 600 13px/1 var(--font-mono); letter-spacing: .12em; text-transform: uppercase; color: var(--gold-70)`.

- [ ] **Step 6: Restructure the survey shell in App.jsx**

Delete `stepHeading`, `JourneyRailCard`, `JourneyRailStrip` and `stepProgressText`. Replace the `questions-screen` wrapper's `<header>` and progress block with a single `surveyFooter` value passed into each screen's `footer` prop:

```jsx
  const overall = overallProgress(progress);
  const surveyFooter = (
    <>
      {overall && (
        <div className="screen-progress">
          <div
            className="screen-progress-track"
            role="progressbar"
            aria-valuenow={overall.answered}
            aria-valuemin={0}
            aria-valuemax={overall.total}
            aria-label={`Overall: ${overall.answered} of ${overall.total} questions`}
          >
            <div className="screen-progress-fill" style={{ width: `${overall.percent}%` }} />
          </div>
          <span className="screen-progress-percent">{overall.percent}%</span>
        </div>
      )}
      <StepRail
        step={step}
        furthestStep={furthestStep}
        busy={busy.goto}
        onNavigate={handleRailNavigate}
      />
    </>
  );
```

Every step screen needs to forward the footer. `ExperienceScreen` already takes the prop (Task 10); add it to the other six with the same two edits per file — accept `footer` in the props and hand it to the shell:

```jsx
export default function BigFiveScreen({ item, savedValue, index, total, busy, onAnswer, onBack, canGoBack, footer }) {
  return (
    <ScreenShell
      eyebrow={`step 2 · big five · item ${index + 1} of ${total}`}
      title="Mini-IPIP-20"
      sub="The fixed public-domain Mini-IPIP-20, rated 1–5, scored to OCEAN 0–100 plus Stability/Plasticity."
      footer={footer}
      headerSlot={/* unchanged */ null}
    >
```

Apply the identical pattern to `DemographicsScreen`, `RiasecScreen`, `ValuesTournamentScreen`, `ValuesHierarchyScreen` and `SummaryScreen`, then pass `footer={surveyFooter}` at every call site in `App.jsx`. Render `JourneyIntroScreen` in place of `JourneyRailCard`, and `SummaryScreen` in place of the inline summary block:

```jsx
          {step === "summary" && (
            <SummaryScreen
              archetype={deriveArchetype({
                riasecCode: profile?.riasecCode,
                bigFiveScores: profile?.bigFiveScores,
              })}
              bigFiveScores={profile?.bigFiveScores}
              personaSummary={profile?.personaSummary}
              userValues={profile?.userValues}
              busy={busy.summary}
              onContinue={handleSummaryContinue}
              footer={surveyFooter}
            />
          )}
```

- [ ] **Step 7: Run the tests**

Run: `cd frontend && npm test -- --run`
Expected: PASS, including the 4 new summary tests.

- [ ] **Step 8: Walk the whole assessment**

Run `npm run dev` and complete every step from the entry screen to the summary, keyless.
Expected: one consistent dark screen per step, the rail and progress bar at the foot of each, no leftover light-theme header anywhere.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/screens frontend/src/ui frontend/src/components frontend/src/App.jsx
git commit -m "feat(ui): move the rail and progress into the screen shell, rebuild summary"
```

---

### Task 12: The 1st-output decision

The dock over the graph becomes the design's three-column output block. Its copy is the one place the mockup over-promises, so it is corrected here (spec §6.2, §6.10).

**Files:**
- Modify: `frontend/src/lifePath.js` (add `usMarketLine`)
- Modify: `frontend/src/lifePath.test.js`
- Create: `frontend/src/screens/OutputDecision.jsx`
- Create: `frontend/src/screens/OutputDecision.test.jsx`
- Modify: `frontend/src/screens/screens.css`
- Modify: `frontend/src/App.jsx:1260-1315` (the `output-review` dock card)

**Interfaces:**
- Consumes: `Eyebrow`, `whyThisFitsSections` from `lifePath.js`.
- Produces:
  - `usMarketLine(output) -> string` — `"$166,570/yr median (US) · outlook: Bright"`, either half alone, or `""`.
  - `OutputDecision` — `({ output, busy, onAccept, onRegenerate, onOpenDetails })`.

- [ ] **Step 1: Write the failing helper test**

Append to `frontend/src/lifePath.test.js` (adding `usMarketLine` to the imports):

```js
describe("usMarketLine", () => {
  it("joins salary and outlook, both flagged as US data", () => {
    expect(
      usMarketLine({ onet: { salary: { annualMedian: 166570 }, outlook: { category: "Bright" } } })
    ).toBe("$166,570/yr median (US) · outlook: Bright");
  });

  it("renders whichever half is present", () => {
    expect(usMarketLine({ onet: { salary: { annualMedian: 90000 } } })).toBe("$90,000/yr median (US)");
    expect(usMarketLine({ onet: { outlook: { category: "Average" } } })).toBe("outlook: Average");
  });

  it("is empty when the keyless snapshot carries neither", () => {
    expect(usMarketLine({ onet: {} })).toBe("");
    expect(usMarketLine({})).toBe("");
    expect(usMarketLine(null)).toBe("");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npm test -- --run src/lifePath.test.js`
Expected: FAIL — `usMarketLine is not a function`.

- [ ] **Step 3: Implement the helper**

In `frontend/src/lifePath.js`, next to `onetSection`:

```js
// The single-line US market summary shown on the output card. Salary and
// outlook come from the live O*NET API, so both are absent keyless — and both
// stay visibly US-flagged, because the audience is not.
export function usMarketLine(output) {
  const onet = output?.onet;
  if (!onet) return "";
  const parts = [];
  if (onet.salary?.annualMedian) {
    parts.push(`$${onet.salary.annualMedian.toLocaleString("en-US")}/yr median (US)`);
  }
  if (onet.outlook?.category) parts.push(`outlook: ${onet.outlook.category}`);
  return parts.join(" · ");
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd frontend && npm test -- --run src/lifePath.test.js`
Expected: PASS.

- [ ] **Step 5: Write the failing component test**

Create `frontend/src/screens/OutputDecision.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import OutputDecision from "./OutputDecision";

const output = {
  id: "output_1",
  orientedField: "Applied research",
  jobTitle: "Financial Manager",
  thesis: "Investigative and Artistic scores put you where questions are still open but the method is fixed.",
  valuesFit: { overall: 51 },
  onet: { salary: { annualMedian: 166570 }, outlook: { category: "Bright" } },
  whyThisFits: {
    personality: [{ point: "High openness" }, { point: "Moderate conscientiousness" }],
    interests: [{ point: "Investigative" }],
    values: [{ point: "Achievement first" }],
  },
};

const base = { output, busy: {}, onAccept: () => {}, onRegenerate: () => {}, onOpenDetails: () => {} };

describe("OutputDecision", () => {
  it("carries the section copy verbatim", () => {
    render(<OutputDecision {...base} />);
    expect(screen.getByText("your 1st output")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Applied research" })).toBeInTheDocument();
    expect(screen.getByText("oriented field")).toBeInTheDocument();
    expect(screen.getByText("Grounded in O*NET")).toBeInTheDocument();
    expect(screen.getByText("Traced to your answers")).toBeInTheDocument();
  });

  it("states the refine loop honestly — no per-parameter tuning exists", () => {
    render(<OutputDecision {...base} />);
    expect(
      screen.getByText(
        "Say Yes to accept (unlocks four advice blocks + a roadmap) or No to regenerate from a genuinely different field family."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes — accept this path" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "No — regenerate from a different field" })
    ).toBeInTheDocument();
  });

  it("shows the job with its US-flagged market line", () => {
    render(<OutputDecision {...base} />);
    expect(screen.getByText("Financial Manager")).toBeInTheDocument();
    expect(screen.getByText("$166,570/yr median (US) · outlook: Bright")).toBeInTheDocument();
  });

  it("opens the full trace from the third column", () => {
    const onOpenDetails = vi.fn();
    render(<OutputDecision {...base} onOpenDetails={onOpenDetails} />);
    fireEvent.click(screen.getByRole("button", { name: "See the full trace →" }));
    expect(onOpenDetails).toHaveBeenCalledWith(output);
  });

  it("accepts and regenerates", () => {
    const onAccept = vi.fn();
    const onRegenerate = vi.fn();
    render(<OutputDecision {...base} onAccept={onAccept} onRegenerate={onRegenerate} />);
    fireEvent.click(screen.getByRole("button", { name: "Yes — accept this path" }));
    fireEvent.click(screen.getByRole("button", { name: "No — regenerate from a different field" }));
    expect(onAccept).toHaveBeenCalled();
    expect(onRegenerate).toHaveBeenCalled();
  });

  it("shows the in-flight labels and locks both actions", () => {
    render(<OutputDecision {...base} busy={{ accept: true }} />);
    expect(screen.getByRole("button", { name: "Building next steps…" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "No — regenerate from a different field" })
    ).toBeDisabled();
  });

  it("falls back to a legacy free-text explanation rather than showing nothing", () => {
    render(
      <OutputDecision
        {...base}
        output={{
          ...output,
          whyThisFits: null,
          whyFit: "Your scores point at structured, analytical work.",
        }}
      />
    );
    expect(
      screen.getByText("Your scores point at structured, analytical work.")
    ).toBeInTheDocument();
  });

  it("survives a keyless output with no market data and no structured explanation", () => {
    render(<OutputDecision {...base} output={{ ...output, onet: {}, whyThisFits: null }} />);
    expect(screen.getByText("Financial Manager")).toBeInTheDocument();
    expect(screen.queryByText(/median \(US\)/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `cd frontend && npm test -- --run src/screens/OutputDecision.test.jsx`
Expected: FAIL — unresolved import.

- [ ] **Step 7: Implement the block**

Create `frontend/src/screens/OutputDecision.jsx`:

```jsx
import Eyebrow from "../ui/Eyebrow";
import { usMarketLine, whyThisFitsSections } from "../lifePath";
import "./screens.css";

// The Yes/No decision, as three ruled columns. The columns carry the real
// output — the mockup's card bodies are its stand-in for exactly this data.
export default function OutputDecision({ output, busy, onAccept, onRegenerate, onOpenDetails }) {
  const market = usMarketLine(output);
  // Outputs generated before the structured explanation existed — and any
  // whose second AI call failed — carry a single free-text section instead of
  // items. Reading only `items` would drop a real explanation on the floor.
  const trace = whyThisFitsSections(output)
    .flatMap((section) => (section.items?.length ? section.items : [section.text]))
    .filter(Boolean)
    .slice(0, 3);
  const locked = Boolean(busy.accept || busy.refine);

  return (
    <div className="output-decision">
      <Eyebrow>your 1st output</Eyebrow>
      <h3 className="output-field">{output.orientedField}</h3>

      <div className="output-columns">
        <div className="output-column">
          <p className="output-tag">oriented field</p>
          <p className="output-title">{output.orientedField}</p>
          <p className="output-body">{output.thesis}</p>
        </div>

        <div className="output-column">
          <p className="output-tag">concrete job</p>
          <p className="output-title">Grounded in O*NET</p>
          <p className="output-body">
            {output.jobTitle}
            {/* The fit sits in its own element so the job title stays a text
                node of its own — as one concatenated string, an exact-text
                query for the title never matches. */}
            {output.valuesFit && (
              <span className="output-fit"> · {output.valuesFit.overall}% values fit</span>
            )}
          </p>
          {market && <p className="output-meta">{market}</p>}
        </div>

        <div className="output-column">
          <p className="output-tag">why this fits</p>
          <p className="output-title">Traced to your answers</p>
          {trace.length > 0 && (
            <ul className="output-trace">
              {trace.map((point, index) => (
                <li key={index}>{point}</li>
              ))}
            </ul>
          )}
          <button type="button" className="link-action" onClick={() => onOpenDetails(output)}>
            See the full trace →
          </button>
        </div>
      </div>

      <p className="screen-footnote">
        Say Yes to accept (unlocks four advice blocks + a roadmap) or No to regenerate from a
        genuinely different field family.
      </p>

      <div className="output-actions">
        <button type="button" className="btn btn--gold" onClick={onAccept} disabled={locked}>
          {busy.accept ? "Building next steps…" : "Yes — accept this path"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onRegenerate} disabled={locked}>
          {busy.refine ? "Finding another…" : "No — regenerate from a different field"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Style it**

Append to `frontend/src/screens/screens.css`:

```css
.output-decision {
  width: min(1100px, calc(100vw - 64px));
  padding: 26px 0 22px;
  text-align: center;
  background: var(--ink-screen);
  border-radius: var(--radius-surface);
}

.output-field {
  margin: 0 0 30px;
  font: 900 40px/1.05 var(--font-display);
  letter-spacing: -0.02em;
  text-transform: uppercase;
  color: var(--text);
}

.output-columns {
  display: flex;
  align-items: stretch;
  border-top: 1px solid var(--gold-25);
  border-bottom: 1px solid var(--gold-25);
  text-align: left;
}

.output-column {
  flex: 1;
  padding: 30px;
  border-right: 1px solid var(--gold-25);
}

.output-column:last-child {
  border-right: none;
}

.output-tag {
  margin: 0 0 14px;
  font: 500 10px/1 var(--font-mono);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--gold);
}

.output-title {
  margin: 0;
  font: 700 22px/1.15 var(--font-display);
  letter-spacing: -0.01em;
  color: var(--text);
}

.output-body {
  margin: 12px 0 0;
  font: 300 13.5px/1.6 var(--font-body);
  color: var(--text-60);
}

.output-fit {
  color: var(--gold-70);
}

.output-meta {
  margin: 10px 0 0;
  font: 400 12px/1 var(--font-body);
  color: var(--text-45);
}

.output-trace {
  margin: 12px 0 10px;
  padding-left: 18px;
  font: 300 13.5px/1.6 var(--font-body);
  color: var(--text-60);
}

.output-actions {
  display: flex;
  gap: 14px;
  align-items: center;
  justify-content: center;
  margin-top: 26px;
  flex-wrap: wrap;
}
```

- [ ] **Step 9: Wire it into the dock**

In `frontend/src/App.jsx`, replace the whole `output-review` dock card body with:

```jsx
  if (dockCardKind === "output-review" && latestOutput) {
    dockCard = {
      key: `review-${latestOutput.id}`,
      content: (
        <OutputDecision
          output={latestOutput}
          busy={busy}
          onAccept={handleAcceptOutput}
          onRegenerate={handleNotSuitable}
          onOpenDetails={handleOutputOpen}
        />
      ),
    };
  }
```

- [ ] **Step 10: Run the tests**

Run: `cd frontend && npm test -- --run`
Expected: PASS, including the 3 helper and 7 component tests.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/lifePath.js frontend/src/lifePath.test.js frontend/src/screens frontend/src/App.jsx
git commit -m "feat(ui): rebuild the 1st-output decision as the design's three columns"
```

---

### Task 13: Graph page chrome

React Flow keeps the graph; the design supplies its skin.

**Files:**
- Modify: `frontend/src/components/GraphView/NodeComponent.jsx` (the Me node caption, the accepted tag)
- Modify: `frontend/src/components/GraphView/NodeComponent.css` (full restyle)
- Modify: `frontend/src/components/GraphView/GraphView.css` (surface, controls)
- Modify: `frontend/src/components/GraphView/GraphPage.css` (page chrome, dock, panels)
- Modify: `frontend/src/components/GraphView/BranchEdge.jsx` (stroke)
- Modify: `frontend/src/App.jsx:1608-1625` (the graph header)
- Create: `frontend/src/components/GraphView/MeNode.test.jsx`

**Interfaces:**
- Consumes: `Wordmark`, `BranchCanvas` (preset `graph`).
- Produces: no new exports; `MeNode` gains the caption "invector · life path model".

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/GraphView/MeNode.test.jsx`:

```jsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { MeNode } from "./NodeComponent";

describe("MeNode", () => {
  it("carries the design's caption under the circle", () => {
    render(
      <ReactFlowProvider>
        <MeNode />
      </ReactFlowProvider>
    );
    expect(screen.getByText("Me")).toBeInTheDocument();
    expect(screen.getByText("invector · life path model")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npm test -- --run src/components/GraphView/MeNode.test.jsx`
Expected: FAIL — the caption is not rendered.

- [ ] **Step 3: Add the caption**

In `frontend/src/components/GraphView/NodeComponent.jsx`, inside `MeNode`, after `node-me-label`:

```jsx
      <div className="node-me-caption">invector · life path model</div>
```

- [ ] **Step 4: Restyle the nodes**

Rewrite the colour and shape rules in `frontend/src/components/GraphView/NodeComponent.css` against the tokens. The values that matter:

```css
.node--me {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  border: 1.5px solid var(--gold-60);
  background: var(--gold-wash);
  box-shadow: 0 0 24px rgba(255, 217, 140, 0.15);
  font: 700 15px/1 var(--font-display);
  color: var(--gold);
}

.node-me-caption {
  position: absolute;
  top: calc(100% + 14px);
  white-space: nowrap;
  font: 500 10px/1 var(--font-mono);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--gold-50);
}

.node--output {
  max-width: 480px;
  padding: 8px 0 0 30px;
  border: none;
  border-left: 2px solid var(--gold);
  border-radius: 0;
  background: none;
  text-align: left;
}

.node-archetype {
  font: 600 10px/1 var(--font-mono);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--gold);
}

.node-title {
  font: 900 34px/1.1 var(--font-display);
  letter-spacing: -0.01em;
  color: var(--text);
}

.node-fit-badge {
  font: 700 10px/1 var(--font-display);
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--gold);
  background: none;
  padding: 0;
}

.node-top-values,
.node-advice-count,
.node-roadmap-timeframe {
  font: 400 11px/1 var(--font-mono);
  color: var(--text-45);
}

.node-accepted-tag {
  font: 700 11px/1 var(--font-display);
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--positive);
  background: none;
}

.node--advice {
  width: 220px;
  padding: 18px 22px;
  border: none;
  border-top: 1px solid var(--gold-20);
  border-bottom: 1px solid var(--gold-20);
  border-right: 1px solid var(--gold-20);
  border-radius: 0;
  background: none;
  text-align: left;
}

.node--roadmap {
  width: 360px;
  padding: 10px 0;
  border: none;
  border-bottom: 1px solid var(--gold-15);
  border-radius: 0;
  background: none;
  display: flex;
  align-items: center;
  gap: 16px;
  text-align: left;
}

.node-roadmap-index {
  font: 900 20px/1 var(--font-display);
  color: var(--gold-40);
  min-width: 24px;
  flex-shrink: 0;
}

.node--roadmap-last .node-roadmap-index {
  color: var(--gold);
}

.node--roadmap-last {
  border-bottom: none;
}

.node-roadmap-title {
  font: 600 14px/1.3 var(--font-body);
  color: var(--text);
}
```

Delete every light-theme background, shadow and border colour left in that file; nothing may reference a hex outside the tokens.

- [ ] **Step 5: Restyle the edges and the canvas**

In `frontend/src/components/GraphView/BranchEdge.jsx`, set the path's stroke to `var(--gold-40)` and `strokeWidth` to `1.5`, keeping the existing draw-in animation and its timing untouched.

In `GraphView.css`, let the branch show through and re-token the React Flow furniture:

```css
.react-flow,
.react-flow__pane,
.react-flow__renderer {
  background: transparent;
}

.react-flow__attribution {
  background: transparent;
  color: var(--text-30);
  font: 400 10px/1 var(--font-mono);
}

.react-flow__controls-button {
  background: var(--ink-screen);
  border-bottom: 1px solid var(--gold-20);
  fill: var(--gold-70);
}

.react-flow__controls-button:hover {
  background: var(--gold-hover);
  fill: var(--gold);
}

.react-flow__handle {
  opacity: 0;
}
```

- [ ] **Step 6: Restyle the page chrome**

In `frontend/src/App.jsx`, replace the graph header's brand span with the wordmark and add the branch behind the canvas:

```jsx
        <div className="graph-page">
          <BranchCanvas preset="graph" className="graph-branch" reducedMotion={REDUCED_MOTION} />
          <div className="graph-header">
            <button type="button" className="screen-back" onClick={resetAll}>
              ← Restart
            </button>
            <Wordmark />
            <span className="graph-header-side">
              {!aiEnabled && <span className="demo-notice demo-notice-inline">Demo mode</span>}
              <button
                type="button"
                className={`graph-profile-toggle ${profileOpen ? "active" : ""}`}
                onClick={() => setProfileOpen((open) => !open)}
              >
                {profileOpen ? "Hide profile" : "My profile"}
              </button>
              <span className="graph-hint">{treeHint}</span>
            </span>
          </div>
```

In `GraphPage.css`, set the page background to `var(--ink-graph)`, give `.graph-branch` `opacity: .55` and `z-index: 0`, put the header, canvas and dock above it, and restyle the dock, profile panel and detail panel to the token set (hairline borders, `--ink-screen` surface, the type ramp from §3 of the spec). Add:

```css
.graph-branch {
  opacity: 0.55;
  z-index: 0;
}

/* The dock is deliberately left out of the position rule below: it is already
   position: absolute, which is how it floats centred at the bottom, and
   forcing it to relative would drop it back into normal flow. z-index alone
   keeps it above the canvas. */
.graph-header,
.graph-canvas {
  position: relative;
  z-index: 1;
}

.graph-question-dock {
  z-index: 1;
}

/* The dock stays click-through so the empty space around the card never
   blocks the graph underneath, and the card re-enables clicks for itself.
   Bind this to the card's own class, not to its position in the tree: the
   previous version keyed on `.question-card`, and when the card inside the
   dock was replaced the Accept and Regenerate buttons silently stopped
   responding — jsdom does not implement pointer-events, so nothing caught it. */
.graph-question-dock .output-decision {
  pointer-events: auto;
}
```

- [ ] **Step 7: Run the tests**

Run: `cd frontend && npm test -- --run`
Expected: PASS, including the new MeNode test.

- [ ] **Step 8: Verify the accepted graph by hand**

Run `npm run dev` with `DEV_TOOLS_TOKEN` set in `backend/.env`, open `?dev=<token>`, jump to `detail (accepted)`.
Expected: the branch glows behind a gold hairline graph; the Me circle carries its caption; the accepted output shows "Accepted" in green; advice and roadmap rows are ruled, not boxed.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/GraphView frontend/src/App.jsx
git commit -m "feat(ui): restyle the life-path graph in the Invector language"
```

---

### Task 14: Sweep the old theme out and verify the whole thing

**Files:**
- Modify: `frontend/src/App.css` (delete every rule no longer referenced; keep and re-token what still is)
- Modify: `frontend/src/components/DevPanel.css`
- Modify: `frontend/src/screens/screens.css`, `frontend/src/ui/ui.css` (breakpoints)
- Modify: `frontend/src/lifePath.js` (drop `moveRankItem` if nothing imports it, and its tests with it)
- Modify: `frontend/src/App.jsx` (drop dead imports and state)

- [ ] **Step 1: Find what is actually still used**

```bash
cd frontend
# every class name still referenced in JSX
grep -rhoE 'className="[^"]+"' src --include=*.jsx | tr -d '"' | sed 's/className=//' | tr ' ' '\n' | sort -u > /tmp/used-classes.txt
# every class defined in App.css
grep -oE '^\.[a-zA-Z0-9_-]+' src/App.css | sed 's/^\.//' | sort -u > /tmp/defined-classes.txt
comm -13 /tmp/used-classes.txt /tmp/defined-classes.txt
```

Expected: a long list of light-theme leftovers (`question-card`, `option-button`, `likert-row`, `journey-rail-*`, `values-ab-*`, `rank-controls`, …).

- [ ] **Step 2: Delete them**

Remove every rule from `App.css` whose selector appears only in that list. What remains — the app shell, error rows, the demo notice, the restore hint, the bottom actions — gets re-tokened: `background: var(--ink-page)`, `color: var(--text)`, borders in the gold ramp. Do the same sweep over `DevPanel.css`, keeping the panel legible on a dark ground.

- [ ] **Step 3: Add the breakpoints**

Append to `frontend/src/ui/ui.css`:

```css
@media (max-width: 1200px) {
  .hero-title {
    font-size: 54px;
  }

  .screen-title {
    font-size: 34px;
  }

  .screen--tournament .screen-title {
    font-size: 36px;
  }

  .split-title {
    font-size: 28px;
  }
}

@media (max-width: 900px) {
  .screen {
    padding: 76px 24px 48px;
  }

  .hero-body {
    padding: 40px 24px 0;
  }

  .hero-title {
    font-size: 40px;
  }

  .screen-title {
    font-size: 28px;
  }

  .demo-grid {
    grid-template-columns: 1fr;
  }

  .split,
  .experience-halves,
  .output-columns {
    flex-direction: column;
  }

  .split-rule,
  .experience-rule {
    width: 100%;
    height: 1px;
  }

  .split-rule-label {
    display: none;
  }

  .experience-half,
  .experience-half--b {
    padding: 0 0 24px;
  }

  .output-column {
    border-right: none;
    border-bottom: 1px solid var(--gold-25);
  }

  .likert {
    flex-wrap: wrap;
    gap: 12px;
    justify-content: center;
  }

  .likert-option {
    width: 84px;
  }
}
```

- [ ] **Step 3b: Fix the four orphaned setters `resetAll` still calls**

`resetAll` calls `setJobCharParams`, `setRankDraft`, `setRefineMode` and `setRefineChecks`. None of them exist — they were removed with the job-characteristics step and the refine panel, and the calls were left behind. They are four of the eight baseline lint errors (`no-undef`), and they are not cosmetic: `resetAll` throws a ReferenceError on the first one, so **Restart is broken on `main` today** and would ship broken in this redesign. Delete the four lines:

```bash
cd frontend
grep -n "setJobCharParams\|setRankDraft\|setRefineMode\|setRefineChecks" src/App.jsx
```

Expected after the fix: no output, and `npm run lint` down from 8 errors to 4.

- [ ] **Step 3c: Give the RIASEC loading placeholder its rail back**

While `riasecItems` is still loading, `App.jsx` renders a bare placeholder card instead of a screen, and Task 11's move of the rail into each screen's footer left that one render site without it — so the rail vanishes for one network round trip. Pass `footer={surveyFooter}` there too, or render the placeholder through `ScreenShell` like every other step.

- [ ] **Step 4: Drop what nothing calls any more**

```bash
cd frontend
grep -rn "moveRankItem\b" src --include=*.jsx --include=*.js | grep -v "moveRankItemTo"
```

If the only hits are `lifePath.js` and `lifePath.test.js`, delete the export and its `describe` block. Run `npx eslint .` and clear every unused-import and unused-variable warning it reports in `App.jsx`.

- [ ] **Step 5: Run both suites**

```bash
cd backend && npm test
cd ../frontend && npm test -- --run
```

Expected: backend 185+ passing, untouched; frontend all suites passing.

- [ ] **Step 6: Lint**

Run: `cd frontend && npm run lint`
Expected: at most the 4 pre-existing errors this plan does not own — the two react-hooks findings in `App.jsx` (`Cannot access variable before it is declared`, `Calling setState synchronously within an effect`) and the two unused `salary`/`outlook` destructures. The four `no-undef` errors on the orphaned setters must be gone.

- [ ] **Step 7: Screenshot every screen at both widths**

With `npm run dev` running and `DEV_TOOLS_TOKEN` set, drive Playwright through `?dev=<token>` and capture, at 1440×900 and 900×1200: entry, journey intro, demographics, big five, interests, values tournament, confirm hierarchy, experience, summary, 1st output, accepted graph. Compare each against the same section of the design artifact opened in the same browser.
Expected: type scale, hairline placement and copy match; nothing scrolls horizontally at 900px.

- [ ] **Step 8: Verify the reduced-motion path**

In the browser devtools, emulate `prefers-reduced-motion: reduce`, reload the entry screen, and check in the Performance panel that no `requestAnimationFrame` work is running while a fully grown branch is painted.

- [ ] **Step 9: Verify keyless mode**

Stop the backend, remove `OPENAI_API_KEY` from `backend/.env`, restart, and run the whole flow to an accepted output.
Expected: every screen renders, the summary shows the deterministic persona fallback, and the output card hides the market line rather than showing an empty one.

- [ ] **Step 10: Commit**

```bash
git add frontend/src
git commit -m "chore(ui): remove the light theme and finish the Invector responsive pass"
```

---

## Verification summary

The work is done when all of the following hold:

- `cd backend && npm test` — green, and `git diff --stat main -- backend/` is empty.
- `cd frontend && npm test -- --run` — green, including roughly 60 new tests across the primitives, screens and helpers.
- `cd frontend && npm run lint` — clean.
- No hex colour appears in `src/**/*.css` outside `theme/tokens.css`, and none in any `.jsx` outside `ui/branchEngine.js`:
  ```bash
  cd frontend && grep -rn "#[0-9a-fA-F]\{3,6\}\b" src --include=*.css | grep -v "theme/tokens.css"
  ```
- No stylesheet still references the deleted light palette. Task 1 removed the `--color-*` custom properties while five stylesheets still consumed them; every one of those consumers is migrated by Tasks 11, 13 and 14, and this grep is what proves it:
  ```bash
  cd frontend && grep -rn -- "--color-" src
  ```
  Expected: no output. A hit means a stylesheet is resolving colours to nothing.
- The O*NET badge and the exact licence sentence render on the entry screen and in the details panel.
- A full keyless run and a full keyed run both reach an accepted output with a roadmap.
