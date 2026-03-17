import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerOrdersCommands } from "../../commands/orders.js";

describe("orders commands", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  // Mock SP client
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

  it("orders list outputs table by default", async () => {
    mockCallAPI.mockResolvedValueOnce({
      Orders: [
        {
          AmazonOrderId: "123-456-789",
          OrderStatus: "SHIPPED",
          PurchaseDate: "2024-01-01T00:00:00Z",
          NumberOfItemsShipped: 2,
          NumberOfItemsUnshipped: 0,
          OrderTotal: { Amount: "29.99", CurrencyCode: "USD" },
        },
      ],
    });

    const program = new Command();
    program.exitOverride();
    registerOrdersCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "orders", "list"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "getOrders" })
    );
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("orders list outputs JSON with --json flag", async () => {
    const orderList = [{ AmazonOrderId: "123-456-789", OrderStatus: "SHIPPED" }];
    mockCallAPI.mockResolvedValueOnce({ Orders: orderList });

    const program = new Command();
    program.exitOverride();
    registerOrdersCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "orders", "list", "--json"]);

    // The command outputs the extracted orderList array, not the full result
    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(orderList, null, 2));
  });

  it("orders get outputs JSON with --json flag", async () => {
    const order = { AmazonOrderId: "123-456-789", OrderStatus: "SHIPPED" };
    mockCallAPI.mockResolvedValueOnce(order);

    const program = new Command();
    program.exitOverride();
    registerOrdersCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "orders", "get", "--order", "123-456-789", "--json"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "getOrder" })
    );
    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(order, null, 2));
  });

  it("orders list handles API errors gracefully", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("API Error"));

    const program = new Command();
    program.exitOverride();
    registerOrdersCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "orders", "list"]);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});
