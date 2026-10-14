import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerSellersCommands } from "../../commands/sellers.js";

describe("sellers commands", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockCallAPI = vi.fn();
  const mockClient = { callAPI: mockCallAPI } as any;

  const participations = [
    {
      marketplace: {
        id: "ATVPDKIKX0DER",
        name: "Amazon.com",
        countryCode: "US",
        defaultCurrencyCode: "USD",
      },
      participation: { isParticipating: true, hasSuspendedListings: false },
    },
    {
      marketplace: {
        id: "A2EUQ1WTGCTBG2",
        name: "Amazon.ca",
        countryCode: "CA",
        defaultCurrencyCode: "CAD",
      },
      participation: { isParticipating: false, hasSuspendedListings: true },
    },
  ];

  function program() {
    const p = new Command();
    p.exitOverride();
    registerSellersCommands(p, mockClient);
    return p;
  }

  function output() {
    return consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
  }

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
    mockCallAPI.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sellers participations lists marketplaces in a table", async () => {
    mockCallAPI.mockResolvedValueOnce(participations);

    await program().parseAsync(["node", "test", "sellers", "participations"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "getMarketplaceParticipations",
        endpoint: "sellers",
        options: { version: "v1" },
      })
    );
    const out = output();
    expect(out).toContain("ATVPDKIKX0DER");
    expect(out).toContain("Amazon.com");
    expect(out).toContain("US");
    expect(out).toContain("A2EUQ1WTGCTBG2");
    expect(out).toMatch(/yes/);
    expect(out).toMatch(/no/);
  });

  it("sellers participations outputs JSON with --json", async () => {
    mockCallAPI.mockResolvedValueOnce(participations);

    await program().parseAsync(["node", "test", "sellers", "participations", "--json"]);

    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(participations, null, 2));
  });

  it("sellers participations reports when there are none", async () => {
    mockCallAPI.mockResolvedValueOnce([]);

    await program().parseAsync(["node", "test", "sellers", "participations"]);

    expect(output()).toContain("No marketplace participations found.");
  });

  it("sellers account prints flattened fields", async () => {
    mockCallAPI.mockResolvedValueOnce({
      businessType: "PRIVATE_LIMITED",
      sellingPlan: "PROFESSIONAL",
      business: { name: "Acme Ltd", addressLine1: "1 Main St", countryCode: "US" },
      marketplaceParticipationList: participations,
    });

    await program().parseAsync(["node", "test", "sellers", "account"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "getAccount",
        endpoint: "sellers",
        options: { version: "v1" },
      })
    );
    const out = output();
    expect(out).toMatch(/businessType:\s+PRIVATE_LIMITED/);
    expect(out).toMatch(/business\.name:\s+Acme Ltd/);
    expect(out).toMatch(/marketplaceParticipationList:\s+2 entries/);
    expect(out).not.toContain("{");
  });

  it("sellers account handles API errors", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("boom"));

    await program().parseAsync(["node", "test", "sellers", "account"]);

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to get account"));
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});
