// The assessment as one personal mark: Big Five lobes, the RIASEC ring, the
// work-value ticks. The geometry is a pure function of the profile (same
// answers, same mark), so this is a figure of the result, not decoration.
import { useMemo, useRef } from "react";
import { WORK_VALUE_META } from "../../lifePath";
import { totalDuration } from "../timeline";
import { usePlayOnce } from "../usePlayOnce";
import EmblemCanvas from "./EmblemCanvas";
import { BIG_FIVE_AXES, STAGES, WORK_VALUE_SLOTS, buildEmblem, frameAt } from "./emblemEngine";
import { saveEmblemPng } from "./savePng";
import "./emblem.css";

const valueLabel = (key) => WORK_VALUE_META[key]?.label ?? key;

function emblemAria(e) {
  const lobes = e.lobes.map((l) => `${l.label} ${l.value}`).join(", ");
  const lead = [...e.ticks].sort((a, b) => a.rank - b.rank).slice(0, 2).map((t) => valueLabel(t.key));
  return `Personal emblem for ${e.archetype.name}. Inner lobes: ${lobes}. Interest ring with ${e.riasecCode.split("").join(", ")} marked. Longest work-value ticks: ${lead.join(", then ")}.`;
}

function Legend({ emblem, frame }) {
  const lead = [...emblem.ticks].sort((a, b) => a.rank - b.rank)[0];
  return (
    <dl className="emb-legend">
      <div style={{ opacity: Math.max(0.35, frame.scaleAlpha) }}>
        <dt>Inner · Personality</dt>
        <dd>
          Five lobes, length = score.{" "}
          {BIG_FIVE_AXES.map((a) => `${a.abbr} ${a.label}`).join(", ")}. STB = 100 − Neuroticism.
        </dd>
      </div>
      <div style={{ opacity: Math.max(0.35, frame.ringAlpha) }}>
        <dt>Middle · Interests</dt>
        <dd>Six RIASEC segments, thickness = score. Your code {emblem.riasecCode} is marked in turquoise.</dd>
      </div>
      <div style={{ opacity: Math.max(0.35, frame.tickAlpha) }}>
        <dt>Outer · Priorities</dt>
        <dd>
          Six work values, length = rank. Longest: {valueLabel(lead.key)}.{" "}
          {WORK_VALUE_SLOTS.map((s) => `${s.abbr} ${valueLabel(s.key)}`).join(", ")}.
        </dd>
      </div>
      <div>
        <dt>Seed</dt>
        <dd>A hash of the scores sets the orientation; same answers, same mark.</dd>
      </div>
    </dl>
  );
}

// Presentational: one frame of one emblem. `showName` adds the archetype name
// and tagline under the mark (the summary screen prints them itself);
// `legend` is "open" (beside the mark) or "fold" (a closed disclosure).
export function EmblemScene({ emblem, frame, showName = true, legend = "open", children }) {
  const { archetype } = emblem;
  return (
    <div className="emb">
      <div className={`emb-layout emb-layout--${legend}`}>
        <figure className="emb-figure">
          <EmblemCanvas emblem={emblem} frame={frame} ariaLabel={emblemAria(emblem)} />
          <figcaption className={`emb-caption${showName ? "" : " emb-caption--serial"}`} aria-hidden="true">
            {showName && (
              <>
                <p className="emb-name" style={{ opacity: frame.nameAlpha }}>
                  {archetype.name}
                </p>
                <p className="emb-tagline" style={{ opacity: frame.taglineAlpha }}>
                  {archetype.tagline}
                </p>
              </>
            )}
            <p className="emb-serial" style={{ opacity: frame.taglineAlpha }}>
              {emblem.riasecCode} · {emblem.serial}
            </p>
          </figcaption>
        </figure>

        {legend === "fold" ? (
          <details className="emb-fold">
            <summary>How to read this mark</summary>
            <Legend emblem={emblem} frame={frame} />
          </details>
        ) : (
          <Legend emblem={emblem} frame={frame} />
        )}
      </div>
      {children}
    </div>
  );
}

// The shipped scene: draws once when it appears; reduced motion paints the
// finished mark. `profile` is { bigFiveScores, riasecScores, riasecCode,
// valuesOrder } straight from the session snapshot.
export default function ArchetypeEmblem({ profile, reducedMotion }) {
  const ref = useRef(null);
  const emblem = useMemo(() => buildEmblem(profile), [profile]);
  const { T } = usePlayOnce(totalDuration(STAGES), { targetRef: ref, reducedMotion });
  const frame = useMemo(() => frameAt(T), [T]);
  return (
    <div ref={ref} className="emb-host">
      <EmblemScene emblem={emblem} frame={frame} showName={false} legend="fold">
        <button type="button" className="link-action emb-save" onClick={() => saveEmblemPng(emblem)}>
          Save as image
        </button>
      </EmblemScene>
    </div>
  );
}
