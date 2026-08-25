import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StepRail from "./StepRail";

describe("StepRail", () => {
  it("renders the design's six labels in order", () => {
    render(<StepRail step="demographics" furthestStep="demographics" onNavigate={() => {}} />);
    const labels = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(labels).toEqual([
      "Demographics",
      "Big Five",
      "Interests",
      "Values",
      "Experience",
      "Summary",
    ]);
  });

  it("marks the current step and never makes it a button", () => {
    render(<StepRail step="riasec" furthestStep="riasec" onNavigate={() => {}} />);
    expect(screen.queryByRole("button", { name: "Interests" })).not.toBeInTheDocument();
    expect(screen.getByText("Interests").closest("li")).toHaveClass("step-rail-item--active");
  });

  it("makes already-reached steps clickable and leaves later ones inert", () => {
    render(<StepRail step="values" furthestStep="values" onNavigate={() => {}} />);
    expect(screen.getByRole("button", { name: "Big Five" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Summary" })).not.toBeInTheDocument();
  });

  it("reports the step the user picked", () => {
    const onNavigate = vi.fn();
    render(<StepRail step="values" furthestStep="values" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: "Big Five" }));
    expect(onNavigate).toHaveBeenCalledWith("big_five");
  });

  it("disables navigation while a jump is in flight", () => {
    render(<StepRail step="values" furthestStep="values" busy onNavigate={() => {}} />);
    expect(screen.getByRole("button", { name: "Big Five" })).toBeDisabled();
  });
});
