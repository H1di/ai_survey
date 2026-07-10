import { describe, it, expect, vi } from "vitest";
import {
  buildLifePathGraph,
  selectDockCard,
  firstUnansweredIndex,
  moveRankItem,
  outputX,
  ADVICE_BLOCKS,
} from "./lifePath";

const OUTPUTS = [
  {
    id: "output_1",
    parentId: null,
    jobTitle: "Agronomist",
    orientedField: "Agriculture & Environment",
    valuesFit: { overall: 78 },
    topValues: ["security", "universalism", "tradition"],
    accepted: null,
    detail: null,
  },
  {
    id: "output_2",
    parentId: "output_1",
    jobTitle: "Environmental Technician",
    orientedField: "Agriculture & Environment",
    valuesFit: { overall: 84 },
    topValues: ["universalism", "security", "self_direction"],
    accepted: null,
    detail: null,
  },
];

const DETAIL = {
  aiRecommendations: [{ title: "a", detail: "b" }, { title: "c", detail: "d" }],
  events: [{ name: "a", why: "b" }, { name: "c", why: "d" }],
  universities: [{ name: "a", program: "b" }, { name: "c", program: "d" }],
  courses: [
    { name: "a", provider: "b", why: "c" },
    { name: "d", provider: "e", why: "f" },
  ],
};

const noop = () => {};

describe("buildLifePathGraph (output chain)", () => {
  it("renders only Me with no outputs", () => {
    const { nodes, edges } = buildLifePathGraph({ onOutputOpen: noop, onAdviceOpen: noop, onStageOpen: noop });
    expect(nodes).toHaveLength(1);
    expect(edges).toHaveLength(0);
  });

  it("chains outputs horizontally with parent-linked edges (me anchors the first)", () => {
    const { nodes, edges } = buildLifePathGraph({
      outputs: OUTPUTS,
      onOutputOpen: noop,
      onAdviceOpen: noop,
      onStageOpen: noop,
    });
    const outputNodes = nodes.filter((n) => n.type === "output");
    expect(outputNodes).toHaveLength(2);
    expect(outputNodes[0].position.x).toBe(outputX(0));
    expect(outputNodes[1].position.x).toBe(outputX(1));

    expect(edges.find((e) => e.id === "me-output_1")).toBeTruthy();
    expect(edges.find((e) => e.id === "output_1-output_2")).toBeTruthy();
    // only the latest (or accepted) edge is active
    expect(edges.find((e) => e.id === "me-output_1").data.active).toBe(false);
    expect(edges.find((e) => e.id === "output_1-output_2").data.active).toBe(true);
  });

  it("passes fit, top values, and accepted/latest flags into node data", () => {
    const onOutputOpen = vi.fn();
    const { nodes } = buildLifePathGraph({
      outputs: OUTPUTS,
      acceptedOutputId: "output_2",
      onOutputOpen,
      onAdviceOpen: noop,
      onStageOpen: noop,
    });
    const second = nodes.find((n) => n.id === "output_2");
    expect(second.data.fit).toBe(84);
    expect(second.data.accepted).toBe(true);
    expect(second.data.latest).toBe(true);
    second.data.onOpen();
    expect(onOutputOpen).toHaveBeenCalledWith(OUTPUTS[1]);
  });

  it("accepted output with detail grows the four advice nodes", () => {
    const outputs = [OUTPUTS[0], { ...OUTPUTS[1], accepted: true, detail: DETAIL }];
    const onAdviceOpen = vi.fn();
    const { nodes, edges } = buildLifePathGraph({
      outputs,
      acceptedOutputId: "output_2",
      onOutputOpen: noop,
      onAdviceOpen,
      onStageOpen: noop,
    });
    const advice = nodes.filter((n) => n.type === "advice");
    expect(advice).toHaveLength(4);
    expect(advice.map((n) => n.id)).toEqual(ADVICE_BLOCKS.map((b) => `advice-${b.key}`));
    expect(advice[0].data.count).toBe(2);
    advice[0].data.onOpen();
    expect(onAdviceOpen).toHaveBeenCalledWith("aiRecommendations");
    for (const b of ADVICE_BLOCKS) {
      expect(edges.find((e) => e.id === `output_2-advice-${b.key}`)).toBeTruthy();
    }
  });

  it("roadmap chain hangs under the accepted output, keyed by outputId", () => {
    const outputs = [{ ...OUTPUTS[0], accepted: true, detail: DETAIL }];
    const roadmaps = {
      output_1: {
        professionId: "output_1",
        stages: [
          { id: "stage_1", title: "T1", timeframe: "1m" },
          { id: "stage_2", title: "T2", timeframe: "2m" },
        ],
      },
    };
    const { nodes, edges } = buildLifePathGraph({
      outputs,
      acceptedOutputId: "output_1",
      roadmaps,
      onOutputOpen: noop,
      onAdviceOpen: noop,
      onStageOpen: noop,
    });
    const stages = nodes.filter((n) => n.type === "roadmap");
    expect(stages).toHaveLength(2);
    expect(edges.find((e) => e.id === "output_1-stage-output_1-stage_1")).toBeTruthy();
    expect(edges.find((e) => e.id === "stage-output_1-stage_1-stage-output_1-stage_2")).toBeTruthy();
    expect(stages[1].data.last).toBe(true);
  });

  it("shows loading placeholders while detail or roadmap generate", () => {
    const outputs = [{ ...OUTPUTS[0], accepted: true }];
    const pendingDetail = buildLifePathGraph({
      outputs,
      acceptedOutputId: "output_1",
      detailPending: true,
      onOutputOpen: noop,
      onAdviceOpen: noop,
      onStageOpen: noop,
    });
    expect(pendingDetail.nodes.find((n) => n.id === "detail-loading")).toBeTruthy();

    const pendingRoadmap = buildLifePathGraph({
      outputs,
      acceptedOutputId: "output_1",
      roadmapPending: true,
      onOutputOpen: noop,
      onAdviceOpen: noop,
      onStageOpen: noop,
    });
    expect(pendingRoadmap.nodes.find((n) => n.id === "roadmap-loading")).toBeTruthy();
  });
});

