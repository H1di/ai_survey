import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ValuesTournamentScreen from "./ValuesTournamentScreen";

const base = {
  comparison: { a: "achievement", b: "independence" },
  progress: { answered: 5, total: 10 },
  busy: false,
  onChoose: () => {},
};

describe("ValuesTournamentScreen", () => {
  it("carries the step copy verbatim", () => {
    render(<ValuesTournamentScreen {...base} />);
    expect(screen.getByText("step 4 · values tournament · comparison 6 of 10")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Which matters more?" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "An adaptive Ford–Johnson merge-insertion tournament, ≤10 comparisons, ranking the six Minnesota work values: Achievement, Independence, Recognition, Relationships, Support, Working Conditions."
      )
    ).toBeInTheDocument();
  });

  it("labels both halves from the shared work-value metadata", () => {
    render(<ValuesTournamentScreen {...base} />);
    expect(screen.getByText("Achievement")).toBeInTheDocument();
    expect(screen.getByText("Independence")).toBeInTheDocument();
  });

  it("passes the winner up as a work-value key", () => {
    const onChoose = vi.fn();
    render(<ValuesTournamentScreen {...base} onChoose={onChoose} />);
    fireEvent.click(screen.getByRole("button", { name: /Achievement/ }));
    expect(onChoose).toHaveBeenCalledWith("achievement");
  });

  it("falls back to a bare eyebrow when progress is unknown", () => {
    render(<ValuesTournamentScreen {...base} progress={null} />);
    expect(screen.getByText("step 4 · values tournament")).toBeInTheDocument();
  });
});
