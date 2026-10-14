import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerFinancesCommands } from "../../commands/finances.js";

describe("finances commands", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockCallAPI = vi.fn();
  const mockClient = { callAPI: mockCallAPI } as any;
  const resolveMarketplaceId = (_opts: { marketplace?: string }) => "ATVPDKIKX0DER";

  function program() {
    const p = new Command();
    p.exitOverride();
    registerFinancesCommands(p, mockClient, resolveMarketplaceId);
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

  // ── finances groups ───────────────────────────────────────────────────────

  it("finances groups lists settlement groups with converted totals", async () => {
    mockCallAPI.mockResolvedValueOnce({
      FinancialEventGroupList: [
        {
          FinancialEventGroupId: "G1",
          ProcessingStatus: "Closed",
          FundTransferStatus: "Succeeded",
          FinancialEventGroupStart: "2026-01-01T00:00:00Z",
          FinancialEventGroupEnd: "2026-01-15T00:00:00Z",
          OriginalTotal: { CurrencyAmount: 100, CurrencyCode: "EUR" },
          ConvertedTotal: { CurrencyAmount: 110.5, CurrencyCode: "USD" },
        },
      ],
    });

    await program().parseAsync(["node", "test", "finances", "groups"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "listFinancialEventGroups",
        endpoint: "finances",
        options: { version: "v0" },
        query: expect.objectContaining({
          FinancialEventGroupStartedAfter: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        }),
      })
    );
    const out = output();
    expect(out).toContain("G1");
    expect(out).toContain("Closed");
    expect(out).toContain("Succeeded");
    expect(out).toContain("$110.50");
  });

  it("finances groups passes --start/--end and pages with --all", async () => {
    mockCallAPI
      .mockResolvedValueOnce({
        FinancialEventGroupList: [{ FinancialEventGroupId: "A" }],
        NextToken: "n1",
      })
      .mockResolvedValueOnce({ FinancialEventGroupList: [{ FinancialEventGroupId: "B" }] });

    await program().parseAsync([
      "node",
      "test",
      "finances",
      "groups",
      "--start",
      "2026-01-01",
      "--end",
      "2026-03-01",
      "--all",
      "--json",
    ]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          FinancialEventGroupStartedAfter: "2026-01-01",
          FinancialEventGroupStartedBefore: "2026-03-01",
        }),
      })
    );
    expect(mockCallAPI).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ NextToken: "n1" }) })
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      JSON.stringify([{ FinancialEventGroupId: "A" }, { FinancialEventGroupId: "B" }], null, 2)
    );
  });

  // ── finances events ───────────────────────────────────────────────────────

  const financialEvents = {
    FinancialEvents: {
      ShipmentEventList: [
        {
          AmazonOrderId: "111-222",
          MarketplaceName: "Amazon.com",
          PostedDate: "2026-01-05T00:00:00Z",
          ShipmentItemList: [{ SellerSKU: "A" }, { SellerSKU: "B" }],
        },
      ],
      ServiceFeeEventList: [
        {
          AmazonOrderId: "111-222",
          FeeReason: "Subscription",
          FeeList: [
            { FeeType: "Subscription", FeeAmount: { CurrencyAmount: -39.99, CurrencyCode: "USD" } },
          ],
        },
      ],
      AdjustmentEventList: [
        {
          AdjustmentType: "ReserveCredit",
          PostedDate: "2026-01-06T00:00:00Z",
          AdjustmentAmount: { CurrencyAmount: 12.5, CurrencyCode: "USD" },
        },
      ],
      RefundEventList: [],
    },
  };

  it("finances events flattens event lists into a typed table", async () => {
    mockCallAPI.mockResolvedValueOnce(financialEvents);

    await program().parseAsync(["node", "test", "finances", "events"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "listFinancialEvents",
        endpoint: "finances",
        options: { version: "v0" },
        query: expect.objectContaining({ PostedAfter: expect.stringMatching(/^\d{4}-/) }),
      })
    );
    const out = output();
    expect(out).toContain("Shipment");
    expect(out).toContain("111-222");
    expect(out).toContain("2 items");
    expect(out).toContain("ServiceFee");
    expect(out).toContain("-$39.99");
    expect(out).toContain("Adjustment");
    expect(out).toContain("ReserveCredit");
    expect(out).toContain("$12.50");
  });

  it("finances events --order uses listFinancialEventsByOrderId", async () => {
    mockCallAPI.mockResolvedValueOnce({ FinancialEvents: {} });

    await program().parseAsync(["node", "test", "finances", "events", "--order", "111-222"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "listFinancialEventsByOrderId",
        path: { orderId: "111-222" },
      })
    );
    expect(output()).toContain("No financial events found.");
  });

  it("finances events --group uses listFinancialEventsByGroupId", async () => {
    mockCallAPI.mockResolvedValueOnce({ FinancialEvents: {} });

    await program().parseAsync(["node", "test", "finances", "events", "--group", "G1"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "listFinancialEventsByGroupId",
        path: { eventGroupId: "G1" },
      })
    );
  });

  it("finances events --json prints the raw FinancialEvents object", async () => {
    mockCallAPI.mockResolvedValueOnce(financialEvents);

    await program().parseAsync(["node", "test", "finances", "events", "--json"]);

    expect(consoleSpy).toHaveBeenCalledWith(
      JSON.stringify(financialEvents.FinancialEvents, null, 2)
    );
  });

  it("finances events --all follows NextToken", async () => {
    mockCallAPI
      .mockResolvedValueOnce({
        FinancialEvents: { AdjustmentEventList: [{ AdjustmentType: "A" }] },
        NextToken: "n1",
      })
      .mockResolvedValueOnce({
        FinancialEvents: { AdjustmentEventList: [{ AdjustmentType: "B" }] },
      });

    await program().parseAsync(["node", "test", "finances", "events", "--all"]);

    expect(mockCallAPI).toHaveBeenCalledTimes(2);
    expect(mockCallAPI).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ NextToken: "n1" }) })
    );
    const out = output();
    expect(out).toContain("A");
    expect(out).toContain("B");
  });

  // ── finances transactions ─────────────────────────────────────────────────

  it("finances transactions lists transactions with amounts and related order", async () => {
    mockCallAPI.mockResolvedValueOnce({
      transactions: [
        {
          transactionType: "Shipment",
          transactionStatus: "RELEASED",
          postedDate: "2026-01-05T00:00:00Z",
          description: "Order Payment",
          totalAmount: { currencyAmount: 25.75, currencyCode: "USD" },
          relatedIdentifiers: [
            { relatedIdentifierName: "ORDER_ID", relatedIdentifierValue: "111-222" },
            { relatedIdentifierName: "SHIPMENT_ID", relatedIdentifierValue: "S1" },
          ],
        },
      ],
    });

    await program().parseAsync(["node", "test", "finances", "transactions"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "listTransactions",
        endpoint: "finances",
        options: { version: "2024-06-19" },
        query: expect.objectContaining({
          postedAfter: expect.stringMatching(/^\d{4}-/),
          marketplaceId: "ATVPDKIKX0DER",
        }),
      })
    );
    const out = output();
    expect(out).toContain("Shipment");
    expect(out).toContain("RELEASED");
    expect(out).toContain("111-222");
    expect(out).toContain("$25.75");
  });

  it("finances transactions --status filters and --all pages", async () => {
    mockCallAPI
      .mockResolvedValueOnce({ transactions: [{ transactionId: "T1" }], nextToken: "n1" })
      .mockResolvedValueOnce({ transactions: [{ transactionId: "T2" }] });

    await program().parseAsync([
      "node",
      "test",
      "finances",
      "transactions",
      "--status",
      "DEFERRED",
      "--all",
      "--json",
    ]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ transactionStatus: "DEFERRED" }) })
    );
    expect(mockCallAPI).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ nextToken: "n1" }) })
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      JSON.stringify([{ transactionId: "T1" }, { transactionId: "T2" }], null, 2)
    );
  });

  it("finances transactions handles API errors", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("boom"));

    await program().parseAsync(["node", "test", "finances", "transactions"]);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to list transactions")
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});
