import { useCallback, useEffect, useState } from "react";
import * as api from "./api";
import Wordmark from "./ui/Wordmark";
import { HomeNavContext } from "./ui/homeNav";
import AboutYouScreen from "./screens/AboutYouScreen";
import PathScreen from "./screens/PathScreen";
import TestsScreen from "./screens/TestsScreen";

const SESSION_KEY = "invector-v2-session";

function readStoredSession() {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function storeSession(id) {
  try {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // storage blocked — the session simply won't survive a reload
  }
}

// Invector v2 — path-first. The server snapshot is the single source of
// truth; local state is only the view (stage, busy, error).
//   about → building → path ⇄ tests
export default function App() {
  const [meta, setMeta] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [stage, setStage] = useState("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fatal, setFatal] = useState("");

  const apply = useCallback((snap) => {
    setSnapshot(snap);
    storeSession(snap.sessionId);
  }, []);

  // Boot: static meta, then resume a stored session if it is still alive.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const m = await api.fetchMeta();
        if (!live) return;
        setMeta(m);
        const id = readStoredSession();
        if (id) {
          try {
            const snap = await api.fetchSession(id);
            if (!live) return;
            apply(snap);
            setStage(snap.path ? "path" : "building");
            return;
          } catch {
            storeSession(null);
          }
        }
        setStage("about");
      } catch {
        if (live) setFatal("Could not reach the Invector server. Is the v2 backend running on port 3002?");
      }
    })();
    return () => {
      live = false;
    };
  }, [apply]);

  // A session without a path (fresh start or a reload mid-build) builds one.
  useEffect(() => {
    if (stage !== "building" || !snapshot) return;
    let live = true;
    api
      .buildPath({ sessionId: snapshot.sessionId })
      .then((snap) => {
        if (!live) return;
        apply(snap);
        setStage("path");
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [stage, snapshot, apply]);

  // Run one mutating call; returns true on success so callers can close UI.
  const run = useCallback(
    async (fn) => {
      setBusy(true);
      setError("");
      try {
        apply(await fn());
        return true;
      } catch (e) {
        setError(e.message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [apply]
  );

  const sid = snapshot?.sessionId;
  const actions = {
    updateProfile: (answers, parentalConsent) => run(() => api.updateProfile({ sessionId: sid, answers, parentalConsent })),
    rebuild: (note) => run(() => api.rebuildPath({ sessionId: sid, note })),
    restore: () => run(() => api.restorePath({ sessionId: sid })),
    add: (courseId) => run(() => api.addStep({ sessionId: sid, courseId })),
    swap: (stepId, courseId) => run(() => api.swapStep({ sessionId: sid, stepId, courseId })),
    move: (stepId, direction) => run(() => api.moveStep({ sessionId: sid, stepId, direction })),
    remove: (stepId) => run(() => api.removeStep({ sessionId: sid, stepId })),
    unlock: (addon) => run(() => api.unlockAddon({ sessionId: sid, addon })),
    applyScenario: (scenarioId) => run(() => api.applyScenario({ sessionId: sid, scenarioId })),
    generateGuidance: () => run(() => api.generateGuidance({ sessionId: sid })),
    openTests: async () => {
      if (await run(() => api.startTests({ sessionId: sid }))) setStage("tests");
    },
  };

  const startOver = () => {
    storeSession(null);
    setSnapshot(null);
    setError("");
    setStage("about");
  };

  if (fatal) {
    return (
      <main className="app">
        <p className="form-error">{fatal}</p>
      </main>
    );
  }
  if (!meta || stage === "loading") {
    return (
      <main className="app">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  return (
    <HomeNavContext.Provider value={stage === "about" ? null : startOver}>
      <main className="app">
        <header className="topbar">
          <Wordmark />
          <span className="version-tag">v2 · path-first preview</span>
        </header>
        {meta.catalogue.notice && <p className="notice">{meta.catalogue.notice}</p>}

        {stage === "about" && (
          <section className="page">
            <p className="case-pill">Free · about 2 minutes</p>
            <h1 className="page-title">Build your path from real courses</h1>
            <p className="page-sub">
              Answer a few questions. We'll sort your situation into a case and build a first step-by-step roadmap
              from the course catalogue. Then it's yours to change.
            </p>
            <AboutYouScreen
              questions={meta.personalQuestions}
              digitalAgeOfConsent={meta.digitalAgeOfConsent}
              busy={busy}
              error={error}
              onSubmit={async (answers, parentalConsent) => {
                if (await run(() => api.startSession({ answers, parentalConsent }))) setStage("building");
              }}
            />
          </section>
        )}

        {stage === "building" && snapshot && (
          <section className="page building" aria-live="polite">
            <p className="case-pill">{snapshot.case.label}</p>
            <h1 className="page-title">Building your path…</h1>
            <p className="page-sub">{snapshot.case.summary}</p>
            <ol className="slot-preview">
              {snapshot.slots.map((s) => (
                <li key={s.id}>{s.label}</li>
              ))}
            </ol>
            {error && (
              <>
                <p className="form-error" role="alert">
                  {error}
                </p>
                <button type="button" className="btn btn--ghost" onClick={startOver}>
                  Change my answers
                </button>
              </>
            )}
          </section>
        )}

        {stage === "path" && snapshot?.path && (
          <PathScreen snapshot={snapshot} meta={meta} busy={busy} error={error} actions={actions} />
        )}

        {stage === "tests" && snapshot?.tests && (
          snapshot.tests.step === "done" ? (
            <section className="page">
              <h1 className="page-title">Tests done</h1>
              <p className="page-sub">Your answers are scored. Head back to your path to see your guidance.</p>
              <button type="button" className="btn btn--primary" onClick={() => setStage("path")}>
                Back to my path
              </button>
            </section>
          ) : (
            <TestsScreen
              tests={snapshot.tests}
              busy={busy}
              error={error}
              onBack={() => setStage("path")}
              onBigFive={(itemId, value) => run(() => api.answerBigFive({ sessionId: sid, itemId, value }))}
              onRiasec={(itemId, value) => run(() => api.answerRiasec({ sessionId: sid, itemId, value }))}
              onValues={(comparisonId, winner) => run(() => api.answerValues({ sessionId: sid, comparisonId, winner }))}
              onExperience={(answers) => run(() => api.submitExperience({ sessionId: sid, answers }))}
            />
          )
        )}
      </main>
    </HomeNavContext.Provider>
  );
}
