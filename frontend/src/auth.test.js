import { describe, expect, it } from "vitest";
import { authGate } from "./auth";

describe("authGate", () => {
  it("lets everyone in when auth is off (keyless dev)", () => {
    expect(authGate({ enabled: false, loading: true, session: null })).toBe("app");
  });

  it("waits while the session is resolving", () => {
    expect(authGate({ enabled: true, loading: true, session: null })).toBe("loading");
  });

  it("asks a signed-out visitor to sign in", () => {
    expect(authGate({ enabled: true, loading: false, session: null })).toBe("signin");
  });

  it("opens the app for a signed-in user", () => {
    expect(authGate({ enabled: true, loading: false, session: { access_token: "t" } })).toBe("app");
  });
});
