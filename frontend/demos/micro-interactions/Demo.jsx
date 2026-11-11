// Micro-interactions — the real assessment components rendered as-is, twice:
// "Current" with the app's CSS only, "Proposed" inside a .demo-micro wrapper
// that layers micro.css on top. Strip the `.demo-micro ` prefix from a rule in
// micro.css and it is the rule to adopt. JS exists only where CSS cannot
// reach: starting a view transition, and forcing reduced motion for review.
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import "../kit/demo.css";
import ScreenShell from "../../src/ui/ScreenShell";
import LikertScale from "../../src/ui/LikertScale";
import StepRail from "../../src/screens/StepRail";
import { JOURNEY_RAIL } from "../../src/lifePath";
import { readDemoParams } from "../kit/params";
import "./micro.css";

const params = readDemoParams();

// Two real Mini-IPIP-20 items (backend/assessment/bigFiveItems.js, mip_1/2).
const ITEMS = ["I am the life of the party.", "I sympathize with others' feelings."];

// Same anchors BigFiveScreen uses.
const ANCHORS = [
  { value: 1, label: "Very inaccurate" },
  { value: 2, label: "Moderately inaccurate" },
  { value: 3, label: "Neither" },
  { value: 4, label: "Moderately accurate" },
  { value: 5, label: "Very accurate" },
];

// The one piece of JS the slide proposal needs. flushSync makes React commit
// inside the callback, so the browser's "after" snapshot is the new slide.
function withViewTransition(update) {
  if (!document.startViewTransition) {
    update();
    return;
  }
  document.startViewTransition(() => flushSync(update));
}

function Pair({ children }) {
  return (
    <div className="micro-pair">
      <div className="micro-col">
        <span className="micro-col-label">Current</span>
        {children}
      </div>
      <div className="micro-col micro-col--proposed demo-micro">
        <span className="micro-col-label">Proposed</span>
        {children}
      </div>
    </div>
  );
}

function Slide({ index, onAnswer }) {
  return (
    <ScreenShell
      glow="none"
      eyebrow={`step 2 · big five · item ${index + 1} of ${ITEMS.length}`}
      title="Mini-IPIP-20"
    >
      <div className="instrument">
        <p className="item-statement item-statement--italic">&quot;{ITEMS[index]}&quot;</p>
        <LikertScale anchors={ANCHORS} value={null} onSelect={onAnswer} />
      </div>
    </ScreenShell>
  );
}

function SlidePanel() {
  const [current, setCurrent] = useState(0);
  const [proposed, setProposed] = useState(0);
  const next = (i) => (i + 1) % ITEMS.length;
  const advanceCurrent = () => setCurrent(next);
  const advanceProposed = () => withViewTransition(() => setProposed(next));

  return (
    <section className="micro-panel" aria-labelledby="micro-a">
      <header className="micro-panel-head">
        <span className="micro-panel-key">a</span>
        <h2 id="micro-a">Slide change</h2>
        <p>
          Answering an item swaps the slide. Proposed: the outgoing item fades 12 px left, the
          next arrives from 12 px right; the eyebrow and title hold still.
        </p>
        <button
          type="button"
          className="demo-btn demo-btn-primary"
          onClick={() => {
            advanceCurrent();
            advanceProposed();
          }}
        >
          Answer both
        </button>
      </header>
      <div className="micro-pair">
        <div className="micro-col">
          <span className="micro-col-label">Current</span>
          <Slide index={current} onAnswer={advanceCurrent} />
        </div>
        <div className="micro-col micro-col--proposed demo-micro">
          <span className="micro-col-label">Proposed</span>
          <Slide index={proposed} onAnswer={advanceProposed} />
        </div>
      </div>
    </section>
  );
}

