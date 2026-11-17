import Eyebrow from "../ui/Eyebrow";
import OutputFieldFigure from "../motion/OutputFieldFigure";
import { canPlaceOutputs } from "../motion/onetField";
import { usMarketLine, whyThisFitsSections } from "../lifePath";
import "./screens.css";

// The Yes/No decision, as three ruled columns carrying the output itself.
//
// With the O*NET field (`field`, `riasecScores`, `outputs` — every output so
// far, this one last) the job column carries a figure: where the pick sits
// among the shortlist, and — while a "No" is in flight and when its answer
// lands — the move from one field family to the next. The figure never gates
// the buttons.
export default function OutputDecision({
  output,
  busy,
  onAccept,
  onRegenerate,
  onOpenDetails,
  field = null,
  riasecScores = null,
  outputs = null,
  animateArrival = false,
  reducedMotion,
}) {
  const market = usMarketLine(output);
  const trace = whyThisFitsSections(output)
    .flatMap((section) => section.items || [])
    .slice(0, 3);
  const locked = Boolean(busy.accept || busy.refine);
  const shown = outputs?.length ? outputs : [output];
  const figure = Boolean(riasecScores) && canPlaceOutputs(field, shown);

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
            {output.valuesFit && (
              <span className="output-fit"> · {output.valuesFit.overall}% values fit</span>
            )}
          </p>
          {market && <p className="output-meta">{market}</p>}
          {figure && (
            <OutputFieldFigure
              field={field}
              riasecScores={riasecScores}
              outputs={shown}
              leaving={Boolean(busy.refine)}
              animateArrival={animateArrival}
              reducedMotion={reducedMotion}
            />
          )}
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

      {figure && (
        <p className="output-attribution">{output.onet?.attribution || field.attribution}</p>
      )}

      <p className="screen-footnote">
        Say Yes to accept (unlocks four advice blocks + a roadmap) or No to regenerate from a
        genuinely different field family.
      </p>

      <div className="output-actions">
        <button type="button" className="btn btn--primary" onClick={onAccept} disabled={locked}>
          {busy.accept ? "Building next steps…" : "Yes — accept this path"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onRegenerate} disabled={locked}>
          {busy.refine ? "Finding another…" : "No — regenerate from a different field"}
        </button>
      </div>
    </div>
  );
}
