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

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "searchListingsItems",
        query: expect.objectContaining({ pageSize: 20 }),
      })
    );
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

  // ── listings get ─────────────────────────────────────────────────────────

  it("listings get outputs item detail by default", async () => {
    mockCallAPI.mockResolvedValueOnce({
      sku: "SKU1",
      summaries: [
        { marketplaceId: "ATVPDKIKX0DER", asin: "B001", itemName: "Widget", status: ["BUYABLE"] },
      ],
    });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "get", "--sku", "SKU1"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "getListingsItem",
        path: { sellerId: "SELLER123", sku: "SKU1" },
      })
    );
    // All field lines have 2-space indent
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("SKU1"));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("B001"));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Widget"));
  });

  it("listings get prints issues when present", async () => {
    mockCallAPI.mockResolvedValueOnce({
      sku: "SKU1",
      summaries: [
        { marketplaceId: "ATVPDKIKX0DER", asin: "B001", itemName: "Widget", status: ["BUYABLE"] },
      ],
      issues: [{ code: "ERR1", message: "Bad data", severity: "ERROR" }],
    });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "get", "--sku", "SKU1"]);

    // Issue line has 4 leading spaces: "    [ERROR] ERR1: Bad data"
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("[ERROR] ERR1: Bad data"));
  });

  it("listings get skips summary block when no matching marketplace", async () => {
    mockCallAPI.mockResolvedValueOnce({
      sku: "SKU1",
      summaries: [{ marketplaceId: "OTHER_MP" }],
    });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "get", "--sku", "SKU1"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("SKU1"));
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining("ASIN:"));
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining("Title:"));
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining("Status:"));
  });

  it("listings get outputs JSON with --json flag", async () => {
    const result = {
      sku: "SKU1",
      summaries: [
        { marketplaceId: "ATVPDKIKX0DER", asin: "B001", itemName: "Widget", status: ["BUYABLE"] },
      ],
    };
    mockCallAPI.mockResolvedValueOnce(result);

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "get", "--sku", "SKU1", "--json"]);

    // result is the full mock return value — not a sub-field
    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(result, null, 2));
  });

  it("listings get handles API errors gracefully", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("API Error"));

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "get", "--sku", "SKU1"]);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("listings get shows auth hint on 401 error", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("401 Unauthorized"));

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "get", "--sku", "SKU1"]);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("auth login")
    );
  });

  // ── listings delete ──────────────────────────────────────────────────────

  it("listings delete prints result status from API response", async () => {
    mockCallAPI.mockResolvedValueOnce({ status: "PURGED" });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "delete", "--sku", "SKU1"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "deleteListingsItem",
        path: { sellerId: "SELLER123", sku: "SKU1" },
      })
    );
    expect(consoleSpy).toHaveBeenCalledWith("Result: PURGED");
  });

  it("listings delete falls back to 'deleted' when response has no status field", async () => {
    mockCallAPI.mockResolvedValueOnce({});

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "delete", "--sku", "SKU1"]);

    expect(consoleSpy).toHaveBeenCalledWith("Result: deleted");
  });

  it("listings delete handles API errors gracefully", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("API Error"));

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "delete", "--sku", "SKU1"]);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("listings delete shows auth hint on 403 error", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("403 Forbidden"));

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "delete", "--sku", "SKU1"]);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("auth login")
    );
  });

  // ── listings patch ───────────────────────────────────────────────────────

  it("listings patch prints status and submission ID on success", async () => {
    mockCallAPI.mockResolvedValueOnce({ status: "ACCEPTED", submissionId: "SUB123" });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync([
      "node", "test", "listings", "patch",
      "--sku", "SKU1",
      "--body", '{"patches":[]}',
    ]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "patchListingsItem",
        path: { sellerId: "SELLER123", sku: "SKU1" },
        body: { patches: [] },
      })
    );
    expect(consoleSpy).toHaveBeenCalledWith("Status: ACCEPTED");
    expect(consoleSpy).toHaveBeenCalledWith("Submission ID: SUB123");
  });

  it("listings patch omits submission ID line when not in response", async () => {
    mockCallAPI.mockResolvedValueOnce({ status: "ACCEPTED" });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync([
      "node", "test", "listings", "patch",
      "--sku", "SKU1",
      "--body", '{"patches":[]}',
    ]);

    expect(consoleSpy).toHaveBeenCalledWith("Status: ACCEPTED");
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Submission ID")
    );
  });

  it("listings patch prints issues when present", async () => {
    mockCallAPI.mockResolvedValueOnce({
      status: "INVALID",
      issues: [{ code: "ERR1", message: "Bad", severity: "WARNING" }],
    });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync([
      "node", "test", "listings", "patch",
      "--sku", "SKU1",
      "--body", '{"patches":[]}',
    ]);

    // Issue line has 2 leading spaces (differs from `get` which uses 4)
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("[WARNING] ERR1: Bad"));
  });

  it("listings patch outputs JSON with --json flag", async () => {
    const result = { status: "ACCEPTED" };
    mockCallAPI.mockResolvedValueOnce(result);

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync([
      "node", "test", "listings", "patch",
      "--sku", "SKU1",
      "--body", '{"patches":[]}',
      "--json",
    ]);

    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(result, null, 2));
  });

  it("listings patch rejects invalid JSON body without calling API", async () => {
    // process.exit is mocked to throw here so execution halts after printError
    // (otherwise the mocked exit is a no-op and callAPI would be called with
    // parsedBody=undefined since the inner catch never assigned it)
    processExitSpy.mockImplementationOnce(() => {
      throw new Error("process.exit");
    });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    try {
      await program.parseAsync([
        "node", "test", "listings", "patch",
        "--sku", "SKU1",
        "--body", "not-json",
      ]);
    } catch {
      // absorb the thrown process.exit error
    }

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
    expect(mockCallAPI).not.toHaveBeenCalled();
  });

  it("listings patch handles API errors gracefully", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("API Error"));

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync([
      "node", "test", "listings", "patch",
      "--sku", "SKU1",
      "--body", '{"patches":[]}',
    ]);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("listings patch shows auth hint on 401 error", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("401 Unauthorized"));

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync([
      "node", "test", "listings", "patch",
      "--sku", "SKU1",
      "--body", '{"patches":[]}',
    ]);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("auth login")
    );
  });
});
