import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SummaryScreen from "./SummaryScreen";

const base = {
  archetype: { name: "The Analyst", tagline: "You test before you trust." },
  bigFiveScores: { O: 94, C: 75, E: 44, A: 75, N: 25 },
  personaSummary: "You work best when the question is still open.",
  userValues: { scores: { achievement: 90, independence: 80, recognition: 60, relationships: 50, support: 40, working_conditions: 30 } },
  busy: false,
  onContinue: () => {},
};

describe("SummaryScreen", () => {
  it("carries the step copy verbatim", () => {
    render(<SummaryScreen {...base} />);
    expect(screen.getByText("step 6 · summary")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Who you are" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "A deterministic named archetype, a Big Five radar chart, AI persona prose, and your confirmed work-values radar — brought together into one profile."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enter the Life Path Engine" })).toBeInTheDocument();
  });

  it("shows the archetype and the persona prose", () => {
    render(<SummaryScreen {...base} />);
    expect(screen.getByText("The Analyst")).toBeInTheDocument();
    expect(screen.getByText("You test before you trust.")).toBeInTheDocument();
    expect(screen.getByText("You work best when the question is still open.")).toBeInTheDocument();
  });

  it("survives a keyless session with no persona prose", () => {
    render(<SummaryScreen {...base} personaSummary={null} />);
    expect(screen.getByText("The Analyst")).toBeInTheDocument();
  });

  it("continues into the engine", () => {
    const onContinue = vi.fn();
    render(<SummaryScreen {...base} onContinue={onContinue} />);
    fireEvent.click(screen.getByRole("button", { name: "Enter the Life Path Engine" }));
    expect(onContinue).toHaveBeenCalled();
  });
});
