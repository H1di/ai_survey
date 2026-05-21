import { useEffect, useMemo, useState } from "react";
import ReactFlow, { Controls, MarkerType } from "reactflow";
import "reactflow/dist/style.css";
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

const ROOT_NODE_ID = "root-me";
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

function TreeNode({ data, selected }) {
  if (data.isRoot) {
    return (
      <div className={`tree-node root-node ${selected ? "selected" : ""}`}>
        <span>Me</span>
      </div>
    );
  }

  return (
    <div className={`tree-node path-node ${selected ? "selected" : ""}`}>
      <p className="path-theme">{data.themeLabel}</p>
      <h3>{data.title}</h3>
      <p>{data.summary}</p>
      {data.answeredChoiceLabel && (
        <p className="node-answer">Answer: {data.answeredChoiceLabel}</p>
      )}
      <p className="node-status">
        {data.question
          ? "Click to continue exploration"
          : data.shouldStop
            ? "Clarity reached"
            : "Path snapshot"}
      </p>
    </div>
  );
}

function buildGraph(branches) {
  const nodes = [
    {
      id: ROOT_NODE_ID,
      type: "treeNode",
      position: { x: 0, y: 0 },
      draggable: false,
      data: { isRoot: true },
    },
  ];

  const edges = [];
  const branchCount = Math.max(1, branches.length);

  branches.forEach((branch, branchIndex) => {
    const branchOffset = (branchIndex - (branchCount - 1) / 2) * 420;

    branch.nodes.forEach((node, nodeIndex) => {
      const graphNodeId = `${branch.id}::${node.id}`;

      nodes.push({
        id: graphNodeId,
        type: "treeNode",
        position: {
          x: branchOffset,
          y: 220 + nodeIndex * 220,
        },
        draggable: false,
        data: {
          isRoot: false,
          branchId: branch.id,
          nodeId: node.id,
          theme: branch.theme,
          themeLabel: branch.themeLabel,
          title: node.title,
          summary: node.summary,
          question: node.question,
          shouldStop: node.shouldStop,
          answeredChoiceLabel: node.answeredChoiceLabel,
        },
      });

      if (nodeIndex === 0) {
        edges.push({
          id: `edge-${ROOT_NODE_ID}-${graphNodeId}`,
          source: ROOT_NODE_ID,
          target: graphNodeId,
        });
      } else {
        const prevNodeId = `${branch.id}::${branch.nodes[nodeIndex - 1].id}`;

        edges.push({
          id: `edge-${prevNodeId}-${graphNodeId}`,
          source: prevNodeId,
          target: graphNodeId,
        });
      }
    });
  });

  return { nodes, edges };
}

