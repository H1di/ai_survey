import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { usePlayOnce } from "./usePlayOnce";

function Probe({ duration, reducedMotion, restartKey }) {
  const { T, done } = usePlayOnce(duration, { reducedMotion, restartKey });
  return <output>{`${T}|${done}`}</output>;
}

describe("usePlayOnce", () => {
  it("starts at 0 and is not done while there is time to play", () => {
    render(<Probe duration={6} reducedMotion={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("0|false");
  });

  it("reduced motion: no clock — T is the end and the scene is done", () => {
    render(<Probe duration={6} reducedMotion />);
    expect(screen.getByRole("status")).toHaveTextContent("6|true");
  });

  it("an open-ended wait is never done, with or without motion", () => {
    const { rerender } = render(<Probe duration={Infinity} reducedMotion />);
    expect(screen.getByRole("status")).toHaveTextContent("0|false");
    rerender(<Probe duration={Infinity} reducedMotion={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("0|false");
    // The response lands: the end becomes known.
    rerender(<Probe duration={4} reducedMotion />);
    expect(screen.getByRole("status")).toHaveTextContent("4|true");
  });

  it("a new restartKey replays from 0", () => {
    const { rerender } = render(<Probe duration={3} reducedMotion={false} restartKey="a" />);
    rerender(<Probe duration={3} reducedMotion={false} restartKey="b" />);
    expect(screen.getByRole("status")).toHaveTextContent("0|false");
  });
});
