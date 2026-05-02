import { useEffect, useMemo, useState } from "react";
import ReactFlow, { Controls, MarkerType } from "reactflow";
import "reactflow/dist/style.css";
import {
  answerQuestion,
  createThematicBranch,
  evolveBranch,
  generateInitialBranch,
  setPremiumDepth,
  startSession,
  unlockTheme,
} from "./api";
import "./App.css";

const ROOT_NODE_ID = "root-me";
const ENTRY_OPTIONS = [
  { value: "change", label: "Change my career" },
  { value: "find", label: "Find my career" },
];

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
  const [premiumDepth, setPremiumDepthState] = useState(false);

  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [draftAnswer, setDraftAnswer] = useState("");
  const [progress, setProgress] = useState({
    answered: 0,
    target: 14,
    remaining: 14,
    canFinish: false,
    done: false,
  });

  const [branches, setBranches] = useState([]);
  const [themes, setThemes] = useState([]);
  const [unlockedThemes, setUnlockedThemes] = useState([]);

  const [selectedNodeId, setSelectedNodeId] = useState(ROOT_NODE_ID);
  const [branchAnswer, setBranchAnswer] = useState("");

  const [graphInstance, setGraphInstance] = useState(null);

  const [busy, setBusy] = useState({
    start: false,
    answer: false,
    premium: false,
    initialBranch: false,
    unlockThemeId: "",
    createThemeId: "",
    evolve: false,
  });

  const [error, setError] = useState("");

  const nodeTypes = useMemo(
    () => ({
      treeNode: TreeNode,
    }),
    []
  );

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

  const handleStartSession = async () => {
    if (!entryChoice || !dreamAnswer.trim()) {
      return;
    }

    setError("");
    setBusy((prev) => ({ ...prev, start: true }));

    try {
      const data = await startSession({
        entryChoice,
        dreamAnswer: dreamAnswer.trim(),
        premiumDepth,
      });

      setSessionId(data.sessionId);
      setPremiumDepthState(data.premiumDepth);
      setCurrentQuestion(data.nextQuestion);
      setDraftAnswer("");
      setProgress(data.progress);
      setThemes(data.themes || []);
      setUnlockedThemes(data.unlockedThemes || []);
      setBranches(data.branches || []);
      setStage("questions");
    } catch (requestError) {
      setError(requestError.message || "Could not start session.");
    } finally {
      setBusy((prev) => ({ ...prev, start: false }));
    }
  };

  const handleTogglePremium = async () => {
    if (!sessionId) {
      return;
    }

    const nextValue = !premiumDepth;

    setError("");
    setBusy((prev) => ({ ...prev, premium: true }));

    try {
      const data = await setPremiumDepth({
        sessionId,
        premiumDepth: nextValue,
      });

      setPremiumDepthState(data.premiumDepth);
      setProgress(data.progress);
      setCurrentQuestion(data.nextQuestion);
      setDraftAnswer("");
    } catch (requestError) {
      setError(requestError.message || "Could not update premium depth.");
    } finally {
      setBusy((prev) => ({ ...prev, premium: false }));
    }
  };

  const handleAnswerQuestion = async () => {
    if (!sessionId || !currentQuestion) {
      return;
    }

    const answer =
      currentQuestion.kind === "text" ? draftAnswer.trim() : draftAnswer || "";

    if (!answer) {
      return;
    }

    setError("");
    setBusy((prev) => ({ ...prev, answer: true }));

    try {
      const data = await answerQuestion({
        sessionId,
        questionId: currentQuestion.id,
        answer,
      });

      setProgress(data.progress);
      setCurrentQuestion(data.nextQuestion);
      setDraftAnswer("");
    } catch (requestError) {
      setError(requestError.message || "Could not save answer.");
    } finally {
      setBusy((prev) => ({ ...prev, answer: false }));
    }
  };

  const handleGenerateInitialBranch = async () => {
    if (!sessionId) {
      return;
    }

    setError("");
    setBusy((prev) => ({ ...prev, initialBranch: true }));

    try {
      const data = await generateInitialBranch({ sessionId });

      setBranches(data.branches || []);
      setThemes(data.themes || []);
      setUnlockedThemes(data.unlockedThemes || []);

      const primary = data.branches?.find((branch) => branch.theme === "primary");

      if (primary && primary.nodes[0]) {
        setSelectedNodeId(`${primary.id}::${primary.nodes[0].id}`);
        setBranchAnswer("");
      } else {
        setSelectedNodeId(ROOT_NODE_ID);
        setBranchAnswer("");
      }

      setStage("tree");
    } catch (requestError) {
      setError(requestError.message || "Could not generate first branch.");
    } finally {
      setBusy((prev) => ({ ...prev, initialBranch: false }));
    }
  };

  const handleUnlockTheme = async (themeId) => {
    if (!sessionId || !themeId) {
      return;
    }

    setError("");
    setBusy((prev) => ({ ...prev, unlockThemeId: themeId }));

    try {
      const data = await unlockTheme({ sessionId, themeId });
      setUnlockedThemes(data.unlockedThemes || []);
    } catch (requestError) {
      setError(requestError.message || "Could not unlock theme.");
    } finally {
      setBusy((prev) => ({ ...prev, unlockThemeId: "" }));
    }
  };

  const handleCreateThemeBranch = async (themeId) => {
    if (!sessionId || !themeId) {
      return;
    }

    setError("");
    setBusy((prev) => ({ ...prev, createThemeId: themeId }));

    try {
      const data = await createThematicBranch({ sessionId, themeId });
      setBranches(data.branches || []);
      setThemes(data.themes || []);
      setUnlockedThemes(data.unlockedThemes || []);

      if (data.branch?.nodes?.[0]) {
        setSelectedNodeId(`${data.branch.id}::${data.branch.nodes[0].id}`);
        setBranchAnswer("");
      }
    } catch (requestError) {
      setError(requestError.message || "Could not create branch.");
    } finally {
      setBusy((prev) => ({ ...prev, createThemeId: "" }));
    }
  };

  const handleEvolveBranch = async () => {
    if (!selected || !sessionId || !branchAnswer) {
      return;
    }

    setError("");
    setBusy((prev) => ({ ...prev, evolve: true }));

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
    } catch (requestError) {
      setError(requestError.message || "Could not evolve branch.");
    } finally {
      setBusy((prev) => ({ ...prev, evolve: false }));
    }
  };

  const resetAll = () => {
    setStage("entry");
    setEntryChoice("");
    setDreamAnswer("");
    setSessionId("");
    setPremiumDepthState(false);
    setCurrentQuestion(null);
    setDraftAnswer("");
    setProgress({
      answered: 0,
      target: 14,
      remaining: 14,
      canFinish: false,
      done: false,
    });
    setBranches([]);
    setThemes([]);
    setUnlockedThemes([]);
    setSelectedNodeId(ROOT_NODE_ID);
    setBranchAnswer("");
    setError("");
    setBusy({
      start: false,
      answer: false,
      premium: false,
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
          <h1>Why are you here?</h1>

          <div className="entry-options">
            {ENTRY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`entry-option ${
                  entryChoice === option.value ? "selected" : ""
                }`}
                onClick={() => setEntryChoice(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <p className="entry-prompt">
            If you knew that you would definitely succeed, what would you do?
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
            {busy.start ? "Entering..." : "Continue"}
          </button>

          {error && <p className="error-text">{error}</p>}
        </section>
      )}

      {stage === "questions" && (
        <section className="questions-screen">
          <header className="screen-header">
            <h2>Deep Analysis</h2>
            <p>
              {progress.answered} / {progress.target} questions answered
            </p>
          </header>

          <div className="premium-box">
            <div>
              <p className="premium-title">Premium depth modules</p>
              <p>
                Add personality, motivation, values mapping, and cognitive style
                layers.
              </p>
            </div>
            <button
              type="button"
              className={`toggle-button ${premiumDepth ? "active" : ""}`}
              onClick={handleTogglePremium}
              disabled={busy.premium}
            >
              {busy.premium ? "Updating..." : premiumDepth ? "Enabled" : "Enable"}
            </button>
          </div>

          {currentQuestion ? (
            <div className="question-card">
              <p className="question-category">
                {currentQuestion.module === "premium" ? "Premium" : "Core"} •{" "}
                {currentQuestion.category.replaceAll("_", " ")}
              </p>
              <h3>{currentQuestion.question}</h3>

              {currentQuestion.kind === "single" && (
                <div className="option-list">
                  {currentQuestion.options.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`option-button ${
                        draftAnswer === option.value ? "selected" : ""
                      }`}
                      onClick={() => setDraftAnswer(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}

              {currentQuestion.kind === "text" && (
                <textarea
                  className="question-textarea"
                  value={draftAnswer}
                  onChange={(event) => setDraftAnswer(event.target.value)}
                  placeholder={currentQuestion.placeholder || "Type your answer"}
                />
              )}

              <div className="question-actions">
                <button
                  type="button"
                  className="primary-action"
                  onClick={handleAnswerQuestion}
                  disabled={
                    busy.answer ||
                    (currentQuestion.kind === "text"
                      ? !draftAnswer.trim()
                      : !draftAnswer)
                  }
                >
                  {busy.answer ? "Saving..." : "Next question"}
                </button>

                <button
                  type="button"
                  className="secondary-action"
                  onClick={handleGenerateInitialBranch}
                  disabled={!progress.canFinish || busy.initialBranch}
                >
                  {busy.initialBranch ? "Building..." : "Run Life Path Engine"}
                </button>
              </div>
            </div>
          ) : (
            <div className="question-card">
              <h3>You have enough signal to generate your first branch.</h3>
              <div className="question-actions single">
                <button
                  type="button"
                  className="primary-action"
                  onClick={handleGenerateInitialBranch}
                  disabled={!progress.canFinish || busy.initialBranch}
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
                            className={`option-button ${
                              branchAnswer === option.value ? "selected" : ""
                            }`}
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
