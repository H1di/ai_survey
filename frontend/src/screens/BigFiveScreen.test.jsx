import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BigFiveScreen from "./BigFiveScreen";

const base = {
  item: { id: "mip_1", text: "I am the life of the party." },
  savedValue: null,
  index: 0,
  total: 20,
  busy: false,
  onAnswer: () => {},
  onBack: () => {},
  canGoBack: false,
};

describe("BigFiveScreen", () => {
  it("carries the instrument copy verbatim", () => {
    render(<BigFiveScreen {...base} />);
    expect(screen.getByText("step 2 · big five · item 1 of 20")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mini-IPIP-20" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "The fixed public-domain Mini-IPIP-20, rated 1–5, scored to OCEAN 0–100 plus Stability/Plasticity."
      )
    ).toBeInTheDocument();
  });

  it("quotes the item statement", () => {
    render(<BigFiveScreen {...base} />);
    expect(screen.getByText('"I am the life of the party."')).toBeInTheDocument();
  });

  it("uses the design's accurate/inaccurate anchors", () => {
    render(<BigFiveScreen {...base} />);
    ["Very inaccurate", "Moderately inaccurate", "Neither", "Moderately accurate", "Very accurate"]
      .forEach((label) => expect(screen.getByText(label)).toBeInTheDocument());
  });

  it("submits the chosen rating", () => {
    const onAnswer = vi.fn();
    render(<BigFiveScreen {...base} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole("button", { name: /Very accurate/ }));
    expect(onAnswer).toHaveBeenCalledWith(5);
  });

  it("offers Back only when there is somewhere to go", () => {
    const { rerender } = render(<BigFiveScreen {...base} />);
    expect(screen.queryByRole("button", { name: "← Back" })).not.toBeInTheDocument();
    rerender(<BigFiveScreen {...base} canGoBack />);
    expect(screen.getByRole("button", { name: "← Back" })).toBeInTheDocument();
  });
});
