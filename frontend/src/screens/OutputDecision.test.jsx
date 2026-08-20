import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import OutputDecision from "./OutputDecision";

const output = {
  id: "output_1",
  orientedField: "Applied research",
  jobTitle: "Financial Manager",
  thesis: "Investigative and Artistic scores put you where questions are still open but the method is fixed.",
  valuesFit: { overall: 51 },
  onet: { salary: { annualMedian: 166570 }, outlook: { category: "Bright" } },
  whyThisFits: {
    personality: [{ point: "High openness" }, { point: "Moderate conscientiousness" }],
    interests: [{ point: "Investigative" }],
    values: [{ point: "Achievement first" }],
  },
};

const base = { output, busy: {}, onAccept: () => {}, onRegenerate: () => {}, onOpenDetails: () => {} };

describe("OutputDecision", () => {
  it("carries the section copy verbatim", () => {
    render(<OutputDecision {...base} />);
    expect(screen.getByText("your 1st output")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Applied research" })).toBeInTheDocument();
    expect(screen.getByText("oriented field")).toBeInTheDocument();
    expect(screen.getByText("Grounded in O*NET")).toBeInTheDocument();
    expect(screen.getByText("Traced to your answers")).toBeInTheDocument();
  });

  it("states the refine loop honestly — no per-parameter tuning exists", () => {
    render(<OutputDecision {...base} />);
    expect(
      screen.getByText(
        "Say Yes to accept (unlocks four advice blocks + a roadmap) or No to regenerate from a genuinely different field family."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes — accept this path" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "No — regenerate from a different field" })
    ).toBeInTheDocument();
  });

  it("shows the job with its US-flagged market line", () => {
    render(<OutputDecision {...base} />);
    expect(screen.getByText("Financial Manager")).toBeInTheDocument();
    expect(screen.getByText("$166,570/yr median (US) · outlook: Bright")).toBeInTheDocument();
  });

  it("opens the full trace from the third column", () => {
    const onOpenDetails = vi.fn();
    render(<OutputDecision {...base} onOpenDetails={onOpenDetails} />);
    fireEvent.click(screen.getByRole("button", { name: "See the full trace →" }));
    expect(onOpenDetails).toHaveBeenCalledWith(output);
  });

  it("accepts and regenerates", () => {
    const onAccept = vi.fn();
    const onRegenerate = vi.fn();
    render(<OutputDecision {...base} onAccept={onAccept} onRegenerate={onRegenerate} />);
    fireEvent.click(screen.getByRole("button", { name: "Yes — accept this path" }));
    fireEvent.click(screen.getByRole("button", { name: "No — regenerate from a different field" }));
    expect(onAccept).toHaveBeenCalled();
    expect(onRegenerate).toHaveBeenCalled();
  });

  it("shows the in-flight labels and locks both actions", () => {
    render(<OutputDecision {...base} busy={{ accept: true }} />);
    expect(screen.getByRole("button", { name: "Building next steps…" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "No — regenerate from a different field" })
    ).toBeDisabled();
  });

  it("falls back to a legacy free-text explanation rather than showing nothing", () => {
    render(
      <OutputDecision
        {...base}
        output={{
          ...output,
          whyThisFits: null,
          whyFit: "Your scores point at structured, analytical work.",
        }}
      />
    );
    expect(
      screen.getByText("Your scores point at structured, analytical work.")
    ).toBeInTheDocument();
  });

  it("survives a keyless output with no market data and no structured explanation", () => {
    render(<OutputDecision {...base} output={{ ...output, onet: {}, whyThisFits: null }} />);
    expect(screen.getByText("Financial Manager")).toBeInTheDocument();
    expect(screen.queryByText(/median \(US\)/)).not.toBeInTheDocument();
  });
});
