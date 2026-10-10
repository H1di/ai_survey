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
};

describe("ExperienceScreen", () => {
  it("carries the step copy verbatim", () => {
    render(<ExperienceScreen {...base} />);
    expect(screen.getByText("step 5 · experience")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Where should we start from?" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Paste or upload a CV — or answer seven career-journey questions if you don't have one."
      )
    ).toBeInTheDocument();
  });

  it("offers both intents as one either/or switch and reports the pick", () => {
    const onSelectIntent = vi.fn();
    render(<ExperienceScreen {...base} onSelectIntent={onSelectIntent} />);
    const group = screen.getByRole("radiogroup", { name: "Where should we start from?" });
    expect(group).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual([
      "Something completely new",
      "Use the skills I already have",
    ]);
    // Nothing is picked for the user.
    radios.forEach((r) => expect(r).toHaveAttribute("aria-checked", "false"));
    fireEvent.click(screen.getByRole("radio", { name: "Use the skills I already have" }));
    expect(onSelectIntent).toHaveBeenCalledWith("use_skills");
  });

  it("marks the chosen intent as checked", () => {
    render(<ExperienceScreen {...base} intent="new" />);
    expect(screen.getByRole("radio", { name: "Something completely new" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(
      screen.getByRole("radio", { name: "Use the skills I already have" })
    ).toHaveAttribute("aria-checked", "false");
  });

  it("hides both paths until an intent is chosen, then reveals them", () => {
    const { rerender } = render(<ExperienceScreen {...base} />);
    expect(screen.queryByRole("heading", { name: "With a CV" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Without a CV" })).not.toBeInTheDocument();
    expect(screen.getByText("Pick one to continue.")).toBeInTheDocument();
    rerender(<ExperienceScreen {...base} intent="new" />);
    expect(screen.getByRole("button", { name: /Paste its text/i })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "Without a CV" })).toBeInTheDocument();
    expect(screen.queryByText("Pick one to continue.")).not.toBeInTheDocument();
  });

  it("renders both halves of the split with the design's copy", () => {
    render(<ExperienceScreen {...base} intent="new" />);
    expect(screen.getByRole("heading", { name: "With a CV" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Without a CV" })).toBeInTheDocument();
    expect(screen.getByText('"What is your current or most recent role?"')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("e.g. shift manager at a cafe; student")
    ).toBeInTheDocument();
  });

  it("leaves the journey to the Without-a-CV half alone", () => {
    render(<ExperienceScreen {...base} intent="new" />);
    expect(screen.queryByRole("button", { name: /quick questions/i })).not.toBeInTheDocument();
  });

  it("submits the B-side answer", () => {
    const onSubmitJourney = vi.fn();
    render(<ExperienceScreen {...base} intent="new" journeyDraft="barista" onSubmitJourney={onSubmitJourney} />);
    fireEvent.submit(screen.getByPlaceholderText("e.g. shift manager at a cafe; student").closest("form"));
    expect(onSubmitJourney).toHaveBeenCalled();
  });

  it("confirms the B-side answer with the Next button", () => {
    const onSubmitJourney = vi.fn();
    render(
      <ExperienceScreen {...base} intent="new" journeyDraft="barista" onSubmitJourney={onSubmitJourney} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(onSubmitJourney).toHaveBeenCalled();
  });

  it("keeps Next disabled on an empty answer", () => {
    render(<ExperienceScreen {...base} intent="new" journeyDraft="   " />);
    expect(screen.getByRole("button", { name: "Next →" })).toBeDisabled();
  });

  it("labels the last question's confirm as Finish", () => {
    render(<ExperienceScreen {...base} intent="new" mode="journey" journeyIndex={6} journeyDraft="x" />);
    expect(screen.getByRole("button", { name: "Finish →" })).toBeEnabled();
  });

  it("steps back from the answer row only once the journey is running", () => {
    const onJourneyBack = vi.fn();
    const { rerender } = render(
      <ExperienceScreen {...base} intent="new" onJourneyBack={onJourneyBack} />
    );
    const inlineBack = () =>
      screen.getByRole("button", { name: "Next →" }).parentElement.querySelector("button");
    expect(inlineBack()).toBeDisabled();
    rerender(<ExperienceScreen {...base} intent="new" mode="journey" onJourneyBack={onJourneyBack} />);
    fireEvent.click(inlineBack());
    expect(onJourneyBack).toHaveBeenCalledTimes(1);
  });

  it("keeps the header Back alongside the inline one during the journey", () => {
    render(<ExperienceScreen {...base} intent="new" mode="journey" onJourneyBack={() => {}} />);
    expect(screen.getAllByRole("button", { name: "← Back" })).toHaveLength(2);
  });

  it("cancels a locked file drop so the browser cannot navigate away", () => {
    const onUploadFile = vi.fn();
    render(<ExperienceScreen {...base} intent="new" busy onUploadFile={onUploadFile} />);
    const zone = screen.getByRole("heading", { name: "With a CV" }).parentElement;
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
