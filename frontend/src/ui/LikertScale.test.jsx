import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import LikertScale, { PICK_HOLD_MS } from "./LikertScale";

afterEach(() => vi.useRealTimers());

const anchors = [
  { value: 1, label: "Very inaccurate" },
  { value: 2, label: "Moderately inaccurate" },
  { value: 3, label: "Neither" },
  { value: 4, label: "Moderately accurate" },
  { value: 5, label: "Very accurate" },
];
const ends = { low: "disagree", high: "agree" };

const caption = (container) => container.querySelector(".likert-caption").textContent;

describe("LikertScale", () => {
  it("renders one real button per anchor, named by its full anchor", () => {
    render(<LikertScale anchors={anchors} onSelect={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(5);
    anchors.forEach((a) =>
      expect(screen.getByRole("button", { name: a.label })).toBeInTheDocument()
    );
  });

  it("is one named group, with the ends written out but not announced twice", () => {
    const { container } = render(
      <LikertScale anchors={anchors} ends={ends} label="How accurately does this describe you?" onSelect={() => {}} />
    );
    expect(screen.getByRole("group", { name: "How accurately does this describe you?" })).toBeInTheDocument();
    const shown = [...container.querySelectorAll(".likert-end")];
    expect(shown.map((e) => e.textContent)).toEqual(["disagree", "agree"]);
    shown.forEach((e) => expect(e).toHaveAttribute("aria-hidden", "true"));
  });

  it("does not print the five anchors permanently", () => {
    const { container } = render(<LikertScale anchors={anchors} ends={ends} onSelect={() => {}} />);
    expect(caption(container)).toBe("");
    anchors.forEach((a) => expect(screen.queryByText(a.label)).not.toBeInTheDocument());
  });

  it("names the hovered, focused or chosen point once, under the scale", () => {
    const { container, rerender } = render(<LikertScale anchors={anchors} onSelect={() => {}} />);
    const option = screen.getByRole("button", { name: "Moderately accurate" });
    fireEvent.mouseEnter(option);
    expect(caption(container)).toBe("Moderately accurate");
    fireEvent.mouseLeave(option);
    expect(caption(container)).toBe("");
    fireEvent.focus(screen.getByRole("button", { name: "Neither" }));
    expect(caption(container)).toBe("Neither");
    fireEvent.blur(screen.getByRole("button", { name: "Neither" }));
    rerender(<LikertScale anchors={anchors} value={5} onSelect={() => {}} />);
    expect(caption(container)).toBe("Very accurate");
  });

  it("marks the saved answer as pressed", () => {
    render(<LikertScale anchors={anchors} value={4} onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "Moderately accurate" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Neither" })).toHaveAttribute("aria-pressed", "false");
  });

  it("reports the value that was picked and fills it at once, swelling", () => {
    const onSelect = vi.fn();
    render(<LikertScale anchors={anchors} onSelect={onSelect} />);
    const option = screen.getByRole("button", { name: "Neither" });
    fireEvent.click(option);
    expect(onSelect).toHaveBeenCalledWith(3);
    expect(option).toHaveAttribute("aria-pressed", "true");
    expect(option).toHaveClass("likert-option--picked");
  });

  it("a saved answer shown again is filled without the swell", () => {
    render(<LikertScale anchors={anchors} value={2} onSelect={() => {}} />);
    const option = screen.getByRole("button", { name: "Moderately inaccurate" });
    expect(option).toHaveClass("likert-option--on");
    expect(option).not.toHaveClass("likert-option--picked");
  });

  it("drops an in-flight pick that did not save, falling back to the saved value", () => {
    const { rerender } = render(<LikertScale anchors={anchors} value={1} onSelect={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Very accurate" }));
    rerender(<LikertScale anchors={anchors} value={1} onSelect={() => {}} disabled />);
    expect(screen.getByRole("button", { name: "Very accurate" })).toHaveAttribute("aria-pressed", "true");
    rerender(<LikertScale anchors={anchors} value={1} onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "Very accurate" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Very inaccurate" })).toHaveAttribute("aria-pressed", "true");
  });

  it("holds a saved pick on the next item for the settle, then clears it — the new item stays live", () => {
    vi.useFakeTimers();
    const props = { anchors, onSelect: () => {} };
    const { rerender, container } = render(<LikertScale {...props} itemKey="q1" />);
    fireEvent.click(screen.getByRole("button", { name: "Moderately accurate" }));
    rerender(<LikertScale {...props} itemKey="q1" value={null} disabled />);
    // The answer saved: the next item arrives and the scale is live again.
    rerender(<LikertScale {...props} itemKey="q2" value={null} />);
    const held = screen.getByRole("button", { name: "Moderately accurate" });
    expect(held).toHaveClass("likert-option--on");
    // Announced state is the new item's own (unanswered).
    expect(held).toHaveAttribute("aria-pressed", "false");
    screen.getAllByRole("button").forEach((b) => expect(b).toBeEnabled());
    act(() => {
      vi.advanceTimersByTime(PICK_HOLD_MS + 10);
    });
    expect(container.querySelector(".likert-option--on")).toBeNull();
  });

  it("walks the rings with the arrow keys, Home and End", () => {
    render(<LikertScale anchors={anchors} onSelect={() => {}} />);
    const neither = screen.getByRole("button", { name: "Neither" });
    neither.focus();
    fireEvent.keyDown(neither, { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: "Moderately accurate" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement, { key: "ArrowLeft" });
    fireEvent.keyDown(document.activeElement, { key: "ArrowLeft" });
    expect(screen.getByRole("button", { name: "Moderately inaccurate" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement, { key: "End" });
    expect(screen.getByRole("button", { name: "Very accurate" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement, { key: "Home" });
    expect(screen.getByRole("button", { name: "Very inaccurate" })).toHaveFocus();
  });

  it("goes inert while an answer is in flight", () => {
    render(<LikertScale anchors={anchors} onSelect={() => {}} disabled />);
    screen.getAllByRole("button").forEach((b) => expect(b).toBeDisabled());
  });
});
