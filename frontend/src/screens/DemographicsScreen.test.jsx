import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DemographicsScreen from "./DemographicsScreen";

const questions = [
  {
    id: "sex",
    kind: "single",
    question: "What is your sex?",
    options: [
      { value: "female", label: "Female" },
      { value: "male", label: "Male" },
      { value: "other", label: "Other / non-binary" },
      { value: "prefer_not", label: "Prefer not to say" },
    ],
  },
  { id: "age", kind: "number", question: "How old are you?", placeholder: "e.g. 32" },
  { id: "country", kind: "text", question: "Which country are you currently based in?", placeholder: "Type your country" },
  { id: "city", kind: "text", question: "Which city are you based in?", placeholder: "Type your city" },
];

const base = {
  questions,
  drafts: {},
  onDraftChange: () => {},
  saved: {},
  busy: false,
  onSubmit: () => {},
};

describe("DemographicsScreen", () => {
  it("carries the step copy verbatim", () => {
    render(<DemographicsScreen {...base} />);
    expect(screen.getByText("step 1 · demographics")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "A little about you" })).toBeInTheDocument();
    expect(screen.getByText("Four quick questions — sex, age, country, city.")).toBeInTheDocument();
  });

  it("shows all four questions at once", () => {
    render(<DemographicsScreen {...base} />);
    questions.forEach((q) => expect(screen.getByText(q.question)).toBeInTheDocument());
    expect(screen.getByPlaceholderText("Type your city")).toBeInTheDocument();
    expect(screen.getByLabelText("Other / non-binary")).toBeInTheDocument();
  });

  it("reports drafts as they change", () => {
    const onDraftChange = vi.fn();
    render(<DemographicsScreen {...base} onDraftChange={onDraftChange} />);
    fireEvent.click(screen.getByLabelText("Male"));
    expect(onDraftChange).toHaveBeenCalledWith("sex", "male");
    fireEvent.change(screen.getByPlaceholderText("e.g. 32"), { target: { value: "32" } });
    expect(onDraftChange).toHaveBeenCalledWith("age", "32");
  });

  it("keeps the continue button locked until all four are answered", () => {
    const { rerender } = render(<DemographicsScreen {...base} />);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    rerender(
      <DemographicsScreen
        {...base}
        drafts={{ sex: "male", age: "32", country: "Ireland", city: "Dublin" }}
      />
    );
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("marks the chosen option as checked", () => {
    render(<DemographicsScreen {...base} drafts={{ sex: "female" }} />);
    expect(screen.getByLabelText("Female")).toBeChecked();
    expect(screen.getByLabelText("Male")).not.toBeChecked();
  });

  it("submits once", () => {
    const onSubmit = vi.fn();
    render(
      <DemographicsScreen
        {...base}
        drafts={{ sex: "male", age: "32", country: "Ireland", city: "Dublin" }}
        onSubmit={onSubmit}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
