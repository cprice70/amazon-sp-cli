import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  printJson,
  printSuccess,
  printError,
  printWarning,
  formatCurrency,
  colorState,
  printTable,
} from "../output.js";

describe("output", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("printJson outputs pretty JSON", () => {
    printJson({ key: "value", num: 42 });
    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify({ key: "value", num: 42 }, null, 2));
  });

  it("printSuccess calls console.log", () => {
    printSuccess("All good");
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const call = consoleSpy.mock.calls[0][0] as string;
    expect(call).toContain("All good");
  });

  it("printError calls console.error", () => {
    printError("Something broke");
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const call = consoleErrorSpy.mock.calls[0][0] as string;
    expect(call).toContain("Something broke");
  });

  it("printWarning calls console.warn", () => {
    printWarning("Watch out");
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    const call = consoleWarnSpy.mock.calls[0][0] as string;
    expect(call).toContain("Watch out");
  });

  it("formatCurrency uses the currency code when given", () => {
    expect(formatCurrency("29.99", "USD")).toBe("$29.99");
    expect(formatCurrency("29.99", "EUR")).toBe("€29.99");
    expect(formatCurrency("29.99", "GBP")).toBe("£29.99");
    expect(formatCurrency("2999", "JPY")).toBe("¥2,999");
  });

  it("formatCurrency falls back to a dollar sign for an unknown currency code", () => {
    expect(formatCurrency("5", "NOPE")).toBe("$5.00");
  });

  it("formatCurrency formats numbers correctly", () => {
    expect(formatCurrency(1.5)).toBe("$1.50");
    expect(formatCurrency(0)).toBe("$0.00");
    expect(formatCurrency(100)).toBe("$100.00");
    expect(formatCurrency(undefined)).toBe("$0.00");
    expect(formatCurrency("2.75")).toBe("$2.75");
  });

  it("colorState returns colored string for known states", () => {
    expect(colorState("SHIPPED")).toContain("SHIPPED");
    expect(colorState("PENDING")).toContain("PENDING");
    expect(colorState("CANCELED")).toContain("CANCELED");
    expect(colorState("UNKNOWN")).toBe("UNKNOWN");
  });

  it("printTable truncates cells past a column's max width with an ellipsis", () => {
    printTable(["Id", "Title"], [["1", "abcdefghijklmnopqrstuvwxyz"]], {
      maxWidths: [undefined, 10],
    });
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain("abcdefghi…");
    expect(output).not.toContain("abcdefghijk");
  });

  it("printTable leaves cells within the max width alone", () => {
    printTable(["Id", "Title"], [["1", "short"]], { maxWidths: [undefined, 10] });
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain("short");
    expect(output).not.toContain("…");
  });

  it("printTable outputs a table", () => {
    printTable(["Col A", "Col B"], [["val1", "val2"]]);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain("val1");
    expect(output).toContain("val2");
  });
});
