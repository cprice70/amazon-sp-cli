import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerListingsCommands } from "../../commands/listings.js";

describe("listings commands", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockCallAPI = vi.fn();
  const mockClient = { callAPI: mockCallAPI } as any;

  const resolveMarketplaceId = (_opts: { marketplace?: string }) => "ATVPDKIKX0DER";
  const resolveSellerId = (_opts: { seller?: string }) => "SELLER123";

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
    mockCallAPI.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── listings search ──────────────────────────────────────────────────────

  it("listings search outputs table by default", async () => {
    mockCallAPI.mockResolvedValueOnce({
      items: [
        {
          sku: "SKU1",
          summaries: [
            { marketplaceId: "ATVPDKIKX0DER", asin: "B001", itemName: "Widget", status: ["BUYABLE"] },
          ],
        },
      ],
    });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "search"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "searchListingsItems",
        query: expect.objectContaining({ pageSize: 20 }),
      })
    );
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("listings search outputs JSON with --json flag", async () => {
    const items = [
      {
        sku: "SKU1",
        summaries: [
          { marketplaceId: "ATVPDKIKX0DER", asin: "B001", itemName: "Widget", status: ["BUYABLE"] },
        ],
      },
    ];
    mockCallAPI.mockResolvedValueOnce({ items });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "search", "--json"]);

    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(items, null, 2));
  });

  it("listings search prints message when no items found", async () => {
    mockCallAPI.mockResolvedValueOnce({ items: [] });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "search"]);

    expect(consoleSpy).toHaveBeenCalledWith("No listings items found.");
  });

  it("listings search passes identifiers query when --sku is provided", async () => {
    mockCallAPI.mockResolvedValueOnce({ items: [] });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "search", "--sku", "SKU1"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ identifiers: ["SKU1"], identifiersType: "SKU" }),
      })
    );
    // pageSize must NOT appear when --sku is used
    expect(mockCallAPI).not.toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ pageSize: expect.anything() }),
      })
    );
  });

  it("listings search handles API errors gracefully", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("API Error"));

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "search"]);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("listings search shows auth hint on 401 error", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("401 Unauthorized"));

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "search"]);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("auth login")
    );
  });
});
