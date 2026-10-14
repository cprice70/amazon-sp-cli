import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerCatalogCommands } from "../../commands/catalog.js";

describe("catalog commands", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockCallAPI = vi.fn();
  const mockClient = { callAPI: mockCallAPI } as any;

  const resolveMarketplaceId = (_opts: { marketplace?: string }) => "ATVPDKIKX0DER";

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
    mockCallAPI.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("catalog search outputs table by default", async () => {
    mockCallAPI.mockResolvedValueOnce({
      items: [
        {
          asin: "B001234567",
          summaries: [
            { marketplaceId: "ATVPDKIKX0DER", itemName: "Test Widget", brand: "TestBrand" },
          ],
        },
      ],
    });

    const program = new Command();
    program.exitOverride();
    registerCatalogCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "catalog", "search", "--query", "widget"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "searchCatalogItems",
        options: { version: "2022-04-01" },
      })
    );
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("catalog search outputs JSON with --json flag", async () => {
    const items = [{ asin: "B001234567", summaries: [] }];
    mockCallAPI.mockResolvedValueOnce({ items });

    const program = new Command();
    program.exitOverride();
    registerCatalogCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "catalog", "search", "--query", "widget", "--json"]);

    // The command outputs the extracted items array, not the full result
    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(items, null, 2));
  });

  it("catalog get prints a labeled summary for the requested marketplace", async () => {
    mockCallAPI.mockResolvedValueOnce({
      asin: "B001234567",
      summaries: [
        { marketplaceId: "OTHER", itemName: "Wrong Market", brand: "Nope" },
        {
          marketplaceId: "ATVPDKIKX0DER",
          itemName: "Blue Widget",
          brand: "Acme",
          manufacturer: "Acme Corp",
          productType: "WIDGET",
          websiteDisplayGroupName: "Home & Kitchen",
          modelNumber: "BW-1",
        },
      ],
      identifiers: [
        {
          marketplaceId: "ATVPDKIKX0DER",
          identifiers: [{ identifierType: "UPC", identifier: "012345678905" }],
        },
      ],
      salesRanks: [
        {
          marketplaceId: "ATVPDKIKX0DER",
          displayGroupRanks: [{ title: "Home & Kitchen", rank: 1234 }],
        },
      ],
    });

    const program = new Command();
    program.exitOverride();
    registerCatalogCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "catalog", "get", "--asin", "B001234567"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          includedData: expect.arrayContaining(["summaries", "identifiers", "salesRanks"]),
        }),
      })
    );
    const output = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(output).toMatch(/ASIN:\s+B001234567/);
    expect(output).toMatch(/Title:\s+Blue Widget/);
    expect(output).toMatch(/Brand:\s+Acme/);
    expect(output).toMatch(/Product Type:\s+WIDGET/);
    expect(output).toMatch(/UPC:\s+012345678905/);
    expect(output).toMatch(/Home & Kitchen.*#1,234/);
    expect(output).not.toContain("Wrong Market");
    expect(output).toContain("--json");
    expect(output).not.toContain("{");
  });

  it("catalog search truncates long titles in the table", async () => {
    const longTitle = "X".repeat(150);
    mockCallAPI.mockResolvedValueOnce({
      items: [{ asin: "B0", summaries: [{ marketplaceId: "ATVPDKIKX0DER", itemName: longTitle }] }],
    });

    const program = new Command();
    program.exitOverride();
    registerCatalogCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "catalog", "search", "--query", "x"]);

    const output = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(output).toContain("…");
    expect(output).not.toContain(longTitle);
  });

  it("catalog get outputs JSON with --json flag", async () => {
    const item = { asin: "B001234567", summaries: [] };
    mockCallAPI.mockResolvedValueOnce(item);

    const program = new Command();
    program.exitOverride();
    registerCatalogCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "catalog", "get", "--asin", "B001234567", "--json"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "getCatalogItem", options: { version: "2022-04-01" } })
    );
    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(item, null, 2));
  });

  it("catalog search --all follows pagination.nextToken with pageToken", async () => {
    mockCallAPI
      .mockResolvedValueOnce({ items: [{ asin: "B1" }], pagination: { nextToken: "p1" } })
      .mockResolvedValueOnce({ items: [{ asin: "B2" }] });

    const program = new Command();
    program.exitOverride();
    registerCatalogCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync([
      "node",
      "test",
      "catalog",
      "search",
      "--query",
      "widget",
      "--all",
      "--json",
    ]);

    expect(mockCallAPI).toHaveBeenCalledTimes(2);
    expect(mockCallAPI).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ pageToken: "p1" }) })
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      JSON.stringify([{ asin: "B1" }, { asin: "B2" }], null, 2)
    );
  });

  it("catalog search --limit sets pageSize capped at 20", async () => {
    mockCallAPI.mockResolvedValueOnce({ items: [] });

    const program = new Command();
    program.exitOverride();
    registerCatalogCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync([
      "node",
      "test",
      "catalog",
      "search",
      "--query",
      "widget",
      "--limit",
      "50",
    ]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ pageSize: 20 }) })
    );
  });

  it("catalog search handles API errors gracefully", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("API Error"));

    const program = new Command();
    program.exitOverride();
    registerCatalogCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "catalog", "search", "--query", "widget"]);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});
