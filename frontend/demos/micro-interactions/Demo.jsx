// Micro-interactions — the small motion layer on the real assessment
// components. It started as a current-vs-proposed comparison; the proposal is
// now the app's own CSS (ui.css: slide change + Likert; screens.css: journey
// rail, button press; ui/RankList.jsx: reorder glide), so this page simply
// renders the shipped components to poke at. One screen at a time on purpose:
// two .screen elements would duplicate the view-transition names and cancel
// the slide.
//
// Reduced motion follows the OS setting (in Playwright: emulateMedia).
import { useState } from "react";
import "../kit/demo.css";
import "../../src/index.css";
import ScreenShell from "../../src/ui/ScreenShell";
import LikertScale from "../../src/ui/LikertScale";
import RankList from "../../src/ui/RankList";
import StepRail from "../../src/screens/StepRail";
import { JOURNEY_RAIL, WORK_VALUE_META, WORK_VALUE_ORDER, moveRankItemTo } from "../../src/lifePath";
import { withViewTransition } from "../../src/motion/viewTransition";
import "./micro.css";

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

function Panel({ id, k, title, children, note }) {
  return (
    <section className="micro-panel" aria-labelledby={id}>
      <header className="micro-panel-head">
        <span className="micro-panel-key">{k}</span>
        <h2 id={id}>{title}</h2>
        <p>{note}</p>
      </header>
      <div className="micro-col">{children}</div>
    </section>
  );
}

function SlidePanel() {
  const [index, setIndex] = useState(0);
  const advance = () => withViewTransition(() => setIndex((i) => (i + 1) % ITEMS.length));
  return (
    <Panel
      id="micro-a"
      k="a"
      title="Slide change"
      note="Answering an item swaps the slide: the outgoing item fades 12 px left, the next arrives from 12 px right; the eyebrow and title hold still. The next answer is clickable at once."
    >
      <ScreenShell
        glow="none"
        eyebrow={`step 2 · big five · item ${index + 1} of ${ITEMS.length}`}
        title="Mini-IPIP-20"
      >
        <div className="instrument">
          <p className="item-statement">{ITEMS[index]}</p>
          <LikertScale key={index} anchors={ANCHORS} ends={{ low: "inaccurate", high: "accurate" }} value={null} onSelect={advance} />
        </div>
      </ScreenShell>
    </Panel>
  );
}

function LikertPanel() {
  const [value, setValue] = useState(null);
  return (
    <Panel
      id="micro-b"
      k="b"
      title="Likert"
      note="Pick: the turquoise fill swells past the ring and settles to a dot with a soft halo. Hover or focus a ring and its anchor is named under the scale. Tab in: the focus ring hugs the circle and never shows on a mouse click; arrow keys walk the rings."
    >
      <div className="micro-likert">
        <p className="item-statement item-statement--sm">{ITEMS[1]}</p>
        <LikertScale anchors={ANCHORS} ends={{ low: "inaccurate", high: "accurate" }} value={value} onSelect={setValue} />
      </div>
    </Panel>
  );
}

function RailPanel() {
  const last = JOURNEY_RAIL.length - 1;
  const [active, setActive] = useState(1);
  const [furthest, setFurthest] = useState(1);
  // Completing a step advances exactly one, as on the real rail.
  const complete = () => {
    const to = Math.min(active + 1, last);
    setActive(to);
    setFurthest((f) => Math.max(f, to));
  };
  return (
    <Panel
      id="micro-c"
      k="c"
      title="Journey rail and buttons"
      note="Completing a step fills the progress line one sixth further, and that step's dot turns gold. Click a finished step to go back; the line follows. The buttons settle to 97 % while pressed."
    >
      <div className="micro-rail">
        <StepRail
          step={JOURNEY_RAIL[active].step}
          furthestStep={JOURNEY_RAIL[furthest].step}
          onNavigate={(target) => setActive(JOURNEY_RAIL.findIndex((r) => r.step === target))}
        />
        <div className="micro-actions">
          <button type="button" className="btn btn--primary" onClick={complete} disabled={active === last}>
            Complete step
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setActive(0);
              setFurthest(0);
            }}
          >
            Reset
          </button>
        </div>
      </div>
    </Panel>
  );
}

function RankPanel() {
  const [order, setOrder] = useState(WORK_VALUE_ORDER);
  return (
    <Panel
      id="micro-d"
      k="d"
      title="Rank list"
      note="Drag a row, or focus one and use the arrow keys: the rows it passes glide to their new slots instead of jumping."
    >
      <div className="screen micro-rank">
        <RankList
          items={order.map((id) => ({ id, label: WORK_VALUE_META[id].label }))}
          onReorder={(from, to) => setOrder((list) => moveRankItemTo(list, from, to))}
        />
      </div>
    </Panel>
  );
}

export default function Demo() {
  return (
    <div className="demo-page micro-page">
      <header className="demo-head">
        <a className="demo-back" href="/demos/">
          Demos
        </a>
        <span className="demo-slug">micro-interactions</span>
        <h1 className="demo-title">Micro-interactions</h1>
        <p className="demo-explains">
          The real assessment components with the shipped motion layer: slide change, Likert press
          and focus, journey rail progress, button press, rank-list reorder.
        </p>
      </header>

      <SlidePanel />
      <LikertPanel />
      <RailPanel />
      <RankPanel />
    </div>
  );
}
