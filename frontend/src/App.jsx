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
  startSession,
  submitBigFiveAnswer,
  submitDemographics,
  submitValuesAnswer,
} from "./api";
import "./App.css";
import "./components/GraphView/GraphPage.css";

const ENTRY_OPTIONS = [
  { value: "change", label: "Change my career" },
  { value: "find", label: "Find my career" },
];

const LIKERT = [
  { value: 1, label: "Strongly disagree" },
  { value: 2, label: "Disagree" },
  { value: 3, label: "Neutral" },
  { value: 4, label: "Agree" },
  { value: 5, label: "Strongly agree" },
];

function stepHeading(step) {
  switch (step) {
    case "demographics": return "About you";
    case "depth_choice": return "Choose depth";
    case "big_five":     return "Personality";
    case "values":       return "Values";
    case "complete":     return "Ready";
    default:             return "Deep Analysis";
  }
}

function stepProgressText(step, progress) {
  if (!progress) return "";
  if (step === "demographics")
    return `${progress.demographics.answered} / ${progress.demographics.total}`;
  if (step === "big_five")
    return `${progress.bigFive.answered} / ${progress.bigFive.total}`;
  if (step === "values")
    return `${progress.values.answered} / ${progress.values.total}`;
  return "";
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
          <p className="depth-meta">20 questions • 3–5 minutes</p>
        </button>
        <button
          type="button"
          className="depth-card"
          onClick={() => onChoose("deep")}
          disabled={Boolean(busy)}
        >
          <p className="depth-title">Deep</p>
          <p className="depth-meta">50 questions • 8–12 minutes</p>
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

// The measured dimension is deliberately NOT shown while answering — naming
// the construct invites answering for the desired self-image. Dimensions are
// revealed afterwards in the profile panel.
function ValuesQuestionCard({ q, savedValue, busy, onChoose, onBack, canGoBack, progress }) {
  return (
    <div className="question-card values-card">
      <div className="question-card-top">
        {canGoBack && (
          <button type="button" className="ghost-action back-action" onClick={onBack} disabled={busy}>
            ← Back
          </button>
        )}
        <p className="question-category">
          {progress ? `Question ${progress.index + 1} of ${progress.total}` : "Values"}
        </p>
      </div>
      <h3>Which feels more like you?</h3>
      <div className="ab-pair">
        <button
          type="button"
          className={`ab-option ${savedValue === "A" ? "selected" : ""}`}
          onClick={() => onChoose("A")}
          disabled={busy}
        >
          <span className="ab-tag">A</span>
          <span className="ab-text">{q.optionA}</span>
        </button>
        <button
          type="button"
          className={`ab-option ${savedValue === "B" ? "selected" : ""}`}
          onClick={() => onChoose("B")}
          disabled={busy}
        >
          <span className="ab-tag">B</span>
          <span className="ab-text">{q.optionB}</span>
        </button>
      </div>
    </div>
  );
}

const ME_NODE = { id: "me", type: "me", position: { x: 0, y: 0 }, data: {} };

// Vertical story: Me -> Direction -> 3 professions -> roadmap chain.
const DIRECTION_Y = 240;
const PROFESSION_Y = 500;
const PROFESSION_GAP = 340;
const ROADMAP_START_Y = 760;
const ROADMAP_GAP = 200;

// Cascade timing: a node appears exactly when its edge finishes drawing.
const EDGE_DRAW_MS = 600;
const PROFESSION_STAGGER_MS = 180;
const ROADMAP_STEP_MS = 600;

const REDUCED_MOTION =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const SESSION_STORAGE_KEY = "lpe.sessionId";

// Index of the first unanswered question, so a restored session resumes
// where the user left off (falls back to 0 for a fresh list).
function firstUnansweredIndex(questions, answers) {
  const index = questions.findIndex((q) => (answers || {})[q.id] === undefined);
  return index === -1 ? Math.max(0, questions.length - 1) : index;
}

// Values must match REFINE_REASON_VALUES on the backend.
const REFINE_REASONS = [
  { value: "environment", label: "Wrong day-to-day environment" },
  { value: "interests", label: "Doesn't match my real interests" },
  { value: "too_technical", label: "Too technical / not my style" },
  { value: "prospects", label: "Worried about pay & prospects" },
];

function professionX(index, count) {
  return (index - (count - 1) / 2) * PROFESSION_GAP;
}

function buildLifePathGraph({
  direction,
  professionOptions,
  selectedProfessionId,
  roadmaps,
  roadmapPending,
  onProfessionOpen,
  onStageOpen,
}) {
  const nodes = [ME_NODE];
  const edges = [];

  if (!direction) {
    return { nodes, edges };
  }

  nodes.push({
    id: "direction",
    type: "direction",
    position: { x: 0, y: DIRECTION_Y },
    draggable: true,
    style: { "--appear-delay": `${EDGE_DRAW_MS}ms` },
    data: { label: direction.label },
  });
  edges.push({
    id: "me-direction",
    source: "me",
    target: "direction",
    type: "branch",
    data: { delay: 0, active: true, flowDelayMs: EDGE_DRAW_MS },
  });

  professionOptions.forEach((profession, index) => {
    const edgeDelay = index * PROFESSION_STAGGER_MS;
    nodes.push({
      id: profession.id,
      type: "profession",
      position: { x: professionX(index, professionOptions.length), y: PROFESSION_Y },
      draggable: true,
      style: { "--appear-delay": `${edgeDelay + EDGE_DRAW_MS}ms` },
      data: {
        title: profession.title,
        summary: profession.summary,
        selected: profession.id === selectedProfessionId,
        onOpen: () => onProfessionOpen(profession),
      },
    });
    edges.push({
      id: `direction-${profession.id}`,
      source: "direction",
      target: profession.id,
      type: "branch",
      data: {
        delay: edgeDelay,
        active: profession.id === selectedProfessionId || Boolean(roadmaps[profession.id]),
        flowDelayMs: 150,
      },
    });
  });

  const selectedIndex = professionOptions.findIndex((p) => p.id === selectedProfessionId);

  if (roadmapPending && selectedIndex !== -1) {
    const anchor = professionOptions[selectedIndex];
    const anchorX = professionX(selectedIndex, professionOptions.length);
    nodes.push({
      id: "roadmap-loading",
      type: "loading",
      position: { x: anchorX, y: ROADMAP_START_Y },
      data: {},
    });
    edges.push({
      id: `${anchor.id}-roadmap-loading`,
      source: anchor.id,
      target: "roadmap-loading",
      type: "branch",
    });
  }

  // Every built roadmap stays on the graph, each under its own profession.
  Object.entries(roadmaps).forEach(([professionId, professionRoadmap]) => {
    const profIndex = professionOptions.findIndex((p) => p.id === professionId);
    if (profIndex === -1) return;
    const chainX = professionX(profIndex, professionOptions.length);

    professionRoadmap.stages.forEach((stage, index) => {
      const nodeId = `stage-${professionId}-${stage.id}`;
      const parentId =
        index === 0
          ? professionId
          : `stage-${professionId}-${professionRoadmap.stages[index - 1].id}`;
      const edgeDelay = index * ROADMAP_STEP_MS;
      nodes.push({
        id: nodeId,
        type: "roadmap",
        position: { x: chainX, y: ROADMAP_START_Y + index * ROADMAP_GAP },
        draggable: true,
        style: { "--appear-delay": `${edgeDelay + EDGE_DRAW_MS}ms` },
        data: {
          index: index + 1,
          title: stage.title,
          timeframe: stage.timeframe,
          last: index === professionRoadmap.stages.length - 1,
          onOpen: () => onStageOpen(stage, index),
        },
      });
      edges.push({
        id: `${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
        type: "branch",
        data: { delay: edgeDelay, active: true, flowDelayMs: edgeDelay + EDGE_DRAW_MS },
      });
    });
  });

  return { nodes, edges };
}

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
  const [valuesQuestions, setValuesQuestions] = useState([]);
  const [valuesAnswers, setValuesAnswers] = useState({});
  const [valuesIndex, setValuesIndex] = useState(0);

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
    values: false,
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
    setDemographicQuestions(data.demographicQuestions || []);
    setDemoAnswers(data.demographics || {});
    setBigFiveItems(data.bigFiveItems || []);
    setBigFiveAnswers(data.bigFiveAnswers || {});
    setValuesQuestions(data.valuesQuestions || []);
    setValuesAnswers(data.valuesAnswers || {});
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
    setDirectionCatalog(data.directionCatalog || []);
    setProfile({
      bigFiveScores: data.bigFiveScores || null,
      derivedTraits: data.derivedTraits || null,
      valuesScores: data.valuesScores || null,
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
        setDemoIndex(firstUnansweredIndex(data.demographicQuestions || [], data.demographics));
        setBigFiveIndex(firstUnansweredIndex(data.bigFiveItems || [], data.bigFiveAnswers));
        setValuesIndex(firstUnansweredIndex(data.valuesQuestions || [], data.valuesAnswers));
        setNarrowIntent(Object.keys(data.narrowingAnswers || {}).length > 0);
        const inTree =
          data.step === "complete" &&
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
    if (!entryChoice || !dreamAnswer.trim()) {
      return;
    }
    setError("");
    setBusy((p) => ({ ...p, start: true }));
    try {
      const data = await startSession({
        entryChoice,
        dreamAnswer: dreamAnswer.trim(),
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
      const questions = data.demographicQuestions || [];
      if (demoIndex < questions.length - 1) {
        const nextQ = questions[demoIndex + 1];
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
      setValuesIndex(0);
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
      if (bigFiveIndex < (data.bigFiveItems?.length ?? 0) - 1) {
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

  const handleSubmitValues = async (choice) => {
    if (!sessionId) return;
    const question = valuesQuestions[valuesIndex];
    if (!question) return;
    setError("");
    setBusy((p) => ({ ...p, values: true }));
    try {
      const data = await submitValuesAnswer({
        sessionId,
        questionId: question.id,
        choice,
      });
      applySessionSnapshot(data);
      if (valuesIndex < (data.valuesQuestions?.length ?? 0) - 1) {
        setValuesIndex((i) => i + 1);
      }
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setBusy((p) => ({ ...p, values: false }));
    }
  };

  const handleBackValues = () => {
    setValuesIndex((i) => Math.max(0, i - 1));
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
  const currentValuesQuestion = valuesQuestions[valuesIndex] || null;

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
    setValuesQuestions([]);
    setValuesAnswers({});
    setValuesIndex(0);
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
      values: false,
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

  let dockCard = null;
  if (stage === "tree") {
    if (!direction && currentDirectionQuestion) {
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
    } else if (!direction && !proposedDirection && directionTieCandidates.length > 0) {
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
    } else if (!direction && refineMode && rejectedDirections.length < 2) {
      dockCard = {
        key: "refine",
        content: (
          <div className="question-card dock-card">
            <p className="question-category">Let's get this right</p>
            <h3>
              What feels off about {proposedDirection ? proposedDirection.label : "this direction"}?
            </h3>
            <div className="option-list">
              {REFINE_REASONS.map((r) => (
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
    } else if (!direction && refineMode && rejectedDirections.length >= 2) {
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
    } else if (!direction && proposedDirection) {
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
    } else if (direction && professionOptions.length === 0 && !narrowIntent) {
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
    } else if (direction && professionOptions.length === 0 && narrowIntent && currentNarrowingQuestion) {
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

          <button
            type="button"
            className="primary-action"
            onClick={handleStartSession}
            disabled={busy.start || !entryChoice || !dreamAnswer.trim()}
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

          {step === "values" && currentValuesQuestion && (
            <ValuesQuestionCard
              q={currentValuesQuestion}
              savedValue={valuesAnswers[currentValuesQuestion.id] ?? null}
              busy={busy.values}
              onChoose={handleSubmitValues}
              onBack={handleBackValues}
              canGoBack={valuesIndex > 0}
              progress={{ index: valuesIndex, total: valuesQuestions.length }}
            />
          )}

          {step === "complete" && (
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
              <ProfilePanel profile={profile} onClose={() => setProfileOpen(false)} />
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
