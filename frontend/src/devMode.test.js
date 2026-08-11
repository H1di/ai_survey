import { describe, it, expect, beforeEach } from "vitest";
import { readTokenFromSearch, captureDevToken, getDevToken, isDevMode } from "./devMode";

describe("readTokenFromSearch", () => {
  it("pulls the dev token out of a query string", () => {
    expect(readTokenFromSearch("?dev=abc123")).toBe("abc123");
    expect(readTokenFromSearch("?foo=1&dev=abc123&bar=2")).toBe("abc123");
  });

  it("returns null when there is no usable token", () => {
    expect(readTokenFromSearch("")).toBe(null);
    expect(readTokenFromSearch("?foo=1")).toBe(null);
    expect(readTokenFromSearch("?dev=")).toBe(null);
  });
});

describe("captureDevToken", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("stores the token and strips it from the address bar", () => {
    window.history.replaceState({}, "", "/?dev=secret-token");

    captureDevToken();

    expect(getDevToken()).toBe("secret-token");
    expect(isDevMode()).toBe(true);
    expect(window.location.search).toBe("");
  });

  it("keeps other query parameters", () => {
    window.history.replaceState({}, "", "/?dev=secret-token&keep=1");

    captureDevToken();

    expect(window.location.search).toBe("?keep=1");
  });

  it("is inert without a token", () => {
    captureDevToken();

    expect(getDevToken()).toBe(null);
    expect(isDevMode()).toBe(false);
  });

  it("keeps a token captured earlier in the tab", () => {
    window.history.replaceState({}, "", "/?dev=secret-token");
    captureDevToken();
    window.history.replaceState({}, "", "/");

    captureDevToken();

    expect(getDevToken()).toBe("secret-token");
  });
});
