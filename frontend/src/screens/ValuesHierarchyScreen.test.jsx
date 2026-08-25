import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ValuesHierarchyScreen from "./ValuesHierarchyScreen";

const ranking = [
  "achievement",
  "independence",
  "recognition",
  "relationships",
  "support",
  "working_conditions",
];

const base = { ranking, onReorder: () => {}, busy: false, onConfirm: () => {} };

describe("ValuesHierarchyScreen", () => {
  it("carries the step copy verbatim", () => {
    render(<ValuesHierarchyScreen {...base} />);
    expect(screen.getByText("step 4b · confirm your hierarchy")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your work values, ranked" })).toBeInTheDocument();
    expect(
      screen.getByText("The tournament result — reorder if something looks off, then confirm.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm hierarchy" })).toBeInTheDocument();
  });

  it("lists all six values with their human labels", () => {
    render(<ValuesHierarchyScreen {...base} />);
    expect(screen.getAllByRole("option")).toHaveLength(6);
    expect(screen.getByText("Working Conditions")).toBeInTheDocument();
  });

  it("confirms the hierarchy", () => {
    const onConfirm = vi.fn();
    render(<ValuesHierarchyScreen {...base} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm hierarchy" }));
    expect(onConfirm).toHaveBeenCalled();
  });
});
