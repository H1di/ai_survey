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

  describe("the emblem", () => {
    const full = {
      ...base,
      riasecScores: { R: 13, I: 100, A: 88, S: 50, E: 63, C: 38 },
      riasecCode: "IAE",
      userValues: {
        ...base.userValues,
        order: ["achievement", "independence", "recognition", "relationships", "support", "working_conditions"],
      },
    };

    it("reduced motion: the finished mark, described by what it shows", () => {
      const { container } = render(<SummaryScreen {...full} reducedMotion />);
      expect(
        screen.getByRole("img", {
          name: /Personal emblem for The Investigator\. Inner lobes: Openness 94.*Interest ring with I, A, E marked\. Longest work-value ticks: Achievement, then Independence\./,
        })
      ).toBeInTheDocument();
      // Final frame: the serial line is fully in.
      expect(container.querySelector(".emb-serial")).toHaveStyle({ opacity: "1" });
      expect(container.querySelector(".emb-serial").textContent).toMatch(/^IAE · [0-9A-F]{4}-[0-9A-F]{4}$/);
      expect(screen.getByRole("button", { name: "Save as image" })).toBeInTheDocument();
      // The screen still prints the archetype itself — once.
      expect(screen.getAllByText("The Analyst")).toHaveLength(1);
    });

    it("is the same mark for the same answers", () => {
      const serial = () => {
        const { container, unmount } = render(<SummaryScreen {...full} reducedMotion />);
        const text = container.querySelector(".emb-serial").textContent;
        unmount();
        return text;
      };
      expect(serial()).toBe(serial());
    });

    it("is left out when a layer is missing, and never blocks Continue", () => {
      const onContinue = vi.fn();
      const { container } = render(<SummaryScreen {...base} onContinue={onContinue} reducedMotion={false} />);
      expect(container.querySelector(".emb-canvas")).toBeNull();
      const { container: withEmblem } = render(<SummaryScreen {...full} onContinue={onContinue} reducedMotion={false} />);
      expect(withEmblem.querySelector(".emb-canvas")).not.toBeNull();
      screen.getAllByRole("button", { name: "Enter the Life Path Engine" }).forEach((b) => {
        expect(b).toBeEnabled();
        fireEvent.click(b);
      });
      expect(onContinue).toHaveBeenCalledTimes(2);
    });
  });
});
