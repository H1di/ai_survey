import { useEffect, useState } from "react";
import { AnimatePresence, motion as Motion } from "framer-motion";
import GraphView from "./components/GraphView";
import ConfirmModal from "./components/GraphView/ConfirmModal";
import { DetailPanel } from "./components/GraphView/NodeComponent";
import ProfilePanel from "./components/ProfileCharts";
import {
  answerDirectionQuestion,
  answerNarrowingQuestion,
  chooseBigFiveDepth,
  chooseDirection,
  confirmDirection,
  fetchDirectionQuestions,
  fetchSession,
  generateRoadmap,
  refineDirection,
  selectProfession,
  skipRiasec,
  startRiasec,
  startSession,
  submitBigFiveAnswer,
  submitDemographics,
  submitCvText,
  submitJobCharAnswer,
  submitJobCharRanking,
  submitJourneyAnswer,
  submitRiasecAnswer,
  uploadCvFile,
} from "./api";
import { buildLifePathGraph, firstUnansweredIndex, moveRankItem, selectDockCard } from "./lifePath";
import "./App.css";
import "./components/GraphView/GraphPage.css";

const ENTRY_OPTIONS = [
  { value: "change", label: "Change my career" },
  { value: "find", label: "Find my career" },
];

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
  switch (step) {
    case "demographics": return "About you";
    case "depth_choice": return "Choose depth";
    case "big_five":     return "Personality";
    case "riasec":              return "Interests";
    case "job_characteristics": return "What matters in a job";
    case "cv":                  return "Your experience";
    case "tree":                return "Ready";
    default:             return "Deep Analysis";
  }
}

function stepProgressText(step, progress) {
  if (!progress) return "";
  if (step === "demographics")
    return `${progress.demographics.answered} / ${progress.demographics.total}`;
  if (step === "big_five")
    return `${progress.bigFive.answered} / ${progress.bigFive.total}`;
  if (step === "riasec" && progress.riasec.total)
    return `${progress.riasec.answered} / ${progress.riasec.total}`;
  if (step === "job_characteristics" && progress.jobChar.ranked)
    return `${progress.jobChar.answered} / ${progress.jobChar.total}`;
  if (step === "cv" && progress.journey.answered)
    return `${progress.journey.answered} / ${progress.journey.total}`;
  return "";
}

