import Wordmark from "./Wordmark";
import Eyebrow from "./Eyebrow";
import "./ui.css";

// Every assessment screen is the same composition: a glow background, the
// wordmark, a mono eyebrow, a display headline, an optional sub-headline and
// the step's body. Screens describe only what is unique to them.
export default function ScreenShell({
  eyebrow,
  title,
  sub,
  glow = "corners",
  align = "center",
  headerSlot = null,
  className = "",
  footer = null,
  children,
}) {
  return (
    <section className={`screen screen--glow-${glow} screen--${align} ${className}`}>
      <Wordmark />
      {headerSlot}
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      {title && <h2 className="screen-title">{title}</h2>}
      {sub && <p className="screen-sub">{sub}</p>}
      <div className="screen-body">{children}</div>
      {footer && <div className="screen-footer">{footer}</div>}
    </section>
  );
}
