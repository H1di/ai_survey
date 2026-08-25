import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EntryScreen from "./EntryScreen";

const base = {
  value: "",
  onChange: () => {},
  onStart: () => {},
  busy: false,
  error: "",
  reducedMotion: true,
  onOpenInfo: () => {},
};

describe("EntryScreen", () => {
  it("renders the headline with the last word set apart in gold", () => {
    render(<EntryScreen {...base} />);
    const heading = screen.getByRole("heading", { level: 1 });
    // The design breaks the line four ways, and <br> contributes no whitespace
    // to textContent — assert the fragments, not one flattened sentence.
    ["What would you do", "if you knew you", "would definitely"].forEach((fragment) =>
      expect(heading).toHaveTextContent(fragment)
    );
    expect(heading.querySelector(".hero-accent")).toHaveTextContent("succeed?");
  });

  it("carries the design's CTA and disclaimer verbatim", () => {
    render(<EntryScreen {...base} value="anything" />);
    expect(screen.getByRole("button", { name: "Start the assessment" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "This is a playful exploratory tool. Because of its simplified structure, it is not fully reliable."
      )
    ).toBeInTheDocument();
  });

  it("keeps the O*NET badge and the exact licence sentence", () => {
    render(<EntryScreen {...base} />);
    expect(screen.getByAltText("O*NET in-it")).toBeInTheDocument();
    expect(
      screen.getByText(/O\*NET® is a trademark of USDOL\/ETA\./)
    ).toBeInTheDocument();
  });

  it("blocks the CTA until something is written and while starting", () => {
    const { rerender } = render(<EntryScreen {...base} />);
    expect(screen.getByRole("button", { name: "Start the assessment" })).toBeDisabled();
    rerender(<EntryScreen {...base} value="   " />);
    expect(screen.getByRole("button", { name: "Start the assessment" })).toBeDisabled();
    rerender(<EntryScreen {...base} value="build things" busy />);
    expect(screen.getByRole("button", { name: "Entering…" })).toBeDisabled();
  });

  it("caps the answer at 500 characters", () => {
    render(<EntryScreen {...base} />);
    expect(screen.getByPlaceholderText("Write your honest answer")).toHaveAttribute("maxlength", "500");
  });

  it("opens the methodology panels from the nav", () => {
    const onOpenInfo = vi.fn();
    render(<EntryScreen {...base} onOpenInfo={onOpenInfo} />);
    fireEvent.click(screen.getByRole("button", { name: "how it works" }));
    expect(onOpenInfo).toHaveBeenCalledWith("how-it-works");
    fireEvent.click(screen.getByRole("button", { name: "the engine" }));
    expect(onOpenInfo).toHaveBeenCalledWith("the-engine");
    expect(screen.getByRole("link", { name: "github" })).toHaveAttribute("href");
  });

  it("starts the assessment on click", () => {
    const onStart = vi.fn();
    render(<EntryScreen {...base} value="build things" onStart={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: "Start the assessment" }));
    expect(onStart).toHaveBeenCalled();
  });
});
