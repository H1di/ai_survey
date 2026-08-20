import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RankList from "./RankList";

const items = [
  { id: "achievement", label: "Achievement" },
  { id: "independence", label: "Independence" },
  { id: "recognition", label: "Recognition" },
];

describe("RankList", () => {
  it("numbers the rows from one and shows the design's hint", () => {
    render(<RankList items={items} onReorder={() => {}} />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getAllByText("drag to reorder")).toHaveLength(3);
  });

  it("exposes rows as a listbox so a screen reader can work the order", () => {
    render(<RankList items={items} onReorder={() => {}} />);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("reorders with the arrow keys", () => {
    const onReorder = vi.fn();
    render(<RankList items={items} onReorder={onReorder} />);
    const row = screen.getAllByRole("option")[1];
    fireEvent.keyDown(row, { key: "ArrowUp" });
    expect(onReorder).toHaveBeenCalledWith(1, 0);
    fireEvent.keyDown(row, { key: "ArrowDown" });
    expect(onReorder).toHaveBeenCalledWith(1, 2);
  });

  it("jumps to the ends with Home and End", () => {
    const onReorder = vi.fn();
    render(<RankList items={items} onReorder={onReorder} />);
    const row = screen.getAllByRole("option")[2];
    fireEvent.keyDown(row, { key: "Home" });
    expect(onReorder).toHaveBeenCalledWith(2, 0);
    fireEvent.keyDown(row, { key: "End" });
    expect(onReorder).toHaveBeenCalledWith(2, 2);
  });

  it("reorders on drop", () => {
    const onReorder = vi.fn();
    render(<RankList items={items} onReorder={onReorder} />);
    const rows = screen.getAllByRole("option");
    fireEvent.dragStart(rows[0]);
    fireEvent.dragOver(rows[2]);
    fireEvent.drop(rows[2]);
    expect(onReorder).toHaveBeenCalledWith(0, 2);
  });

  it("ignores keys and drags while disabled", () => {
    const onReorder = vi.fn();
    render(<RankList items={items} onReorder={onReorder} disabled />);
    const rows = screen.getAllByRole("option");
    fireEvent.keyDown(rows[1], { key: "ArrowUp" });
    // The drag half of this test's name has to be exercised too, or a
    // regression that drops the guard from the drag handlers goes unseen.
    fireEvent.dragStart(rows[0]);
    fireEvent.dragOver(rows[2]);
    fireEvent.drop(rows[2]);
    expect(onReorder).not.toHaveBeenCalled();
  });
});
