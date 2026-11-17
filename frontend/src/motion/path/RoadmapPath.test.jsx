import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import RoadmapPath from "./RoadmapPath";
import { RoadmapPathNode } from "../../components/GraphView/NodeComponent";
import { RevealContext } from "../roadmap/revealContext";
import { RoadmapReveal } from "../roadmap/RoadmapReveal";
import { buildTimeline, timelineDuration } from "../roadmap/roadmapTimeline";

const STAGES = [
  { id: "s1", title: "Foundations", timeframe: "2-3 months", description: "Learn the core.", milestone: "Core applied." },
  { id: "s2", title: "First real projects", timeframe: "2-3 months", description: "Build three.", milestone: "A portfolio." },
  { id: "s3", title: "First role", timeframe: "1 year", description: "Land it.", milestone: "Signed offer." },
];
const BIG_FIVE = { O: 94, C: 75, E: 44, A: 75, N: 25 };
const RIASEC = { R: 13, I: 100, A: 88, S: 50, E: 63, C: 38 };
const timeline = buildTimeline(STAGES.length);

const renderPath = ({ T = null, compact = false } = {}) =>
  render(
    <RevealContext.Provider value={T === null ? null : { T, timeline }}>
      <RoadmapPath stages={STAGES} jobTitle="Data Scientist" bigFive={BIG_FIVE} riasec={RIASEC} compact={compact} />
    </RevealContext.Provider>
  );

const marker = (name) => screen.getByRole("button", { name: new RegExp(`Stage \\d of 3: ${name}`) });

describe("RoadmapPath", () => {
  it("draws every stage as a keyboard-reachable marker with its month", () => {
    renderPath();
    expect(marker("Foundations")).toHaveAccessibleName("Stage 1 of 3: Foundations, now → ≈3m");
    expect(marker("First real projects")).toHaveAccessibleName(/≈3m → ≈5m/);
    expect(marker("First role")).toHaveTextContent("FR");
    expect(screen.getByText("Foundations · ≈3m")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Roadmap over about 17 months from now/ })).toBeInTheDocument();
  });

  it("opens with the current stage's description and milestone, and a marker switches it", () => {
    renderPath();
    expect(marker("Foundations")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Learn the core.")).toBeInTheDocument();
    expect(screen.getByText("Core applied.")).toBeInTheDocument();

    fireEvent.click(marker("First role"));
    expect(marker("First role")).toHaveAttribute("aria-pressed", "true");
    expect(marker("Foundations")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Land it.")).toBeInTheDocument();
    expect(screen.getByText("Signed offer.")).toBeInTheDocument();
    expect(screen.queryByText("Learn the core.")).toBeNull();
  });

  it("the pill opens its stage too, but stays out of the tab order", () => {
    renderPath();
    const pill = screen.getByText("First real projects · ≈5m");
    expect(pill).toHaveAttribute("tabindex", "-1");
    fireEvent.click(pill);
    expect(screen.getByText("Build three.")).toBeInTheDocument();
  });

  it("shows test scores with Neuroticism as Steadiness, and the top interests ranked", () => {
    renderPath();
    const scores = screen.getByRole("region", { name: "Test scores" });
    expect(within(scores).getByText("Steadiness").nextSibling).toHaveTextContent("75");
    expect(within(scores).queryByText(/Neuroticism/)).toBeNull();
    const items = within(screen.getByRole("region", { name: "Top interests" })).getAllByRole("listitem");
    expect(items.map((li) => li.querySelector(".rp-interest-name").textContent)).toEqual([
      "1. Investigative",
      "2. Artistic",
      "3. Enterprising",
      "4. Social",
    ]);
    expect(items[0].className).toContain("rp-interest--top");
    expect(items[1].className).not.toContain("rp-interest--top");
  });

  it("on a phone the path runs vertically and the scores fold behind one toggle", () => {
    const { container } = renderPath({ compact: true });
    expect(container.querySelector(".rp--vertical")).toBeTruthy();
    const toggle = screen.getByRole("button", { name: /Test scores · Top interests/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Steadiness")).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Steadiness")).toBeInTheDocument();
  });
});

describe("RoadmapPath reveal (roadmap clock)", () => {
  const clipWidth = (container) => Number(container.querySelector("clipPath rect").getAttribute("width"));

  it("a stage is invisible and unclickable until the line has reached it", () => {
    const { container } = renderPath({ T: timeline[1].edgeStart + 0.1 });
    expect(marker("Foundations")).toHaveStyle({ opacity: "1" });
    expect(marker("First real projects")).toHaveStyle({ opacity: "0", pointerEvents: "none" });
    expect(screen.getByText("First real projects · ≈5m")).toHaveStyle({ opacity: "0" });
    // the line is mid-draw, and the stage detail waits for the end
    const mid = clipWidth(container);
    const { container: done } = renderPath({ T: timelineDuration(timeline) });
    expect(mid).toBeLessThan(clipWidth(done));
    expect(container.querySelector(".rp-detail")).toHaveStyle({ visibility: "hidden" });
  });

  it("at the end every stage is in and nothing is left on it", () => {
    const { container } = renderPath({ T: timelineDuration(timeline) });
    for (const s of STAGES) expect(marker(s.title)).toHaveStyle({ opacity: "1", transform: "scale(1)" });
    expect(container.querySelector(".rp-detail").getAttribute("style")).toBeNull();
  });

  it("outside a reveal the path renders plainly — no inline motion at all", () => {
    renderPath();
    const style = marker("First role").getAttribute("style");
    expect(style).not.toMatch(/opacity|transform/);
  });

  it("reduced motion: the provider puts the whole path in its final state at once", () => {
    render(
      <ReactFlowProvider>
        <RoadmapReveal stepCount={STAGES.length} revealKey="output_1" reducedMotion>
          <RoadmapPathNode data={{ stages: STAGES, jobTitle: "Data Scientist", bigFive: BIG_FIVE, riasec: RIASEC }} />
        </RoadmapReveal>
      </ReactFlowProvider>
    );
    for (const s of STAGES) expect(marker(s.title)).toHaveStyle({ opacity: "1" });
    expect(screen.getByText("Learn the core.")).toBeVisible();
  });
});