function getSelectedBranchNode(branches, selectedGraphNodeId) {
  if (!selectedGraphNodeId || selectedGraphNodeId === ROOT_NODE_ID) {
    return null;
  }

  const [branchId, nodeId] = selectedGraphNodeId.split("::");
  const branch = branches.find((item) => item.id === branchId);

  if (!branch) {
    return null;
  }

  const node = branch.nodes.find((item) => item.id === nodeId);

  if (!node) {
    return null;
  }

  return { branch, node };
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

  const [selectedNodeId, setSelectedNodeId] = useState(ROOT_NODE_ID);
  const [branchAnswer, setBranchAnswer] = useState("");

  const [graphInstance, setGraphInstance] = useState(null);

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

  const nodeTypes = useMemo(() => ({ treeNode: TreeNode }), []);
  const graph = useMemo(() => buildGraph(branches), [branches]);

  const selected = useMemo(
    () => getSelectedBranchNode(branches, selectedNodeId),
    [branches, selectedNodeId]
  );

  const defaultEdgeOptions = useMemo(
    () => ({
      type: "smoothstep",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "#111111",
      },
      style: {
        stroke: "#111111",
        strokeWidth: 1,
      },
    }),
    []
  );

  useEffect(() => {
    if (stage !== "tree" || !graphInstance) {
      return;
    }

    const timer = window.setTimeout(() => {
      graphInstance.fitView({
        duration: 350,
        padding: 0.22,
      });
    }, 40);

    return () => window.clearTimeout(timer);
  }, [stage, graphInstance, branches]);

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

      const primary = data.branches?.find((branch) => branch.theme === "primary");
      if (primary && primary.nodes[0]) {
        setSelectedNodeId(`${primary.id}::${primary.nodes[0].id}`);
      } else {
        setSelectedNodeId(ROOT_NODE_ID);
      }
      setBranchAnswer("");
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
    try {
      const data = await unlockTheme({ sessionId, themeId });
      setUnlockedThemes(data.unlockedThemes || []);
    } catch (e) {
      setError(e.message || "Could not unlock theme.");
    } finally {
      setBusy((p) => ({ ...p, unlockThemeId: "" }));
    }
  };

  const handleCreateThemeBranch = async (themeId) => {
    if (!sessionId || !themeId) return;
    setError("");
    setBusy((p) => ({ ...p, createThemeId: themeId }));
    try {
      const data = await createThematicBranch({ sessionId, themeId });
      applySessionSnapshot(data);
      if (data.branch?.nodes?.[0]) {
        setSelectedNodeId(`${data.branch.id}::${data.branch.nodes[0].id}`);
        setBranchAnswer("");
      }
    } catch (e) {
      setError(e.message || "Could not create branch.");
    } finally {
      setBusy((p) => ({ ...p, createThemeId: "" }));
    }
  };

  const handleEvolveBranch = async () => {
    if (!selected || !sessionId || !branchAnswer) return;
    setError("");
    setBusy((p) => ({ ...p, evolve: true }));
    try {
      const data = await evolveBranch({
        sessionId,
        branchId: selected.branch.id,
        nodeId: selected.node.id,
        answer: branchAnswer,
      });
      setBranches(data.branches || []);
      if (data.nextNode?.id) {
        setSelectedNodeId(`${selected.branch.id}::${data.nextNode.id}`);
        setBranchAnswer("");
      }
    } catch (e) {
      setError(e.message || "Could not evolve branch.");
    } finally {
      setBusy((p) => ({ ...p, evolve: false }));
    }
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
    setSelectedNodeId(ROOT_NODE_ID);
    setBranchAnswer("");
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

  const createdThemes = new Set(
    branches
      .map((branch) => branch.theme)
      .filter((theme) => theme && theme !== "primary")
  );

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
        <section className="tree-screen">
          <header className="screen-header tree-header">
            <div>
              <h2>Life Path Engine</h2>
              <p>
                First branch is free. Additional thematic branches unlock
                separately.
              </p>
            </div>
            <button type="button" className="ghost-action" onClick={resetAll}>
              Restart
            </button>
          </header>

          <div className="tree-layout">
            <div className="flow-panel">
              <ReactFlow
                nodes={graph.nodes}
                edges={graph.edges}
                nodeTypes={nodeTypes}
                onNodeClick={(_event, node) => {
                  setSelectedNodeId(node.id);
                  setBranchAnswer("");
                }}
                onInit={setGraphInstance}
                minZoom={0.2}
                maxZoom={1.6}
                fitView
                defaultEdgeOptions={defaultEdgeOptions}
                proOptions={{ hideAttribution: true }}
              >
                <Controls showInteractive={false} />
              </ReactFlow>
            </div>

            <aside className="side-panel">
              {selected ? (
                <>
                  <p className="side-theme">{selected.branch.themeLabel}</p>
                  <h3>{selected.node.title}</h3>
                  <p>{selected.node.summary}</p>
                  {selected.node.milestone && (
                    <p className="side-note">
                      <strong>Milestone:</strong> {selected.node.milestone}
                    </p>
                  )}
                  {selected.node.answeredChoiceLabel && (
                    <p className="side-note">
                      <strong>Latest answer:</strong> {selected.node.answeredChoiceLabel}
                    </p>
                  )}
                  <p className="side-note">
                    <strong>Risk:</strong> {selected.node.riskNote}
                  </p>

                  {selected.node.question ? (
                    <div className="tradeoff-box">
                      <p className="tradeoff-title">Tradeoff question</p>
                      <p>{selected.node.question.text}</p>
                      <div className="option-list compact">
                        {selected.node.question.options.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={`option-button ${branchAnswer === option.value ? "selected" : ""}`}
                            onClick={() => setBranchAnswer(option.value)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="primary-action"
                        onClick={handleEvolveBranch}
                        disabled={!branchAnswer || busy.evolve}
                      >
                        {busy.evolve ? "Evolving..." : "Continue this branch"}
                      </button>
                    </div>
                  ) : (
                    <div className="tradeoff-box">
                      <p className="tradeoff-title">Branch status</p>
                      <p>
                        {selected.node.shouldStop
                          ? "This branch reached a strong clarity point."
                          : "Select another node to continue exploring."}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <h3>Me</h3>
                  <p>
                    Select a branch node to continue exploration through adaptive
                    tradeoff decisions.
                  </p>
                </>
              )}

              <div className="theme-section">
                <h4>Unlock New Branches</h4>
                <p className="theme-caption">
                  New branches evolve independently and do not change existing
                  branches.
                </p>
                <div className="theme-list">
                  {themes.map((theme) => {
                    if (theme.id === "primary") {
                      return null;
                    }

                    const isCreated = createdThemes.has(theme.id);
                    const isUnlocked = unlockedThemes.includes(theme.id);
                    const isUnlockBusy = busy.unlockThemeId === theme.id;
                    const isCreateBusy = busy.createThemeId === theme.id;

                    return (
                      <div key={theme.id} className="theme-card">
                        <p className="theme-title">{theme.label}</p>
                        <p>{theme.description}</p>

                        {isCreated ? (
                          <span className="theme-state">Exploring</span>
                        ) : isUnlocked ? (
                          <button
                            type="button"
                            className="secondary-action"
                            onClick={() => handleCreateThemeBranch(theme.id)}
                            disabled={isCreateBusy}
                          >
                            {isCreateBusy ? "Creating..." : "Create branch"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="secondary-action"
                            onClick={() => handleUnlockTheme(theme.id)}
                            disabled={isUnlockBusy}
                          >
                            {isUnlockBusy ? "Unlocking..." : "Unlock $9"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </aside>
          </div>

          {error && <p className="error-text">{error}</p>}
        </section>
      )}
    </main>
  );
}

export default App;
