import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import AboutYouScreen from "./AboutYouScreen";
import PathScreen from "./PathScreen";

const QUESTIONS = [
  { id: "status", kind: "single", question: "Where are you right now?", options: [{ value: "school", label: "In school" }] },
  { id: "age", kind: "number", question: "How old are you?", min: 14, max: 80 },
  { id: "goal", kind: "text", question: "Goal?", maxLength: 300 },
];

describe("AboutYouScreen", () => {
  it("blocks submit until every question is answered", () => {
    const onSubmit = vi.fn();
    render(<AboutYouScreen questions={QUESTIONS} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Build my free path" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByText("Please answer this one.")).toHaveLength(3);
  });

  it("asks under-16s for parental consent before submitting", () => {
    const onSubmit = vi.fn();
    render(<AboutYouScreen questions={QUESTIONS} onSubmit={onSubmit} digitalAgeOfConsent={16} />);
    fireEvent.click(screen.getByRole("radio", { name: "In school" }));
    fireEvent.change(screen.getByLabelText("How old are you?"), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText("Goal?"), { target: { value: "Become a nurse" } });
    fireEvent.click(screen.getByRole("button", { name: "Build my free path" }));
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Build my free path" }));
    expect(onSubmit).toHaveBeenCalledWith({ status: "school", age: 15, goal: "Become a nurse" }, true);
  });
});

const course = (id, title) => ({
  id,
  title,
  provider: "Sample University Dublin",
  award: "Level 8 Honours Bachelor's Degree",
  nfqLevel: 8,
  kind: "undergrad",
  city: "dublin",
  mode: "full_time",
  durationMonths: 48,
  feeEur: 3000,
  totalFeeEur: 12000,
  startMonth: 9,
  skills: ["Science"],
  sample: true,
});

const SNAPSHOT = {
  sessionId: "s1",
  profile: { goal: "Help people recover from injuries", field: "healthcare" },
  case: { id: "first_course", label: "Choosing a first course" },
  path: {
    steps: [
      { id: "step_1", slotLabel: "Prepare", courseId: "a", course: course("a", "First Aid Basics"), basis: ["Field: Healthcare — your answer"], why: null },
      { id: "step_2", slotLabel: "Main programme", courseId: "b", course: course("b", "Physiotherapy"), basis: ["x"], why: "Leads straight to your goal." },
    ],
    summary: "A two-step path.",
    source: "rules",
    totals: { months: 52, fees: 12000, cities: ["dublin"] },
  },
  previousPaths: 0,
  profileChanged: false,
  rebuilds: { used: 3, free: 3, remaining: 0, unlimited: false },
  entitlements: { tests: false, rebuilds: false, extras: false },
  addons: [
    { id: "tests", label: "Tests", description: "d", priceEur: 5, available: true, owned: false },
    { id: "extras", label: "Extras", description: "d", priceEur: 5, available: false, owned: false },
  ],
  tests: null,
  guidance: null,
};
const META = {
  personalQuestions: [{ id: "field", kind: "single", options: [{ value: "healthcare", label: "Healthcare" }, { value: "unsure", label: "Not sure" }] }],
  digitalAgeOfConsent: 16,
  mockPayments: true,
};

describe("PathScreen", () => {
  it("renders every step, the goal and the traceable why", () => {
    render(<PathScreen snapshot={SNAPSHOT} meta={META} busy={false} error="" actions={{}} />);
    expect(screen.getByText("First Aid Basics")).toBeInTheDocument();
    expect(screen.getByText("Physiotherapy")).toBeInTheDocument();
    expect(screen.getByText("Leads straight to your goal.")).toBeInTheDocument();
    expect(screen.getByText("Help people recover from injuries")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Why this step" })[0]);
    expect(screen.getByText("Field: Healthcare — your answer")).toBeInTheDocument();
  });

  it("locks rebuild after the free three and labels mock unlocks honestly", () => {
    render(<PathScreen snapshot={SNAPSHOT} meta={META} busy={false} error="" actions={{}} />);
    expect(screen.getByRole("button", { name: "Free rebuilds used" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Unlock (test mode, no payment)" })).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });

  it("moves a step through the action handler", () => {
    const move = vi.fn().mockResolvedValue(true);
    render(<PathScreen snapshot={SNAPSHOT} meta={META} busy={false} error="" actions={{ move }} />);
    fireEvent.click(screen.getByRole("button", { name: "Move step 2 earlier" }));
    expect(move).toHaveBeenCalledWith("step_2", "up");
    expect(screen.getByRole("button", { name: "Move step 1 earlier" })).toBeDisabled();
  });

  it("shows a comparison table once two courses are picked", () => {
    render(<PathScreen snapshot={SNAPSHOT} meta={META} busy={false} error="" actions={{}} />);
    const buttons = screen.getAllByRole("button", { name: "Compare" });
    fireEvent.click(buttons[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Compare" })[0]);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Total fees")).toBeInTheDocument();
  });
});
