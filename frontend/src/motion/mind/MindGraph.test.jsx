import { describe, it, expect, vi, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import MindGraph from "./MindGraph";
import { buildMindGraph } from "./mindGraph";

const nodesAfter = (seed, total, k) => String(buildMindGraph(seed, total).cut[k]);

afterEach(() => vi.unstubAllGlobals());

const canvasOf = (container) => container.querySelector("canvas.mind-graph");

describe("MindGraph", () => {
  it("is decoration: hidden from assistive tech, drawing the clusters of the answers so far", () => {
    const { container } = render(<MindGraph seed="big_five" total={20} answered={7} reducedMotion />);
    const canvas = canvasOf(container);
    expect(canvas).toHaveAttribute("aria-hidden", "true");
    expect(canvas).toHaveAttribute("data-answered", "7");
    expect(canvas).toHaveAttribute("data-nodes", nodesAfter("big_five", 20, 7));
    expect(Number(canvas.dataset.nodes)).toBeGreaterThanOrEqual(14);
    expect(Number(canvas.dataset.edges)).toBeGreaterThanOrEqual(Number(canvas.dataset.nodes) - 1);
  });

  it("paints the settled frame on mount — a reload looks like the moment before it", () => {
    const { container } = render(<MindGraph seed="riasec" total={12} answered={5} />);
    expect(canvasOf(container)).toHaveAttribute("data-arriving", "false");
  });

  it("plays the newest node's arrival only for an answer given while it is up", () => {
    // Freeze the clock so the arrival stays observable mid-way.
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const { container, rerender } = render(<MindGraph seed="riasec" total={12} answered={5} />);
    rerender(<MindGraph seed="riasec" total={12} answered={6} />);
    expect(canvasOf(container)).toHaveAttribute("data-arriving", "true");
    expect(canvasOf(container)).toHaveAttribute("data-nodes", nodesAfter("riasec", 12, 6));
    // Going back is not an arrival.
    rerender(<MindGraph seed="riasec" total={12} answered={5} />);
    expect(canvasOf(container)).toHaveAttribute("data-arriving", "false");
  });

  it("under reduced motion an answer jumps straight to the settled frame", () => {
    const { container, rerender } = render(
      <MindGraph seed="riasec" total={12} answered={5} reducedMotion />
    );
    act(() => {
      rerender(<MindGraph seed="riasec" total={12} answered={6} reducedMotion />);
    });
    expect(canvasOf(container)).toHaveAttribute("data-arriving", "false");
    expect(canvasOf(container)).toHaveAttribute("data-flare", "false");
    expect(canvasOf(container)).toHaveAttribute("data-nodes", nodesAfter("riasec", 12, 6));
  });

  it("draws nothing before the first answer", () => {
    const { container } = render(<MindGraph seed="journey" total={7} answered={0} reducedMotion />);
    expect(canvasOf(container)).toHaveAttribute("data-nodes", "0");
  });
});
