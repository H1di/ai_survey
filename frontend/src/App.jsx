import { useEffect, useState } from "react";
import { AnimatePresence, motion as Motion } from "framer-motion";
import GraphView from "./components/GraphView";
import { DetailPanel } from "./components/GraphView/NodeComponent";
import ProfilePanel, { PersonalityRadarChart, WorkValuesRadar } from "./components/ProfileCharts";
import DevPanel from "./components/DevPanel";
import { captureDevToken, isDevMode } from "./devMode";
import {
  acceptOutput,
  confirmValues,
  continueSummary,
  devJump,
  fetchFirstOutput,
  fetchSession,
  generateRoadmap,
  postCvIntent,
  refineOutput,
  skipRiasec,
  startRiasec,
  startSession,
  startValues,
  submitBigFiveAnswer,
  submitDemographics,
  submitCvText,
  submitJobCharRanking,
  submitJourneyAnswer,
  submitRiasecAnswer,
  submitValuesAnswer,
  uploadCvFile,
} from "./api";
import {
  buildLifePathGraph,
  deriveArchetype,
  firstUnansweredIndex,
  moveRankItem,
  selectDockCard,
  JOURNEY_RAIL,
  railIndexForStep,
  whyThisFitsSections,
  onetSection,
  WORK_VALUE_META,
} from "./lifePath";
import "./App.css";

// Runs before React mounts: moves ?dev=<token> into sessionStorage and scrubs
// it from the URL, so the panel's visibility is settled by first render.
captureDevToken();
const DEV_MODE = isDevMode();
import "./components/GraphView/GraphPage.css";

const CV_INTENT_OPTIONS = [
  { value: "new", label: "Something completely new" },
  { value: "use_skills", label: "Use the skills I already have" },
];

const LIKERT = [
  { value: 1, label: "Strongly disagree" },
  { value: 2, label: "Disagree" },
  { value: 3, label: "Neutral" },
  { value: 4, label: "Agree" },
  { value: 5, label: "Strongly agree" },
];

const ENJOY_LIKERT = [
  { value: 1, label: "Not at all" },
  { value: 2, label: "Not really" },
  { value: 3, label: "Maybe" },
  { value: 4, label: "Quite a bit" },
  { value: 5, label: "Very much" },
];

function stepHeading(step) {
  const railEntry = JOURNEY_RAIL.find((r) => r.step === step);
  if (railEntry) return railEntry.label;
  return step === "tree" ? "Ready" : "Career Discovery Journey";
}

function JourneyRailCard({ onBegin }) {
  return (
    <div className="question-card journey-rail-card">
      <h3>Career Discovery Journey</h3>
      <p className="entry-prompt">Five short steps. Each one feeds the final picture.</p>
      <ol className="journey-rail-list">
        {JOURNEY_RAIL.map((r) => (
          <li key={r.step}>
            <span className="journey-rail-label">{r.label}</span>
            <span className="journey-rail-time">{r.time}</span>
          </li>
        ))}
      </ol>
      <button type="button" className="primary-action" onClick={onBegin}>
        Start
      </button>
    </div>
  );
}

function JourneyRailStrip({ step }) {
  const active = railIndexForStep(step);
  if (active === -1) return null;
  return (
    <ol className="journey-rail-strip" aria-label="Career Discovery Journey progress">
      {JOURNEY_RAIL.map((r, index) => (
        <li
          key={r.step}
          className={`journey-rail-step ${index === active ? "active" : ""} ${index < active ? "done" : ""}`}
        >
          {r.label}
        </li>
      ))}
    </ol>
  );
}

function stepProgressText(step, progress) {
  if (!progress) return "";
  if (step === "demographics")
    return `${progress.demographics.answered} / ${progress.demographics.total}`;
  if (step === "big_five")
    return `${progress.bigFive.answered} / ${progress.bigFive.total}`;
  if (step === "riasec" && progress.riasec.total)
    return `${progress.riasec.answered} / ${progress.riasec.total}`;
  if (step === "values" && progress.values && progress.values.answered)
    return `${progress.values.answered} / ${progress.values.total}`;
  if (step === "cv" && progress.journey.answered)
    return `${progress.journey.answered} / ${progress.journey.total}`;
  return "";
}

// One journey, one bar. Unknown-yet block sizes assume the short variants so
// the bar can only get more accurate, never jump backwards. The ranking step
// counts as one "question"; the CV block counts as the 7 journey questions
// until a CV text makes them moot.
function overallProgress(progress) {
  if (!progress) return null;
  const bigFiveTotal = progress.bigFive.total || 20;
  const riasecTotal = progress.riasec.total || 12;
  const valuesTotal = progress.values?.total || 10;
  const journeyTotal = progress.journey.active ? progress.journey.total : 0;
  const total =
    progress.demographics.total + bigFiveTotal + riasecTotal + valuesTotal + 1 + journeyTotal;
  const answered =
    progress.demographics.answered +
    progress.bigFive.answered +
    progress.riasec.answered +
    (progress.values?.confirmed ? valuesTotal : progress.values?.answered || 0) +
    (progress.jobChar.ranked ? 1 : 0) +
    (progress.journey.active ? progress.journey.answered : 0);
  if (!total) return null;
  return { answered, total, percent: Math.min(100, Math.round((answered / total) * 100)) };
}

