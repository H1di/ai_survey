import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Wordmark from "./Wordmark";

describe("Wordmark", () => {
  it("renders the product name in lower case, as the design draws it", () => {
    render(<Wordmark />);
    expect(screen.getByText("invector")).toBeInTheDocument();
  });

  it("defaults to the screen tone and accepts the hero tone", () => {
    const { container, rerender } = render(<Wordmark />);
    expect(container.firstChild).toHaveClass("wordmark--screen");
    rerender(<Wordmark tone="hero" />);
    expect(container.firstChild).toHaveClass("wordmark--hero");
  });
});
