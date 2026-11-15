// The result card's figure: one box, three states of the same hexagon of
// O*NET occupations.
//   leaving  — a "No" is in flight: this family is ruled out, the scene waits;
//   arriving — a new pick just landed: the camera reaches its family;
//   settled  — where the pick sits among the shortlist it was chosen from.
// The box has a fixed aspect ratio, so swapping states never moves the card.
// Nothing here gates the buttons beside it.
import { useMemo, useState } from "react";
import { groundingFor } from "./onetField";
import { useReducedMotion } from "./usePlayOnce";
import OccupationMap from "./map/OccupationMap";
import FieldShift from "./shift/FieldShift";
import "./output-figure.css";

function figureCaption({ mode, label, shortlistSize }) {
  if (mode === "leaving") return `${label} ruled out · weighing the other fields`;
  if (mode === "arriving") return `From ${label}`;
  return `Among the ${shortlistSize} closest interest profiles`;
}

export default function OutputFieldFigure({
  field,
  riasecScores,
  outputs,
  leaving = false,
  animateArrival = false,
  reducedMotion,
}) {
  const rm = useReducedMotion(reducedMotion);
  const [arrived, setArrived] = useState(!animateArrival);
  const output = outputs[outputs.length - 1];
  const shortlist = useMemo(
    () => groundingFor(field, riasecScores, outputs.slice(0, -1)).shortlist,
    [field, riasecScores, outputs]
  );

  const mode = leaving ? "leaving" : arrived || rm ? "settled" : "arriving";
  const label = field.directionLabel(output.directionId);

  return (
    <figure className="output-figure">
      <div className="output-figure-box">
        <div className="output-figure-layer" key={mode}>
          {mode === "settled" ? (
            <OccupationMap
              field={field}
              riasecScores={riasecScores}
              shortlist={shortlist}
              chosen={{ soc: output.socCode, title: output.jobTitle }}
              reducedMotion={rm}
            />
          ) : (
            <FieldShift
              field={field}
              riasecScores={riasecScores}
              outputs={outputs}
              phase={mode}
              reducedMotion={rm}
              onDone={() => setArrived(true)}
            />
          )}
        </div>
      </div>
      <figcaption className="output-figure-caption">
        {figureCaption({ mode, label, shortlistSize: shortlist.length })}
      </figcaption>
    </figure>
  );
}
