import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ScreenShell from "./ScreenShell";

describe("ScreenShell", () => {
  it("renders the wordmark, eyebrow, headline, sub-headline and body", () => {
    render(
      <ScreenShell eyebrow="step 1 · demographics" title="A little about you" sub="Four quick questions.">
        <p>body</p>
      </ScreenShell>
    );
    expect(screen.getByText("invector")).toBeInTheDocument();
    expect(screen.getByText("step 1 · demographics")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "A little about you" })).toBeInTheDocument();
    expect(screen.getByText("Four quick questions.")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("omits the optional slots when they are not given", () => {
    render(<ScreenShell title="Only a title"><p>body</p></ScreenShell>);
    expect(screen.queryByText("step 1 · demographics")).not.toBeInTheDocument();
    expect(document.querySelector(".screen-sub")).toBeNull();
  });

  it("selects the glow variant and the alignment", () => {
    const { container } = render(
      <ScreenShell glow="center" align="left" title="t"><p>body</p></ScreenShell>
    );
    expect(container.firstChild).toHaveClass("screen--glow-center");
    expect(container.firstChild).toHaveClass("screen--left");
  });

  it("renders a header slot above the eyebrow", () => {
    render(
      <ScreenShell headerSlot={<button type="button">← Back</button>} title="t">
        <p>body</p>
      </ScreenShell>
    );
    expect(screen.getByRole("button", { name: "← Back" })).toBeInTheDocument();
  });
});
