import { useState } from "react";
import { AnimatePresence, motion as Motion } from "framer-motion";
import GraphView from "./components/GraphView";
import ConfirmModal from "./components/GraphView/ConfirmModal";
import { DetailPanel } from "./components/GraphView/NodeComponent";
import {
  answerDirectionQuestion,
  answerNarrowingQuestion,
  chooseBigFiveDepth,
  confirmDirection,
  fetchDirectionQuestions,
  generateRoadmap,
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

function DemographicQuestionCard({ q, draft, setDraft, busy, onSubmit }) {
  return (
    <div className="question-card">
      <h3>{q.question}</h3>
      {q.kind === "single" && (
        <div className="option-list">
          {q.options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`option-button ${draft === o.value ? "selected" : ""}`}
              onClick={() => setDraft(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      {q.kind === "number" && (
        <input
          type="number"
          className="question-textarea"
          value={draft}
          min={q.min}
          max={q.max}
          placeholder={q.placeholder}
          onChange={(e) => setDraft(e.target.value)}
        />
      )}
      {q.kind === "text" && (
        <input
          type="text"
          className="question-textarea"
          value={draft}
          placeholder={q.placeholder}
          onChange={(e) => setDraft(e.target.value)}
        />
      )}
      <div className="question-actions single">
        <button
          type="button"
          className="primary-action"
          onClick={onSubmit}
          disabled={busy || draft === "" || draft === null}
        >
          {busy ? "Saving..." : "Next"}
        </button>
      </div>
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

function BigFiveQuestionCard({ q, draft, setDraft, busy, onSubmit, progress }) {
  return (
    <div className="question-card">
      <p className="question-category">
        {progress ? `Item ${progress.answered + 1} of ${progress.total}` : "Personality"}
      </p>
      <h3>{q.text}</h3>
      <div className="likert-row">
        {LIKERT.map((l) => (
          <button
            key={l.value}
            type="button"
            className={`option-button likert-button ${draft === l.value ? "selected" : ""}`}
            onClick={() => setDraft(l.value)}
            disabled={busy}
          >
            <span className="likert-value">{l.value}</span>
            <span className="likert-label">{l.label}</span>
          </button>
        ))}
      </div>
      <div className="question-actions single">
        <button
          type="button"
          className="primary-action"
          onClick={() => onSubmit(draft)}
          disabled={busy || !draft}
        >
          {busy ? "Saving..." : "Next"}
        </button>
      </div>
    </div>
  );
}

function ValuesQuestionCard({ q, busy, onChoose, progress }) {
  return (
    <div className="question-card values-card">
      <p className="dimension-header">
        <span className="dimension-emoji">{q.dimensionEmoji}</span>{" "}
        <span className="dimension-label">{q.dimensionLabel}</span>{" "}
        <span className="dimension-counter">({q.indexInGroup + 1} / 5)</span>
      </p>
      <p className="question-category">
        {progress ? `Question ${progress.answered + 1} of ${progress.total}` : ""}
      </p>
      <h3>Which feels more like you?</h3>
      <div className="ab-pair">
        <button
          type="button"
          className="ab-option"
          onClick={() => onChoose("A")}
          disabled={busy}
        >
          <span className="ab-tag">A</span>
          <span className="ab-text">{q.optionA}</span>
        </button>
        <button
          type="button"
          className="ab-option"
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

  const [entryChoice, setEntryChoice] = useState("");
  const [dreamAnswer, setDreamAnswer] = useState("");

  const [sessionId, setSessionId] = useState("");
  const [step, setStep] = useState("entry");
  const [nextQuestion, setNextQuestion] = useState(null);
  const [demoDraft, setDemoDraft] = useState("");
  const [bigFiveDraft, setBigFiveDraft] = useState(0);
  const [progress, setProgress] = useState(null);

  const [directionQuestions, setDirectionQuestions] = useState([]);
  const [directionAnswers, setDirectionAnswers] = useState({});
  const [proposedDirection, setProposedDirection] = useState(null);
  const [direction, setDirection] = useState(null);
  const [narrowingQuestions, setNarrowingQuestions] = useState([]);
  const [narrowingAnswers, setNarrowingAnswers] = useState({});
  const [professionOptions, setProfessionOptions] = useState([]);
  const [selectedProfession, setSelectedProfession] = useState(null);
  const [roadmaps, setRoadmaps] = useState({});

  const [narrowIntent, setNarrowIntent] = useState(false);
  const [confirmContext, setConfirmContext] = useState(null);
  const [stageDetail, setStageDetail] = useState(null);

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
  });

  const [error, setError] = useState("");

  const applySessionSnapshot = (data) => {
    setSessionId(data.sessionId);
    setStep(data.step);
    setNextQuestion(data.nextQuestion || null);
    setProgress(data.progress || null);
    setDirectionQuestions(data.directionQuestions || []);
    setDirectionAnswers(data.directionAnswers || {});
    setProposedDirection(data.proposedDirection || null);
    setDirection(data.direction || null);
    setNarrowingQuestions(data.narrowingQuestions || []);
    setNarrowingAnswers(data.narrowingAnswers || {});
    setProfessionOptions(data.professionOptions || []);
    setSelectedProfession(data.selectedProfession || null);
    setRoadmaps(data.roadmaps || {});
  };

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
      setStage("survey");
      setDemoDraft("");
    } catch (e) {
      setError(e.message || "Could not start.");
    } finally {
      setBusy((p) => ({ ...p, start: false }));
    }
  };

  const handleSubmitDemographic = async () => {
    if (!sessionId || !nextQuestion) return;
    const q = nextQuestion.question;
    const value = q.kind === "number" ? Number(demoDraft) : demoDraft;
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
      setDemoDraft("");
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setBusy((p) => ({ ...p, demo: false }));
    }
  };

  const handleChooseDepth = async (depth) => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, depth }));
    try {
      const data = await chooseBigFiveDepth({ sessionId, depth });
      applySessionSnapshot(data);
      setBigFiveDraft(0);
    } catch (e) {
      setError(e.message || "Could not start Big Five.");
    } finally {
      setBusy((p) => ({ ...p, depth: "" }));
    }
  };

  const handleSubmitBigFive = async (value) => {
    if (!sessionId || !nextQuestion) return;
    setError("");
    setBusy((p) => ({ ...p, bigFive: true }));
    try {
      const data = await submitBigFiveAnswer({
        sessionId,
        itemId: nextQuestion.question.id,
        value,
      });
      applySessionSnapshot(data);
      setBigFiveDraft(0);
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setBusy((p) => ({ ...p, bigFive: false }));
    }
  };

  const handleSubmitValues = async (choice) => {
    if (!sessionId || !nextQuestion) return;
    setError("");
    setBusy((p) => ({ ...p, values: true }));
    try {
      const data = await submitValuesAnswer({
        sessionId,
        questionId: nextQuestion.question.id,
        choice,
      });
      applySessionSnapshot(data);
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setBusy((p) => ({ ...p, values: false }));
    }
  };

  const handleEnterLifePath = async () => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, enterTree: true }));
    try {
      const data = await fetchDirectionQuestions({ sessionId });
      applySessionSnapshot(data);
      setStage("tree");
    } catch (e) {
      setError(e.message || "Could not start the Life Path Engine.");
    } finally {
      setBusy((p) => ({ ...p, enterTree: false }));
    }
  };

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
      setConfirmContext(null);
    } catch (e) {
      setError(e.message || "Could not generate roadmap.");
    } finally {
      setBusy((p) => ({ ...p, roadmap: false }));
    }
  };

  const handleStageOpen = (stageItem, index) => {
    setStageDetail({ stage: stageItem, index });
  };

  const resetAll = () => {
    setStage("entry");
    setEntryChoice("");
    setDreamAnswer("");
    setSessionId("");
    setStep("entry");
    setNextQuestion(null);
    setDemoDraft("");
    setBigFiveDraft(0);
    setProgress(null);
    setDirectionQuestions([]);
    setDirectionAnswers({});
    setProposedDirection(null);
    setDirection(null);
    setNarrowingQuestions([]);
    setNarrowingAnswers({});
    setProfessionOptions([]);
    setSelectedProfession(null);
    setRoadmaps({});
    setNarrowIntent(false);
    setConfirmContext(null);
    setStageDetail(null);
    setError("");
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
    } else if (!direction && proposedDirection) {
      dockCard = {
        key: "proposal",
        content: (
          <div className="question-card dock-card">
            <p className="question-category">Direction found</p>
            <h3>{proposedDirection.label}</h3>
            <p className="dock-subtext">
              Based on your profile and answers, this is your strongest broad direction.
            </p>
            <div className="question-actions single">
              <button
                type="button"
                className="primary-action"
                onClick={handleConfirmDirection}
                disabled={busy.confirmDirection}
              >
                {busy.confirmDirection ? "Confirming…" : "Confirm this direction"}
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

          {error && <p className="error-text">{error}</p>}
        </section>
      )}

      {stage === "survey" && (
        <section className="questions-screen">
          <header className="screen-header">
            <h2>{stepHeading(step)}</h2>
            <p>{stepProgressText(step, progress)}</p>
          </header>

          {step === "demographics" && nextQuestion?.question && (
            <DemographicQuestionCard
              q={nextQuestion.question}
              draft={demoDraft}
              setDraft={setDemoDraft}
              busy={busy.demo}
              onSubmit={handleSubmitDemographic}
            />
          )}

          {step === "depth_choice" && (
            <DepthChoiceCard busy={busy.depth} onChoose={handleChooseDepth} />
          )}

          {step === "big_five" && nextQuestion?.question && (
            <BigFiveQuestionCard
              q={nextQuestion.question}
              draft={bigFiveDraft}
              setDraft={setBigFiveDraft}
              busy={busy.bigFive}
              onSubmit={handleSubmitBigFive}
              progress={progress?.bigFive}
            />
          )}

          {step === "values" && nextQuestion?.question && (
            <ValuesQuestionCard
              q={nextQuestion.question}
              busy={busy.values}
              onChoose={handleSubmitValues}
              progress={progress?.values}
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

          {error && <p className="error-text">{error}</p>}
        </section>
      )}

      {stage === "tree" && (
        <div className="graph-page">
          <div className="graph-header">
            <button type="button" className="graph-back" onClick={resetAll}>
              ← Restart
            </button>
            <span className="graph-logo">Life Path Explorer</span>
            <span className="graph-hint">{treeHint}</span>
          </div>

          <div className="graph-canvas">
            <GraphView
              nodes={graph.nodes}
              edges={graph.edges}
              focusKey={focusKey}
              focusNodeIds={focusNodeIds}
            />
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
                professionTitle={confirmContext.title}
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

          {error && <p className="error-text graph-error">{error}</p>}
        </div>
      )}
    </main>
  );
}

export default App;
