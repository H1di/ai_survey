// Pure helpers for the Life Path tree: the React Flow graph builder and the
// dock-card state machine. Kept side-effect-free and out of App.jsx so both
// can be unit-tested without rendering the whole app.

export const ME_NODE = { id: "me", type: "me", position: { x: 0, y: 0 }, data: {} };

// Vertical story: Me -> output iteration chain (horizontal trail) -> the
// accepted output grows 4 advice cards and its roadmap chain.
const OUTPUT_Y = 240;
const OUTPUT_GAP_X = 380;
const ADVICE_Y = 520;
const ADVICE_GAP = 300;
const ROADMAP_START_Y = 780;
const ROADMAP_GAP = 200;

// Cascade timing: a node appears exactly when its edge finishes drawing.
const EDGE_DRAW_MS = 600;
const ADVICE_STAGGER_MS = 180;
const ROADMAP_STEP_MS = 600;

export const ADVICE_BLOCKS = [
  { key: "aiRecommendations", label: "AI Recommendations" },
  { key: "events", label: "Events" },
  { key: "universities", label: "Universities & Majors" },
  { key: "courses", label: "Courses" },
];

export function outputX(index) {
  return index * OUTPUT_GAP_X;
}

// Index of the first unanswered question, so a restored session resumes
// where the user left off (falls back to 0 for a fresh list).
export function firstUnansweredIndex(questions, answers) {
  const index = questions.findIndex((q) => (answers || {})[q.id] === undefined);
  return index === -1 ? Math.max(0, questions.length - 1) : index;
}

// Reorder helper for the job-characteristics ranking list. Pure: returns the
// input list unchanged when the move would fall off either end.
export function moveRankItem(list, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function buildLifePathGraph({
  outputs = [],
  acceptedOutputId = null,
  roadmaps = {},
  roadmapPending = false,
  detailPending = false,
  onOutputOpen,
  onAdviceOpen,
  onStageOpen,
}) {
  const nodes = [ME_NODE];
  const edges = [];

  outputs.forEach((output, index) => {
    const isLatest = index === outputs.length - 1;
    const isAccepted = output.id === acceptedOutputId;
    nodes.push({
      id: output.id,
      type: "output",
      position: { x: outputX(index), y: OUTPUT_Y },
      draggable: true,
      style: { "--appear-delay": `${EDGE_DRAW_MS}ms` },
      data: {
        jobTitle: output.jobTitle,
        orientedField: output.orientedField,
        fit: output.valuesFit ? output.valuesFit.overall : null,
        topValues: output.topValues || [],
        accepted: isAccepted,
        latest: isLatest,
        onOpen: () => onOutputOpen(output),
      },
    });
    edges.push({
      id: `${output.parentId || "me"}-${output.id}`,
      source: output.parentId || "me",
      target: output.id,
      type: "branch",
      data: { delay: 0, active: isAccepted || isLatest, flowDelayMs: EDGE_DRAW_MS },
    });
  });

  const acceptedIndex = outputs.findIndex((o) => o.id === acceptedOutputId);
  const accepted = acceptedIndex === -1 ? null : outputs[acceptedIndex];
  if (!accepted) {
    return { nodes, edges };
  }
  const anchorX = outputX(acceptedIndex);

  if (detailPending) {
    nodes.push({
      id: "detail-loading",
      type: "loading",
      position: { x: anchorX, y: ADVICE_Y },
      data: {},
    });
    edges.push({
      id: `${accepted.id}-detail-loading`,
      source: accepted.id,
      target: "detail-loading",
      type: "branch",
    });
  } else if (accepted.detail) {
    ADVICE_BLOCKS.forEach((block, index) => {
      const items = accepted.detail[block.key] || [];
      const edgeDelay = index * ADVICE_STAGGER_MS;
      const nodeId = `advice-${block.key}`;
      nodes.push({
        id: nodeId,
        type: "advice",
        position: { x: anchorX + (index - (ADVICE_BLOCKS.length - 1) / 2) * ADVICE_GAP, y: ADVICE_Y },
        draggable: true,
        style: { "--appear-delay": `${edgeDelay + EDGE_DRAW_MS}ms` },
        data: {
          label: block.label,
          count: items.length,
          onOpen: () => onAdviceOpen(block.key),
        },
      });
      edges.push({
        id: `${accepted.id}-${nodeId}`,
        source: accepted.id,
        target: nodeId,
        type: "branch",
        data: { delay: edgeDelay, active: true, flowDelayMs: 150 },
      });
    });
  }

  if (roadmapPending) {
    nodes.push({
      id: "roadmap-loading",
      type: "loading",
      position: { x: anchorX, y: ROADMAP_START_Y },
      data: {},
    });
    edges.push({
      id: `${accepted.id}-roadmap-loading`,
      source: accepted.id,
      target: "roadmap-loading",
      type: "branch",
    });
  }

  const roadmap = roadmaps[accepted.id];
  if (roadmap) {
    roadmap.stages.forEach((stage, index) => {
      const nodeId = `stage-${accepted.id}-${stage.id}`;
      const parentId =
        index === 0 ? accepted.id : `stage-${accepted.id}-${roadmap.stages[index - 1].id}`;
      const edgeDelay = index * ROADMAP_STEP_MS;
      nodes.push({
        id: nodeId,
        type: "roadmap",
        position: { x: anchorX, y: ROADMAP_START_Y + index * ROADMAP_GAP },
        draggable: true,
        style: { "--appear-delay": `${edgeDelay + EDGE_DRAW_MS}ms` },
        data: {
          index: index + 1,
          title: stage.title,
          timeframe: stage.timeframe,
          last: index === roadmap.stages.length - 1,
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
  }

  return { nodes, edges };
}

// Which dock card the tree shows for a given session shape. Returns one of:
// "output-review" | "refine" | null. Mirrors the render order in App.jsx —
// once an output is accepted, the graph nodes carry the story and the dock
// stays empty.
export function selectDockCard({ stage, outputs = [], acceptedOutputId, refineMode }) {
  if (stage !== "tree") return null;
  if (!outputs.length) return null;
  if (acceptedOutputId) return null;
  if (refineMode) return "refine";
  return "output-review";
}
