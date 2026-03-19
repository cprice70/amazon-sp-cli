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

  // ── orders items ──────────────────────────────────────────────────────────

  it("orders items outputs table by default", async () => {
    mockCallAPI.mockResolvedValueOnce({
      OrderItems: [
        {
          ASIN: "B001234567",
          SellerSKU: "SKU1",
          Title: "Widget Pro",
          QuantityOrdered: 2,
          QuantityShipped: 1,
          ItemPrice: { Amount: "19.99", CurrencyCode: "USD" },
        },
      ],
    });

    const program = new Command();
    program.exitOverride();
    registerOrdersCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "orders", "items", "--order", "123-456-789"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "getOrderItems",
        path: { orderId: "123-456-789" },
      })
    );
    // Table renders ASIN, SKU, and the formatted price
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("B001234567"));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("SKU1"));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("19.99"));
  });

  it("orders items outputs JSON with --json flag", async () => {
    const orderItems = [
      {
        ASIN: "B001234567",
        SellerSKU: "SKU1",
        Title: "Widget Pro",
        QuantityOrdered: 2,
      },
    ];
    mockCallAPI.mockResolvedValueOnce({ OrderItems: orderItems });

    const program = new Command();
    program.exitOverride();
    registerOrdersCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "orders", "items", "--order", "123-456-789", "--json"]);

    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(orderItems, null, 2));
  });

  it("orders items prints message when no items found", async () => {
    mockCallAPI.mockResolvedValueOnce({ OrderItems: [] });

    const program = new Command();
    program.exitOverride();
    registerOrdersCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "orders", "items", "--order", "123-456-789"]);

    expect(consoleSpy).toHaveBeenCalledWith("No items found for this order.");
  });

  it("orders items handles API errors gracefully", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("API Error"));

    const program = new Command();
    program.exitOverride();
    registerOrdersCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "orders", "items", "--order", "123-456-789"]);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to get order items")
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("orders items shows auth hint on 401 error", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("401 Unauthorized"));

    const program = new Command();
    program.exitOverride();
    registerOrdersCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "orders", "items", "--order", "123-456-789"]);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("auth login")
    );
  });
});
