import { describe, it, expect } from "vitest";
import { isAuthError, formatApiError } from "../errors.js";

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
