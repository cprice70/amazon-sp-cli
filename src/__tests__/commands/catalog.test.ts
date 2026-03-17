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
          summaries: [{ marketplaceId: "ATVPDKIKX0DER", itemName: "Test Widget", brand: "TestBrand" }],
        },
      ],
    });

    const program = new Command();
    program.exitOverride();
    registerCatalogCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "catalog", "search", "--query", "widget"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "searchCatalogItems" })
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

  it("catalog get outputs JSON with --json flag", async () => {
    const item = { asin: "B001234567", summaries: [] };
    mockCallAPI.mockResolvedValueOnce(item);

    const program = new Command();
    program.exitOverride();
    registerCatalogCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "catalog", "get", "--asin", "B001234567", "--json"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "getCatalogItem" })
    );
    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(item, null, 2));
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
