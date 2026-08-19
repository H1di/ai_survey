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
  it("carries the instrument copy verbatim", () => {
    render(<RiasecScreen {...base} />);
    expect(screen.getByText("step 3 · riasec interests · item 1 of 12")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How much would you enjoy this?" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Twelve fixed activity statements, rated for enjoyment — never job titles — scored to a Holland code. You can skip to infer interests from personality instead."
      )
    ).toBeInTheDocument();
  });

  it("quotes the activity, closing it with the period the design adds", () => {
    render(<RiasecScreen {...base} />);
    expect(
      screen.getByText('"Assembling or repairing a physical device until it works."')
    ).toBeInTheDocument();
  });

  it("keeps the enjoyment anchors, which the mockup does not show", () => {
    render(<RiasecScreen {...base} />);
    ["Not at all", "Not really", "Maybe", "Quite a bit", "Very much"].forEach((label) =>
      expect(screen.getByText(label)).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole("button", { name: /Maybe/ }));
    expect(onAnswer).toHaveBeenCalledWith(3);
  });
});
