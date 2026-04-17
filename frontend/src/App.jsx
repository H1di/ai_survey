import { useMemo, useRef, useState } from "react";
import ReactFlow, { Background, Controls, MarkerType } from "reactflow";
import "reactflow/dist/style.css";
import "./App.css";

const REASONS = [
  "I feel lost in my career",
  "I want to choose a career path",
  "I want to rethink my life decisions",
];

const ROOT_NODE_ID = "root-node";

function PathNode({ data, selected }) {
  if (data.kind === "root") {
    return (
      <div className={`path-node root ${selected ? "selected" : ""}`}>
        <h3>{data.title}</h3>
        <p>{data.shortDescription}</p>
      </div>
    );
  }

  return (
    <div className={`path-node ${selected ? "selected" : ""}`}>
      <h3>{data.path.title}</h3>
      <p>{data.path.shortDescription}</p>
      <div className="node-footnote">
        {data.loading
          ? "Generating branches..."
          : data.expanded
            ? "Expanded"
            : "Click to explore deeper"}
      </div>
    </div>
  );
}

const nodeTypes = {
  pathNode: PathNode,
};

function createRootNode() {
  return {
    id: ROOT_NODE_ID,
    type: "pathNode",
    position: { x: 0, y: 0 },
    draggable: false,
    data: {
      kind: "root",
      level: 0,
      title: "Your Current Starting Point",
      shortDescription: "Explore branches to simulate possible futures.",
    },
  };
}

function createPathNode({ id, path, x, y, level }) {
  return {
    id,
    type: "pathNode",
    position: { x, y },
    data: {
      kind: "path",
      level,
      loading: false,
      expanded: false,
      path,
    },
  };
}

function buildInitialTree(paths) {
  const root = createRootNode();

  if (!paths.length) {
    return {
      nodes: [root],
      edges: [],
    };
  }

  const spacing = 320;
  const width = spacing * (paths.length - 1);

  const pathNodes = paths.map((path, index) =>
    createPathNode({
      id: `path-${index + 1}`,
      path,
      x: -width / 2 + index * spacing,
      y: 230,
      level: 1,
    })
  );

  const rootEdges = pathNodes.map((node, index) => ({
    id: `edge-root-${index + 1}`,
    source: ROOT_NODE_ID,
    target: node.id,
  }));

  return {
    nodes: [root, ...pathNodes],
    edges: rootEdges,
  };
}