function LikertPanel() {
  const [values, setValues] = useState({ current: null, proposed: null });
  const scale = (side) => (
    <div className="micro-likert">
      <p className="item-statement item-statement--italic item-statement--sm">
        &quot;{ITEMS[1]}&quot;
      </p>
      <LikertScale
        anchors={ANCHORS}
        value={values[side]}
        onSelect={(v) => setValues((s) => ({ ...s, [side]: v }))}
      />
    </div>
  );

  return (
    <section className="micro-panel" aria-labelledby="micro-b">
      <header className="micro-panel-head">
        <span className="micro-panel-key">b</span>
        <h2 id="micro-b">Likert</h2>
        <p>
          Press and hold: the option settles to 97 %. The fill grows from the centre of the
          ring. Tab in: the focus ring hugs the circle and never shows on a mouse click.
        </p>
      </header>
      <div className="micro-pair">
        <div className="micro-col">
          <span className="micro-col-label">Current</span>
          {scale("current")}
        </div>
        <div className="micro-col micro-col--proposed demo-micro">
          <span className="micro-col-label">Proposed</span>
          {scale("proposed")}
        </div>
      </div>
    </section>
  );
}

function RailPanel() {
  const last = JOURNEY_RAIL.length - 1;
  const [active, setActive] = useState(1);
  const [furthest, setFurthest] = useState(1);
  const step = JOURNEY_RAIL[active].step;
  const furthestStep = JOURNEY_RAIL[furthest].step;
  // Completing a step advances exactly one, as on the real rail.
  const complete = () => {
    const to = Math.min(active + 1, last);
    setActive(to);
    setFurthest((f) => Math.max(f, to));
  };
  const navigate = (target) => setActive(JOURNEY_RAIL.findIndex((r) => r.step === target));

  return (
    <section className="micro-panel" aria-labelledby="micro-c">
      <header className="micro-panel-head">
        <span className="micro-panel-key">c</span>
        <h2 id="micro-c">Journey rail</h2>
        <p>
          Completing a step fills the progress line one sixth further, and that step's dot turns
          gold. Click a finished step to go back; the line follows.
        </p>
        <div className="micro-actions">
          <button
            type="button"
            className="demo-btn demo-btn-primary"
            onClick={complete}
            disabled={active === last}
          >
            Complete step
          </button>
          <button
            type="button"
            className="demo-btn"
            onClick={() => {
              setActive(0);
              setFurthest(0);
            }}
          >
            Reset
          </button>
        </div>
      </header>
      <Pair>
        <div className="micro-rail">
          <StepRail step={step} furthestStep={furthestStep} onNavigate={navigate} />
        </div>
      </Pair>
    </section>
  );
}

