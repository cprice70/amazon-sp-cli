import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerInventoryCommands } from "../../commands/inventory.js";

describe("inventory commands", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockCallAPI = vi.fn();
  const mockClient = { callAPI: mockCallAPI } as any;

  // Note: printError calls chalk.red(message). Chalk auto-detects non-TTY
  // environments (like Vitest) and sets level=0, returning plain strings.
  // No special chalk mocking needed for content assertions.

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

  // ── inventory list ────────────────────────────────────────────────────────

  it("inventory list outputs table by default", async () => {
    mockCallAPI.mockResolvedValueOnce({
      inventorySummaries: [
        {
          asin: "B001",
          fnSku: "FN001",
          sellerSku: "SKU1",
          condition: "NewItem",
          inventoryDetails: { fulfillableQuantity: 10 },
          totalQuantity: 10,
        },
      ],
    });

    const program = new Command();
    program.exitOverride();
    registerInventoryCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "inventory", "list"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "getInventorySummaries",
        query: expect.objectContaining({
          granularityType: "Marketplace",
          granularityId: "ATVPDKIKX0DER",
          marketplaceIds: ["ATVPDKIKX0DER"],
        }),
      })
    );
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("inventory list outputs JSON with --json flag", async () => {
    const inventorySummaries = [
      { asin: "B001", fnSku: "FN001", sellerSku: "SKU1", condition: "NewItem", totalQuantity: 3 },
    ];
    mockCallAPI.mockResolvedValueOnce({ inventorySummaries });

    const program = new Command();
    program.exitOverride();
    registerInventoryCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "inventory", "list", "--json"]);

    // summaries array is extracted from result — not the full result object
    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(inventorySummaries, null, 2));
  });

  it("inventory list prints message when no inventory found", async () => {
    mockCallAPI.mockResolvedValueOnce({ inventorySummaries: [] });

    const program = new Command();
    program.exitOverride();
    registerInventoryCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "inventory", "list"]);

    expect(consoleSpy).toHaveBeenCalledWith("No inventory found.");
  });
});
