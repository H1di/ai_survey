import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ConfirmDialog from "./ConfirmDialog";

const props = {
  eyebrow: "leave the assessment",
  title: "Start over from the beginning?",
  body: "Your answers are dropped.",
  confirmLabel: "Yes, start over",
  cancelLabel: "Stay here",
};

describe("ConfirmDialog", () => {
  it("renders the question and both answers", () => {
    render(<ConfirmDialog {...props} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole("alertdialog")).toHaveAccessibleName(props.title);
    expect(screen.getByText(props.eyebrow)).toBeInTheDocument();
    expect(screen.getByText(props.body)).toBeInTheDocument();
  });

  it("gives focus to cancel, so a stray Enter never confirms", () => {
    render(<ConfirmDialog {...props} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole("button", { name: props.cancelLabel })).toHaveFocus();
  });

  it("reports confirm and cancel separately", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog {...props} onConfirm={onConfirm} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: props.cancelLabel }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: props.confirmLabel }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels on Escape and on a backdrop click, but not from inside the card", () => {
    const onCancel = vi.fn();
    const { container } = render(
      <ConfirmDialog {...props} onConfirm={() => {}} onCancel={onCancel} />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.mouseDown(screen.getByRole("alertdialog"));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.mouseDown(container.querySelector(".confirm-overlay"));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
