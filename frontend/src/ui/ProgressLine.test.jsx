import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ProgressLine from "./ProgressLine";

const parts = (container) => ({
  fill: container.querySelector(".progress-line-fill"),
  dot: container.querySelector(".progress-line-dot"),
});

describe("ProgressLine", () => {
  it("is an accessible progressbar that says where you are", () => {
    render(<ProgressLine current={8} total={20} />);
    const bar = screen.getByRole("progressbar", { name: "Step progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "8");
    expect(bar).toHaveAttribute("aria-valuemin", "1");
    expect(bar).toHaveAttribute("aria-valuemax", "20");
    expect(bar).toHaveAttribute("aria-valuetext", "Question 8 of 20");
    expect(screen.getByText("Question 8 of 20")).toBeInTheDocument();
  });

  it("puts the dot mid-way through the current question, with ink up to it", () => {
    const { container } = render(<ProgressLine current={8} total={20} />);
    const { fill, dot } = parts(container);
    expect(fill.style.width).toBe("37.5%");
    expect(dot.style.left).toBe("37.5%");
  });

  it("keeps the first and last question off the ends", () => {
    const { container, rerender } = render(<ProgressLine current={1} total={4} />);
    expect(parts(container).dot.style.left).toBe("12.5%");
    rerender(<ProgressLine current={4} total={4} />);
    expect(parts(container).dot.style.left).toBe("87.5%");
  });

  it("counts answers in the answered variant", () => {
    const { container } = render(<ProgressLine current={2} total={4} variant="answered" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemin", "0");
    expect(screen.getByText("2 of 4 answered")).toBeInTheDocument();
    expect(parts(container).dot.style.left).toBe("50%");
  });

  it("clamps out-of-range input and tolerates an empty step", () => {
    const { container, rerender } = render(<ProgressLine current={30} total={20} />);
    expect(screen.getByText("Question 20 of 20")).toBeInTheDocument();
    expect(parts(container).dot.style.left).toBe("97.5%");
    rerender(<ProgressLine current={0} total={0} />);
    expect(parts(container).dot.style.left).toBe("0%");
  });
});
