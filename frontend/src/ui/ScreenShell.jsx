import Wordmark from "./Wordmark";
import Eyebrow from "./Eyebrow";
import ProgressLine from "./ProgressLine";
import "./ui.css";

// Every assessment screen is the same composition: a glow background, the
// wordmark, a mono eyebrow, a display headline, an optional sub-headline and
// the step's body. Screens describe only what is unique to them.
//
// Question steps add two things: `progress` ({current, total, variant?}) draws
// the hairline progress line in the header row, and `backdrop` (a scene such as
// the mind graph) is painted behind the body — the body becomes its stacking
// context, so the backdrop can never cover a control.
//
// `question` marks a screen that asks one thing at a time (a Likert item, a
// journey question, the demographics form): the body fills the page below the
// header row, and the item cross-fades in place instead of sliding.
export default function ScreenShell({
  eyebrow,
  title,
  sub,
  glow = "corners",
  align = "center",
  headerSlot = null,
  className = "",
  footer = null,
  progress = null,
  backdrop = null,
  question = false,
  children,
}) {
  return (
    <section
      className={`screen screen--glow-${glow} screen--${align}${backdrop ? " screen--backdrop" : ""}${
        question ? " screen--question" : ""
      } ${className}`}
    >
      <Wordmark />
      {progress && <ProgressLine {...progress} />}
      {headerSlot}
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      {title && <h2 className="screen-title">{title}</h2>}
      {sub && <p className="screen-sub">{sub}</p>}
      <div className={`screen-body${backdrop ? " screen-body--backdrop" : ""}`}>
        {backdrop}
        {children}
      </div>
      {footer && <div className="screen-footer">{footer}</div>}
    </section>
  );
}
