import { useState } from "react";
import Wordmark from "../ui/Wordmark";
import BranchCanvas from "../ui/BranchCanvas";
import OnetAttribution from "./OnetAttribution";
import "./screens.css";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Account before the assessment: email magic link or Google. Same hero frame
// as the entry screen so signing in reads as the first step, not a wall.
export default function SignInScreen({ onMagicLink, onGoogle, reducedMotion }) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const attempt = (kind, fn) => async () => {
    setBusy(kind);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err?.message || "Sign-in failed. Try again.");
    } finally {
      setBusy("");
    }
  };

  const trimmed = email.trim();
  const sendLink = attempt("link", async () => {
    await onMagicLink(trimmed);
    setSentTo(trimmed);
  });

  return (
    <section className="hero">
      <BranchCanvas preset="hero" reducedMotion={reducedMotion} />

      <div className="hero-bar">
        <Wordmark tone="hero" />
      </div>

      <div className="hero-body">
        <h1 className="hero-title">
          Sign in to
          <br />
          <span className="hero-accent">start.</span>
        </h1>

        {sentTo ? (
          <div className="signin-sent" role="status">
            <p>
              We sent a sign-in link to <strong>{sentTo}</strong>. Open it in this browser to
              continue.
            </p>
            <button type="button" className="btn btn--ghost" onClick={() => setSentTo("")}>
              Use another email
            </button>
          </div>
        ) : (
          <form
            className="signin-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (EMAIL_PATTERN.test(trimmed) && !busy) sendLink();
            }}
          >
            <label className="signin-label" htmlFor="signin-email">
              Email
            </label>
            <input
              id="signin-email"
              className="hero-input signin-input"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
            <button
              type="submit"
              className="btn btn--bone"
              disabled={!EMAIL_PATTERN.test(trimmed) || Boolean(busy)}
            >
              {busy === "link" ? "Sending…" : "Email me a sign-in link"}
            </button>
            <p className="signin-or">or</p>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={attempt("google", onGoogle)}
              disabled={Boolean(busy)}
            >
              {busy === "google" ? "Opening Google…" : "Continue with Google"}
            </button>
          </form>
        )}

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        <div className="hero-footer">
          <OnetAttribution />
        </div>
      </div>
    </section>
  );
}