// One journey, one bar. Unknown-yet block sizes assume the short variants so
// the bar can only get more accurate, never jump backwards. The rank step
// counts as one "question"; the CV block counts as the 7 journey questions
// until a CV text makes them moot.
function overallProgress(progress) {
  if (!progress) return null;
  const bigFiveTotal = progress.bigFive.total || 20;
  const riasecTotal = progress.riasec.total || 12;
  const jobCharTotal = progress.jobChar.total || 5;
  const journeyTotal = progress.journey.active ? progress.journey.total : 0;
  const total = progress.demographics.total + bigFiveTotal + riasecTotal + 1 + jobCharTotal + journeyTotal;
  const answered =
    progress.demographics.answered +
    progress.bigFive.answered +
    progress.riasec.answered +
    (progress.jobChar.ranked ? 1 : 0) +
    progress.jobChar.answered +
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

function DepthChoiceCard({ busy, onChoose }) {
  return (
    <div className="question-card">
      <h3>How deep do you want to go?</h3>
      <div className="depth-options">
        <button
          type="button"
          className="depth-card"
          onClick={() => onChoose("short")}
          disabled={Boolean(busy)}
        >
          <p className="depth-title">Short</p>
          <p className="depth-meta">20 personality questions • 3–5 minutes</p>
          <p className="depth-meta">≈50 questions overall • ~12 minutes to your paths</p>
        </button>
        <button
          type="button"
          className="depth-card"
          onClick={() => onChoose("deep")}
          disabled={Boolean(busy)}
        >
          <p className="depth-title">Deep</p>
          <p className="depth-meta">50 personality questions • 8–12 minutes</p>
          <p className="depth-meta">≈90 questions overall • ~22 minutes to your paths</p>
        </button>
      </div>
      {busy && <p className="depth-loading">Generating items…</p>}
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

function CvCard({ mode, setMode, cvDraft, setCvDraft, busy, onSubmitText, onUploadFile }) {
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
      <div className="option-list">
        <button type="button" className="option-button" onClick={() => setMode("paste")} disabled={busy}>
          Paste my CV as text
        </button>
        <label className="option-button cv-upload">
          Upload a file (.pdf, .docx, .txt — max 2 MB)
          <input
            type="file"
            accept=".pdf,.docx,.txt"
            hidden
            disabled={busy}
            onChange={(e) => e.target.files?.[0] && onUploadFile(e.target.files[0])}
          />
        </label>
        <button type="button" className="option-button" onClick={() => setMode("journey")} disabled={busy}>
          No CV — ask me 7 quick questions instead
        </button>
      </div>
      {busy && <p className="dock-busy">Reading your CV…</p>}
    </div>
  );
}

function RankCard({ params, ranking, onMove, busy, onChooseDepth }) {
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
      <div className="depth-options">
        <button type="button" className="depth-card" onClick={() => onChooseDepth(5)} disabled={busy}>
          <p className="depth-title">Quick</p>
          <p className="depth-meta">5 targeted questions on your top priorities</p>
        </button>
        <button type="button" className="depth-card" onClick={() => onChooseDepth(10)} disabled={busy}>
          <p className="depth-title">Thorough</p>
          <p className="depth-meta">10 questions, finer-grained targets</p>
        </button>
      </div>
      {busy && <p className="depth-loading">Building your questions…</p>}
    </div>
  );
}

function JobCharQuestionCard({ q, savedValue, busy, onSubmit, onBack, canGoBack, progress }) {
  return (
    <div className="question-card">
      <div className="question-card-top">
        {canGoBack && (
          <button type="button" className="ghost-action back-action" onClick={onBack} disabled={busy}>
            ← Back
          </button>
        )}
        <p className="question-category">
          {progress ? `Question ${progress.index + 1} of ${progress.total}` : "Priorities"}
        </p>
      </div>
      <h3>{q.text}</h3>
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
    </div>
  );
}

const REDUCED_MOTION =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const SESSION_STORAGE_KEY = "lpe.sessionId";

function GraphQuestionCard({ heading, question, busy, busyLabel, onChoose }) {
  return (
    <div className="question-card dock-card">
      <p className="question-category">{heading}</p>
      <h3>{question.text}</h3>
      <div className="option-list">
        {question.options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="option-button"
            onClick={() => onChoose(option.value)}
            disabled={busy}
          >
            {option.label}
          </button>
        ))}
      </div>
      {busy && <p className="dock-busy">{busyLabel || "Working…"}</p>}
    </div>
  );
}

