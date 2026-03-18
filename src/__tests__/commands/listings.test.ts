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
});
