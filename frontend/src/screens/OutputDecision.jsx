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
