import ScreenShell from "../ui/ScreenShell";
import "./screens.css";

const CV_INTENT_OPTIONS = [
  { value: "new", label: "Something completely new" },
  { value: "use_skills", label: "Use the skills I already have" },
];

// A dotted rule, drawn the way the design draws it.
function DottedRule() {
  return (
    <svg className="dotted-rule" width="100%" height="2" aria-hidden="true">
      <line x1="0" y1="1" x2="100%" y2="1" strokeDasharray="1,7" strokeLinecap="round" />
    </svg>
  );
}

export default function ExperienceScreen({
  mode,
  intent,
  intentBusy,
  onSelectIntent,
  cvDraft,
  onCvDraftChange,
  onStartPaste,
  onSubmitCvText,
  onUploadFile,
  uploadFormats,
  busy,
  journeyQuestion,
  journeyIndex,
  journeyTotal,
  journeyDraft,
  onJourneyDraftChange,
  onSubmitJourney,
  onBackToChoice,
  onJourneyBack,
  footer,
}) {
  const eyebrow =
    mode === "journey"
      ? `step 5 · experience · question ${journeyIndex + 1} of ${journeyTotal}`
      : "step 5 · experience";

  const backControl = (onBack) => (
    <button type="button" className="screen-back" onClick={onBack} disabled={busy}>
      ← Back
    </button>
  );

  if (mode === "paste") {
    return (
      <ScreenShell
        eyebrow={eyebrow}
        title="Paste your CV"
        footer={footer}
        headerSlot={backControl(onBackToChoice)}
      >
        <textarea
          className="cv-paste"
          value={cvDraft}
          maxLength={6000}
          disabled={busy}
          placeholder="Paste the text of your CV or a summary of your experience"
          onChange={(event) => onCvDraftChange(event.target.value)}
        />
        <button
          type="button"
          className="btn btn--gold"
          onClick={onSubmitCvText}
          disabled={busy || !cvDraft.trim()}
        >
          {busy ? "Analysing…" : "Analyse my CV"}
        </button>
      </ScreenShell>
    );
  }

  // The split is not drawn until the intent question above it is answered —
  // the choice comes first, then the two ways of describing your experience.
  const locked = !intent || busy;
  const lastQuestion = journeyIndex >= journeyTotal - 1;

  return (
    <ScreenShell
      eyebrow={eyebrow}
      headerSlot={mode === "journey" ? backControl(onJourneyBack) : null}
      title="Where should we start from?"
      sub="Paste or upload a CV — or answer seven career-journey questions if you don't have one."
      footer={footer}
    >
      <div className="intent-segment" role="radiogroup" aria-label="Where should we start from?">
        {CV_INTENT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={intent === option.value}
            className={`intent-segment-option ${
              intent === option.value ? "intent-segment-option--on" : ""
            }`}
            disabled={intentBusy || busy}
            onClick={() => onSelectIntent(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {!intent && <p className="intent-hint">Pick one to continue.</p>}

      {intent && (
        <div className="experience-split">
          <DottedRule />

          <div className="experience-halves">
            <div
              className="experience-half"
              onDragOver={(event) => {
                // Cancel unconditionally, locked or not. An un-cancelled dragover
                // leaves the drop to the browser, which navigates the tab to the
                // dropped file and destroys the in-progress session.
                event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (locked) return;
                const file = event.dataTransfer?.files?.[0];
                if (file) onUploadFile(file);
              }}
            >
              <h3 className="experience-heading">With a CV</h3>
              <p className="experience-copy">
                Drop your CV file here,
                <br />
                or paste its text.
              </p>
              <div className="experience-actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={locked}
                  onClick={onStartPaste}
                >
                  Paste its text
                </button>
                <label className={`btn btn--ghost ${locked ? "btn--locked" : ""}`}>
                  Upload a file ({uploadFormats.join(", ")} — max 5 MB)
                  <input
                    type="file"
                    accept={uploadFormats.join(",")}
                    hidden
                    disabled={locked}
                    onChange={(event) =>
                      event.target.files?.[0] && onUploadFile(event.target.files[0])
                    }
                  />
                </label>
              </div>
            </div>

            <div className="experience-rule" />

            <div className="experience-half experience-half--b">
              <h3 className="experience-heading">Without a CV</h3>
              <p className="item-statement item-statement--italic item-statement--sm">
                &quot;{journeyQuestion.question}&quot;
              </p>
              <form
                key={journeyQuestion.id}
                onSubmit={(event) => {
                  event.preventDefault();
                  onSubmitJourney();
                }}
              >
                <input
                  className="demo-input"
                  value={journeyDraft}
                  maxLength={400}
                  disabled={locked}
                  placeholder={journeyQuestion.placeholder}
                  onChange={(event) => onJourneyDraftChange(event.target.value)}
                />
                <div className="journey-nav">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={busy || mode !== "journey"}
                    onClick={onJourneyBack}
                  >
                    ← Back
                  </button>
                  <button
                    type="submit"
                    className="btn btn--gold"
                    disabled={locked || !journeyDraft.trim()}
                  >
                    {busy && mode === "journey" ? "Saving…" : lastQuestion ? "Finish →" : "Next →"}
                  </button>
                </div>
              </form>
            </div>
          </div>

          <DottedRule />
        </div>
      )}
    </ScreenShell>
  );
}
