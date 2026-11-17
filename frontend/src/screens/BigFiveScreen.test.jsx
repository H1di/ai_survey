import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BigFiveScreen from "./BigFiveScreen";

const base = {
  item: { id: "mip_1", text: "I am the life of the party." },
  savedValue: null,
  index: 0,
  total: 20,
  busy: false,
  onAnswer: () => {},
  onBack: () => {},
  canGoBack: false,
};

describe("BigFiveScreen", () => {
  it("is a bare question screen: no eyebrow, no title, no sub-headline, no footer", () => {
    const { container } = render(<BigFiveScreen {...base} footer={<p>rail</p>} />);
    expect(container.querySelector(".screen")).toHaveClass("screen--question");
    expect(screen.queryByText("step 2 · big five")).not.toBeInTheDocument();
    expect(screen.queryByText("Mini-IPIP-20")).not.toBeInTheDocument();
    expect(container.querySelector(".screen-sub")).toBeNull();
    expect(container.querySelector(".screen-footer")).toBeNull();
  });

  it("shows the statement upright, unquoted, as the screen's heading", () => {
    render(<BigFiveScreen {...base} />);
    const statement = screen.getByRole("heading", { name: "I am the life of the party." });
    expect(statement).toHaveClass("item-statement");
    expect(statement).not.toHaveClass("item-statement--italic");
  });

  it("writes the instrument's inaccurate … accurate ends; every ring keeps its IPIP anchor as its name", () => {
    const { container } = render(<BigFiveScreen {...base} />);
    expect([...container.querySelectorAll(".likert-end")].map((e) => e.textContent)).toEqual([
      "inaccurate",
      "accurate",
    ]);
    expect(screen.getByRole("group", { name: "How accurately does this describe you?" })).toBeInTheDocument();
    ["Very inaccurate", "Moderately inaccurate", "Neither", "Moderately accurate", "Very accurate"]
      .forEach((label) => expect(screen.getByRole("button", { name: label })).toBeInTheDocument());
  });

  it("submits the chosen rating", () => {
    const onAnswer = vi.fn();
    render(<BigFiveScreen {...base} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole("button", { name: "Very accurate" }));
    expect(onAnswer).toHaveBeenCalledWith(5);
  });

  it("shows where you are on the progress line", () => {
    render(<BigFiveScreen {...base} index={7} />);
    const bar = screen.getByRole("progressbar", { name: "Step progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "8");
    expect(bar).toHaveAttribute("aria-valuemax", "20");
    expect(screen.getByText("Question 8 of 20")).toBeInTheDocument();
  });

  it("grows the mind graph with the answers behind the current item", () => {
    const { container } = render(<BigFiveScreen {...base} index={7} reducedMotion />);
    const graph = container.querySelector("canvas.mind-graph");
    expect(graph).toHaveAttribute("aria-hidden", "true");
    expect(graph).toHaveAttribute("data-answered", "7");
  });

  it("offers Back only when there is somewhere to go", () => {
    const { rerender } = render(<BigFiveScreen {...base} />);
    expect(screen.queryByRole("button", { name: "← Back" })).not.toBeInTheDocument();
    rerender(<BigFiveScreen {...base} canGoBack />);
    expect(screen.getByRole("button", { name: "← Back" })).toBeInTheDocument();
  });
});
