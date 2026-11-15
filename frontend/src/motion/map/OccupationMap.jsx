// The shipped map: where the picked occupation sits among the shortlist it
// was chosen from, on the hexagon of every O*NET occupation. Ambient — a slow
// orbit, and the marked occupations named one at a time (hover names any of
// them). Reduced motion: a still map that names the pick.
import { useMemo, useRef } from "react";
import { projectRiasec } from "../riasecPlane";
import { useSceneClock } from "../useSceneClock";
import MapCanvas from "./MapCanvas";
import { STAGES, buildField, buildMarks } from "./mapEngine";
import "./map.css";

// buildField is 923 seeded rows; one result card after another reuses it.
const fieldCache = new WeakMap();
function dotsFor(field) {
  if (!fieldCache.has(field)) fieldCache.set(field, buildField(field.occupations));
  return fieldCache.get(field);
}

function mapAria({ count, chosen, shortlist }) {
  const closest = shortlist
    .slice(0, 3)
    .map((s) => s.title)
    .join(", ");
  return `${chosen.title} marked among the ${shortlist.length} occupations whose measured O*NET interest profiles sit closest to yours, on the six-type RIASEC hexagon of all ${count} occupations. Closest: ${closest}.`;
}

export default function OccupationMap({ field, riasecScores, shortlist, chosen, reducedMotion }) {
  const boxRef = useRef(null);
  const dots = dotsFor(field);
  const marks = useMemo(
    () => buildMarks(dots, { shortlist, chosen: chosen.soc }),
    [dots, shortlist, chosen.soc]
  );
  const you = useMemo(() => projectRiasec(riasecScores), [riasecScores]);
  const clock = useSceneClock(STAGES, { targetRef: boxRef, reducedMotion });

  return (
    <div className="omap-figure" ref={boxRef}>
      <MapCanvas
        variant="figure"
        field={dots}
        marks={marks}
        you={you}
        T={clock.T}
        reducedMotion={clock.reducedMotion}
        ariaLabel={mapAria({ count: dots.length, chosen, shortlist })}
      />
    </div>
  );
}
