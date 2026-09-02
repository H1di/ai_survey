import Wordmark from "../ui/Wordmark";
import BranchCanvas from "../ui/BranchCanvas";
import OnetAttribution from "./OnetAttribution";
import "./screens.css";

// The first screen: the branch grows behind the question that starts
// everything. Line breaks follow the design exactly.
export default function EntryScreen({
  value,
  onChange,
  onStart,
  busy,
  error,
  reducedMotion,
  onOpenInfo,
}) {
  const ready = Boolean(value.trim()) && !busy;

  return (
    <section className="hero">
      <BranchCanvas preset="hero" reducedMotion={reducedMotion} />

      <div className="hero-bar">
        <Wordmark tone="hero" />
        <nav className="hero-nav">
          <button type="button" onClick={() => onOpenInfo("how-it-works")}>
            how it works
          </button>
          <button type="button" onClick={() => onOpenInfo("the-engine")}>
            the engine
          </button>
        </nav>
      </div>

      <div className="hero-body">
        <h1 className="hero-title">
          What would you do
          <br />
          if you knew you
          <br />
          would definitely
          <br />
          <span className="hero-accent">succeed?</span>
        </h1>

        <textarea
          className="hero-input"
          value={value}
          maxLength={500}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Write your honest answer"
        />

        <button type="button" className="btn btn--bone" onClick={onStart} disabled={!ready}>
          {busy ? "Entering…" : "Start the assessment"}
        </button>

        <p className="hero-disclaimer">
          This is a playful exploratory tool. Because of its simplified structure, it is not fully
          reliable.
        </p>

        {error && <p className="error-text">{error}</p>}

        <div className="hero-footer">
          <OnetAttribution />
        </div>
      </div>
    </section>
  );
}
