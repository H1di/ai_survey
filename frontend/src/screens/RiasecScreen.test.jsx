import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RiasecScreen from "./RiasecScreen";

const base = {
  item: { id: "r1", text: "Assembling or repairing a physical device until it works" },
  savedValue: null,
  index: 0,
  total: 12,
  busy: false,
  onAnswer: () => {},
  onBack: () => {},
  canGoBack: false,
  onSkip: () => {},
  canSkip: true,
};

describe("RiasecScreen", () => {
  it("is a bare question screen with the progress line, no eyebrow, title or sub-headline", () => {
    const { container } = render(<RiasecScreen {...base} />);
    expect(container.querySelector(".screen")).toHaveClass("screen--question");
    expect(screen.getByText("Question 1 of 12")).toBeInTheDocument();
    expect(screen.queryByText("step 3 · riasec interests")).not.toBeInTheDocument();
    expect(container.querySelector(".screen-title")).toBeNull();
    expect(container.querySelector(".screen-sub")).toBeNull();
    expect(container.querySelector(".screen-footer")).toBeNull();
  });

  it("shows the activity unquoted, closed with the period the design adds", () => {
    render(<RiasecScreen {...base} />);
    expect(
      screen.getByRole("heading", { name: "Assembling or repairing a physical device until it works." })
    ).toBeInTheDocument();
  });

  it("names the enjoyment question on the scale and writes honest ends", () => {
    const { container } = render(<RiasecScreen {...base} />);
    expect(screen.getByRole("group", { name: "How much would you enjoy this?" })).toBeInTheDocument();
    expect([...container.querySelectorAll(".likert-end")].map((e) => e.textContent)).toEqual([
      "not at all",
      "very much",
    ]);
    ["Not at all", "Not really", "Maybe", "Quite a bit", "Very much"].forEach((label) =>
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument()
    );
  });

  it("offers the skip with the design's label, and only before the first answer", () => {
    const onSkip = vi.fn();
    const { rerender } = render(<RiasecScreen {...base} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip — infer from personality" }));
    expect(onSkip).toHaveBeenCalled();
    rerender(<RiasecScreen {...base} canSkip={false} />);
    expect(screen.queryByRole("button", { name: "Skip — infer from personality" })).not.toBeInTheDocument();
  });

  it("submits the chosen rating", () => {
    const onAnswer = vi.fn();
    render(<RiasecScreen {...base} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole("button", { name: "Maybe" }));
    expect(onAnswer).toHaveBeenCalledWith(3);
  });
});
