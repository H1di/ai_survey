import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import raw from "../motion/data/onet-field.json";
import { decodeField, groundingFor } from "../motion/onetField";
import FirstPathScreen from "./FirstPathScreen";

const field = decodeField(raw);
const riasecScores = { R: 13, I: 100, A: 88, S: 50, E: 63, C: 38 };
const top = groundingFor(field, riasecScores).shortlist[0];
const output = { id: "output_1", socCode: top.soc, jobTitle: top.title, directionId: top.directionId };
const base = { field, riasecScores, riasecCode: "IAE", output: null, onDone: () => {} };

describe("FirstPathScreen", () => {
  it("keeps the step copy", () => {
    render(<FirstPathScreen {...base} reducedMotion />);
    expect(screen.getByRole("heading", { name: "Building your first life path…" })).toBeInTheDocument();
    expect(screen.getByText("Matching your profile against the O*NET occupation set.")).toBeInTheDocument();
  });

  it("reduced motion, still waiting: the shortlist frame, no pick claimed, nothing to click", () => {
    const onDone = vi.fn();
    render(<FirstPathScreen {...base} onDone={onDone} reducedMotion />);
    expect(
      screen.getByRole("img", {
        name: new RegExp(`^${raw.occupations.length} occupations \\(ESCO × O\\*NET\\).*The pick is being made\\.`),
      })
    ).toBeInTheDocument();
    expect(screen.getByText("Weighing the shortlist")).toBeInTheDocument();
    // In the layout (no shift later) but hidden and inert until there is a result.
    const cta = screen.getByText("See your path");
    expect(cta).toBeDisabled();
    expect(cta).toHaveStyle({ visibility: "hidden" });
    expect(onDone).not.toHaveBeenCalled();
  });

  it("shows the O*NET attribution next to the O*NET-derived scene", () => {
    render(<FirstPathScreen {...base} reducedMotion />);
    expect(screen.getByText(field.attribution)).toBeInTheDocument();
  });

  it("reduced motion: hands over the moment the result arrives", () => {
    const onDone = vi.fn();
    const { rerender } = render(<FirstPathScreen {...base} onDone={onDone} reducedMotion />);
    rerender(<FirstPathScreen {...base} output={output} onDone={onDone} reducedMotion />);
    expect(onDone).toHaveBeenCalled();
    expect(screen.getByRole("img", { name: new RegExp(`The pick is ${top.title}\\.`) })).toBeInTheDocument();
  });

  it("with motion: the result enables See your path at once — the scene never gates it", () => {
    const onDone = vi.fn();
    const { rerender } = render(<FirstPathScreen {...base} onDone={onDone} reducedMotion={false} />);
    rerender(<FirstPathScreen {...base} output={output} onDone={onDone} reducedMotion={false} />);
    const cta = screen.getByRole("button", { name: "See your path" });
    expect(cta).toBeEnabled();
    fireEvent.click(cta);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("a result the map cannot place does not strand the user on the scene", () => {
    const onDone = vi.fn();
    const { rerender } = render(<FirstPathScreen {...base} onDone={onDone} reducedMotion={false} />);
    rerender(
      <FirstPathScreen {...base} output={{ ...output, socCode: null }} onDone={onDone} reducedMotion={false} />
    );
    expect(onDone).toHaveBeenCalled();
  });

  it("without the field it is the plain pulse, and still hands over on arrival", () => {
    const onDone = vi.fn();
    const { rerender } = render(<FirstPathScreen {...base} field={null} onDone={onDone} />);
    expect(screen.getByLabelText("Generating")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    rerender(<FirstPathScreen {...base} field={null} output={output} onDone={onDone} />);
    expect(onDone).toHaveBeenCalled();
  });

  it("coming back to the step with a result already made goes straight through", () => {
    const onDone = vi.fn();
    render(<FirstPathScreen {...base} output={output} onDone={onDone} reducedMotion={false} />);
    expect(onDone).toHaveBeenCalled();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
