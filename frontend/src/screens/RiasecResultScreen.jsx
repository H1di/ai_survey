import ScreenShell from "../ui/ScreenShell";
import RiasecSettle from "../motion/settle/RiasecSettle";
import "./screens.css";

// The interest result, shown once the quiz is finished — never while
// answering, where live scores would bias the answers. The step machine has
// already moved on to `values`; this is a view over the stored result, and
// Continue is live from the first frame.
export default function RiasecResultScreen({
  scores,
  code,
  inferred = false,
  onContinue,
  footer,
  reducedMotion,
}) {
  return (
    <ScreenShell
      eyebrow="step 3 · riasec interests · result"
      title="Your interest code"
      sub={
        inferred
          ? "Estimated from your personality answers rather than the quiz — take it as a sketch."
          : "Your twelve answers as six scores, where their balance sits on Holland's hexagon, and the three types that lead."
      }
      footer={footer}
    >
      <RiasecSettle scores={scores} code={code} reducedMotion={reducedMotion} />
      <button type="button" className="btn btn--gold result-continue" onClick={onContinue}>
        Continue to values
      </button>
    </ScreenShell>
  );
}
