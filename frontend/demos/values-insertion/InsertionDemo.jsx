// The painter. Every value is ONE motion element keyed by its layoutId, rendered
// in whichever zone the model puts it (pool chip, A/B card, column row); when a
// zone changes, framer-motion FLIPs it there. Layout is recomputed from the
// model on every render — nothing is moved imperatively.
import { useMemo } from "react";
import { LayoutGroup, motion } from "framer-motion";
import { WORK_VALUE_META } from "../../src/lifePath";
import "../../src/ui/ui.css";
import "./values-insertion.css";

const GLIDE_S = 0.42;
const SWAP_S = 0.12;

// --ease-out lives in tokens.css; framer-motion wants the four numbers.
function readEase() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--ease-out");
  const m = raw.match(/cubic-bezier\(([^)]+)\)/);
  return m ? m[1].split(",").map(Number) : "easeOut";
}

const label = (key) => WORK_VALUE_META[key].label;

export default function InsertionDemo({ layout, frame, reducedMotion, maxChoices }) {
  const ease = useMemo(readEase, []);
  // Reduced motion drops layoutId too: a shared id alone would still morph.
  const item = (key) =>
    reducedMotion ? {} : { layoutId: key, layout: "position", transition: { layout: { duration: GLIDE_S, ease } } };

  const { pending, column, pool } = layout;
  const ranked = column.map((r) => `${r.rank}. ${label(r.key)}`).join(", ");
  const aria = !pending
    ? `${frame.applied} pairwise choices ranked six work values: ${ranked}. The other ${15 - frame.applied} of the 15 possible pairs followed from these answers.`
    : `After ${frame.applied} of at most ${maxChoices} choices, ${column.length} values are in the ordered column; next comparison: ${label(pending.a)} or ${label(pending.b)}.`;

  const card = (key) => (
    <motion.div
      key={key}
      {...item(key)}
      className={[
        "split-half vins-card",
        frame.chosen === key ? "vins-card--chosen" : "",
        frame.chosen && frame.chosen !== key ? "vins-card--other" : "",
      ].join(" ")}
    >
      <span className="split-title">{label(key)}</span>
      <span className="split-body">{WORK_VALUE_META[key].blurb}</span>
    </motion.div>
  );

  return (
    <LayoutGroup>
      {/* Reduced motion: no gliding — the whole frame swaps with a short fade. */}
      <motion.div
        key={reducedMotion ? `${frame.applied}-${frame.chosen}` : "scene"}
        className="vins-figure"
        role="img"
        aria-label={aria}
        initial={reducedMotion ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: SWAP_S }}
      >
        <div className="vins-left" aria-hidden="true">
          <div className="split vins-pair">
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
                {frame.applied} answers. Six values make 15 possible pairs; the other{" "}
                {15 - frame.applied} followed from these.
              </p>
            )}
          </div>

          <div className="vins-pool">
            <span className="vins-eyebrow">{pool.length ? "Not compared yet" : " "}</span>
            <div className="vins-chips">
              {pool.map((key) => (
                <motion.span key={key} {...item(key)} className="vins-chip">
                  {label(key)}
                </motion.span>
              ))}
            </div>
          </div>
        </div>

        <div className="screen vins-col" aria-hidden="true">
          <span className="vins-eyebrow">Ordered so far</span>
          <ol className="rank-list vins-list">
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
          <p className="vins-legend">
            <span className="vins-key vins-key--solid" /> order decided
            <span className="vins-key vins-key--open" /> not yet decided
          </p>
          <p className="vins-confirmed" style={{ opacity: frame.confirmed ? 1 : 0 }}>
            Confirmed order
          </p>
        </div>
      </motion.div>
    </LayoutGroup>
  );
}
