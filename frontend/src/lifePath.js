// Pure helpers for the Life Path tree: the React Flow graph builder and the
// dock-card state machine. Kept side-effect-free and out of App.jsx so both
// can be unit-tested without rendering the whole app.

export const ME_NODE = { id: "me", type: "me", position: { x: 0, y: 0 }, data: {} };

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

export function professionX(index, count) {
  return (index - (count - 1) / 2) * PROFESSION_GAP;
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

// Which dock card the tree shows for a given session shape. Returns one of:
// "direction-question" | "direction-tie" | "refine" | "direction-pick" |
// "proposal" | "narrow-prompt" | "narrowing" | null. Mirrors the render
// order in App.jsx exactly — earliest matching branch wins.
export function selectDockCard({
  stage,
  direction,
  currentDirectionQuestion,
  directionTieCandidates = [],
  proposedDirection,
  refineMode,
  rejectedDirections = [],
  professionOptions = [],
  narrowIntent,
  currentNarrowingQuestion,
}) {
  if (stage !== "tree") return null;

  if (!direction && currentDirectionQuestion) return "direction-question";
  if (!direction && !proposedDirection && directionTieCandidates.length > 0) return "direction-tie";
  if (!direction && refineMode && rejectedDirections.length < 2) return "refine";
  if (!direction && refineMode && rejectedDirections.length >= 2) return "direction-pick";
  if (!direction && proposedDirection) return "proposal";
  if (direction && professionOptions.length === 0 && !narrowIntent) return "narrow-prompt";
  if (direction && professionOptions.length === 0 && narrowIntent && currentNarrowingQuestion) {
    return "narrowing";
  }
  return null;
}
