import { useHomeNav } from "./homeNav";
import "./ui.css";

// The mark in the top-left of every screen: a glowing dot plus the product
// name. `hero` is the bone-white variant on the black hero; every step screen
// uses the gold-dimmed default. When a home handler is published (everywhere
// but the entry screen, which is already home) the mark becomes the link back
// to the start page.
export default function Wordmark({ tone = "screen" }) {
  const onHome = useHomeNav();

  const mark = (
    <>
      <span className="wordmark-dot" aria-hidden="true" />
      <span className="wordmark-text">invector</span>
    </>
  );

  if (!onHome) {
    return <div className={`wordmark wordmark--${tone}`}>{mark}</div>;
  }

  return (
    <button
      type="button"
      className={`wordmark wordmark--${tone} wordmark--link`}
      onClick={onHome}
      title="Back to the start page"
    >
      {mark}
    </button>
  );
}