function App() {
  const [stage, setStage] = useState("entry");
  const [restoring, setRestoring] = useState(() =>
    Boolean(localStorage.getItem(SESSION_STORAGE_KEY))
  );

  const [entryChoice, setEntryChoice] = useState("");
  const [dreamAnswer, setDreamAnswer] = useState("");
  const [cvIntent, setCvIntent] = useState("");

  const [sessionId, setSessionId] = useState("");
  const [step, setStep] = useState("entry");
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
  const [jobCharRanking, setJobCharRanking] = useState(null);
  const [jobCharItems, setJobCharItems] = useState([]);
  const [jobCharAnswers, setJobCharAnswers] = useState({});
  const [jcIndex, setJcIndex] = useState(0);
  const [rankDraft, setRankDraft] = useState([]);
  const [careerJourneyQuestions, setCareerJourneyQuestions] = useState([]);
  const [careerJourneyAnswers, setCareerJourneyAnswers] = useState({});
  const [journeyIndex, setJourneyIndex] = useState(0);
  const [journeyDraft, setJourneyDraft] = useState("");
  const [cvMode, setCvMode] = useState("choice"); // choice | paste | journey
  const [cvDraft, setCvDraft] = useState("");

  const [directionQuestions, setDirectionQuestions] = useState([]);
  const [directionAnswers, setDirectionAnswers] = useState({});
  const [directionTieCandidates, setDirectionTieCandidates] = useState([]);
  const [proposedDirection, setProposedDirection] = useState(null);
  const [direction, setDirection] = useState(null);
  const [narrowingQuestions, setNarrowingQuestions] = useState([]);
  const [narrowingAnswers, setNarrowingAnswers] = useState({});
  const [professionOptions, setProfessionOptions] = useState([]);
  const [selectedProfession, setSelectedProfession] = useState(null);
  const [roadmaps, setRoadmaps] = useState({});

  const [rejectedDirections, setRejectedDirections] = useState([]);
  const [directionCatalog, setDirectionCatalog] = useState([]);
  // Served by the backend (single source): refine reason options.
  const [refineReasons, setRefineReasons] = useState([]);
  const [refineMode, setRefineMode] = useState(false);
  const [refineReason, setRefineReason] = useState("");
  const [refineText, setRefineText] = useState("");

  const [narrowIntent, setNarrowIntent] = useState(false);
  const [confirmContext, setConfirmContext] = useState(null);
  const [stageDetail, setStageDetail] = useState(null);

  const [profile, setProfile] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);

  const [busy, setBusy] = useState({
    start: false,
    demo: false,
    depth: "",
    bigFive: false,
    riasecStart: false,
    riasec: false,
    riasecSkip: false,
    rank: false,
    jobChar: false,
    cv: false,
    journey: false,
    enterTree: false,
    direction: false,
    confirmDirection: false,
    narrowing: false,
    select: false,
    roadmap: false,
    refine: false,
  });

  const [error, setError] = useState("");
  // Re-runs the last failed AI-backed action; rendered next to the error text.
  const [retryAction, setRetryAction] = useState(null);

  const applySessionSnapshot = (data) => {
    setSessionId(data.sessionId);
    setStep(data.step);
    setProgress(data.progress || null);
    // Static question banks only travel on start/resume/depth-choice
    // snapshots; answer responses omit them, so merge instead of replacing.
    if (data.demographicQuestions) setDemographicQuestions(data.demographicQuestions);
    if (data.bigFiveItems) setBigFiveItems(data.bigFiveItems);
    if (data.riasecItems) setRiasecItems(data.riasecItems);
    if (data.jobCharParams) setJobCharParams(data.jobCharParams);
    if (data.careerJourneyQuestions) setCareerJourneyQuestions(data.careerJourneyQuestions);
    if (data.directionCatalog) setDirectionCatalog(data.directionCatalog);
    if (data.refineReasons) setRefineReasons(data.refineReasons);
    setDemoAnswers(data.demographics || {});
    setBigFiveAnswers(data.bigFiveAnswers || {});
    setRiasecAnswers(data.riasecAnswers || {});
    setJobCharRanking(data.jobCharRanking || null);
    setJobCharItems(data.jobCharItems || []);
    setJobCharAnswers(data.jobCharAnswers || {});
    setCareerJourneyAnswers(data.careerJourneyAnswers || {});
    setDirectionQuestions(data.directionQuestions || []);
    setDirectionAnswers(data.directionAnswers || {});
    setDirectionTieCandidates(data.directionTieCandidates || []);
    setProposedDirection(data.proposedDirection || null);
    setDirection(data.direction || null);
    setNarrowingQuestions(data.narrowingQuestions || []);
    setNarrowingAnswers(data.narrowingAnswers || {});
    setProfessionOptions(data.professionOptions || []);
    setSelectedProfession(data.selectedProfession || null);
    setRoadmaps(data.roadmaps || {});
    setRejectedDirections(data.rejectedDirections || []);
    setProfile({
      bigFiveScores: data.bigFiveScores || null,
      derivedTraits: data.derivedTraits || null,
      riasecScores: data.riasecScores || null,
      riasecCode: data.riasecCode || null,
      riasecInferred: Boolean(data.riasecInferred),
      bigFiveDepth: data.bigFiveDepth || null,
    });
    if (data.aiEnabled !== undefined) setAiEnabled(Boolean(data.aiEnabled));
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
        applySessionSnapshot(data);
        setEntryChoice(data.entryChoice || "");
        setDreamAnswer(data.dreamAnswer || "");
        setCvIntent(data.cvIntent || "");
        setDemoIndex(firstUnansweredIndex(data.demographicQuestions || [], data.demographics));
        setBigFiveIndex(firstUnansweredIndex(data.bigFiveItems || [], data.bigFiveAnswers));
        setRiasecIndex(firstUnansweredIndex(data.riasecItems || [], data.riasecAnswers));
        setJcIndex(firstUnansweredIndex(data.jobCharItems || [], data.jobCharAnswers));
        setJourneyIndex(
          firstUnansweredIndex(data.careerJourneyQuestions || [], data.careerJourneyAnswers)
        );
        if (Object.keys(data.careerJourneyAnswers || {}).length) setCvMode("journey");
        setNarrowIntent(Object.keys(data.narrowingAnswers || {}).length > 0);
        const inTree =
          data.step === "tree" &&
          ((data.directionQuestions || []).length > 0 || data.direction);
        setStage(inTree ? "tree" : "survey");
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

  const handleStartSession = async () => {
    if (!entryChoice || !cvIntent || !dreamAnswer.trim()) {
      return;
    }
    setError("");
    setBusy((p) => ({ ...p, start: true }));
    try {
      const data = await startSession({
        entryChoice,
        dreamAnswer: dreamAnswer.trim(),
        cvIntent,
      });
      applySessionSnapshot(data);
      localStorage.setItem(SESSION_STORAGE_KEY, data.sessionId);
      setStage("survey");
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

  const handleChooseDepth = async (depth) => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, depth }));
    try {
      const data = await chooseBigFiveDepth({ sessionId, depth });
      applySessionSnapshot(data);
      setRetryAction(null);
      setBigFiveIndex(0);
      setRiasecIndex(0);
    } catch (e) {
      setError(e.message || "Could not start Big Five.");
      setRetryAction(() => () => handleChooseDepth(depth));
    } finally {
      setBusy((p) => ({ ...p, depth: "" }));
    }
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

  // Seed the reorderable ranking with the canonical order once the step opens.
  useEffect(() => {
    if (step !== "job_characteristics" || jobCharRanking || rankDraft.length) return;
    setRankDraft(jobCharParams.map((p) => p.id));
  }, [step, jobCharRanking, rankDraft.length, jobCharParams]);

  const handleSubmitRanking = async (depth) => {
    if (!sessionId || rankDraft.length !== 7) return;
    setError("");
    setBusy((p) => ({ ...p, rank: true }));
    try {
      const data = await submitJobCharRanking({ sessionId, ranking: rankDraft, depth });
      applySessionSnapshot(data);
      setRetryAction(null);
      setJcIndex(0);
    } catch (e) {
      setError(e.message || "Could not build the questions.");
      setRetryAction(() => () => handleSubmitRanking(depth));
    } finally {
      setBusy((p) => ({ ...p, rank: false }));
    }
  };

  const handleSubmitJobChar = async (value) => {
    if (!sessionId) return;
    const item = jobCharItems[jcIndex];
    if (!item) return;
    setError("");
    setBusy((p) => ({ ...p, jobChar: true }));
    try {
      const data = await submitJobCharAnswer({ sessionId, itemId: item.id, value });
      applySessionSnapshot(data);
      if (jcIndex < jobCharItems.length - 1) setJcIndex((i) => i + 1);
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setBusy((p) => ({ ...p, jobChar: false }));
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
      const data = await fetchDirectionQuestions({ sessionId });
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

  const currentDirectionQuestion =
    directionQuestions.find((q) => directionAnswers[q.id] === undefined) || null;
  const currentNarrowingQuestion =
    narrowingQuestions.find((q) => narrowingAnswers[q.id] === undefined) || null;

  const handleAnswerDirection = async (value) => {
    if (!sessionId || !currentDirectionQuestion) return;
    setError("");
    setBusy((p) => ({ ...p, direction: true }));
    try {
      const data = await answerDirectionQuestion({
        sessionId,
        questionId: currentDirectionQuestion.id,
        value,
      });
      applySessionSnapshot(data);
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setBusy((p) => ({ ...p, direction: false }));
    }
  };

  const handleConfirmDirection = async () => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, confirmDirection: true }));
    try {
      const data = await confirmDirection({ sessionId });
      applySessionSnapshot(data);
    } catch (e) {
      setError(e.message || "Could not confirm direction.");
    } finally {
      setBusy((p) => ({ ...p, confirmDirection: false }));
    }
  };

  const handleOpenRefine = () => {
    setError("");
    setRefineMode(true);
    setRefineReason("");
    setRefineText("");
  };

  const handleRefineDirection = async () => {
    if (!sessionId || !refineReason) return;
    setError("");
    setBusy((p) => ({ ...p, refine: true }));
    try {
      const data = await refineDirection({
        sessionId,
        reasonChoice: refineReason,
        feedbackText: refineText.trim(),
      });
      applySessionSnapshot(data);
      setRetryAction(null);
      setRefineMode(false);
      setRefineReason("");
      setRefineText("");
    } catch (e) {
      setError(e.message || "Could not refine direction.");
      setRetryAction(() => handleRefineDirection);
    } finally {
      setBusy((p) => ({ ...p, refine: false }));
    }
  };

  const handleChooseDirection = async (directionId) => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, refine: true }));
    try {
      const data = await chooseDirection({ sessionId, directionId });
      applySessionSnapshot(data);
      setRefineMode(false);
      setRefineReason("");
      setRefineText("");
    } catch (e) {
      setError(e.message || "Could not choose direction.");
    } finally {
      setBusy((p) => ({ ...p, refine: false }));
    }
  };

  const handleAnswerNarrowing = async (value) => {
    if (!sessionId || !currentNarrowingQuestion) return;
    setError("");
    setBusy((p) => ({ ...p, narrowing: true }));
    try {
      const data = await answerNarrowingQuestion({
        sessionId,
        questionId: currentNarrowingQuestion.id,
        value,
      });
      applySessionSnapshot(data);
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setBusy((p) => ({ ...p, narrowing: false }));
    }
  };

  const handleProfessionOpen = async (profession) => {
    if (busy.roadmap || busy.select) return;
    setError("");
    setBusy((p) => ({ ...p, select: true }));
    try {
      const data = await selectProfession({ sessionId, professionId: profession.id });
      applySessionSnapshot(data);
      setConfirmContext(profession);
    } catch (e) {
      setError(e.message || "Could not select profession.");
    } finally {
      setBusy((p) => ({ ...p, select: false }));
    }
  };

  const handleConfirmRoadmap = async () => {
    if (!sessionId || !confirmContext) return;
    setError("");
    setBusy((p) => ({ ...p, roadmap: true }));
    try {
      const data = await generateRoadmap({ sessionId });
      applySessionSnapshot(data);
      setRetryAction(null);
      setConfirmContext(null);
    } catch (e) {
      setError(e.message || "Could not generate roadmap.");
      setRetryAction(() => handleConfirmRoadmap);
    } finally {
      setBusy((p) => ({ ...p, roadmap: false }));
    }
  };

  const handleStageOpen = (stageItem, index) => {
    setStageDetail({ stage: stageItem, index });
  };

  const resetAll = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setRestoring(false);
    setStage("entry");
    setEntryChoice("");
    setDreamAnswer("");
    setSessionId("");
    setStep("entry");
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
    setJobCharRanking(null);
    setJobCharItems([]);
    setJobCharAnswers({});
    setJcIndex(0);
    setRankDraft([]);
    setCareerJourneyQuestions([]);
    setCareerJourneyAnswers({});
    setJourneyIndex(0);
    setJourneyDraft("");
    setCvMode("choice");
    setCvDraft("");
    setCvIntent("");
    setDirectionQuestions([]);
    setDirectionAnswers({});
    setDirectionTieCandidates([]);
    setProposedDirection(null);
    setDirection(null);
    setNarrowingQuestions([]);
    setNarrowingAnswers({});
    setProfessionOptions([]);
    setSelectedProfession(null);
    setRoadmaps({});
    setRejectedDirections([]);
    setDirectionCatalog([]);
    setRefineReasons([]);
    setRefineMode(false);
    setRefineReason("");
    setRefineText("");
    setNarrowIntent(false);
    setConfirmContext(null);
    setStageDetail(null);
    setProfile(null);
    setProfileOpen(false);
    setError("");
    setRetryAction(null);
    setBusy({
      start: false,
      demo: false,
      depth: "",
      bigFive: false,
      riasecStart: false,
      riasec: false,
      riasecSkip: false,
      rank: false,
      jobChar: false,
      cv: false,
      journey: false,
      enterTree: false,
      direction: false,
      confirmDirection: false,
      narrowing: false,
      select: false,
      roadmap: false,
      refine: false,
    });
  };

  const graph = buildLifePathGraph({
    direction,
    professionOptions,
    selectedProfessionId: selectedProfession?.id || null,
    roadmaps,
    roadmapPending: busy.roadmap,
    onProfessionOpen: handleProfessionOpen,
    onStageOpen: handleStageOpen,
  });

  const selectedRoadmap = selectedProfession ? roadmaps[selectedProfession.id] : null;
  const roadmapVisible = Boolean(selectedRoadmap);

  const treeHint = !direction
    ? "Answer the questions to find your direction"
    : professionOptions.length === 0
      ? "Direction locked — now narrow it down"
      : roadmapVisible
        ? "Your roadmap — click any step for details"
        : "Click a profession to continue";

  let focusKey = "start";
  let focusNodeIds = ["me"];
  if (roadmapVisible) {
    focusKey = `roadmap-${selectedProfession.id}`;
    focusNodeIds = [
      selectedProfession.id,
      ...selectedRoadmap.stages.map((s) => `stage-${selectedProfession.id}-${s.id}`),
    ];
  } else if (professionOptions.length > 0) {
    focusKey = "professions";
    focusNodeIds = ["direction", ...professionOptions.map((p) => p.id)];
  } else if (direction) {
    focusKey = "direction";
    focusNodeIds = ["me", "direction"];
  }

  const dockCardKind = selectDockCard({
    stage,
    direction,
    currentDirectionQuestion,
    directionTieCandidates,
    proposedDirection,
    refineMode,
    rejectedDirections,
    professionOptions,
    narrowIntent,
    currentNarrowingQuestion,
  });

  let dockCard = null;
  {
    if (dockCardKind === "direction-question") {
      dockCard = {
        key: `dir-${currentDirectionQuestion.id}`,
        content: (
          <GraphQuestionCard
            heading={`Direction · Question ${Object.keys(directionAnswers).length + 1} of ${directionQuestions.length}`}
            question={currentDirectionQuestion}
            busy={busy.direction}
            busyLabel="Reading your answer…"
            onChoose={handleAnswerDirection}
          />
        ),
      };
    } else if (dockCardKind === "direction-tie") {
      dockCard = {
        key: "direction-tie",
        content: (
          <div className="question-card dock-card">
            <p className="question-category">It's a close call</p>
            <h3>Which of these pulls you most?</h3>
            <p className="dock-subtext">
              Your answers point equally to these directions — you decide.
            </p>
            <div className="option-list">
              {directionTieCandidates.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="option-button"
                  onClick={() => handleChooseDirection(d.id)}
                  disabled={busy.refine}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        ),
      };
    } else if (dockCardKind === "refine") {
      dockCard = {
        key: "refine",
        content: (
          <div className="question-card dock-card">
            <p className="question-category">Let's get this right</p>
            <h3>
              What feels off about {proposedDirection ? proposedDirection.label : "this direction"}?
            </h3>
            <div className="option-list">
              {refineReasons.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  className={`option-button ${refineReason === r.value ? "selected" : ""}`}
                  onClick={() => setRefineReason(r.value)}
                  disabled={busy.refine}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {aiEnabled ? (
              <textarea
                className="dock-textarea"
                value={refineText}
                placeholder="Tell me what you actually want — interests, environment, anything…"
                onChange={(e) => setRefineText(e.target.value)}
                disabled={busy.refine}
              />
            ) : (
              <p className="dock-subtext">
                Demo mode: the next suggestion comes from your quiz answers, so
                written feedback isn't read here.
              </p>
            )}
            <div className="question-actions single">
              <button
                type="button"
                className="primary-action"
                onClick={handleRefineDirection}
                disabled={busy.refine || !refineReason}
              >
                {busy.refine ? "Thinking…" : "Suggest another direction"}
              </button>
            </div>
          </div>
        ),
      };
    } else if (dockCardKind === "direction-pick") {
      dockCard = {
        key: "direction-pick",
        content: (
          <div className="question-card dock-card">
            <p className="question-category">Pick your direction</p>
            <h3>Choose the one that feels right</h3>
            <p className="dock-subtext">Your roadmap will build from whichever you pick.</p>
            <div className="option-list">
              {directionCatalog
                .filter((d) => !rejectedDirections.some((r) => r.id === d.id))
                .map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className="option-button"
                    onClick={() => handleChooseDirection(d.id)}
                    disabled={busy.refine}
                  >
                    {d.label}
                  </button>
                ))}
            </div>
          </div>
        ),
      };
    } else if (dockCardKind === "proposal") {
      dockCard = {
        key: "proposal",
        content: (
          <div className="question-card dock-card">
            <p className="question-category">Direction found</p>
            <h3>{proposedDirection.label}</h3>
            <p className="dock-subtext">
              {proposedDirection.reason ||
                "Based on your profile and answers, this is your strongest broad direction."}
            </p>
            <div className="question-actions">
              <button
                type="button"
                className="primary-action"
                onClick={handleConfirmDirection}
                disabled={busy.confirmDirection}
              >
                {busy.confirmDirection ? "Confirming…" : "Confirm this direction"}
              </button>
              <button
                type="button"
                className="ghost-action"
                onClick={handleOpenRefine}
                disabled={busy.confirmDirection}
              >
                Not quite right
              </button>
            </div>
          </div>
        ),
      };
    } else if (dockCardKind === "narrow-prompt") {
      dockCard = {
        key: "narrow-prompt",
        content: (
          <div className="question-card dock-card">
            <p className="question-category">Direction confirmed</p>
            <h3>{direction.label}</h3>
            <p className="dock-subtext">
              Want to narrow it down to specific professions?
            </p>
            <div className="question-actions single">
              <button
                type="button"
                className="primary-action"
                onClick={() => setNarrowIntent(true)}
              >
                Yes, narrow it down
              </button>
            </div>
          </div>
        ),
      };
    } else if (dockCardKind === "narrowing") {
      dockCard = {
        key: `nar-${currentNarrowingQuestion.id}`,
        content: (
          <GraphQuestionCard
            heading={`Narrowing · Question ${Object.keys(narrowingAnswers).length + 1} of ${narrowingQuestions.length}`}
            question={currentNarrowingQuestion}
            busy={busy.narrowing}
            busyLabel="Finding your professions…"
            onChoose={handleAnswerNarrowing}
          />
        ),
      };
    }
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
          <h1>Why are you Here?</h1>

          <div className="entry-options">
            {ENTRY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`entry-option ${entryChoice === option.value ? "selected" : ""}`}
                onClick={() => setEntryChoice(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <p className="entry-prompt">
            What would you do if you knew you would definitely succeed?
          </p>

          <textarea
            className="dream-input"
            value={dreamAnswer}
            maxLength={500}
            onChange={(event) => setDreamAnswer(event.target.value)}
            placeholder="Write your honest answer"
          />

          <p className="entry-prompt">Where should we start from?</p>
          <div className="entry-options">
            {CV_INTENT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`entry-option ${cvIntent === option.value ? "selected" : ""}`}
                onClick={() => setCvIntent(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="primary-action"
            onClick={handleStartSession}
            disabled={busy.start || !entryChoice || !cvIntent || !dreamAnswer.trim()}
          >
            {busy.start ? "Entering..." : "Help to explore my career"}
          </button>

          <p className="entry-disclaimer">
            An exploratory self-reflection tool — not professional career
            counseling or a psychological assessment.
          </p>

          {error && <p className="error-text">{error}</p>}
        </section>
      )}

      {stage === "survey" && (
        <section className="questions-screen">
          <header className="screen-header">
            <h2>{stepHeading(step)}</h2>
            <p>{stepProgressText(step, progress)}</p>
          </header>

          {step !== "tree" && (() => {
            const overall = overallProgress(progress);
            return overall ? (
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
            ) : null;
          })()}

          {!aiEnabled && (
            <p className="demo-notice">
              Demo mode — suggestions come from fixed rules, not AI.
            </p>
          )}

          {step === "demographics" && currentDemographicQuestion && (
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

          {step === "depth_choice" && (
            <DepthChoiceCard busy={busy.depth} onChoose={handleChooseDepth} />
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

          {step === "job_characteristics" && !jobCharItems.length && rankDraft.length === 7 && (
            <RankCard
              params={jobCharParams}
              ranking={rankDraft}
              onMove={(index, delta) => setRankDraft((l) => moveRankItem(l, index, delta))}
              busy={busy.rank}
              onChooseDepth={handleSubmitRanking}
            />
          )}

          {step === "job_characteristics" && jobCharItems[jcIndex] && (
            <JobCharQuestionCard
              q={jobCharItems[jcIndex]}
              savedValue={jobCharAnswers[jobCharItems[jcIndex].id] ?? null}
              busy={busy.jobChar}
              onSubmit={handleSubmitJobChar}
              onBack={() => setJcIndex((i) => Math.max(0, i - 1))}
              canGoBack={jcIndex > 0}
              progress={{ index: jcIndex, total: jobCharItems.length }}
            />
          )}

          {step === "cv" && cvMode !== "journey" && (
            <CvCard
              mode={cvMode}
              setMode={setCvMode}
              cvDraft={cvDraft}
              setCvDraft={setCvDraft}
              busy={busy.cv}
              onSubmitText={handleSubmitCvText}
              onUploadFile={handleUploadCv}
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
            {confirmContext && (
              <ConfirmModal
                key="confirm"
                profession={confirmContext}
                busy={busy.roadmap}
                onConfirm={handleConfirmRoadmap}
                onDismiss={() => !busy.roadmap && setConfirmContext(null)}
              />
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
    </main>
  );
}

export default App;
