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
    expect(screen.getByText("Invector")).toBeInTheDocument();
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

  it("draws the progress line and a backdrop behind the body when given", () => {
    const { container } = render(
      <ScreenShell
        title="t"
        progress={{ current: 3, total: 12 }}
        backdrop={<canvas className="backdrop-probe" aria-hidden="true" />}
      >
        <p>body</p>
      </ScreenShell>
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "Question 3 of 12");
    expect(container.firstChild).toHaveClass("screen--backdrop");
    const body = container.querySelector(".screen-body");
    expect(body).toHaveClass("screen-body--backdrop");
    expect(body.firstChild).toHaveClass("backdrop-probe");
  });

  it("adds neither without the props", () => {
    const { container } = render(<ScreenShell title="t"><p>body</p></ScreenShell>);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(container.firstChild).not.toHaveClass("screen--backdrop");
  });

  it("marks a question screen: no eyebrow, no title, no footer — only the header and the body", () => {
    const { container } = render(
      <ScreenShell question progress={{ current: 8, total: 20 }}>
        <h2>I like order.</h2>
      </ScreenShell>
    );
    expect(container.firstChild).toHaveClass("screen--question");
    expect(container.querySelector(".eyebrow")).toBeNull();
    expect(container.querySelector(".screen-title")).toBeNull();
    expect(container.querySelector(".screen-footer")).toBeNull();
    expect(screen.getByRole("heading", { name: "I like order." })).toBeInTheDocument();
  });

  it("is not a question screen by default", () => {
    const { container } = render(<ScreenShell title="t"><p>body</p></ScreenShell>);
    expect(container.firstChild).not.toHaveClass("screen--question");
  });
});
