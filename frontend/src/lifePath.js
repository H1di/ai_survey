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

// The demographics step collects all four answers before submitting, but the
// route takes one at a time. These two turn the screen's drafts into that
// sequence — and into the button's enabled state.
function usableDraft(question, raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return false;
  if (question.kind === "number") return Number.isFinite(Number(raw));
  return true;
}

export function demographicsComplete(questions, drafts = {}) {
  return questions.every((q) => usableDraft(q, drafts[q.id]));
}

export function demographicsPayloads(questions, drafts = {}, saved = {}) {
  const payloads = [];
  for (const q of questions) {
    const raw = drafts[q.id];
    if (!usableDraft(q, raw)) continue;
    const value = q.kind === "number" ? Number(raw) : raw;
    // A retry after a mid-chain failure must not re-post what already landed.
    if (saved[q.id] === value) continue;
    payloads.push({ questionId: q.id, value });
  }
  return payloads;
}

// Reorder helper for the work-values hierarchy list. Pure: returns the
// input list unchanged when the move would fall off either end.
export function moveRankItem(list, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// Drag reorder: lift the item at `from` and insert it at `to`. Pure, and a
// no-op for a move that would not change anything.
export function moveRankItemTo(list, from, to) {
  if (from === to) return list;
  if (from < 0 || from >= list.length) return list;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
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

// Which dock card the tree shows for a given session shape. Returns
// "output-review" or null. Mirrors the render order in App.jsx — once an
// output is accepted, the graph nodes carry the story and the dock stays
// empty.
export function selectDockCard({ stage, outputs = [], acceptedOutputId }) {
  if (stage !== "tree") return null;
  if (!outputs.length) return null;
  if (acceptedOutputId) return null;
  return "output-review";
}

// Display-only Career Discovery Journey rail. Labels are copy, not state:
// the backend step machine stays the source of truth for execution order.
export const JOURNEY_RAIL = [
  { step: "demographics", label: "Demographics", time: "~1 min" },
  { step: "big_five", label: "Big Five", time: "2–3 min" },
  { step: "riasec", label: "Interests", time: "2 min" },
  { step: "values", label: "Values", time: "1–2 min" },
  { step: "cv", label: "Experience", time: "1–2 min" },
  { step: "summary", label: "Summary", time: "~1 min" },
];

export function railIndexForStep(step) {
  return JOURNEY_RAIL.findIndex((r) => r.step === step);
}

// Master switch for rail navigation. Set to false to restore the display-only
// rail: every entry goes inert and nothing else needs editing.
export const RAIL_NAVIGATION = true;

// A rail entry is clickable when the user has already reached it. `tree` sits
// past the end of the rail, so reaching it makes every rail step reachable.
export function railStepReachable(step, furthestStep) {
  if (!RAIL_NAVIGATION) return false;
  const target = railIndexForStep(step);
  if (target === -1) return false;
  if (furthestStep === "tree") return true;
  const furthest = railIndexForStep(furthestStep);
  return furthest !== -1 && target <= furthest;
}

// The six Minnesota / O*NET work values, in the backend WORK_VALUES_ORDER. The
// blurbs are the concrete MIQ-style needs shown in the pairwise tournament and
// the hierarchy table.
export const WORK_VALUE_META = {
  achievement: {
    label: "Achievement",
    blurb: "Using your abilities and seeing real accomplishment in your work.",
  },
  independence: {
    label: "Independence",
    blurb: "Working on your own and making your own decisions.",
  },
  recognition: {
    label: "Recognition",
    blurb: "Advancement, status, and being recognised for good work.",
  },
  relationships: {
    label: "Relationships",
    blurb: "Friendly co-workers and being of service to other people.",
  },
  support: {
    label: "Support",
    blurb: "Supportive management and fair, consistent company policies.",
  },
  working_conditions: {
    label: "Working Conditions",
    blurb: "Good pay, security, variety, and comfortable conditions.",
  },
};

export const WORK_VALUE_ORDER = Object.keys(WORK_VALUE_META);
export const WORK_VALUE_AXES = WORK_VALUE_ORDER.map((key) => ({
  key,
  label: WORK_VALUE_META[key].label,
}));

// Deterministic character archetype from the RIASEC code + Big Five poles.
// Keyless-safe and stable across reloads — the persona prose (AI, with a
// deterministic fallback) carries the nuance; this is the memorable label.
const RIASEC_ARCHETYPE = {
  R: "The Maker",
  I: "The Investigator",
  A: "The Creator",
  S: "The Helper",
  E: "The Driver",
  C: "The Organizer",
};

const RIASEC_THEME = {
  R: "building tangible things",
  I: "figuring out how things work",
  A: "creating and expressing",
  S: "helping people grow",
  E: "leading and persuading",
  C: "bringing order to complexity",
};

export function deriveArchetype({ riasecCode, bigFiveScores } = {}) {
  const top = (riasecCode || "")[0];
  const second = (riasecCode || "")[1];
  const name = RIASEC_ARCHETYPE[top] || "The Explorer";
  const themes = [RIASEC_THEME[top], RIASEC_THEME[second]].filter(Boolean);
  const interestLine = themes.length
    ? `drawn to ${themes.join(" and ")}`
    : "still mapping what draws you";

  const s = bigFiveScores || {};
  const trait =
    (s.O ?? 50) >= 65
      ? "with an open, idea-hungry mind"
      : (s.C ?? 50) >= 65
        ? "with a steady, follow-through streak"
        : (s.E ?? 50) >= 65
          ? "who comes alive around people"
          : (s.A ?? 50) >= 65
            ? "who leads with cooperation"
            : (100 - (s.N ?? 50)) >= 65
              ? "with calm under pressure"
              : "with a considered, careful style";

  return { name, tagline: `${interestLine} — ${trait}.` };
}

// Maps the structured whyThisFits block to InfoPanel sections. Outputs
// generated before the block existed fall back to the legacy whyFit text.
export function whyThisFitsSections(output) {
  const why = output?.whyThisFits;
  if (!why) {
    return output?.whyFit ? [{ heading: "Why this fits you", text: output.whyFit }] : [];
  }
  const pts = (list) => (list || []).map((p) => p.point);
  return [
    { heading: "Why this fits — personality", items: pts(why.personality) },
    { heading: "Interests", items: pts(why.interests) },
    { heading: "Values", items: pts(why.values) },
    { heading: "Current skills", items: pts(why.currentSkills) },
    { heading: "Skills to develop", items: why.skillsToDevelop || [] },
  ].filter((section) => section.items.length);
}

// Maps an output's O*NET block to one InfoPanel section. Salary/outlook are
// live-API extras (absent keyless) and always carry the US-market flag —
// the audience is not US-only. footnote carries the CC-BY attribution.
export function onetSection(output) {
  const onet = output?.onet;
  if (!onet) return null;
  const items = [];
  if (onet.jobZoneLabel) {
    items.push(`Preparation: ${onet.jobZoneLabel} (Job Zone ${onet.jobZone} of 5).`);
  }
  if (onet.salary?.annualMedian) {
    items.push(
      `Median pay: $${onet.salary.annualMedian.toLocaleString("en-US")}/year — US labor market.`
    );
  }
  if (onet.outlook?.category) {
    items.push(
      `US job outlook: ${onet.outlook.category}${onet.outlook.brightOutlook ? " — new opportunities very likely" : ""}.`
    );
  }
  if (onet.skills?.length) items.push(`Core skills: ${onet.skills.join(", ")}.`);
  if (onet.tech?.length) items.push(`Tools & technology: ${onet.tech.join(", ")}.`);
  if (onet.related?.length) {
    items.push(`Related occupations: ${onet.related.map((r) => r.title).join(", ")}.`);
  }
  return {
    heading: "Real-world data (O*NET)",
    items,
    footnote: onet.attribution,
  };
}

// The single-line US market summary shown on the output card. Salary and
// outlook come from the live O*NET API, so both are absent keyless — and both
// stay visibly US-flagged, because the audience is not.
export function usMarketLine(output) {
  const onet = output?.onet;
  if (!onet) return "";
  const parts = [];
  if (onet.salary?.annualMedian) {
    parts.push(`$${onet.salary.annualMedian.toLocaleString("en-US")}/yr median (US)`);
  }
  if (onet.outlook?.category) parts.push(`outlook: ${onet.outlook.category}`);
  return parts.join(" · ");
}

// Deterministic one-liners per Big Five axis. Bands match the backend's
// describeTraits (high >= 65, low <= 35). Neuroticism is DISPLAYED as
// Emotional Steadiness (100 - N); the stored score keeps raw N everywhere.
export function bigFiveTakeaways(scores) {
  if (!scores) return [];
  const pick = (value, highLine, midLine, lowLine) =>
    value >= 65 ? highLine : value <= 35 ? lowLine : midLine;
  const steadiness = 100 - (scores.N ?? 50);
  return [
    {
      key: "O",
      label: "Openness",
      value: scores.O ?? 0,
      line: pick(
        scores.O ?? 0,
        "New ideas pull you more than familiar routines.",
        "You weigh new ideas against what already works.",
        "You trust proven ways over experiments."
      ),
    },
    {
      key: "C",
      label: "Conscientiousness",
      value: scores.C ?? 0,
      line: pick(
        scores.C ?? 0,
        "Plans, order, and follow-through come naturally to you.",
        "You keep enough structure to deliver without living by lists.",
        "You work in bursts of energy, not schedules."
      ),
    },
    {
      key: "E",
      label: "Extraversion",
      value: scores.E ?? 0,
      line: pick(
        scores.E ?? 0,
        "People and rooms give you energy.",
        "You switch between company and quiet without strain.",
        "Quiet focus beats a busy room for you."
      ),
    },
    {
      key: "A",
      label: "Agreeableness",
      value: scores.A ?? 0,
      line: pick(
        scores.A ?? 0,
        "You read people well and pull toward cooperation.",
        "You cooperate when it helps and push back when it counts.",
        "You put the task above keeping everyone comfortable."
      ),
    },
    {
      key: "N",
      label: "Emotional Steadiness",
      value: steadiness,
      line: pick(
        steadiness,
        "You stay level when things go wrong.",
        "You hold steady under everyday pressure.",
        "Stress lands hard on you, so the environment matters."
      ),
    },
  ];
}
