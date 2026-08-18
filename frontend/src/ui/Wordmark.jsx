import "./ui.css";

// The mark in the top-left of every screen: a glowing dot plus the product
// name. `hero` is the bone-white variant on the black hero; every step screen
// uses the gold-dimmed default.
export default function Wordmark({ tone = "screen" }) {
  return (
    <div className={`wordmark wordmark--${tone}`}>
      <span className="wordmark-dot" aria-hidden="true" />
      <span className="wordmark-text">invector</span>
    </div>
  );
}
