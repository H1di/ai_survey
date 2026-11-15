// The painter. Every value is ONE motion element keyed by its layoutId, rendered
// in whichever zone the model puts it (pool chip, A/B card, column row); when a
// zone changes, framer-motion FLIPs it there. Layout is recomputed from the
// model on every render — nothing is moved imperatively.
//
// With `onChoose` the A/B cards are the real answer buttons (the tournament
// screen); without it they are inert (the demo's replay). Either way an answer
// is never held back by the glide: the next pair is live the moment it renders.
import { useMemo } from "react";
import { LayoutGroup, motion } from "framer-motion";
import { WORK_VALUE_META } from "../../lifePath";
import "../../ui/ui.css";
import "./values-insertion.css";

const GLIDE_S = 0.42;
const SWAP_S = 0.12;
const ALL_PAIRS = 15; // six values, taken two at a time

// --ease-out lives in tokens.css; framer-motion wants the four numbers.
function readEase() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--ease-out");
  const m = raw.match(/cubic-bezier\(([^)]+)\)/);
  return m ? m[1].split(",").map(Number) : "easeOut";
}

const label = (key) => WORK_VALUE_META[key]?.label ?? key;

function insertionAria({ layout, applied, maxChoices }) {
  const { pending, column } = layout;
  const ranked = column.map((r) => (r.rank ? `${r.rank}. ${label(r.key)}` : label(r.key))).join(", ");
  if (!pending) {
    return `${applied} pairwise choices ranked six work values: ${ranked}. The other ${ALL_PAIRS - applied} of the ${ALL_PAIRS} possible pairs followed from these answers.`;
  }
  const soFar = column.length ? `ordered so far: ${ranked}` : "nothing ordered yet";
  return `After ${applied} of at most ${maxChoices} choices, ${soFar}. Next comparison: ${label(pending.a)} or ${label(pending.b)}.`;
}

export default function InsertionBoard({
  layout,
  applied,
  chosen = null,
  confirmed = false,
  reducedMotion = false,
  maxChoices,
  onChoose,
  disabled = false,
}) {
  const ease = useMemo(() => readEase(), []);
  // Reduced motion drops layoutId too: a shared id alone would still morph.
  const item = (key) =>
    reducedMotion ? {} : { layoutId: key, layout: "position", transition: { layout: { duration: GLIDE_S, ease } } };

  const { pending, column, pool } = layout;
  const Card = onChoose ? motion.button : motion.div;

  const card = (key) => (
    <Card
      key={key}
      {...item(key)}
      {...(onChoose ? { type: "button", disabled, onClick: () => onChoose(key) } : {})}
      className={[
        "split-half vins-card",
        chosen === key ? "vins-card--chosen" : "",
        chosen && chosen !== key ? "vins-card--other" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="split-title">{label(key)}</span>
      <span className="split-body">{WORK_VALUE_META[key]?.blurb}</span>
    </Card>
  );

  return (
    <LayoutGroup>
      {/* Reduced motion: no gliding — the whole frame swaps with a short fade. */}
      <motion.div
        key={reducedMotion ? `${applied}-${chosen}` : "scene"}
        className="vins-figure"
        initial={reducedMotion ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: SWAP_S }}
      >
        <div className="vins-left">
          <div className="split vins-pair" aria-hidden={onChoose ? undefined : "true"}>
            {pending ? (
              <>
                {card(pending.a)}
                <div className="split-rule">
                  <span className="split-rule-label">or</span>
                </div>
                {card(pending.b)}
              </>
            ) : (
              <p className="vins-done">
                {applied} answers. Six values make {ALL_PAIRS} possible pairs; the other{" "}
                {ALL_PAIRS - applied} followed from these.
              </p>
            )}
          </div>

          <div className="vins-pool" aria-hidden="true">
            <span className="vins-eyebrow">{pool.length ? "Not compared yet" : " "}</span>
            <div className="vins-chips">
              {pool.map((key) => (
                <motion.span key={key} {...item(key)} className="vins-chip">
                  {label(key)}
                </motion.span>
              ))}
            </div>
          </div>
        </div>

        <div
          className="screen vins-col"
          role="img"
          aria-label={insertionAria({ layout, applied, maxChoices })}
        >
          <span className="vins-eyebrow" aria-hidden="true">
            Ordered so far
          </span>
          <ol className="rank-list vins-list" aria-hidden="true">
            {column.map((row) => (
              <motion.li
                key={row.key}
                {...item(row.key)}
                className={`rank-row vins-row${row.linkBelow === false ? " vins-row--open" : ""}`}
              >
                <span className={`rank-number${row.rank ? "" : " vins-rank--open"}`}>
                  {row.rank ?? "–"}
                </span>
                <span className="rank-label">{label(row.key)}</span>
              </motion.li>
            ))}
          </ol>
          <p className="vins-legend" aria-hidden="true">
            <span className="vins-key vins-key--solid" /> order decided
            <span className="vins-key vins-key--open" /> not yet decided
          </p>
          <p className="vins-confirmed" aria-hidden="true" style={{ opacity: confirmed ? 1 : 0 }}>
            Confirmed order
          </p>
        </div>
      </motion.div>
    </LayoutGroup>
  );
}
