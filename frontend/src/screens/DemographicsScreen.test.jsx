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
  it("is a question screen: its own heading, no eyebrow, no instrument sub-headline, no footer", () => {
    const { container } = render(<DemographicsScreen {...base} footer={<p>rail</p>} />);
    expect(container.querySelector(".screen")).toHaveClass("screen--question");
    expect(screen.getByRole("heading", { name: "A little about you" })).toBeInTheDocument();
    expect(screen.queryByText("step 1 · demographics")).not.toBeInTheDocument();
    expect(screen.queryByText("Four quick questions — sex, age, country, city.")).not.toBeInTheDocument();
    expect(container.querySelector(".screen-footer")).toBeNull();
  });

  it("names every text field by its question", () => {
    render(<DemographicsScreen {...base} />);
    expect(screen.getByRole("textbox", { name: "Which city are you based in?" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "How old are you?" })).toBeInTheDocument();
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

  it("counts filled answers on the progress line and in the graph", () => {
    const { container } = render(
      <DemographicsScreen {...base} drafts={{ sex: "female", age: "30", city: "  " }} reducedMotion />
    );
    const bar = screen.getByRole("progressbar", { name: "Step progress" });
    expect(bar).toHaveAttribute("aria-valuetext", "2 of 4 answered");
    expect(screen.getByText("2 of 4 answered")).toBeInTheDocument();
    expect(container.querySelector("canvas.mind-graph")).toHaveAttribute("data-answered", "2");
  });
});