const ADOPTION = [
  {
    panel: "a · Slide change",
    file: "ui.css",
    rules: [
      ".screen-body { view-transition-name: screen-slide }",
      ".screen .eyebrow, .screen-title { view-transition-name: screen-eyebrow / screen-title } — one name each",
      "::view-transition-group(screen-*) { animation-duration: var(--t-base); animation-timing-function: var(--ease-out) }",
      "::view-transition-old(screen-slide) { animation: var(--t-base) var(--ease-out) both slide-out } — to { opacity: 0; transform: translateX(-12px) }",
      "::view-transition-new(screen-slide) { animation: var(--t-base) var(--ease-out) both slide-in } — from { opacity: 0; transform: translateX(12px) }",
      "JS (App.jsx, the one place an item index moves): wrap the index update in document.startViewTransition(() => flushSync(update)) when the API exists; plain update otherwise",
    ],
  },
  {
    panel: "b · Likert",
    file: "ui.css",
    rules: [
      ".likert-option { transition: transform var(--t-fast) var(--ease-out) }",
      ".likert-option:active:enabled { transform: scale(0.97) }",
      ".likert-ring { position: relative; transition: border-color var(--t-fast) var(--ease-out) } — replaces the background/box-shadow transition",
      ".likert-ring::after { content: \"\"; position: absolute; inset: 0; border-radius: 50%; background: var(--gold); opacity: 0; transform: scale(0.5); transition: opacity var(--t-fast) var(--ease-out), transform var(--t-base) var(--ease-out) }",
      ".likert-option--on .likert-ring { background: none; box-shadow: none } + .likert-option--on .likert-ring::after { opacity: 1; transform: none } — the box-shadow drop is optional, it is the 14 px glow",
      ".likert-option:focus-visible { outline: none } + .likert-option:focus-visible .likert-ring { outline: 2px solid var(--gold); outline-offset: 3px }",
    ],
  },
  {
    panel: "c · Journey rail",
    file: "screens.css",
    rules: [
      ".step-rail { position: relative; padding-bottom: 14px }",
      ".step-rail::before (track, var(--gold-20)) and .step-rail::after (fill, var(--gold)) { content: \"\"; position: absolute; inset: auto 0 0; height: 1px }",
      ".step-rail::after { transform-origin: left; transform: scaleX(calc(var(--rail-done, 0) / 6)); transition: transform var(--t-base) var(--ease-out) }",
      ".step-rail:has(> .step-rail-item--active:nth-child(n)) { --rail-done: n − 1 } for n = 2…6 — the 6 is JOURNEY_RAIL.length; a seventh step needs one more rule",
      ".step-rail-item:not(:has(> button))::before, .step-rail-item > button::before { 6 px dot, border 1px solid currentColor; transition: background-color var(--t-fast) linear, border-color var(--t-fast) linear }",
      ".step-rail-item--done::before, .step-rail-item--done > button::before { background-color: var(--gold); border-color: var(--gold) }",
    ],
  },
  {
    panel: "Reduced motion",
    file: "ui.css + screens.css",
    rules: [
      "Move each [data-motion=\"reduced\"] rule into the file's existing @media (prefers-reduced-motion: reduce) block, dropping the attribute prefix",
      "Every rule above: transition-property: opacity; transition-duration: 120ms; no :active scale, fill and line change in place",
      "::view-transition-old/new(screen-slide): opacity-only fade, 120ms linear; header groups 120ms",
    ],
  },
];

function Adoption() {
  return (
    <section className="micro-adoption" aria-labelledby="micro-adopt">
      <h2 id="micro-adopt">Adoption</h2>
      <p>
        What moves into the app CSS, per panel. In micro.css every selector carries a{" "}
        <code>.demo-micro</code> prefix and reduced motion is keyed on{" "}
        <code>[data-motion=&quot;reduced&quot;]</code>; drop the prefix, move the latter into
        the media query. Transition names and keyframes are already final.
      </p>
      {ADOPTION.map((group) => (
        <div key={group.panel} className="micro-adoption-group">
          <h3>
            {group.panel} <span>→ {group.file}</span>
          </h3>
          <ul>
            {group.rules.map((rule) => (
              <li key={rule}>
                <code>{rule}</code>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function systemReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export default function Demo() {
  const [reduced, setReduced] = useState(params.reducedMotion ?? systemReducedMotion());

  // On <html>, because the ::view-transition-* pseudo-elements hang off the
  // root and the reduced-motion rules have to reach them too.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.motion = reduced ? "reduced" : "full";
    return () => delete root.dataset.motion;
  }, [reduced]);

  return (
    <div className="demo-page micro-page">
      <header className="demo-head">
        <a className="demo-back" href="/demos/">
          Demos
        </a>
        <span className="demo-slug">micro-interactions</span>
        <h1 className="demo-title">Micro-interactions</h1>
        <p className="demo-explains">
          The real assessment components, current styling beside a proposed motion layer: slide
          change, Likert press and focus, journey rail progress.
        </p>
        <div className="micro-actions">
          <button
            type="button"
            className="demo-btn"
            aria-pressed={reduced}
            onClick={() => setReduced((r) => !r)}
          >
            Reduced motion
          </button>
        </div>
      </header>

      <SlidePanel />
      <LikertPanel />
      <RailPanel />
      <Adoption />
    </div>
  );
}
