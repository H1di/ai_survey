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

  describe("the order building beside the question", () => {
    const decided = [
      { a: "achievement", b: "independence", winner: "independence" },
      { a: "recognition", b: "relationships", winner: "relationships" },
    ];
    const live = {
      ...base,
      comparison: { comparisonId: "support|working_conditions", a: "support", b: "working_conditions" },
      decided,
      progress: { answered: 2, total: 10 },
    };

    it("reduced motion: the static board — pair, ordered rows, what is undecided", () => {
      const { container } = render(<ValuesTournamentScreen {...live} reducedMotion />);
      // Every value is on screen exactly once: two asked, four ordered so far.
      expect(screen.getAllByRole("button").map((b) => b.querySelector(".split-title").textContent)).toEqual([
        "Support",
        "Working Conditions",
      ]);
      const rows = [...container.querySelectorAll(".vins-row .rank-label")].map((r) => r.textContent);
      expect(rows).toEqual(["Independence", "Achievement", "Relationships", "Recognition"]);
      // No rank is claimed until a value's place against all five others is known.
      expect([...container.querySelectorAll(".vins-row .rank-number")].every((n) => n.textContent === "–")).toBe(true);
      // Achievement vs Relationships has not been asked: that boundary is open.
      expect(container.querySelectorAll(".vins-row--open")).toHaveLength(1);
      expect(
        screen.getByRole("img", {
          name: /After 2 of at most 10 choices, ordered so far: Independence, Achievement, Relationships, Recognition\. Next comparison: Support or Working Conditions\./,
        })
      ).toBeInTheDocument();
    });

    it("answers straight through the card, and marks it while the answer is in flight", () => {
      const onChoose = vi.fn();
      const { container, rerender } = render(<ValuesTournamentScreen {...live} onChoose={onChoose} reducedMotion />);
      fireEvent.click(screen.getByRole("button", { name: /Support/ }));
      expect(onChoose).toHaveBeenCalledWith("support");
      rerender(<ValuesTournamentScreen {...live} onChoose={onChoose} busy reducedMotion />);
      expect(container.querySelector(".vins-card--chosen")).toHaveTextContent("Support");
      // The next pair reuses a value: the mark must not follow it there.
      rerender(
        <ValuesTournamentScreen
          {...live}
          comparison={{ comparisonId: "achievement|support", a: "support", b: "achievement" }}
          busy
          reducedMotion
        />
      );
      expect(container.querySelector(".vins-card--chosen")).toBeNull();
    });

    it("works with no record at all (older snapshot): just the question", () => {
      const { container } = render(<ValuesTournamentScreen {...base} reducedMotion />);
      expect(screen.getAllByRole("button")).toHaveLength(2);
      expect(container.querySelectorAll(".vins-row")).toHaveLength(0);
    });
  });
});
