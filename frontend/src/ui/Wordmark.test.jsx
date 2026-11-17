import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Wordmark from "./Wordmark";
import { HomeNavContext } from "./homeNav";

describe("Wordmark", () => {
  it("names the product for assistive tech; the drawn logo is decorative", () => {
    const { container } = render(<Wordmark />);
    expect(screen.getByText("Invector")).toHaveClass("sr-only");
    expect(container.querySelectorAll('[aria-hidden="true"] svg')).toHaveLength(2);
  });

  it("draws the stacked lockup in the hero tone", () => {
    const { container } = render(<Wordmark tone="hero" />);
    expect(container.querySelector(".wordmark-lockup svg")).not.toBeNull();
    expect(container.querySelector(".wordmark-mark")).toBeNull();
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
