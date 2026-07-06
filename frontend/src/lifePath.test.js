import { describe, it, expect, vi } from "vitest";
import { buildLifePathGraph, selectDockCard, firstUnansweredIndex } from "./lifePath";

const direction = { id: "tech", label: "Programming & Technology" };
const professions = [
  { id: "prof_1", title: "Software Developer", summary: "s1" },
  { id: "prof_2", title: "QA Engineer", summary: "s2" },
  { id: "prof_3", title: "Data Analyst", summary: "s3" },
];

function baseArgs(overrides = {}) {
  return {
    direction,
    professionOptions: professions,
    selectedProfessionId: null,
    roadmaps: {},
    roadmapPending: false,
    onProfessionOpen: vi.fn(),
    onStageOpen: vi.fn(),
    ...overrides,
  };
}

describe("buildLifePathGraph", () => {
  it("returns just the Me node before a direction exists", () => {
    const { nodes, edges } = buildLifePathGraph(baseArgs({ direction: null }));
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe("me");
    expect(edges).toHaveLength(0);
  });

  it("builds Me -> direction -> 3 professions with connecting edges", () => {
    const { nodes, edges } = buildLifePathGraph(baseArgs());
    expect(nodes.map((n) => n.id)).toEqual([
      "me",
      "direction",
      "prof_1",
      "prof_2",
      "prof_3",
    ]);
    expect(edges.find((e) => e.id === "me-direction")).toBeTruthy();
    for (const p of professions) {
      expect(edges.find((e) => e.id === `direction-${p.id}`)).toBeTruthy();
    }
  });

  it("marks the selected profession and activates only its edge", () => {
    const { nodes, edges } = buildLifePathGraph(
      baseArgs({ selectedProfessionId: "prof_2" })
    );
    const selected = nodes.find((n) => n.id === "prof_2");
    expect(selected.data.selected).toBe(true);
    expect(edges.find((e) => e.id === "direction-prof_2").data.active).toBe(true);
    expect(edges.find((e) => e.id === "direction-prof_1").data.active).toBe(false);
  });

  it("shows a loading node under the selected profession while a roadmap is pending", () => {
    const { nodes } = buildLifePathGraph(
      baseArgs({ selectedProfessionId: "prof_1", roadmapPending: true })
    );
    expect(nodes.find((n) => n.id === "roadmap-loading")).toBeTruthy();
  });

  it("renders multiple roadmap chains, each under its own profession", () => {
    const roadmaps = {
      prof_1: { professionId: "prof_1", stages: [{ id: "s1", title: "A" }, { id: "s2", title: "B" }] },
      prof_3: { professionId: "prof_3", stages: [{ id: "s1", title: "C" }] },
    };
    const { nodes, edges } = buildLifePathGraph(baseArgs({ roadmaps }));

    expect(nodes.find((n) => n.id === "stage-prof_1-s1")).toBeTruthy();
    expect(nodes.find((n) => n.id === "stage-prof_1-s2")).toBeTruthy();
    expect(nodes.find((n) => n.id === "stage-prof_3-s1")).toBeTruthy();

    // First stage hangs off its profession; later stages chain to the prior one.
    expect(edges.find((e) => e.id === "prof_1-stage-prof_1-s1")).toBeTruthy();
    expect(edges.find((e) => e.id === "stage-prof_1-s1-stage-prof_1-s2")).toBeTruthy();
    // The last stage of a chain is flagged.
    expect(nodes.find((n) => n.id === "stage-prof_1-s2").data.last).toBe(true);
    expect(nodes.find((n) => n.id === "stage-prof_1-s1").data.last).toBe(false);
  });

  it("ignores roadmaps whose profession is no longer offered", () => {
    const roadmaps = { ghost: { professionId: "ghost", stages: [{ id: "s1", title: "X" }] } };
    const { nodes } = buildLifePathGraph(baseArgs({ roadmaps }));
    expect(nodes.find((n) => n.id.startsWith("stage-ghost"))).toBeFalsy();
  });
});

describe("selectDockCard", () => {
  const tree = { stage: "tree", direction: null };

  it("shows nothing outside the tree stage", () => {
    expect(selectDockCard({ stage: "survey" })).toBeNull();
  });

  it("shows the direction question while one is unanswered", () => {
    expect(
      selectDockCard({ ...tree, currentDirectionQuestion: { id: "dir_q1" } })
    ).toBe("direction-question");
  });

  it("shows the tie card when candidates exist and no proposal was made", () => {
    expect(
      selectDockCard({ ...tree, directionTieCandidates: [{ id: "a" }, { id: "b" }] })
    ).toBe("direction-tie");
  });

  it("prefers an open question over a tie", () => {
    expect(
      selectDockCard({
        ...tree,
        currentDirectionQuestion: { id: "dir_q1" },
        directionTieCandidates: [{ id: "a" }, { id: "b" }],
      })
    ).toBe("direction-question");
  });

  it("shows refine, then the manual picker after two rejections", () => {
    expect(selectDockCard({ ...tree, refineMode: true, proposedDirection: { id: "x" }, rejectedDirections: [{ id: "y" }] })).toBe("refine");
    expect(
      selectDockCard({ ...tree, refineMode: true, rejectedDirections: [{ id: "a" }, { id: "b" }] })
    ).toBe("direction-pick");
  });

  it("shows the proposal when one exists and refine is closed", () => {
    expect(selectDockCard({ ...tree, proposedDirection: { id: "tech" } })).toBe("proposal");
  });

  it("prompts to narrow after a direction is confirmed, then the narrowing question", () => {
    const confirmed = { stage: "tree", direction: { id: "tech" }, professionOptions: [] };
    expect(selectDockCard({ ...confirmed, narrowIntent: false })).toBe("narrow-prompt");
    expect(
      selectDockCard({ ...confirmed, narrowIntent: true, currentNarrowingQuestion: { id: "nar_q1" } })
    ).toBe("narrowing");
  });

  it("shows no card once professions are on the board", () => {
    expect(
      selectDockCard({ stage: "tree", direction: { id: "tech" }, professionOptions: [{ id: "prof_1" }] })
    ).toBeNull();
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
