import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SignInScreen from "./SignInScreen";

const setup = (props = {}) =>
  render(
    <SignInScreen
      onMagicLink={vi.fn().mockResolvedValue()}
      onGoogle={vi.fn().mockResolvedValue()}
      reducedMotion
      {...props}
    />
  );

describe("SignInScreen", () => {
  it("keeps the magic-link button disabled until the email looks valid", () => {
    setup();
    const send = screen.getByRole("button", { name: "Email me a sign-in link" });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "not-an-email" } });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    expect(send).toBeEnabled();
  });

  it("sends the trimmed email and confirms where the link went", async () => {
    const onMagicLink = vi.fn().mockResolvedValue();
    setup({ onMagicLink });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "  ada@example.com " } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    expect(await screen.findByRole("status")).toHaveTextContent("ada@example.com");
    expect(onMagicLink).toHaveBeenCalledWith("ada@example.com");
  });

  it("shows the provider's error and stays on the form", async () => {
    setup({ onGoogle: vi.fn().mockRejectedValue(new Error("Provider is not enabled")) });
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Provider is not enabled");
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("keeps the O*NET attribution the entry screen carries", () => {
    setup();
    expect(screen.getByText(/O\*NET/, { selector: "p, span, small" })).toBeInTheDocument();
  });
});
