import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isAuthError, formatApiError, runCommand } from "../errors.js";

function spApiError(fields: Record<string, unknown>): Error {
  // Mirrors amazon-sp-api's CustomError: an Error with the response body's
  // fields (code, details, type) copied onto it.
  const err = new Error(String(fields.message ?? ""));
  return Object.assign(err, fields);
}

describe("formatApiError", () => {
  it("appends details when the SP-API error carries them", () => {
    const err = spApiError({
      code: "Unauthorized",
      message: "Access to requested resource is denied.",
      details: "The LWA secret token you provided has expired.",
    });
    expect(formatApiError(err)).toBe(
      "Access to requested resource is denied. (The LWA secret token you provided has expired.)"
    );
  });

  it("returns just the message when there are no details", () => {
    expect(formatApiError(new Error("boom"))).toBe("boom");
    expect(formatApiError(spApiError({ message: "boom", details: "" }))).toBe("boom");
  });

  it("stringifies non-Error values", () => {
    expect(formatApiError("plain string")).toBe("plain string");
  });
});

describe("isAuthError", () => {
  it("detects SP-API Unauthorized by error code even when the message does not say so", () => {
    const err = spApiError({ code: "Unauthorized", message: "Access to requested resource is denied." });
    expect(isAuthError(err)).toBe(true);
  });

  it("detects auth errors by message text", () => {
    expect(isAuthError(new Error("HTTP 403 Forbidden"))).toBe(true);
    expect(isAuthError(new Error("401 unauthorized"))).toBe(true);
  });

  it("is false for other errors and non-Errors", () => {
    expect(isAuthError(new Error("Request throttled"))).toBe(false);
    expect(isAuthError(spApiError({ code: "InvalidInput", message: "bad asin" }))).toBe(false);
    expect(isAuthError("nope")).toBe(false);
  });
});

describe("runCommand", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs the action and does not exit on success", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    await runCommand("list orders", action);
    expect(action).toHaveBeenCalledTimes(1);
    expect(processExitSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("prints a labeled error with details and exits 1 on failure", async () => {
    const err = spApiError({ message: "Access denied.", details: "Token expired." });
    await runCommand("list orders", async () => {
      throw err;
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to list orders: Access denied. (Token expired.)")
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("adds a re-authenticate hint for auth errors", async () => {
    await runCommand("list orders", async () => {
      throw spApiError({ code: "Unauthorized", message: "Access denied." });
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("auth login"));
  });

  it("does not add the hint for non-auth errors", async () => {
    await runCommand("list orders", async () => {
      throw new Error("Request throttled");
    });
    const output = consoleErrorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).not.toContain("auth login");
  });
});
