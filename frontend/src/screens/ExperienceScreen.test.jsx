import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ExperienceScreen from "./ExperienceScreen";

const base = {
  mode: "choice",
  intent: null,
  intentBusy: false,
  onSelectIntent: () => {},
  cvDraft: "",
  onCvDraftChange: () => {},
  onSubmitCvText: () => {},
  onUploadFile: () => {},
  uploadFormats: [".pdf", ".docx", ".html", ".txt", ".pptx"],
  busy: false,
  journeyQuestion: {
    id: "cj_role",
    question: "What is your current or most recent role?",
    placeholder: "e.g. shift manager at a cafe; student",
  },
  journeyIndex: 1,
  journeyTotal: 7,
  journeyDraft: "",
  onJourneyDraftChange: () => {},
  onSubmitJourney: () => {},
  onStartJourney: () => {},
};

describe("ExperienceScreen", () => {
  it("carries the step copy verbatim", () => {
    render(<ExperienceScreen {...base} />);
    expect(screen.getByText("step 5 · experience")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Where should we start from?" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Paste or upload a CV (.pdf/.docx/.html/.txt/.pptx, max 5 MB) — or answer seven career-journey questions if you don't have one."
      )
    ).toBeInTheDocument();
  });

  it("offers both intents and reports the pick", () => {
    const onSelectIntent = vi.fn();
    render(<ExperienceScreen {...base} onSelectIntent={onSelectIntent} />);
    fireEvent.click(screen.getByRole("button", { name: "Use the skills I already have" }));
    expect(onSelectIntent).toHaveBeenCalledWith("use_skills");
  });

  it("locks both paths until an intent is chosen", () => {
    const { rerender } = render(<ExperienceScreen {...base} />);
    expect(screen.getByRole("button", { name: /Paste its text/i })).toBeDisabled();
    rerender(<ExperienceScreen {...base} intent="new" />);
    expect(screen.getByRole("button", { name: /Paste its text/i })).toBeEnabled();
  });

  it("renders both halves of the split with the design's copy", () => {
    render(<ExperienceScreen {...base} intent="new" />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText('"What is your current or most recent role?"')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("e.g. shift manager at a cafe; student")
    ).toBeInTheDocument();
  });

  it("submits the B-side answer", () => {
    const onSubmitJourney = vi.fn();
    render(<ExperienceScreen {...base} intent="new" journeyDraft="barista" onSubmitJourney={onSubmitJourney} />);
    fireEvent.submit(screen.getByPlaceholderText("e.g. shift manager at a cafe; student").closest("form"));
    expect(onSubmitJourney).toHaveBeenCalled();
  });

  it("cancels a locked file drop so the browser cannot navigate away", () => {
    const onUploadFile = vi.fn();
    render(<ExperienceScreen {...base} onUploadFile={onUploadFile} />);
    const zone = screen.getByText("A").parentElement;
    // fireEvent returns false when a handler called preventDefault on a
    // cancelable event — which is the whole point here.
    expect(fireEvent.dragOver(zone)).toBe(false);
    expect(fireEvent.drop(zone)).toBe(false);
    expect(onUploadFile).not.toHaveBeenCalled();
  });

  it("shows the paste view when the mode says so", () => {
    render(<ExperienceScreen {...base} intent="new" mode="paste" cvDraft="my cv" />);
    expect(
      screen.getByPlaceholderText("Paste the text of your CV or a summary of your experience")
    ).toHaveValue("my cv");
    expect(screen.getByRole("button", { name: "Analyse my CV" })).toBeEnabled();
  });

  it("counts the journey questions in the eyebrow once they are running", () => {
    render(<ExperienceScreen {...base} intent="new" mode="journey" />);
    expect(screen.getByText("step 5 · experience · question 2 of 7")).toBeInTheDocument();
  });
});
