import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RiasecResultScreen from "./RiasecResultScreen";

const base = {
  scores: { R: 13, I: 100, A: 88, S: 50, E: 63, C: 38 },
  code: "IAE",
  onContinue: () => {},
};

describe("RiasecResultScreen", () => {
  it("reduced motion: the settled result — the code, its names, every score", () => {
    const { container } = render(<RiasecResultScreen {...base} reducedMotion />);
    expect(screen.getByRole("heading", { name: "Your interest code" })).toBeInTheDocument();
    // The figure states the outcome, not the animation.
    expect(
      screen.getByRole("img", { name: /Interest code IAE: Investigative, Artistic, Enterprising/ })
    ).toBeInTheDocument();
    // Final frame: all three letters fully lit and their names fully typed.
    const letters = [...container.querySelectorAll(".rset-letter")];
    expect(letters.map((l) => l.textContent)).toEqual(["I", "A", "E"]);
    letters.forEach((l) => expect(l).toHaveStyle({ opacity: "1" }));
    expect([...container.querySelectorAll(".rset-cell-name")].map((n) => n.textContent)).toEqual([
      "Investigative",
      "Artistic",
      "Enterprising",
    ]);
    expect(container.querySelector(".rset-caption")).toHaveStyle({ opacity: "1" });
  });

  it("uses the stored code rather than re-deriving one", () => {
    render(<RiasecResultScreen {...base} code="AIE" reducedMotion />);
    expect(screen.getByRole("img", { name: /Interest code AIE/ })).toBeInTheDocument();
  });

  it("says so when the profile was estimated instead of measured", () => {
    render(<RiasecResultScreen {...base} inferred reducedMotion />);
    expect(screen.getByText(/Estimated from your personality answers/)).toBeInTheDocument();
  });

  it("Continue is live from the first frame, motion or not", () => {
    const onContinue = vi.fn();
    render(<RiasecResultScreen {...base} onContinue={onContinue} reducedMotion={false} />);
    const button = screen.getByRole("button", { name: "Continue to values" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
