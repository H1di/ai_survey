import { useState } from "react";
import { AnimatePresence, motion as Motion } from "framer-motion";
import GraphView from "./components/GraphView";
import TradeoffModal from "./components/GraphView/TradeoffModal";
import { DetailPanel } from "./components/GraphView/NodeComponent";
import {
  chooseBigFiveDepth,
  createThematicBranch,
  evolveBranch,
  generateInitialBranch,
  startSession,
  submitBigFiveAnswer,
  submitDemographics,
  submitValuesAnswer,
  unlockTheme,
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

// Layout: primary in center, unlockable themes spread on a row below "Me".
const BRANCH_COLUMN_GAP = 340;
const BRANCH_Y = 260;
const CHILD_VSPACING = 240;

function branchColumnX(branchIndex, branchCount) {
  return (branchIndex - (branchCount - 1) / 2) * BRANCH_COLUMN_GAP;
}

function buildGraphFromState({
  branches,
  themes,
  unlockedThemes,
  expandingBranchId,
  evolvingBranchId,
  onExpandBranch,
  onUnlockTheme,
  onCreateTheme,
  onSelectVariation,
}) {
  // Order: primary first, then any other created branches, then locked theme slots.
  const createdById = new Map(branches.map((b) => [b.theme, b]));
  const themeOrder = [
    "primary",
    ...themes.filter((t) => t.id !== "primary").map((t) => t.id),
  ];

  // Render slots only for themes that are created OR available to unlock.
  const slots = themeOrder.map((themeId) => {
    if (themeId === "primary") {
      return { kind: "primary", themeId, branch: createdById.get("primary") || null };
    }
    const theme = themes.find((t) => t.id === themeId);
    const branch = createdById.get(themeId) || null;
    const unlocked = unlockedThemes.includes(themeId);
    return { kind: "theme", themeId, theme, branch, unlocked };
  });

  const visibleSlots = slots.filter((slot) => {
    if (slot.kind === "primary") return Boolean(slot.branch);
    return true; // show all theme slots (locked or unlocked)
  });

  const nodes = [ME_NODE];
  const edges = [];

  visibleSlots.forEach((slot, index) => {
    const x = branchColumnX(index, visibleSlots.length);

    if (slot.kind === "primary" || slot.branch) {
      const branch = slot.branch;
      const rootBranchNode = branch.nodes[0];
      const isExpanding = expandingBranchId === branch.id;

      nodes.push({
        id: branch.id,
        type: "path",
        position: { x, y: BRANCH_Y },
        draggable: true,
        data: {
          archetype: branch.themeLabel,
          title: branch.title,
          locked: false,
          isExpanding,
          onExpand: rootBranchNode.question
            ? () => onExpandBranch(branch, rootBranchNode)
            : undefined,
        },
      });
      edges.push({
        id: `me-${branch.id}`,
        source: "me",
        target: branch.id,
        type: "branch",
        data: { delay: index * 180 },
      });

      // Render evolved variation children in sequence below the path node.
      const childNodes = branch.nodes.slice(1);
      childNodes.forEach((child, childIdx) => {
        const childId = `${branch.id}::${child.id}`;
        const parentId =
          childIdx === 0
            ? branch.id
            : `${branch.id}::${branch.nodes[childIdx].id}`; // previous child
        const childX = x;
        const childY = BRANCH_Y + (childIdx + 1) * CHILD_VSPACING;

        nodes.push({
          id: childId,
          type: "variation",
          position: { x: childX, y: childY },
          draggable: true,
          data: {
            title: child.title,
            difference: child.summary,
            onExpand: child.question
              ? () => onExpandBranch(branch, child)
              : () => onSelectVariation(branch, child),
          },
        });
        edges.push({
          id: `${parentId}-${childId}`,
          source: parentId,
          target: childId,
          type: "branch",
          data: { delay: childIdx * 120 },
        });
      });

      // Loading placeholder while evolve is in flight on this branch.
      if (evolvingBranchId === branch.id) {
        const loadingId = `${branch.id}::__loading__`;
        const lastChildIdx = childNodes.length;
        const parentForLoading =
          lastChildIdx === 0
            ? branch.id
            : `${branch.id}::${branch.nodes[lastChildIdx].id}`;
        nodes.push({
          id: loadingId,
          type: "loading",
          position: { x, y: BRANCH_Y + (lastChildIdx + 1) * CHILD_VSPACING },
          data: {},
        });
        edges.push({
          id: `${parentForLoading}-${loadingId}`,
          source: parentForLoading,
          target: loadingId,
          type: "branch",
        });
      }
    } else if (slot.kind === "theme") {
      // Locked theme card (or unlocked but no branch yet)
      const id = `theme_${slot.themeId}`;
      nodes.push({
        id,
        type: "path",
        position: { x, y: BRANCH_Y },
        draggable: true,
        data: {
          archetype: slot.theme.label,
          title: slot.unlocked ? "Create this branch" : slot.theme.description,
          locked: !slot.unlocked,
          isExpanding: false,
          onExpand: slot.unlocked
            ? () => onCreateTheme(slot.themeId)
            : () => onUnlockTheme(slot.themeId),
        },
      });
      edges.push({
        id: `me-${id}`,
        source: "me",
        target: id,
        type: "branch",
        data: { delay: index * 180 },
      });
    }
  });

  return { nodes, edges };
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

  const [branches, setBranches] = useState([]);
  const [themes, setThemes] = useState([]);
  const [unlockedThemes, setUnlockedThemes] = useState([]);

  const [tradeoffContext, setTradeoffContext] = useState(null);
  const [detailContext, setDetailContext] = useState(null);
  const [evolvingBranchId, setEvolvingBranchId] = useState("");
  const [expandingBranchId, setExpandingBranchId] = useState("");
  const [graphStatus, setGraphStatus] = useState("");

  const [busy, setBusy] = useState({
    start: false,
    demo: false,
    depth: "",
    bigFive: false,
    values: false,
    initialBranch: false,
    unlockThemeId: "",
    createThemeId: "",
    evolve: false,
  });

  const [error, setError] = useState("");


  const applySessionSnapshot = (data) => {
    setSessionId(data.sessionId);
    setStep(data.step);
    setNextQuestion(data.nextQuestion || null);
    setProgress(data.progress || null);
    setBranches(data.branches || []);
    setThemes(data.themes || []);
    setUnlockedThemes(data.unlockedThemes || []);
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

  const handleGenerateInitialBranch = async () => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, initialBranch: true }));
    try {
      const data = await generateInitialBranch({ sessionId });
      applySessionSnapshot(data);
      setStage("tree");
    } catch (e) {
      setError(e.message || "Could not generate first branch.");
    } finally {
      setBusy((p) => ({ ...p, initialBranch: false }));
    }
  };

  const handleUnlockTheme = async (themeId) => {
    if (!sessionId || !themeId) return;
    setError("");
    setBusy((p) => ({ ...p, unlockThemeId: themeId }));
    setGraphStatus("Unlocking…");
    try {
      const data = await unlockTheme({ sessionId, themeId });
      setUnlockedThemes(data.unlockedThemes || []);
      setGraphStatus("");
    } catch (e) {
      setError(e.message || "Could not unlock theme.");
      setGraphStatus("");
    } finally {
      setBusy((p) => ({ ...p, unlockThemeId: "" }));
    }
  };

  const handleCreateThemeBranch = async (themeId) => {
    if (!sessionId || !themeId) return;
    setError("");
    setBusy((p) => ({ ...p, createThemeId: themeId }));
    setGraphStatus("Mapping new direction…");
    try {
      const data = await createThematicBranch({ sessionId, themeId });
      applySessionSnapshot(data);
      setGraphStatus("");
    } catch (e) {
      setError(e.message || "Could not create branch.");
      setGraphStatus("");
    } finally {
      setBusy((p) => ({ ...p, createThemeId: "" }));
    }
  };

  const handleOpenTradeoff = (branch, node) => {
    if (!branch || !node?.question) return;
    setExpandingBranchId(branch.id);
    setTradeoffContext({ branch, node });
  };

  const handleTradeoffClose = () => {
    setTradeoffContext(null);
    setExpandingBranchId("");
  };

  const handleTradeoffSubmit = async (answers) => {
    if (!tradeoffContext) return;
    const { branch, node } = tradeoffContext;
    const picked = answers[0];
    if (!picked) return;
    const option = node.question.options.find((o) => o.label === picked.answer);
    if (!option) return;

    setTradeoffContext(null);
    setExpandingBranchId("");
    setEvolvingBranchId(branch.id);
    setError("");
    setBusy((p) => ({ ...p, evolve: true }));
    try {
      const data = await evolveBranch({
        sessionId,
        branchId: branch.id,
        nodeId: node.id,
        answer: option.value,
      });
      applySessionSnapshot(data);
    } catch (e) {
      setError(e.message || "Could not evolve branch.");
    } finally {
      setBusy((p) => ({ ...p, evolve: false }));
      setEvolvingBranchId("");
    }
  };

  const handleSelectVariation = (branch, node) => {
    setDetailContext({ branch, node });
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
    setBranches([]);
    setThemes([]);
    setUnlockedThemes([]);
    setTradeoffContext(null);
    setDetailContext(null);
    setEvolvingBranchId("");
    setExpandingBranchId("");
    setGraphStatus("");
    setError("");
    setBusy({
      start: false,
      demo: false,
      depth: "",
      bigFive: false,
      values: false,
      initialBranch: false,
      unlockThemeId: "",
      createThemeId: "",
      evolve: false,
    });
  };

  const graph = buildGraphFromState({
    branches,
    themes,
    unlockedThemes,
    expandingBranchId,
    evolvingBranchId,
    onExpandBranch: handleOpenTradeoff,
    onUnlockTheme: handleUnlockTheme,
    onCreateTheme: handleCreateThemeBranch,
    onSelectVariation: handleSelectVariation,
  });

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
                  onClick={handleGenerateInitialBranch}
                  disabled={busy.initialBranch}
                >
                  {busy.initialBranch ? "Building..." : "Run Life Path Engine"}
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
            <span className="graph-hint">Click a path to explore deeper</span>
          </div>

          {graphStatus && <div className="graph-status">{graphStatus}</div>}

          <div className="graph-canvas">
            <GraphView nodes={graph.nodes} edges={graph.edges} />
          </div>

          <AnimatePresence>
            {tradeoffContext && (
              <TradeoffModal
                key="tradeoff"
                questions={[
                  {
                    id: tradeoffContext.node.id,
                    text: tradeoffContext.node.question.text,
                    options: tradeoffContext.node.question.options.map(
                      (o) => o.label
                    ),
                  },
                ]}
                pathTitle={tradeoffContext.node.title || tradeoffContext.branch.title}
                onSubmit={handleTradeoffSubmit}
                onClose={handleTradeoffClose}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {detailContext && (
              <Motion.div
                key="detail"
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 20, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <DetailPanel
                  data={{
                    path: {
                      archetype: detailContext.branch.themeLabel,
                      title: detailContext.node.title,
                      description: detailContext.node.summary,
                      lifestyle: detailContext.node.clarityGain,
                      careerTrajectory: detailContext.node.milestone,
                      financialOutlook: detailContext.node.constraintsNote,
                      whyItFits: detailContext.node.whyFit,
                      risks: detailContext.node.riskNote
                        ? [detailContext.node.riskNote]
                        : null,
                    },
                    onClose: () => setDetailContext(null),
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