describe("selectDockCard (output loop)", () => {
  it("is null off the tree and before the first output", () => {
    expect(selectDockCard({ stage: "survey", outputs: OUTPUTS })).toBeNull();
    expect(selectDockCard({ stage: "tree", outputs: [] })).toBeNull();
  });

  it("reviews the latest output until accepted; refine mode swaps the card", () => {
    expect(selectDockCard({ stage: "tree", outputs: OUTPUTS, acceptedOutputId: null, refineMode: false })).toBe(
      "output-review"
    );
    expect(selectDockCard({ stage: "tree", outputs: OUTPUTS, acceptedOutputId: null, refineMode: true })).toBe(
      "refine"
    );
    expect(selectDockCard({ stage: "tree", outputs: OUTPUTS, acceptedOutputId: "output_2", refineMode: false })).toBeNull();
  });
});

describe("firstUnansweredIndex", () => {
  const qs = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("returns the first gap", () => {
    expect(firstUnansweredIndex(qs, { a: 1 })).toBe(1);
    expect(firstUnansweredIndex(qs, {})).toBe(0);
  });

  it("returns the last index when everything is answered", () => {
    expect(firstUnansweredIndex(qs, { a: 1, b: 2, c: 3 })).toBe(2);
  });

  it("handles empty lists", () => {
    expect(firstUnansweredIndex([], {})).toBe(0);
  });
});

describe("moveRankItem", () => {
  const list = ["a", "b", "c"];
  it("swaps with the neighbour in the given direction", () => {
    expect(moveRankItem(list, 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveRankItem(list, 1, 1)).toEqual(["a", "c", "b"]);
  });
  it("returns the same list at the edges and does not mutate", () => {
    expect(moveRankItem(list, 0, -1)).toBe(list);
    expect(moveRankItem(list, 2, 1)).toBe(list);
    moveRankItem(list, 1, 1);
    expect(list).toEqual(["a", "b", "c"]);
  });
});
