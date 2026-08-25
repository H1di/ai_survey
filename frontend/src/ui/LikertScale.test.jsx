import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import LikertScale from "./LikertScale";

const anchors = [
  { value: 1, label: "Very inaccurate" },
  { value: 2, label: "Moderately inaccurate" },
  { value: 3, label: "Neither" },
  { value: 4, label: "Moderately accurate" },
  { value: 5, label: "Very accurate" },
];

describe("LikertScale", () => {
  it("renders one real button per anchor", () => {
    render(<LikertScale anchors={anchors} onSelect={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(5);
    expect(screen.getByRole("button", { name: /Very accurate/ })).toBeInTheDocument();
  });

  it("marks the saved answer as pressed", () => {
    render(<LikertScale anchors={anchors} value={4} onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /Moderately accurate/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: /Neither/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("reports the value that was picked", () => {
    const onSelect = vi.fn();
    render(<LikertScale anchors={anchors} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Neither/ }));
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("goes inert while an answer is in flight", () => {
    render(<LikertScale anchors={anchors} onSelect={() => {}} disabled />);
    screen.getAllByRole("button").forEach((b) => expect(b).toBeDisabled());
  });
});
