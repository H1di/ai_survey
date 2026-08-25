import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SplitChoice from "./SplitChoice";

const a = { key: "achievement", title: "Achievement", body: "Ability utilization and personal accomplishment in your work." };
const b = { key: "independence", title: "Independence", body: "Working on your own and making your own decisions." };

describe("SplitChoice", () => {
  it("renders both halves with their titles and blurbs", () => {
    render(<SplitChoice a={a} b={b} onChoose={() => {}} />);
    expect(screen.getByText("Achievement")).toBeInTheDocument();
    expect(screen.getByText("Working on your own and making your own decisions.")).toBeInTheDocument();
  });

  it("puts the divider label between them", () => {
    render(<SplitChoice a={a} b={b} onChoose={() => {}} />);
    expect(screen.getByText("or")).toBeInTheDocument();
  });

  it("reports the key of the half that was picked", () => {
    const onChoose = vi.fn();
    render(<SplitChoice a={a} b={b} onChoose={onChoose} />);
    fireEvent.click(screen.getByRole("button", { name: /Independence/ }));
    expect(onChoose).toHaveBeenCalledWith("independence");
  });

  it("goes inert while the answer is in flight", () => {
    render(<SplitChoice a={a} b={b} onChoose={() => {}} disabled />);
    screen.getAllByRole("button").forEach((button) => expect(button).toBeDisabled());
  });
});
