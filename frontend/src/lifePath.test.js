import { describe, it, expect, vi } from "vitest";
import {
  buildLifePathGraph,
  selectDockCard,
  firstUnansweredIndex,
  demographicsComplete,
  demographicsPayloads,
  moveRankItem,
  outputX,
  ADVICE_BLOCKS,
  JOURNEY_RAIL,
  railIndexForStep,
  railStepReachable,
  RAIL_NAVIGATION,
  bigFiveTakeaways,
  whyThisFitsSections,
  onetSection,
  deriveArchetype,
  WORK_VALUE_AXES,
  WORK_VALUE_ORDER,
} from "./lifePath";

describe("whyThisFitsSections", () => {
  const structured = {
    whyThisFits: {
      personality: [{ point: "p1" }, { point: "p2" }],
      interests: [{ point: "i1" }],
      values: [{ point: "v1" }],
      currentSkills: [{ point: "s1" }, { point: "s2" }],
      skillsToDevelop: ["d1", "d2", "d3"],
    },
  };

  it("maps the structured block to five labeled sections", () => {
    const sections = whyThisFitsSections(structured);
    expect(sections.map((s) => s.heading)).toEqual([
      "Why this fits — personality",
      "Interests",
      "Values",
      "Current skills",
      "Skills to develop",
    ]);
    expect(sections[0].items).toEqual(["p1", "p2"]);
    expect(sections[4].items).toEqual(["d1", "d2", "d3"]);
  });

  it("falls back to legacy whyFit text for old outputs", () => {
    expect(whyThisFitsSections({ whyFit: "legacy line" })).toEqual([
      { heading: "Why this fits you", text: "legacy line" },
    ]);
    expect(whyThisFitsSections({})).toEqual([]);
  });
});

describe("onetSection", () => {
  const onet = {
    soc: "29-1141.00",
    jobZone: 3,
    jobZoneLabel: "Medium preparation needed",
    skills: ["Service Orientation", "Active Listening"],
    tech: ["Epic Systems", "MEDITECH software"],
    related: [{ soc: "29-1171.00", title: "Nurse Practitioners" }],
    usMarket: true,
    attribution: "This product includes information from O*NET OnLine (v30.3)… CC BY 4.0 license.",
    salary: { annualMedian: 93600, hourlyMedian: 45 },
    outlook: { category: "Bright", brightOutlook: true },
  };

  it("builds the real-world section with US-flagged salary and outlook", () => {
    const section = onetSection({ onet });
    expect(section.heading).toMatch(/O\*NET/);
    expect(section.items.some((i) => i.includes("$93,600") && i.includes("US"))).toBe(true);
    expect(section.items.some((i) => i.includes("Bright"))).toBe(true);
    expect(section.items.some((i) => i.includes("Job Zone 3"))).toBe(true);
    expect(section.items.some((i) => i.includes("Service Orientation"))).toBe(true);
    expect(section.items.some((i) => i.includes("Epic Systems"))).toBe(true);
    expect(section.items.some((i) => i.includes("Nurse Practitioners"))).toBe(true);
    expect(section.footnote).toMatch(/O\*NET/);
  });

  it("omits salary/outlook lines keyless and returns null without a block", () => {
    const { salary, outlook, ...bare } = onet;
    const section = onetSection({ onet: bare });
    expect(section.items.some((i) => i.includes("$"))).toBe(false);
    expect(section.items.some((i) => i.includes("outlook"))).toBe(false);
    expect(onetSection({})).toBe(null);
    expect(onetSection(null)).toBe(null);
  });
});

describe("bigFiveTakeaways", () => {
  it("returns five axes with Neuroticism shown as inverted Emotional Steadiness", () => {
    const rows = bigFiveTakeaways({ O: 80, C: 30, E: 50, A: 65, N: 20 });
    expect(rows).toHaveLength(5);
    const n = rows.find((r) => r.key === "N");
    expect(n.label).toBe("Emotional Steadiness");
    expect(n.value).toBe(80);
    expect(n.line).toMatch(/level/);
    expect(rows.find((r) => r.key === "O").line).toMatch(/New ideas/);
    expect(rows.find((r) => r.key === "C").line).toMatch(/bursts/);
    expect(rows.find((r) => r.key === "E").line).toMatch(/switch/);
  });

  it("returns an empty list without scores", () => {
    expect(bigFiveTakeaways(null)).toEqual([]);
  });
});

describe("journey rail", () => {
  it("covers the survey steps in execution order incl. values + summary", () => {
    expect(JOURNEY_RAIL.map((r) => r.step)).toEqual([
      "demographics",
      "big_five",
      "riasec",
      "values",
      "cv",
      "summary",
    ]);
    for (const entry of JOURNEY_RAIL) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.time.length).toBeGreaterThan(0);
    }
  });

  it("labels the work-values step 'Values'", () => {
    expect(JOURNEY_RAIL.find((r) => r.step === "values").label).toBe("Values");
  });

  it("maps steps to rail positions; off-rail steps return -1", () => {
    expect(railIndexForStep("demographics")).toBe(0);
    expect(railIndexForStep("values")).toBe(3);
    expect(railIndexForStep("cv")).toBe(4);
    expect(railIndexForStep("summary")).toBe(5);
    expect(railIndexForStep("tree")).toBe(-1);
    expect(railIndexForStep("depth_choice")).toBe(-1);
  });
});

