import { useEffect, useRef, useState } from "react";
import ScreenShell from "../ui/ScreenShell";
import OccupationFunnel from "../motion/funnel/OccupationFunnel";
import "./screens.css";

// The `tree` step while the first result is prepared. With the O*NET field
// loaded it shows the path the pick is made by; the pick itself only appears
// once the response carries it. Nothing here delays the flow: "See your path"
// is live the moment the result exists, and the scene hands over on its own
// when it ends.
//
// Without the field (chunk still loading, or failed) it is the plain pulse,
// and hands over as soon as the result is in.
export default function FirstPathScreen({
  field,
  riasecScores,
  riasecCode,
  output,
  onDone,
  footer,
  reducedMotion,
}) {
  // Coming back to `tree` with a result already made: there is no selection to
  // show in progress, so go straight through.
  const [resumed] = useState(() => Boolean(output));
  const scene = Boolean(field && riasecScores) && !resumed;

  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });
  const ready = Boolean(output);
  useEffect(() => {
    if (ready && !scene) doneRef.current?.();
  }, [ready, scene]);

  return (
    <ScreenShell
      eyebrow="life path engine"
      title="Building your first life path…"
      sub="Matching your profile against the O*NET occupation set."
      glow="center"
      footer={footer}
    >
      {scene ? (
        <div className="first-path">
          <OccupationFunnel
            field={field}
            riasecScores={riasecScores}
            riasecCode={riasecCode}
            pick={output ? { soc: output.socCode, title: output.jobTitle } : null}
            reducedMotion={reducedMotion}
            onDone={onDone}
          />
          {/* Always in the layout so its arrival moves nothing. */}
          <button
            type="button"
            className="btn btn--primary first-path-cta"
            onClick={onDone}
            disabled={!ready}
            style={{ visibility: ready ? "visible" : "hidden" }}
          >
            See your path
          </button>
          <p className="screen-footnote first-path-attribution">{field.attribution}</p>
        </div>
      ) : (
        <div className="screen-loading-dots" aria-live="polite" aria-label="Generating">
          <span /><span /><span />
        </div>
      )}
    </ScreenShell>
  );
}
