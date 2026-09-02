import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Wordmark from "./Wordmark";
import { HomeNavContext } from "./homeNav";

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

  it("stays plain text when no home handler is published", () => {
    const { container } = render(<Wordmark />);
    expect(container.firstChild.tagName).toBe("DIV");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("becomes the link home when a handler is published", () => {
    const onHome = vi.fn();
    render(
      <HomeNavContext.Provider value={onHome}>
        <Wordmark />
      </HomeNavContext.Provider>
    );
    fireEvent.click(screen.getByRole("button", { name: /invector/i }));
    expect(onHome).toHaveBeenCalledTimes(1);
  });
});