function DemographicQuestionCard({ q, savedValue, draft, setDraft, busy, onSubmit, onBack, canGoBack, progress }) {
  return (
    <div className="question-card">
      <div className="question-card-top">
        {canGoBack && (
          <button type="button" className="ghost-action back-action" onClick={onBack} disabled={busy}>
            ← Back
          </button>
        )}
        <p className="question-category">
          {progress ? `Question ${progress.index + 1} of ${progress.total}` : "About you"}
        </p>
      </div>
      <h3>{q.question}</h3>
      {q.kind === "single" && (
        <div className="option-list">
          {q.options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`option-button ${savedValue === o.value ? "selected" : ""}`}
              onClick={() => onSubmit(o.value)}
              disabled={busy}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      {(q.kind === "number" || q.kind === "text") && (
        <form
          key={q.id}
          className="question-form"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(draft);
          }}
        >
          <input
            autoFocus
            type={q.kind === "number" ? "number" : "text"}
            className="question-textarea"
            value={draft}
            min={q.min}
            max={q.max}
            placeholder={q.placeholder}
            onChange={(e) => setDraft(e.target.value)}
            disabled={busy}
          />
          <div className="question-actions single">
            <button
              type="submit"
              className="primary-action"
              disabled={busy || draft === "" || draft === null}
            >
              {busy ? "Saving..." : "Next"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function BigFiveQuestionCard({ q, savedValue, busy, onSubmit, onBack, canGoBack, progress }) {
  return (
    <div className="question-card">
      <div className="question-card-top">
        {canGoBack && (
          <button type="button" className="ghost-action back-action" onClick={onBack} disabled={busy}>
            ← Back
          </button>
        )}
        <p className="question-category">
          {progress ? `Item ${progress.index + 1} of ${progress.total}` : "Personality"}
        </p>
      </div>
      <h3>{q.text}</h3>
      <div className="likert-row">
        {LIKERT.map((l) => (
          <button
            key={l.value}
            type="button"
            className={`option-button likert-button ${savedValue === l.value ? "selected" : ""}`}
            onClick={() => onSubmit(l.value)}
            disabled={busy}
          >
            <span className="likert-value">{l.value}</span>
            <span className="likert-label">{l.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function RiasecQuestionCard({ q, savedValue, busy, onSubmit, onBack, canGoBack, onSkip, canSkip, progress }) {
  return (
    <div className="question-card">
      <div className="question-card-top">
        {canGoBack && (
          <button type="button" className="ghost-action back-action" onClick={onBack} disabled={busy}>
            ← Back
          </button>
        )}
        <p className="question-category">
          {progress ? `Activity ${progress.index + 1} of ${progress.total}` : "Interests"}
        </p>
      </div>
      <p className="entry-prompt">How much would you enjoy…</p>
      <h3>{q.text}</h3>
      <div className="likert-row">
        {ENJOY_LIKERT.map((l) => (
          <button
            key={l.value}
            type="button"
            className={`option-button likert-button ${savedValue === l.value ? "selected" : ""}`}
            onClick={() => onSubmit(l.value)}
            disabled={busy}
          >
            <span className="likert-value">{l.value}</span>
            <span className="likert-label">{l.label}</span>
          </button>
        ))}
      </div>
      {canSkip && (
        <button type="button" className="ghost-action" onClick={onSkip} disabled={busy}>
          Skip the quiz — estimate my interests from my answers so far
        </button>
      )}
    </div>
  );
}

function CvCard({ mode, setMode, cvDraft, setCvDraft, busy, intent, intentBusy, onSelectIntent, onSubmitText, onUploadFile, uploadFormats }) {
  if (mode === "paste") {
    return (
      <div className="question-card">
        <div className="question-card-top">
          <button type="button" className="ghost-action back-action" onClick={() => setMode("choice")} disabled={busy}>
            ← Back
          </button>
          <p className="question-category">Your experience</p>
        </div>
        <h3>Paste your CV</h3>
        <textarea
          className="dream-input cv-input"
          value={cvDraft}
          maxLength={6000}
          onChange={(e) => setCvDraft(e.target.value)}
          placeholder="Paste the text of your CV or a summary of your experience"
        />
        <div className="question-actions single">
          <button type="button" className="primary-action" onClick={onSubmitText} disabled={busy || !cvDraft.trim()}>
            {busy ? "Analysing..." : "Analyse my CV"}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="question-card">
      <p className="question-category">Your experience</p>
      <h3>Let's factor in what you already have.</h3>

      <p className="entry-prompt">Where should we start from?</p>
      <div className="entry-options">
        {CV_INTENT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`entry-option ${intent === option.value ? "selected" : ""}`}
            onClick={() => onSelectIntent(option.value)}
            disabled={busy || intentBusy}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="option-list">
        <button type="button" className="option-button" onClick={() => setMode("paste")} disabled={busy || !intent}>
          Paste my CV as text
        </button>
        <label className={`option-button cv-upload ${!intent ? "cv-upload-disabled" : ""}`}>
          Upload a file ({uploadFormats.join(", ")} — max 5 MB)
          <input
            type="file"
            accept={uploadFormats.join(",")}
            hidden
            disabled={busy || !intent}
            onChange={(e) => e.target.files?.[0] && onUploadFile(e.target.files[0])}
          />
        </label>
        <button type="button" className="option-button" onClick={() => setMode("journey")} disabled={busy || !intent}>
          No CV — ask me 7 quick questions instead
        </button>
      </div>
      {busy && <p className="dock-busy">Reading your CV…</p>}
    </div>
  );
}

function RankCard({ params, ranking, onMove, busy, onConfirm }) {
  const byId = new Map(params.map((p) => [p.id, p]));
  return (
    <div className="question-card">
      <p className="question-category">Rank what matters</p>
      <h3>Order these from most to least important in your next job.</h3>
      <ol className="rank-list">
        {ranking.map((id, index) => (
          <li key={id} className="rank-row">
            <span className="rank-pos">{index + 1}</span>
            <span className="rank-label">
              {byId.get(id)?.label}
              <span className="rank-meaning">{byId.get(id)?.meaning}</span>
            </span>
            <span className="rank-controls">
              <button
                type="button"
                className="ghost-action"
                onClick={() => onMove(index, -1)}
                disabled={busy || index === 0}
                aria-label={`Move ${byId.get(id)?.label} up`}
              >
                ↑
              </button>
              <button
                type="button"
                className="ghost-action"
                onClick={() => onMove(index, 1)}
                disabled={busy || index === ranking.length - 1}
                aria-label={`Move ${byId.get(id)?.label} down`}
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>
      <div className="question-actions single">
        <button type="button" className="primary-action" onClick={onConfirm} disabled={busy}>
          {busy ? "Saving…" : "This is my order"}
        </button>
      </div>
    </div>
  );
}

// The adaptive pairwise-comparison card: pick the more important of two values.
function ValuesComparisonCard({ comparison, busy, onChoose, progress }) {
  const a = WORK_VALUE_META[comparison.a] || { label: comparison.a, blurb: "" };
  const b = WORK_VALUE_META[comparison.b] || { label: comparison.b, blurb: "" };
  return (
    <div className="question-card">
      <p className="question-category">
        What matters more?{progress ? ` (${progress.answered + 1} of up to ${progress.total})` : ""}
      </p>
      <h3>Which of these would you rather have in your work?</h3>
      <div className="values-ab">
        <button
          type="button"
          className="values-ab-option"
          onClick={() => onChoose(comparison.a)}
          disabled={busy}
        >
          <span className="values-ab-label">{a.label}</span>
          <span className="values-ab-blurb">{a.blurb}</span>
        </button>
        <span className="values-ab-or">or</span>
        <button
          type="button"
          className="values-ab-option"
          onClick={() => onChoose(comparison.b)}
          disabled={busy}
        >
          <span className="values-ab-label">{b.label}</span>
          <span className="values-ab-blurb">{b.blurb}</span>
        </button>
      </div>
    </div>
  );
}

// The reorderable 1→6 hierarchy the tournament produced; the user can tweak it
// before confirming.
function ValuesHierarchyCard({ ranking, onMove, busy, onConfirm }) {
  return (
    <div className="question-card">
      <p className="question-category">Your work-value hierarchy</p>
      <h3>Does this feel like your hierarchy? You can modify it.</h3>
      <ol className="rank-list">
        {ranking.map((id, index) => (
          <li key={id} className="rank-row">
            <span className="rank-pos">{index + 1}</span>
            <span className="rank-label">
              {WORK_VALUE_META[id]?.label || id}
              <span className="rank-meaning">{WORK_VALUE_META[id]?.blurb}</span>
            </span>
            <span className="rank-controls">
              <button
                type="button"
                className="ghost-action"
                onClick={() => onMove(index, -1)}
                disabled={busy || index === 0}
                aria-label={`Move ${WORK_VALUE_META[id]?.label} up`}
              >
                ↑
              </button>
              <button
                type="button"
                className="ghost-action"
                onClick={() => onMove(index, 1)}
                disabled={busy || index === ranking.length - 1}
                aria-label={`Move ${WORK_VALUE_META[id]?.label} down`}
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>
      <div className="question-actions single">
        <button type="button" className="primary-action" onClick={onConfirm} disabled={busy}>
          {busy ? "Saving…" : "This is my hierarchy"}
        </button>
      </div>
    </div>
  );
}

// Required by the O*NET Web Services developer terms: the "O*NET in-it"
// badge linking to services.onetcenter.org plus the exact attribution
// sentence with the USDOL/ETA trademark acknowledgment. Keep the wording
// and the badge artwork as published — they are license conditions.
function OnetAttribution() {
  return (
    <div className="onet-attribution">
      <a
        href="https://services.onetcenter.org/"
        target="_blank"
        rel="noopener noreferrer"
        title="This site incorporates information from O*NET Web Services. Click to learn more."
      >
        <img
          src="https://www.onetcenter.org/image/link/onet-in-it.svg"
          width="130"
          height="60"
          alt="O*NET in-it"
        />
      </a>
      <p>
        This site incorporates information from{" "}
        <a href="https://services.onetcenter.org/" target="_blank" rel="noopener noreferrer">
          O*NET Web Services
        </a>{" "}
        by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA).
        O*NET&reg; is a trademark of USDOL/ETA.
      </p>
    </div>
  );
}

// Side panel for output details and advice lists — same visual language as
// the roadmap DetailPanel, but section-driven.
function InfoPanel({ view, onClose }) {
  if (!view) return null;
  return (
    <div className="detail-panel">
      <button className="detail-close" onClick={onClose}>×</button>
      <p className="detail-archetype">{view.archetype}</p>
      <h2 className="detail-title">{view.title}</h2>
      {view.description && <p className="detail-desc">{view.description}</p>}
      {(view.sections || []).map((section, index) => (
        <div className="detail-section" key={index}>
          {section.heading && <h4>{section.heading}</h4>}
          {section.text && <p>{section.text}</p>}
          {section.items && section.items.length > 0 && (
            <ul>
              {section.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          )}
          {section.footnote && <p className="detail-footnote">{section.footnote}</p>}
        </div>
      ))}
    </div>
  );
}

const REDUCED_MOTION =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const SESSION_STORAGE_KEY = "lpe.sessionId";

function App() {
  const [stage, setStage] = useState("entry");
  const [restoring, setRestoring] = useState(() =>
    Boolean(localStorage.getItem(SESSION_STORAGE_KEY))
  );

  const [dreamAnswer, setDreamAnswer] = useState("");
  const [cvIntent, setCvIntent] = useState("");

  const [sessionId, setSessionId] = useState("");
  const [step, setStep] = useState("entry");
  const [pathStage, setPathStage] = useState("output");
  const [progress, setProgress] = useState(null);

  const [demographicQuestions, setDemographicQuestions] = useState([]);
  const [demoAnswers, setDemoAnswers] = useState({});
  const [demoIndex, setDemoIndex] = useState(0);
  const [demoDraft, setDemoDraft] = useState("");
  const [bigFiveItems, setBigFiveItems] = useState([]);
  const [bigFiveAnswers, setBigFiveAnswers] = useState({});
  const [bigFiveIndex, setBigFiveIndex] = useState(0);
  const [riasecItems, setRiasecItems] = useState([]);
  const [riasecAnswers, setRiasecAnswers] = useState({});
  const [riasecIndex, setRiasecIndex] = useState(0);
  const [jobCharParams, setJobCharParams] = useState([]);
  const [rankDraft, setRankDraft] = useState([]);
  // Work-values step: the pending pairwise comparison, the sorted hierarchy
  // once comparisons finish, and the reorderable draft the user can tweak.
  const [valuesComparison, setValuesComparison] = useState(null);
  const [valuesRanking, setValuesRanking] = useState(null);
  const [valuesRankDraft, setValuesRankDraft] = useState([]);
  const [careerJourneyQuestions, setCareerJourneyQuestions] = useState([]);
  const [cvUploadFormats, setCvUploadFormats] = useState([".pdf", ".docx", ".txt"]);
  const [careerJourneyAnswers, setCareerJourneyAnswers] = useState({});
  const [journeyIndex, setJourneyIndex] = useState(0);
  const [journeyDraft, setJourneyDraft] = useState("");
  const [cvMode, setCvMode] = useState("choice"); // choice | paste | journey
  const [cvDraft, setCvDraft] = useState("");

  const [outputs, setOutputs] = useState([]);
  const [acceptedOutputId, setAcceptedOutputId] = useState(null);
  const [roadmaps, setRoadmaps] = useState({});

  // Refine panel view state: checked params map to their brief reasons.
  const [refineMode, setRefineMode] = useState(false);
  const [refineChecks, setRefineChecks] = useState({});

  const [stageDetail, setStageDetail] = useState(null);
  const [infoView, setInfoView] = useState(null);

  const [profile, setProfile] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  // Journey intro rail: shown once right after the entry screen, never on resume.
  const [showRail, setShowRail] = useState(false);

  const [busy, setBusy] = useState({
    start: false,
    demo: false,
    bigFive: false,
    riasecStart: false,
    riasec: false,
    riasecSkip: false,
    rank: false,
    values: false,
    valuesConfirm: false,
    summary: false,
    cv: false,
    cvIntent: false,
    journey: false,
    enterTree: false,
    accept: false,
    roadmap: false,
    refine: false,
    dev: false,
  });

  const [error, setError] = useState("");
  // Re-runs the last failed AI-backed action; rendered next to the error text.
  const [retryAction, setRetryAction] = useState(null);

  const applySessionSnapshot = (data) => {
    setSessionId(data.sessionId);
    setStep(data.step);
    setPathStage(data.pathStage || "output");
    setProgress(data.progress || null);
    // Static question banks only travel on start/resume/riasec-start
    // snapshots; answer responses omit them, so merge instead of replacing.
    if (data.demographicQuestions) setDemographicQuestions(data.demographicQuestions);
    if (data.bigFiveItems) setBigFiveItems(data.bigFiveItems);
    if (data.riasecItems) setRiasecItems(data.riasecItems);
    if (data.jobCharParams) setJobCharParams(data.jobCharParams);
    if (data.careerJourneyQuestions) setCareerJourneyQuestions(data.careerJourneyQuestions);
    if (data.cvUploadFormats) setCvUploadFormats(data.cvUploadFormats);
    setCvIntent(data.cvIntent || "");
    setDemoAnswers(data.demographics || {});
    setBigFiveAnswers(data.bigFiveAnswers || {});
    setRiasecAnswers(data.riasecAnswers || {});
    setCareerJourneyAnswers(data.careerJourneyAnswers || {});
    setOutputs(data.outputs || []);
    setAcceptedOutputId(data.acceptedOutputId || null);
    setRoadmaps(data.roadmaps || {});
    // Seed the reorderable ranking with the canonical order when the
    // job-characteristics step opens (before any ranking is submitted).
    if (data.step === "job_characteristics" && !data.jobCharRanking) {
      const paramsSource = data.jobCharParams || jobCharParams;
      if (paramsSource.length === 7) {
        setRankDraft((draft) => (draft.length === 7 ? draft : paramsSource.map((p) => p.id)));
      }
    }
    setProfile({
      bigFiveScores: data.bigFiveScores || null,
      derivedTraits: data.derivedTraits || null,
      personaSummary: data.personaSummary || null,
      riasecScores: data.riasecScores || null,
      riasecCode: data.riasecCode || null,
      riasecInferred: Boolean(data.riasecInferred),
      userValues: data.userValues || null,
    });
    setValuesComparison(data.valuesComparison || null);
    setValuesRanking(data.valuesRanking || null);
    if (data.aiEnabled !== undefined) setAiEnabled(Boolean(data.aiEnabled));
  };

  // A full session snapshot arriving from outside the normal answer flow —
  // page reload, or a dev stage jump. Beyond the shared state, this repositions
  // the local question indexes and picks the top-level stage. Both callers must
  // go through here: a second place that knows about indexes would drift.
  const hydrateFromSnapshot = (data) => {
    applySessionSnapshot(data);
    setDreamAnswer(data.dreamAnswer || "");
    setDemoIndex(firstUnansweredIndex(data.demographicQuestions || [], data.demographics));
    setBigFiveIndex(firstUnansweredIndex(data.bigFiveItems || [], data.bigFiveAnswers));
    setRiasecIndex(firstUnansweredIndex(data.riasecItems || [], data.riasecAnswers));
    setJourneyIndex(
      firstUnansweredIndex(data.careerJourneyQuestions || [], data.careerJourneyAnswers)
    );
    if (Object.keys(data.careerJourneyAnswers || {}).length) setCvMode("journey");
    const inTree = data.step === "tree" && (data.outputs || []).length > 0;
    setStage(inTree ? "tree" : "survey");
  };

  // Resume a stored session after reload; a dead/unknown id falls back to entry.
  useEffect(() => {
    const storedId = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!storedId) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const data = await fetchSession(storedId);
        if (cancelled) return;
        hydrateFromSnapshot(data);
      } catch {
        if (!cancelled) localStorage.removeItem(SESSION_STORAGE_KEY);
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Mount-only restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kick off the values tournament the moment the step opens (once).
  useEffect(() => {
    if (
      step === "values" &&
      sessionId &&
      !valuesComparison &&
      !(profile?.userValues) &&
      !valuesRanking &&
      !busy.values
    ) {
      handleValuesStart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, sessionId, valuesComparison, valuesRanking]);

  // Prefill the reorderable hierarchy once the comparisons resolve.
  useEffect(() => {
    if (valuesRanking && valuesRankDraft.length !== 6) {
      setValuesRankDraft(valuesRanking);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesRanking]);

  const handleStartSession = async () => {
    if (!dreamAnswer.trim()) {
      return;
    }
    setError("");
    setBusy((p) => ({ ...p, start: true }));
    try {
      const data = await startSession({
        dreamAnswer: dreamAnswer.trim(),
      });
      applySessionSnapshot(data);
      localStorage.setItem(SESSION_STORAGE_KEY, data.sessionId);
      setStage("survey");
      setShowRail(true);
      setDemoIndex(0);
      setDemoDraft("");
    } catch (e) {
      setError(e.message || "Could not start.");
    } finally {
      setBusy((p) => ({ ...p, start: false }));
    }
  };

  const draftFromAnswer = (value) =>
    value === undefined || value === null ? "" : String(value);

  const handleSubmitDemographic = async (rawValue) => {
    if (!sessionId) return;
    const q = demographicQuestions[demoIndex];
    if (!q) return;
    const value = q.kind === "number" ? Number(rawValue) : rawValue;
    if (value === "" || value === null || (typeof value === "number" && Number.isNaN(value))) {
      return;
    }
    setError("");
    setBusy((p) => ({ ...p, demo: true }));
    try {
      const data = await submitDemographics({
        sessionId,
        questionId: q.id,
        value,
      });
      applySessionSnapshot(data);
      if (demoIndex < demographicQuestions.length - 1) {
        const nextQ = demographicQuestions[demoIndex + 1];
        setDemoDraft(draftFromAnswer(data.demographics?.[nextQ.id]));
        setDemoIndex((i) => i + 1);
      }
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setBusy((p) => ({ ...p, demo: false }));
    }
  };

  const handleBackDemographic = () => {
    const prevQ = demographicQuestions[demoIndex - 1];
    if (!prevQ) return;
    setDemoDraft(draftFromAnswer(demoAnswers[prevQ.id]));
    setDemoIndex((i) => Math.max(0, i - 1));
  };

  const handleSubmitBigFive = async (value) => {
    if (!sessionId) return;
    const item = bigFiveItems[bigFiveIndex];
    if (!item) return;
    setError("");
    setBusy((p) => ({ ...p, bigFive: true }));
    try {
      const data = await submitBigFiveAnswer({ sessionId, itemId: item.id, value });
      applySessionSnapshot(data);
      if (bigFiveIndex < bigFiveItems.length - 1) {
        setBigFiveIndex((i) => i + 1);
      }
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setBusy((p) => ({ ...p, bigFive: false }));
    }
  };

  const handleBackBigFive = () => {
    setBigFiveIndex((i) => Math.max(0, i - 1));
  };

  const handleStartRiasec = async () => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, riasecStart: true }));
    try {
      const data = await startRiasec({ sessionId });
      applySessionSnapshot(data);
      setRetryAction(null);
      setRiasecIndex(0);
    } catch (e) {
      setError(e.message || "Could not load the interests quiz.");
      setRetryAction(() => handleStartRiasec);
    } finally {
      setBusy((p) => ({ ...p, riasecStart: false }));
    }
  };

  // Item generation is server-side; kick it off the moment the step arrives.
  useEffect(() => {
    if (stage !== "survey" || step !== "riasec") return;
    if (riasecItems.length || busy.riasecStart) return;
    handleStartRiasec();
    // busy flag + handler identity intentionally omitted: this effect must
    // fire once per riasec-step entry, not on every busy-state flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, step, riasecItems.length]);

  const handleSubmitRiasec = async (value) => {
    if (!sessionId) return;
    const item = riasecItems[riasecIndex];
    if (!item) return;
    setError("");
    setBusy((p) => ({ ...p, riasec: true }));
    try {
      const data = await submitRiasecAnswer({ sessionId, itemId: item.id, value });
      applySessionSnapshot(data);
      if (riasecIndex < riasecItems.length - 1) setRiasecIndex((i) => i + 1);
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setBusy((p) => ({ ...p, riasec: false }));
    }
  };

  const handleSkipRiasec = async () => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, riasecSkip: true }));
    try {
      const data = await skipRiasec({ sessionId });
      applySessionSnapshot(data);
    } catch (e) {
      setError(e.message || "Could not estimate interests.");
    } finally {
      setBusy((p) => ({ ...p, riasecSkip: false }));
    }
  };

  const handleValuesStart = async () => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, values: true }));
    try {
      const data = await startValues({ sessionId });
      applySessionSnapshot(data);
    } catch (e) {
      setError(e.message || "Could not start the values step.");
    } finally {
      setBusy((p) => ({ ...p, values: false }));
    }
  };

  const handleValuesAnswer = async (winner) => {
    if (!sessionId || !valuesComparison) return;
    setError("");
    setBusy((p) => ({ ...p, values: true }));
    try {
      const data = await submitValuesAnswer({
        sessionId,
        comparisonId: valuesComparison.comparisonId,
        winner,
      });
      applySessionSnapshot(data);
    } catch (e) {
      setError(e.message || "Could not record your choice.");
    } finally {
      setBusy((p) => ({ ...p, values: false }));
    }
  };

  const handleValuesConfirm = async () => {
    if (!sessionId || valuesRankDraft.length !== 6) return;
    setError("");
    setBusy((p) => ({ ...p, valuesConfirm: true }));
    try {
      const data = await confirmValues({ sessionId, order: valuesRankDraft });
      applySessionSnapshot(data);
      setValuesRankDraft([]);
    } catch (e) {
      setError(e.message || "Could not save your hierarchy.");
    } finally {
      setBusy((p) => ({ ...p, valuesConfirm: false }));
    }
  };

  const handleSummaryContinue = async () => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, summary: true }));
    try {
      const data = await continueSummary({ sessionId });
      applySessionSnapshot(data);
    } catch (e) {
      setError(e.message || "Could not continue.");
    } finally {
      setBusy((p) => ({ ...p, summary: false }));
    }
  };

  const handleSubmitRanking = async () => {
    if (!sessionId || rankDraft.length !== 7) return;
    setError("");
    setBusy((p) => ({ ...p, rank: true }));
    try {
      const data = await submitJobCharRanking({ sessionId, ranking: rankDraft });
      applySessionSnapshot(data);
      setRetryAction(null);
    } catch (e) {
      setError(e.message || "Could not save your ranking.");
      setRetryAction(() => () => handleSubmitRanking());
    } finally {
      setBusy((p) => ({ ...p, rank: false }));
    }
  };

  const handleSelectCvIntent = async (value) => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, cvIntent: true }));
    try {
      const data = await postCvIntent({ sessionId, cvIntent: value });
      applySessionSnapshot(data);
    } catch (e) {
      setError(e.message || "Could not save your choice.");
    } finally {
      setBusy((p) => ({ ...p, cvIntent: false }));
    }
  };

  const handleSubmitCvText = async () => {
    if (!sessionId || !cvDraft.trim()) return;
    setError("");
    setBusy((p) => ({ ...p, cv: true }));
    try {
      const data = await submitCvText({ sessionId, cvText: cvDraft.trim() });
      applySessionSnapshot(data);
      setRetryAction(null);
    } catch (e) {
      setError(e.message || "Could not analyse the CV.");
      setRetryAction(() => handleSubmitCvText);
    } finally {
      setBusy((p) => ({ ...p, cv: false }));
    }
  };

  const handleUploadCv = async (file) => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, cv: true }));
    try {
      const data = await uploadCvFile({ sessionId, file });
      applySessionSnapshot(data);
      setRetryAction(null);
    } catch (e) {
      setError(e.message || "Could not read the file.");
    } finally {
      setBusy((p) => ({ ...p, cv: false }));
    }
  };

  const handleSubmitJourney = async (rawValue) => {
    if (!sessionId) return;
    const q = careerJourneyQuestions[journeyIndex];
    if (!q || !String(rawValue).trim()) return;
    setError("");
    setBusy((p) => ({ ...p, journey: true }));
    try {
      const data = await submitJourneyAnswer({
        sessionId,
        questionId: q.id,
        value: String(rawValue).trim(),
      });
      applySessionSnapshot(data);
      if (journeyIndex < careerJourneyQuestions.length - 1) {
        const nextQ = careerJourneyQuestions[journeyIndex + 1];
        setJourneyDraft(data.careerJourneyAnswers?.[nextQ.id] || "");
        setJourneyIndex((i) => i + 1);
      }
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setBusy((p) => ({ ...p, journey: false }));
    }
  };

  const handleEnterLifePath = async () => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, enterTree: true }));
    try {
      const data = await fetchFirstOutput({ sessionId });
      applySessionSnapshot(data);
      setRetryAction(null);
      setStage("tree");
    } catch (e) {
      setError(e.message || "Could not start the Life Path Engine.");
      setRetryAction(() => handleEnterLifePath);
    } finally {
      setBusy((p) => ({ ...p, enterTree: false }));
    }
  };

  const currentDemographicQuestion = demographicQuestions[demoIndex] || null;
  const currentBigFiveItem = bigFiveItems[bigFiveIndex] || null;

  const latestOutput = outputs.length ? outputs[outputs.length - 1] : null;
  const acceptedOutput = outputs.find((o) => o.id === acceptedOutputId) || null;

  const ADVICE_VIEWS = {
    aiRecommendations: { title: "AI Recommendations", format: (i) => `${i.title} — ${i.detail}` },
    events: { title: "Events", format: (i) => `${i.name} — ${i.why}` },
    universities: { title: "Universities & Majors", format: (i) => `${i.name}: ${i.program}` },
    courses: { title: "Courses", format: (i) => `${i.name} (${i.provider}) — ${i.why}` },
  };

  const handleOutputOpen = (output) => {
    setStageDetail(null);
    setInfoView({
      archetype: output.orientedField,
      title: output.jobTitle,
      description: output.thesis,
      sections: [
        ...whyThisFitsSections(output),
        {
          heading: "Through your 7 priorities",
          items: jobCharParams.map((p) => output.parameterFit?.[p.id]).filter(Boolean),
        },
        output.changeSummary ? { heading: "What changed", text: output.changeSummary } : null,
        onetSection(output),
        { heading: "First milestone", text: output.firstMilestone },
        output.valuesFit
          ? {
              heading: `Work-values match: ${output.valuesFit.overall}/100`,
              text: "How this profession's measured work values line up with your hierarchy.",
              items: (output.topValues || []).map(
                (k) => `${WORK_VALUE_META[k]?.label || k} — strong for this role`
              ),
            }
          : null,
        { heading: "Constraints", text: output.constraintsNote },
      ].filter(Boolean),
    });
  };

  const handleAdviceOpen = (blockKey) => {
    if (!acceptedOutput?.detail) return;
    const view = ADVICE_VIEWS[blockKey];
    setStageDetail(null);
    setInfoView({
      archetype: acceptedOutput.jobTitle,
      title: view.title,
      sections: [{ heading: "", items: acceptedOutput.detail[blockKey].map(view.format) }],
    });
  };

  const handleGenerateRoadmap = async (outputId) => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, roadmap: true }));
    try {
      const data = await generateRoadmap({ sessionId, outputId });
      applySessionSnapshot(data);
      setRetryAction(null);
    } catch (e) {
      setError(e.message || "Could not generate roadmap.");
      setRetryAction(() => () => handleGenerateRoadmap(outputId));
    } finally {
      setBusy((p) => ({ ...p, roadmap: false }));
    }
  };

  const handleAcceptOutput = async () => {
    if (!sessionId || !latestOutput) return;
    const outputId = latestOutput.id;
    setError("");
    setBusy((p) => ({ ...p, accept: true }));
    try {
      const data = await acceptOutput({ sessionId, outputId });
      applySessionSnapshot(data);
      setRetryAction(null);
    } catch (e) {
      setError(e.message || "Could not accept the output.");
      setRetryAction(() => handleAcceptOutput);
      setBusy((p) => ({ ...p, accept: false }));
      return;
    }
    setBusy((p) => ({ ...p, accept: false }));
    // Yes-branch: the roadmap builds right after the advice blocks land.
    await handleGenerateRoadmap(outputId);
  };

  // Dev stage jump. The composite targets cannot call handleEnterLifePath /
  // handleAcceptOutput: those read sessionId and latestOutput from React state,
  // which has not re-rendered yet inside this same async function. So chain the
  // api wrappers on ids taken straight from each response and hydrate once at
  // the end.
  const handleDevJump = async (target) => {
    const step = target === "tree+output" || target === "detail" ? "tree" : target;
    setError("");
    setBusy((p) => ({ ...p, dev: true }));
    try {
      let data = await devJump({ sessionId: sessionId || undefined, step });
      const jumpedSessionId = data.sessionId;
      localStorage.setItem(SESSION_STORAGE_KEY, jumpedSessionId);

      if (target === "tree+output" || target === "detail") {
        data = await fetchFirstOutput({ sessionId: jumpedSessionId });
      }
      if (target === "detail") {
        const outputId = data.outputs[data.outputs.length - 1].id;
        data = await acceptOutput({ sessionId: jumpedSessionId, outputId });
        // The real Yes-branch always builds the roadmap right after accepting;
        // stopping short would leave a state no user ever sees.
        data = await generateRoadmap({ sessionId: jumpedSessionId, outputId });
      }

      hydrateFromSnapshot(data);
      setRetryAction(null);
    } catch (e) {
      setError(e.message || "Dev jump failed.");
    } finally {
      setBusy((p) => ({ ...p, dev: false }));
    }
  };

  const toggleRefineParam = (paramId) => {
    setRefineChecks((checks) => {
      const next = { ...checks };
      if (paramId in next) delete next[paramId];
      else next[paramId] = "";
      return next;
    });
  };

  const closeRefine = () => {
    setRefineMode(false);
    setRefineChecks({});
  };

  const handleRefineSubmit = async () => {
    if (!sessionId || !latestOutput) return;
    const changes = Object.entries(refineChecks).map(([param, reason]) => ({
      param,
      reason: reason.trim(),
    }));
    if (!changes.length) return;
    setError("");
    setBusy((p) => ({ ...p, refine: true }));
    try {
      const data = await refineOutput({ sessionId, outputId: latestOutput.id, changes });
      applySessionSnapshot(data);
      setRetryAction(null);
      closeRefine();
    } catch (e) {
      setError(e.message || "Could not regenerate the output.");
      setRetryAction(() => handleRefineSubmit);
    } finally {
      setBusy((p) => ({ ...p, refine: false }));
    }
  };

  const handleNotSuitable = async () => {
    if (!sessionId || !latestOutput) return;
    setError("");
    setBusy((p) => ({ ...p, refine: true }));
    try {
      const data = await refineOutput({ sessionId, outputId: latestOutput.id, notSuitable: true });
      applySessionSnapshot(data);
      setRetryAction(null);
      closeRefine();
    } catch (e) {
      setError(e.message || "Could not regenerate the output.");
      setRetryAction(() => handleNotSuitable);
    } finally {
      setBusy((p) => ({ ...p, refine: false }));
    }
  };

  const handleStageOpen = (stageItem, index) => {
    setInfoView(null);
    setStageDetail({ stage: stageItem, index });
  };

  const resetAll = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setRestoring(false);
    setStage("entry");
    setDreamAnswer("");
    setSessionId("");
    setStep("entry");
    setPathStage("output");
    setProgress(null);
    setDemographicQuestions([]);
    setDemoAnswers({});
    setDemoIndex(0);
    setDemoDraft("");
    setBigFiveItems([]);
    setBigFiveAnswers({});
    setBigFiveIndex(0);
    setRiasecItems([]);
    setRiasecAnswers({});
    setRiasecIndex(0);
    setJobCharParams([]);
    setRankDraft([]);
    setValuesComparison(null);
    setValuesRanking(null);
    setValuesRankDraft([]);
    setCareerJourneyQuestions([]);
    setCareerJourneyAnswers({});
    setJourneyIndex(0);
    setJourneyDraft("");
    setCvMode("choice");
    setCvDraft("");
    setCvIntent("");
    setOutputs([]);
    setAcceptedOutputId(null);
    setRoadmaps({});
    setRefineMode(false);
    setRefineChecks({});
    setStageDetail(null);
    setInfoView(null);
    setProfile(null);
    setProfileOpen(false);
    setError("");
    setRetryAction(null);
    setBusy({
      start: false,
      demo: false,
      bigFive: false,
      riasecStart: false,
      riasec: false,
      riasecSkip: false,
      rank: false,
      values: false,
      valuesConfirm: false,
      summary: false,
        cv: false,
      cvIntent: false,
      journey: false,
      enterTree: false,
      accept: false,
      roadmap: false,
      refine: false,
    });
  };

  const graph = buildLifePathGraph({
    outputs,
    acceptedOutputId,
    roadmaps,
    roadmapPending: busy.roadmap,
    detailPending: busy.accept,
    onOutputOpen: handleOutputOpen,
    onAdviceOpen: handleAdviceOpen,
    onStageOpen: handleStageOpen,
  });

  const selectedRoadmap = acceptedOutputId ? roadmaps[acceptedOutputId] : null;
  const roadmapVisible = Boolean(selectedRoadmap);

  const treeHint = !outputs.length
    ? "Generating your first path…"
    : !acceptedOutputId
      ? "Review the suggestion — accept it or tune what doesn't fit"
      : roadmapVisible
        ? "Your roadmap — click any step for details"
        : "Accepted — building your next steps";

  let focusKey = "start";
  let focusNodeIds = ["me"];
  if (roadmapVisible) {
    focusKey = `roadmap-${acceptedOutputId}`;
    focusNodeIds = [
      acceptedOutputId,
      ...selectedRoadmap.stages.map((st) => `stage-${acceptedOutputId}-${st.id}`),
    ];
  } else if (acceptedOutput?.detail) {
    focusKey = `detail-${acceptedOutputId}`;
    focusNodeIds = [acceptedOutputId, "advice-aiRecommendations", "advice-courses"];
  } else if (latestOutput) {
    focusKey = latestOutput.id;
    focusNodeIds = [latestOutput.parentId || "me", latestOutput.id];
  }

  const dockCardKind = selectDockCard({ stage, outputs, acceptedOutputId, refineMode });

  let dockCard = null;
  if (dockCardKind === "output-review" && latestOutput) {
    dockCard = {
      key: `review-${latestOutput.id}`,
      content: (
        <div className="question-card dock-card">
          <p className="question-category">
            {latestOutput.orientedField}
            {latestOutput.valuesFit && (
              <span className="fit-badge">{latestOutput.valuesFit.overall}% values fit</span>
            )}
          </p>
          <h3>{latestOutput.jobTitle}</h3>
          <p className="dock-subtext">{latestOutput.thesis}</p>
          {(latestOutput.onet?.salary || latestOutput.onet?.outlook?.category) && (
            <p className="dock-subtext dock-onet-line">
              {[
                latestOutput.onet.salary
                  ? `$${latestOutput.onet.salary.annualMedian.toLocaleString("en-US")}/yr median (US)`
                  : null,
                latestOutput.onet.outlook?.category
                  ? `outlook: ${latestOutput.onet.outlook.category}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {latestOutput.changeSummary && (
            <p className="dock-subtext dock-change-summary">{latestOutput.changeSummary}</p>
          )}
          <div className="question-actions">
            <button
              type="button"
              className="primary-action"
              onClick={handleAcceptOutput}
              disabled={busy.accept || busy.refine}
            >
              {busy.accept ? "Building next steps…" : "Yes, this fits"}
            </button>
            <button
              type="button"
              className="ghost-action"
              onClick={() => setRefineMode(true)}
              disabled={busy.accept || busy.refine}
            >
              No — adjust
            </button>
            <button
              type="button"
              className="ghost-action"
              onClick={() => handleOutputOpen(latestOutput)}
            >
              Details
            </button>
          </div>
        </div>
      ),
    };
  } else if (dockCardKind === "refine" && latestOutput) {
    const checkedCount = Object.keys(refineChecks).length;
    dockCard = {
      key: "refine",
      content: (
        <div className="question-card dock-card">
          <p className="question-category">What doesn't fit?</p>
          <h3>Tick what to change about “{latestOutput.jobTitle}”</h3>
          <div className="refine-params">
            {jobCharParams.map((p) => {
              const checked = p.id in refineChecks;
              return (
                <div key={p.id} className={`refine-param ${checked ? "checked" : ""}`}>
                  <label className="refine-param-label">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRefineParam(p.id)}
                      disabled={busy.refine}
                    />
                    <span>{p.label}</span>
                  </label>
                  {checked && (
                    <input
                      type="text"
                      className="refine-reason"
                      placeholder="Briefly — what should change?"
                      value={refineChecks[p.id]}
                      maxLength={200}
                      onChange={(e) =>
                        setRefineChecks((c) => ({ ...c, [p.id]: e.target.value }))
                      }
                      disabled={busy.refine}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="question-actions">
            <button
              type="button"
              className="primary-action"
              onClick={handleRefineSubmit}
              disabled={busy.refine || checkedCount === 0}
            >
              {busy.refine ? "Regenerating…" : "Regenerate with these changes"}
            </button>
            <button
              type="button"
              className="ghost-action"
              onClick={handleNotSuitable}
              disabled={busy.refine}
            >
              It doesn't fit me overall
            </button>
            <button type="button" className="ghost-action" onClick={closeRefine} disabled={busy.refine}>
              Back
            </button>
          </div>
        </div>
      ),
    };
  }

  if (restoring) {
    return (
      <main className="app-shell">
        <p className="restore-hint">Resuming your session…</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      {stage === "entry" && (
        <section className="entry-screen">
          <h1>What would you do if you knew you would definitely succeed?</h1>

          <textarea
            className="dream-input"
            value={dreamAnswer}
            maxLength={500}
            onChange={(event) => setDreamAnswer(event.target.value)}
            placeholder="Write your honest answer"
          />

          <button
            type="button"
            className="primary-action"
            onClick={handleStartSession}
            disabled={busy.start || !dreamAnswer.trim()}
          >
            {busy.start ? "Entering..." : "Help to explore my career"}
          </button>

          <p className="entry-disclaimer">
            An exploratory self-reflection tool — not professional career
            counseling or a psychological assessment.
          </p>

          {error && <p className="error-text">{error}</p>}

          <OnetAttribution />
        </section>
      )}

      {stage === "survey" && (
        <section className="questions-screen">
          <header className="screen-header">
            <h2>{stepHeading(step)}</h2>
            <p>{stepProgressText(step, progress)}</p>
            <JourneyRailStrip step={step} />
          </header>

          {step !== "tree" && (() => {
            const overall = overallProgress(progress);
            return overall ? (
              <div className="overall-progress-row">
                <div
                  className="overall-progress"
                  role="progressbar"
                  aria-valuenow={overall.answered}
                  aria-valuemin={0}
                  aria-valuemax={overall.total}
                  aria-label={`Overall: ${overall.answered} of ${overall.total} questions`}
                >
                  <div className="overall-progress-fill" style={{ width: `${overall.percent}%` }} />
                </div>
                <span className="overall-progress-percent">{overall.percent}%</span>
              </div>
            ) : null;
          })()}

          {!aiEnabled && (
            <p className="demo-notice">
              Demo mode — suggestions come from fixed rules, not AI.
            </p>
          )}

          {showRail && step === "demographics" && (
            <JourneyRailCard onBegin={() => setShowRail(false)} />
          )}

          {!showRail && step === "demographics" && currentDemographicQuestion && (
            <DemographicQuestionCard
              q={currentDemographicQuestion}
              savedValue={demoAnswers[currentDemographicQuestion.id] ?? null}
              draft={demoDraft}
              setDraft={setDemoDraft}
              busy={busy.demo}
              onSubmit={handleSubmitDemographic}
              onBack={handleBackDemographic}
              canGoBack={demoIndex > 0}
              progress={{ index: demoIndex, total: demographicQuestions.length }}
            />
          )}

          {step === "big_five" && currentBigFiveItem && (
            <BigFiveQuestionCard
              q={currentBigFiveItem}
              savedValue={bigFiveAnswers[currentBigFiveItem.id] ?? null}
              busy={busy.bigFive}
              onSubmit={handleSubmitBigFive}
              onBack={handleBackBigFive}
              canGoBack={bigFiveIndex > 0}
              progress={{ index: bigFiveIndex, total: bigFiveItems.length }}
            />
          )}

          {step === "riasec" && !riasecItems.length && (
            <div className="question-card">
              <h3>Preparing the interests quiz…</h3>
            </div>
          )}

          {step === "riasec" && riasecItems[riasecIndex] && (
            <RiasecQuestionCard
              q={riasecItems[riasecIndex]}
              savedValue={riasecAnswers[riasecItems[riasecIndex].id] ?? null}
              busy={busy.riasec || busy.riasecSkip}
              onSubmit={handleSubmitRiasec}
              onBack={() => setRiasecIndex((i) => Math.max(0, i - 1))}
              canGoBack={riasecIndex > 0}
              onSkip={handleSkipRiasec}
              canSkip={Object.keys(riasecAnswers).length === 0}
              progress={{ index: riasecIndex, total: riasecItems.length }}
            />
          )}

          {step === "values" && valuesComparison && (
            <ValuesComparisonCard
              comparison={valuesComparison}
              busy={busy.values}
              onChoose={handleValuesAnswer}
              progress={progress?.values}
            />
          )}

          {step === "values" && !valuesComparison && valuesRankDraft.length === 6 && !profile?.userValues && (
            <ValuesHierarchyCard
              ranking={valuesRankDraft}
              onMove={(index, delta) => setValuesRankDraft((l) => moveRankItem(l, index, delta))}
              busy={busy.valuesConfirm}
              onConfirm={handleValuesConfirm}
            />
          )}

          {step === "job_characteristics" && rankDraft.length === 7 && (
            <RankCard
              params={jobCharParams}
              ranking={rankDraft}
              onMove={(index, delta) => setRankDraft((l) => moveRankItem(l, index, delta))}
              busy={busy.rank}
              onConfirm={handleSubmitRanking}
            />
          )}

          {step === "cv" && cvMode !== "journey" && (
            <CvCard
              mode={cvMode}
              setMode={setCvMode}
              cvDraft={cvDraft}
              setCvDraft={setCvDraft}
              busy={busy.cv}
              intent={cvIntent}
              intentBusy={busy.cvIntent}
              onSelectIntent={handleSelectCvIntent}
              onSubmitText={handleSubmitCvText}
              onUploadFile={handleUploadCv}
              uploadFormats={cvUploadFormats}
            />
          )}

          {step === "cv" && cvMode === "journey" && careerJourneyQuestions[journeyIndex] && (
            <div className="question-card">
              <div className="question-card-top">
                <button
                  type="button"
                  className="ghost-action back-action"
                  onClick={() => {
                    if (journeyIndex === 0) {
                      setCvMode("choice");
                    } else {
                      const prevQ = careerJourneyQuestions[journeyIndex - 1];
                      setJourneyDraft(careerJourneyAnswers[prevQ.id] || "");
                      setJourneyIndex((i) => i - 1);
                    }
                  }}
                  disabled={busy.journey}
                >
                  ← Back
                </button>
                <p className="question-category">
                  Question {journeyIndex + 1} of {careerJourneyQuestions.length}
                </p>
              </div>
              <h3>{careerJourneyQuestions[journeyIndex].question}</h3>
              <form
                key={careerJourneyQuestions[journeyIndex].id}
                className="question-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmitJourney(journeyDraft);
                }}
              >
                <textarea
                  autoFocus
                  className="question-textarea"
                  value={journeyDraft}
                  maxLength={400}
                  placeholder={careerJourneyQuestions[journeyIndex].placeholder}
                  onChange={(e) => setJourneyDraft(e.target.value)}
                  disabled={busy.journey}
                />
                <div className="question-actions single">
                  <button
                    type="submit"
                    className="primary-action"
                    disabled={busy.journey || !journeyDraft.trim()}
                  >
                    {busy.journey ? "Saving..." : "Next"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {step === "summary" && (() => {
            const archetype = deriveArchetype({
              riasecCode: profile?.riasecCode,
              bigFiveScores: profile?.bigFiveScores,
            });
            return (
              <div className="question-card summary-card">
                <p className="question-category">Who you are</p>
                <h3 className="summary-archetype">{archetype.name}</h3>
                <p className="summary-tagline">{archetype.tagline}</p>

                {profile?.bigFiveScores && (
                  <PersonalityRadarChart scores={profile.bigFiveScores} />
                )}

                {profile?.personaSummary && (
                  <p className="summary-persona">{profile.personaSummary}</p>
                )}

                {profile?.userValues?.scores && (
                  <WorkValuesRadar user={profile.userValues.scores} title="What matters to you" />
                )}

                <div className="question-actions single">
                  <button
                    type="button"
                    className="primary-action"
                    onClick={handleSummaryContinue}
                    disabled={busy.summary}
                  >
                    {busy.summary ? "Preparing…" : "Continue →"}
                  </button>
                </div>
                <p className="entry-disclaimer">
                  A preliminary sketch from a short self-report — not a clinical assessment.
                </p>
              </div>
            );
          })()}

          {step === "tree" && (
            <div className="question-card">
              <h3>Assessment complete.</h3>
              <p>You're ready to generate your first life path branch.</p>
              <div className="question-actions single">
                <button
                  type="button"
                  className="primary-action"
                  onClick={handleEnterLifePath}
                  disabled={busy.enterTree}
                >
                  {busy.enterTree ? "Preparing..." : "Run Life Path Engine"}
                </button>
              </div>
            </div>
          )}

          <div className="bottom-actions">
            <button type="button" className="ghost-action" onClick={resetAll}>
              Restart
            </button>
          </div>

          {error && (
            <div className="error-row">
              <p className="error-text">{error}</p>
              {retryAction && (
                <button type="button" className="ghost-action" onClick={() => retryAction()}>
                  Try again
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {stage === "tree" && (
        <div className="graph-page">
          <div className="graph-header">
            <button type="button" className="graph-back" onClick={resetAll}>
              ← Restart
            </button>
            <span className="graph-logo">Life Path Explorer</span>
            <span className="graph-header-side">
              {!aiEnabled && <span className="demo-notice demo-notice-inline">Demo mode</span>}
              <button
                type="button"
                className={`graph-profile-toggle ${profileOpen ? "active" : ""}`}
                onClick={() => setProfileOpen((open) => !open)}
              >
                {profileOpen ? "Hide profile" : "My profile"}
              </button>
              <span className="graph-hint">{treeHint}</span>
            </span>
          </div>

          <div className="graph-canvas">
            <GraphView
              nodes={graph.nodes}
              edges={graph.edges}
              focusKey={focusKey}
              focusNodeIds={focusNodeIds}
            />
            {profileOpen && (
              <ProfilePanel
                profile={profile}
                userValues={profile?.userValues}
                onClose={() => setProfileOpen(false)}
              />
            )}
          </div>

          <div className="graph-question-dock">
            <AnimatePresence mode="wait">
              {dockCard && (
                <Motion.div
                  key={dockCard.key}
                  initial={{ y: 12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{
                    y: 12,
                    opacity: 0,
                    transition: { duration: REDUCED_MOTION ? 0 : 0.25 },
                  }}
                  transition={
                    REDUCED_MOTION
                      ? { duration: 0 }
                      : { duration: 0.35, ease: [0.22, 1, 0.36, 1] }
                  }
                >
                  {dockCard.content}
                </Motion.div>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {infoView && (
              <Motion.div
                key="info-view"
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 20, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <InfoPanel view={infoView} onClose={() => setInfoView(null)} />
              </Motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {stageDetail && (
              <Motion.div
                key="stage-detail"
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 20, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <DetailPanel
                  data={{
                    path: {
                      archetype: `Step ${stageDetail.index + 1}${stageDetail.stage.timeframe ? ` · ${stageDetail.stage.timeframe}` : ""}`,
                      title: stageDetail.stage.title,
                      description: stageDetail.stage.description,
                      careerTrajectory: stageDetail.stage.milestone || null,
                    },
                    onClose: () => setStageDetail(null),
                  }}
                />
              </Motion.div>
            )}
          </AnimatePresence>

          {error && (
            <div className="error-row graph-error">
              <p className="error-text">{error}</p>
              {retryAction && (
                <button type="button" className="ghost-action" onClick={() => retryAction()}>
                  Try again
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {DEV_MODE && (
        <DevPanel
          step={step}
          pathStage={pathStage}
          sessionId={sessionId}
          busy={busy.dev}
          onJump={handleDevJump}
        />
      )}
    </main>
  );
}

export default App;
