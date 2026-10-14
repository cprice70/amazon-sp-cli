import type { Command } from "commander";
import type { SellingPartner } from "amazon-sp-api";
import { printTable, printJson, colorState } from "../output.js";
import { runCommand } from "../errors.js";
import { collectPages } from "../paginate.js";

interface InboundShipment {
  ShipmentId?: string;
  ShipmentName?: string;
  ShipmentStatus?: string;
  DestinationFulfillmentCenterId?: string;
  LabelPrepType?: string;
}

interface GetShipmentsResult {
  ShipmentData?: InboundShipment[];
  NextToken?: string;
}

interface InboundShipmentItem {
  SellerSKU?: string;
  FulfillmentNetworkSKU?: string;
  QuantityShipped?: number;
  QuantityReceived?: number;
  QuantityInCase?: number;
}

interface GetShipmentItemsResult {
  ItemData?: InboundShipmentItem[];
  NextToken?: string;
}

type ShipmentStatus =
  | "WORKING"
  | "SHIPPED"
  | "RECEIVING"
  | "CANCELLED"
  | "DELETED"
  | "CLOSED"
  | "ERROR"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "CHECKED_IN";

/** Statuses shown when no --status filter is given: everything still in flight. */
const ACTIVE_STATUSES: ShipmentStatus[] = [
  "WORKING",
  "SHIPPED",
  "IN_TRANSIT",
  "DELIVERED",
  "CHECKED_IN",
  "RECEIVING",
];

/** Maximum width of the Name column in `fba shipments`. */
const NAME_WIDTH = 40;

function splitList(value: string | undefined, upper = false): string[] | undefined {
  if (!value) return undefined;
  const parts = value
    .split(",")
    .map((part) => (upper ? part.trim().toUpperCase() : part.trim()))
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

export function registerFbaCommands(
  program: Command,
  client: SellingPartner,
  resolveMarketplaceId: (opts: { marketplace?: string }) => string
): void {
  const fba = program.command("fba").description("FBA inbound shipments");

  fba
    .command("shipments")
    .description("List inbound shipments (active ones by default)")
    .option(
      "--status <statuses>",
      "Comma-separated statuses (WORKING, SHIPPED, RECEIVING, CLOSED, CANCELLED, ...)"
    )
    .option("--shipment <ids>", "Comma-separated shipment IDs to look up")
    .option("--all", "Fetch every page of results")
    .option("--marketplace <id>", "Marketplace ID override")
    .option("--json", "Output raw JSON instead of table")
    .action(
      async (opts: {
        status?: string;
        shipment?: string;
        all?: boolean;
        marketplace?: string;
        json?: boolean;
      }) => {
        await runCommand("list inbound shipments", async () => {
          const marketplaceId = resolveMarketplaceId({ marketplace: opts.marketplace });
          const shipmentIds = splitList(opts.shipment);
          const statuses = shipmentIds
            ? undefined
            : ((splitList(opts.status, true) as ShipmentStatus[] | undefined) ?? ACTIVE_STATUSES);

          const shipments = await collectPages<InboundShipment>(async (nextToken) => {
            const result = (await client.callAPI({
              operation: "getShipments",
              endpoint: "fulfillmentInbound",
              options: { version: "v0" },
              query: {
                MarketplaceId: marketplaceId,
                // The v0 API wants NEXT_TOKEN as the query type on later pages.
                QueryType: nextToken ? "NEXT_TOKEN" : "SHIPMENT",
                ShipmentStatusList: nextToken ? undefined : statuses,
                ShipmentIdList: nextToken ? undefined : shipmentIds,
                NextToken: nextToken,
              },
            })) as unknown as GetShipmentsResult;
            return { items: result.ShipmentData, nextToken: result.NextToken };
          }, opts);

          if (opts.json) {
            printJson(shipments);
            return;
          }

          if (shipments.length === 0) {
            console.log("No shipments found.");
            return;
          }

          const rows = shipments.map((shipment) => [
            shipment.ShipmentId ?? "",
            shipment.ShipmentName ?? "",
            colorState(shipment.ShipmentStatus ?? ""),
            shipment.DestinationFulfillmentCenterId ?? "",
            shipment.LabelPrepType ?? "",
          ]);

          printTable(["Shipment ID", "Name", "Status", "Destination", "Label Prep"], rows, {
            maxWidths: [undefined, NAME_WIDTH],
          });
        });
      }
    );

  fba
    .command("shipment-items")
    .description("List the items in an inbound shipment")
    .requiredOption("--shipment <id>", "The shipment ID")
    .option("--all", "Fetch every page of results")
    .option("--marketplace <id>", "Marketplace ID override")
    .option("--json", "Output raw JSON instead of table")
    .action(
      async (opts: { shipment: string; all?: boolean; marketplace?: string; json?: boolean }) => {
        await runCommand("list shipment items", async () => {
          const marketplaceId = resolveMarketplaceId({ marketplace: opts.marketplace });

          const items = await collectPages<InboundShipmentItem>(async (nextToken) => {
            // Later pages come from getShipmentItems with QueryType NEXT_TOKEN;
            // the by-shipment-ID operation has no token parameter of its own.
            const result = (await (nextToken
              ? client.callAPI({
                  operation: "getShipmentItems",
                  endpoint: "fulfillmentInbound",
                  options: { version: "v0" },
                  query: {
                    QueryType: "NEXT_TOKEN",
                    NextToken: nextToken,
                    MarketplaceId: marketplaceId,
                  },
                })
              : client.callAPI({
                  operation: "getShipmentItemsByShipmentId",
                  endpoint: "fulfillmentInbound",
                  options: { version: "v0" },
                  path: { shipmentId: opts.shipment },
                  query: { MarketplaceId: marketplaceId },
                }))) as unknown as GetShipmentItemsResult;
            return { items: result.ItemData, nextToken: result.NextToken };
          }, opts);

          if (opts.json) {
            printJson(items);
            return;
          }

          if (items.length === 0) {
            console.log("No items found for this shipment.");
            return;
          }

          const rows = items.map((item) => [
            item.SellerSKU ?? "",
            item.FulfillmentNetworkSKU ?? "",
            String(item.QuantityShipped ?? 0),
            String(item.QuantityReceived ?? 0),
            item.QuantityInCase === undefined ? "" : String(item.QuantityInCase),
          ]);

          printTable(["SKU", "FNSKU", "Shipped", "Received", "Per Case"], rows);
        });
      }
    );
}
