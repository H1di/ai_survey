import { Component } from "react";
import { reportClientError } from "../api";

// Last-resort screen for a render crash anywhere under it. Reports once, then
// offers a reload; the server snapshot survives, so a reload resumes the session.
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    reportClientError({ message: error?.message || "render error", where: "render" });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="confirm-overlay">
        <div className="confirm-card" role="alert">
          <h2 className="confirm-title">Something broke</h2>
          <p className="confirm-body">
            The page hit an unexpected error. Reloading usually fixes it, and your progress is kept.
          </p>
          <div className="confirm-actions">
            <button type="button" className="btn btn--gold" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
