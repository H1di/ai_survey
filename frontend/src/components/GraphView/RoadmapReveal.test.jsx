import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { RoadmapNode } from "./NodeComponent";
import BranchEdge from "./BranchEdge";
import { RevealContext } from "../../motion/roadmap/revealContext";
import { RoadmapReveal } from "../../motion/roadmap/RoadmapReveal";
import { buildTimeline, timelineDuration } from "../../motion/roadmap/roadmapTimeline";

const timeline = buildTimeline(3);
const DATA = { index: 2, revealIndex: 1, title: "First real projects", timeframe: "2–3 months", onOpen: () => {} };

const node = (T) =>
  render(
    <ReactFlowProvider>
      <RevealContext.Provider value={T === null ? null : { T, timeline }}>
        <RoadmapNode data={DATA} />
      </RevealContext.Provider>
    </ReactFlowProvider>
  );

const edge = (T) =>
  render(
    <svg>
      <RevealContext.Provider value={T === null ? null : { T, timeline }}>
        <BranchEdge id="e" sourceX={0} sourceY={0} targetX={0} targetY={100} data={{ revealIndex: 1, active: true }} />
      </RevealContext.Provider>
    </svg>
  );

describe("roadmap reveal", () => {
  it("a step is invisible and unclickable until its edge has arrived", () => {
    node(timeline[1].edgeStart + 0.1);
    const step = screen.getByRole("button", { name: /First real projects/ });
    expect(step).toHaveStyle({ opacity: "0", pointerEvents: "none" });
  });

  it("then it is fully in, with its timeframe, and nothing left on it", () => {
    node(timelineDuration(timeline));
    const step = screen.getByRole("button", { name: /First real projects/ });
    expect(step).toHaveStyle({ opacity: "1", transform: "translateY(0px)" });
    expect(screen.getByText("2–3 months")).toHaveStyle({ opacity: "1" });
  });

  it("outside a reveal the step renders plainly — no inline motion at all", () => {
    node(null);
    const step = screen.getByRole("button", { name: /First real projects/ });
    expect(step.getAttribute("style")).toBeNull();
    expect(step.className).not.toContain("node--clocked");
  });

  it("the edge draws by the clock: undrawn before its window, complete after", () => {
    const before = edge(timeline[1].edgeStart).container.querySelector(".branch-edge");
    expect(before.style.strokeDashoffset).toBe("1");
    const after = edge(timeline[1].edgeEnd).container.querySelector(".branch-edge");
    expect(after.style.strokeDashoffset).toBe("0");
    expect(edge(null).container.querySelector(".branch-edge").style.strokeDashoffset).toBe("");
  });

  it("reduced motion: the provider puts every step in its final state at once", () => {
    render(
      <ReactFlowProvider>
        <RoadmapReveal stepCount={3} revealKey="output_1" reducedMotion>
          <RoadmapNode data={DATA} />
        </RoadmapReveal>
      </ReactFlowProvider>
    );
    expect(screen.getByRole("button", { name: /First real projects/ })).toHaveStyle({ opacity: "1" });
  });
});