describe("work values", () => {
  it("WORK_VALUE_AXES exposes the 6 keys with labels in order", () => {
    expect(WORK_VALUE_AXES.map((a) => a.key)).toEqual(WORK_VALUE_ORDER);
    expect(WORK_VALUE_ORDER).toEqual([
      "achievement",
      "independence",
      "recognition",
      "relationships",
      "support",
      "working_conditions",
    ]);
    for (const axis of WORK_VALUE_AXES) {
      expect(axis.label.length).toBeGreaterThan(0);
    }
  });
});

describe("deriveArchetype", () => {
  it("names the archetype from the top RIASEC letter and a Big Five pole", () => {
    const a = deriveArchetype({
      riasecCode: "SIE",
      bigFiveScores: { O: 40, C: 80, E: 40, A: 55, N: 45 },
    });
    expect(a.name).toBe("The Helper");
    expect(a.tagline).toMatch(/helping people grow/);
    expect(a.tagline).toMatch(/follow-through/);
  });

  it("falls back to a safe label when no RIASEC code is present", () => {
    const a = deriveArchetype({});
    expect(a.name).toBe("The Explorer");
    expect(typeof a.tagline).toBe("string");
  });
});

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

  it("reviews the latest output until one is accepted", () => {
    expect(selectDockCard({ stage: "tree", outputs: OUTPUTS, acceptedOutputId: null })).toBe(
      "output-review"
    );
    expect(selectDockCard({ stage: "tree", outputs: OUTPUTS, acceptedOutputId: "output_2" })).toBeNull();
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

describe("railStepReachable", () => {
  it("is on by default — the flag is the removal switch", () => {
    expect(RAIL_NAVIGATION).toBe(true);
  });

  it("allows steps at or before the furthest reached", () => {
    expect(railStepReachable("demographics", "values")).toBe(true);
    expect(railStepReachable("riasec", "values")).toBe(true);
    expect(railStepReachable("values", "values")).toBe(true);
  });

  it("refuses steps past the furthest reached", () => {
    expect(railStepReachable("cv", "values")).toBe(false);
    expect(railStepReachable("summary", "values")).toBe(false);
  });

  it("treats tree as past the end of the rail", () => {
    expect(railStepReachable("summary", "tree")).toBe(true);
    expect(railStepReachable("demographics", "tree")).toBe(true);
  });

  it("refuses steps that are not on the rail at all", () => {
    expect(railStepReachable("tree", "tree")).toBe(false);
    expect(railStepReachable("entry", "values")).toBe(false);
    expect(railStepReachable("summary", "entry")).toBe(false);
  });
});

describe("demographics one-screen helpers", () => {
  const questions = [
    { id: "sex", kind: "single" },
    { id: "age", kind: "number" },
    { id: "country", kind: "text" },
    { id: "city", kind: "text" },
  ];

  it("is incomplete until every question has a usable draft", () => {
    expect(demographicsComplete(questions, {})).toBe(false);
    expect(
      demographicsComplete(questions, { sex: "female", age: "32", country: "Ireland", city: "" })
    ).toBe(false);
    expect(
      demographicsComplete(questions, { sex: "female", age: "32", country: "Ireland", city: "  " })
    ).toBe(false);
    expect(
      demographicsComplete(questions, { sex: "female", age: "abc", country: "Ireland", city: "Dublin" })
    ).toBe(false);
    expect(
      demographicsComplete(questions, { sex: "female", age: "32", country: "Ireland", city: "Dublin" })
    ).toBe(true);
  });

  it("builds one payload per question, in order, coercing numbers", () => {
    expect(
      demographicsPayloads(questions, {
        sex: "female",
        age: "32",
        country: "Ireland",
        city: "Dublin",
      })
    ).toEqual([
      { questionId: "sex", value: "female" },
      { questionId: "age", value: 32 },
      { questionId: "country", value: "Ireland" },
      { questionId: "city", value: "Dublin" },
    ]);
  });

  it("skips answers the snapshot already holds, so a retry only sends the rest", () => {
    const drafts = { sex: "female", age: "32", country: "Ireland", city: "Dublin" };
    const saved = { sex: "female", age: 32 };
    expect(demographicsPayloads(questions, drafts, saved)).toEqual([
      { questionId: "country", value: "Ireland" },
      { questionId: "city", value: "Dublin" },
    ]);
  });

  it("drops empty and unparseable drafts rather than posting them", () => {
    expect(
      demographicsPayloads(questions, { sex: "", age: "abc", country: "Ireland", city: null })
    ).toEqual([{ questionId: "country", value: "Ireland" }]);
  });

  it("sends nothing when every draft already matches the snapshot", () => {
    // This is the rail-revisit case. The empty result is correct here — it is
    // App.jsx's job to fall back to a single re-post so the step still advances.
    const drafts = { sex: "female", age: "32", country: "Ireland", city: "Dublin" };
    const saved = { sex: "female", age: 32, country: "Ireland", city: "Dublin" };
    expect(demographicsPayloads(questions, drafts, saved)).toEqual([]);
  });

  it("produces every payload when nothing is saved, which is that fallback's input", () => {
    const drafts = { sex: "female", age: "32", country: "Ireland", city: "Dublin" };
    expect(demographicsPayloads(questions, drafts, {})).toHaveLength(4);
  });
});