function buildChildNodes(parentNode, branchPaths, idFactory) {
  if (!branchPaths.length) {
    return { nodes: [], edges: [] };
  }

  const spacing = 250;
  const width = spacing * (branchPaths.length - 1);
  const nextLevel = parentNode.data.level + 1;

  const nodes = branchPaths.map((path, index) =>
    createPathNode({
      id: idFactory(),
      path,
      x: parentNode.position.x - width / 2 + index * spacing,
      y: parentNode.position.y + 220,
      level: nextLevel,
    })
  );

  const branchEdges = nodes.map((node) => ({
    id: `edge-${parentNode.id}-${node.id}`,
    source: parentNode.id,
    target: node.id,
  }));

  return { nodes, edges: branchEdges };
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function App() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({
    reason: "",
    dream: "",
    why: "",
  });
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedPath, setSelectedPath] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [graphInstance, setGraphInstance] = useState(null);
  const nodeCounterRef = useRef(10);

  const defaultEdgeOptions = useMemo(
    () => ({
      type: "smoothstep",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "#2d5a50",
      },
      style: {
        strokeWidth: 1.4,
        stroke: "#2d5a50",
      },
    }),
    []
  );

  const createNodeId = () => {
    nodeCounterRef.current += 1;
    return `path-${nodeCounterRef.current}`;
  };

  const showGraph = step === 3;

  const moveBack = () => {
    setError("");
    setStep((current) => Math.max(current - 1, 0));
  };

  const moveNext = () => {
    setError("");
    setStep((current) => Math.min(current + 1, 2));
  };

  const generateInitialPaths = async () => {
    setLoading(true);
    setError("");

    try {
      const data = await postJson("/api/generate-initial", answers);
      const tree = buildInitialTree(data.paths || []);
      setNodes(tree.nodes);
      setEdges(tree.edges);
      setSelectedPath(null);
      setStep(3);
      window.setTimeout(() => graphInstance?.fitView({ padding: 0.25 }), 50);
    } catch (requestError) {
      setError(requestError.message || "Failed to generate paths.");
    } finally {
      setLoading(false);
    }
  };

  const handleNodeClick = async (_event, node) => {
    if (node.data.kind === "root") {
      setSelectedPath(null);
      return;
    }

    setSelectedPath(node.data.path);

    if (node.data.loading || node.data.expanded) {
      return;
    }

    setError("");
    setNodes((existing) =>
      existing.map((existingNode) =>
        existingNode.id === node.id
          ? {
              ...existingNode,
              data: {
                ...existingNode.data,
                loading: true,
              },
            }
          : existingNode
      )
    );

    try {
      const data = await postJson("/api/generate-branch", {
        ...answers,
        parentPath: node.data.path,
      });
      const branchPaths = data.paths || [];
      const branch = buildChildNodes(node, branchPaths, createNodeId);

      setNodes((existing) => {
        const updated = existing.map((existingNode) =>
          existingNode.id === node.id
            ? {
                ...existingNode,
                data: {
                  ...existingNode.data,
                  loading: false,
                  expanded: true,
                },
              }
            : existingNode
        );

        return [...updated, ...branch.nodes];
      });
      setEdges((existing) => [...existing, ...branch.edges]);
      window.setTimeout(() => graphInstance?.fitView({ padding: 0.28 }), 50);
    } catch (requestError) {
      setError(requestError.message || "Failed to generate branch.");
      setNodes((existing) =>
        existing.map((existingNode) =>
          existingNode.id === node.id
            ? {
                ...existingNode,
                data: {
                  ...existingNode.data,
                  loading: false,
                },
              }
            : existingNode
        )
      );
    }
  };

  const resetFlow = () => {
    setStep(0);
    setAnswers({
      reason: "",
      dream: "",
      why: "",
    });
    setNodes([]);
    setEdges([]);
    setSelectedPath(null);
    setLoading(false);
    setError("");
  };

  return (
    <main className="app-shell">
      {!showGraph && (
        <section className="question-card">
          <p className="step-indicator">Step {step + 1} of 3</p>

          {step === 0 && (
            <>
              <h1>Why are you here?</h1>
              <div className="options-grid">
                {REASONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`option-button ${
                      answers.reason === option ? "selected" : ""
                    }`}
                    onClick={() =>
                      setAnswers((existing) => ({
                        ...existing,
                        reason: option,
                      }))
                    }
                  >
                    {option}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h1>What would you do if you knew you couldn&apos;t fail?</h1>
              <textarea
                value={answers.dream}
                onChange={(event) =>
                  setAnswers((existing) => ({
                    ...existing,
                    dream: event.target.value,
                  }))
                }
                placeholder="Describe your ideal direction..."
              />
            </>
          )}

          {step === 2 && (
            <>
              <h1>Why this choice?</h1>
              <textarea
                value={answers.why}
                onChange={(event) =>
                  setAnswers((existing) => ({
                    ...existing,
                    why: event.target.value,
                  }))
                }
                placeholder="Share the deeper reason behind it..."
              />
            </>
          )}

          {error && <p className="error">{error}</p>}

          <div className="controls">
            {step > 0 && (
              <button type="button" className="ghost" onClick={moveBack}>
                Back
              </button>
            )}

            {step < 2 && (
              <button
                type="button"
                onClick={moveNext}
                disabled={
                  (step === 0 && !answers.reason) ||
                  (step === 1 && !answers.dream.trim())
                }
              >
                Continue
              </button>
            )}

            {step === 2 && (
              <button
                type="button"
                onClick={generateInitialPaths}
                disabled={loading || !answers.why.trim()}
              >
                {loading ? "Generating..." : "Generate Life Paths"}
              </button>
            )}
          </div>
        </section>
      )}

      {showGraph && (
        <section className="graph-shell">
          <header className="graph-header">
            <div>
              <h2>Life Path Explorer</h2>
              <p>Click any path node to generate deeper branches.</p>
            </div>
            <button type="button" className="ghost" onClick={resetFlow}>
              Start Over
            </button>
          </header>

          {error && <p className="error">{error}</p>}

          <div className="graph-panel">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodeClick={handleNodeClick}
              onInit={setGraphInstance}
              fitView
              minZoom={0.2}
              maxZoom={1.4}
              defaultEdgeOptions={defaultEdgeOptions}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#d9e4dc" gap={18} />
              <Controls />
            </ReactFlow>
          </div>

          <aside className="details-panel">
            {selectedPath ? (
              <>
                <h3>{selectedPath.title}</h3>
                <p>
                  <strong>Short description:</strong> {selectedPath.shortDescription}
                </p>
                <p>
                  <strong>Daily lifestyle:</strong> {selectedPath.dailyLifestyle}
                </p>
                <p>
                  <strong>Career trajectory:</strong> {selectedPath.careerTrajectory}
                </p>
                <p>
                  <strong>Financial outlook:</strong> {selectedPath.financialOutlook}
                </p>
                <p>
                  <strong>Risks:</strong> {selectedPath.risks}
                </p>
                <p>
                  <strong>Psychological profile:</strong>{" "}
                  {selectedPath.psychologicalProfile}
                </p>
                <p>
                  <strong>Why this fits you:</strong> {selectedPath.fitWhy}
                </p>
              </>
            ) : (
              <p>Select a path node to inspect the full details.</p>
            )}
          </aside>
        </section>
      )}
    </main>
  );
}

export default App;
