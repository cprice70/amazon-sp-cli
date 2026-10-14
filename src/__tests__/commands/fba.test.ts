import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerFbaCommands } from "../../commands/fba.js";

describe("fba commands", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockCallAPI = vi.fn();
  const mockClient = { callAPI: mockCallAPI } as any;
  const resolveMarketplaceId = (_opts: { marketplace?: string }) => "ATVPDKIKX0DER";

  function program(quiet = false) {
    const p = new Command();
    p.exitOverride();
    // Output settings are copied to subcommands at registration time, so
    // silence commander's own error echo before registering.
    if (quiet) p.configureOutput({ writeErr: () => {} });
    registerFbaCommands(p, mockClient, resolveMarketplaceId);
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

  it("fba shipments lists active shipments by default", async () => {
    mockCallAPI.mockResolvedValueOnce({
      ShipmentData: [
        {
          ShipmentId: "FBA123",
          ShipmentName: "Spring restock",
          ShipmentStatus: "SHIPPED",
          DestinationFulfillmentCenterId: "PHX7",
          LabelPrepType: "SELLER_LABEL",
        },
      ],
    });

    await program().parseAsync(["node", "test", "fba", "shipments"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "getShipments",
        endpoint: "fulfillmentInbound",
        options: { version: "v0" },
        query: expect.objectContaining({
          QueryType: "SHIPMENT",
          MarketplaceId: "ATVPDKIKX0DER",
          ShipmentStatusList: expect.arrayContaining(["WORKING", "SHIPPED", "RECEIVING"]),
        }),
      })
    );
    const out = output();
    expect(out).toContain("FBA123");
    expect(out).toContain("Spring restock");
    expect(out).toContain("PHX7");
  });

  it("fba shipments --status filters by the given statuses", async () => {
    mockCallAPI.mockResolvedValueOnce({ ShipmentData: [] });

    await program().parseAsync([
      "node",
      "test",
      "fba",
      "shipments",
      "--status",
      "closed, cancelled",
    ]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ ShipmentStatusList: ["CLOSED", "CANCELLED"] }),
      })
    );
    expect(output()).toContain("No shipments found.");
  });

  it("fba shipments --shipment looks up specific shipment IDs", async () => {
    mockCallAPI.mockResolvedValueOnce({ ShipmentData: [] });

    await program().parseAsync(["node", "test", "fba", "shipments", "--shipment", "FBA1,FBA2"]);

    const query = mockCallAPI.mock.calls[0][0].query;
    expect(query.ShipmentIdList).toEqual(["FBA1", "FBA2"]);
    expect(query.ShipmentStatusList).toBeUndefined();
  });

  it("fba shipments --all pages with QueryType NEXT_TOKEN", async () => {
    mockCallAPI
      .mockResolvedValueOnce({ ShipmentData: [{ ShipmentId: "A" }], NextToken: "n1" })
      .mockResolvedValueOnce({ ShipmentData: [{ ShipmentId: "B" }] });

    await program().parseAsync(["node", "test", "fba", "shipments", "--all", "--json"]);

    expect(mockCallAPI).toHaveBeenCalledTimes(2);
    expect(mockCallAPI).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ QueryType: "NEXT_TOKEN", NextToken: "n1" }),
      })
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      JSON.stringify([{ ShipmentId: "A" }, { ShipmentId: "B" }], null, 2)
    );
  });

  it("fba shipment-items lists items for a shipment", async () => {
    mockCallAPI.mockResolvedValueOnce({
      ItemData: [
        {
          SellerSKU: "SKU-1",
          FulfillmentNetworkSKU: "X000ABC",
          QuantityShipped: 24,
          QuantityReceived: 20,
          QuantityInCase: 6,
        },
      ],
    });

    await program().parseAsync(["node", "test", "fba", "shipment-items", "--shipment", "FBA123"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "getShipmentItemsByShipmentId",
        endpoint: "fulfillmentInbound",
        options: { version: "v0" },
        path: { shipmentId: "FBA123" },
      })
    );
    const out = output();
    expect(out).toContain("SKU-1");
    expect(out).toContain("X000ABC");
    expect(out).toContain("24");
    expect(out).toContain("20");
  });

  it("fba shipment-items requires --shipment", async () => {
    const p = program(true);
    await expect(p.parseAsync(["node", "test", "fba", "shipment-items"])).rejects.toThrow(
      /required option/
    );
  });

  it("fba shipments handles API errors", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("boom"));

    await program().parseAsync(["node", "test", "fba", "shipments"]);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to list inbound shipments")
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});
