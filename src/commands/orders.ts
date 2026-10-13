import type { Command } from "commander";
import type { SellingPartner } from "amazon-sp-api";
import { printTable, printJson, colorState, formatCurrency } from "../output.js";
import { runCommand } from "../errors.js";
import { collectPages, parseLimit, pageSizeFor } from "../paginate.js";

interface OrderTotal {
  Amount?: string | number;
  CurrencyCode?: string;
}

interface OrderRecord {
  AmazonOrderId?: string;
  OrderStatus?: string;
  PurchaseDate?: string;
  LastUpdateDate?: string;
  FulfillmentChannel?: string;
  SalesChannel?: string;
  ShipServiceLevel?: string;
  EarliestShipDate?: string;
  LatestShipDate?: string;
  IsPrime?: boolean;
  IsBusinessOrder?: boolean;
  NumberOfItemsShipped?: number;
  NumberOfItemsUnshipped?: number;
  OrderTotal?: OrderTotal;
  ShippingAddress?: {
    Name?: string;
    City?: string;
    StateOrRegion?: string;
    PostalCode?: string;
    CountryCode?: string;
  };
  BuyerInfo?: { BuyerEmail?: string; BuyerName?: string };
  [key: string]: unknown;
}

/** Maximum width of the Title column in `orders items`. */
const TITLE_WIDTH = 60;

function printField(label: string, value: string | number | boolean | undefined): void {
  if (value === undefined || value === "") return;
  console.log(`  ${(label + ":").padEnd(16)}${String(value)}`);
}

function formatOrderDetail(order: OrderRecord): void {
  const shipped = order.NumberOfItemsShipped ?? 0;
  const unshipped = order.NumberOfItemsUnshipped ?? 0;
  const address = order.ShippingAddress;
  const shipTo = address
    ? [
        address.Name,
        [address.City, address.StateOrRegion].filter(Boolean).join(", ") +
          (address.PostalCode ? ` ${address.PostalCode}` : ""),
        address.CountryCode,
      ]
        .filter((part) => part && part.trim())
        .join(", ")
    : undefined;

  console.log("");
  printField("Order ID", order.AmazonOrderId);
  printField("Status", order.OrderStatus ? colorState(order.OrderStatus) : undefined);
  printField("Purchased", order.PurchaseDate);
  printField("Last update", order.LastUpdateDate);
  printField("Channel", [order.SalesChannel, order.FulfillmentChannel].filter(Boolean).join(" / "));
  printField("Ship level", order.ShipServiceLevel);
  printField(
    "Ship window",
    [order.EarliestShipDate, order.LatestShipDate].filter(Boolean).join(" to ")
  );
  printField("Items", `${shipped + unshipped} (${shipped} shipped, ${unshipped} unshipped)`);
  if (order.OrderTotal) {
    printField("Total", formatCurrency(order.OrderTotal.Amount, order.OrderTotal.CurrencyCode));
  }
  printField("Prime", order.IsPrime === undefined ? undefined : order.IsPrime ? "yes" : "no");
  printField("Business", order.IsBusinessOrder ? "yes" : undefined);
  printField("Buyer", order.BuyerInfo?.BuyerEmail ?? order.BuyerInfo?.BuyerName);
  printField("Ship to", shipTo);
  console.log("");
  console.log("  Use --json for the full order record.");
  console.log("");
}

function parseStatuses(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const statuses = value
    .split(",")
    .map((status) => status.trim().toUpperCase())
    .filter(Boolean);
  return statuses.length > 0 ? statuses : undefined;
}

interface GetOrdersResult {
  Orders?: OrderRecord[];
  NextToken?: string;
}

/** Orders v0 getOrders accepts MaxResultsPerPage of 1-100. */
const ORDERS_PAGE_MAX = 100;

interface OrderItem {
  ASIN: string;
  SellerSKU?: string;
  Title?: string;
  QuantityOrdered: number;
  QuantityShipped?: number;
  ItemPrice?: { Amount: string; CurrencyCode: string };
}

interface GetOrderItemsResult {
  OrderItems: OrderItem[];
}

export function registerOrdersCommands(
  program: Command,
  client: SellingPartner,
  resolveMarketplaceId: (opts: { marketplace?: string }) => string
): void {
  const orders = program.command("orders").description("Manage orders");

  orders
    .command("list")
    .description("List orders")
    .option(
      "--status <statuses>",
      "Filter by order status, comma-separated (PENDING,UNSHIPPED, ...)"
    )
    .option("--start <date>", "ISO date string for CreatedAfter")
    .option("--end <date>", "ISO date string for CreatedBefore")
    .option("--limit <n>", "Maximum number of orders to return", parseLimit)
    .option("--all", "Fetch every page of results")
    .option("--marketplace <id>", "Marketplace ID override")
    .option("--json", "Output raw JSON instead of table")
    .action(
      async (opts: {
        status?: string;
        start?: string;
        end?: string;
        limit?: number;
        all?: boolean;
        marketplace?: string;
        json?: boolean;
      }) => {
        await runCommand("list orders", async () => {
          const marketplaceId = resolveMarketplaceId({ marketplace: opts.marketplace });

          const defaultStart = new Date();
          defaultStart.setDate(defaultStart.getDate() - 30);

          const orderList = await collectPages<OrderRecord>(async (nextToken) => {
            // amazon-sp-api types getOrders as a union of the v0 and 2026-01-01
            // response shapes; we pin v0, whose payload is unwrapped to { Orders }.
            const result = (await client.callAPI({
              operation: "getOrders",
              endpoint: "orders",
              options: { version: "v0" },
              query: {
                MarketplaceIds: [marketplaceId],
                OrderStatuses: parseStatuses(opts.status),
                CreatedAfter: opts.start ?? defaultStart.toISOString(),
                CreatedBefore: opts.end,
                MaxResultsPerPage: pageSizeFor(opts.limit, ORDERS_PAGE_MAX),
                NextToken: nextToken,
              },
            })) as unknown as GetOrdersResult;
            return { items: result.Orders, nextToken: result.NextToken };
          }, opts);

          if (opts.json) {
            printJson(orderList);
            return;
          }

          if (orderList.length === 0) {
            console.log("No orders found.");
            return;
          }

          const rows = orderList.map((order) => {
            const items = (order.NumberOfItemsShipped ?? 0) + (order.NumberOfItemsUnshipped ?? 0);
            const total = formatCurrency(order.OrderTotal?.Amount, order.OrderTotal?.CurrencyCode);
            return [
              order.AmazonOrderId ?? "",
              colorState(order.OrderStatus ?? ""),
              order.PurchaseDate ?? "",
              String(items),
              total,
            ];
          });

          printTable(["Order ID", "Status", "Purchase Date", "Items", "Total"], rows);
        });
      }
    );

  orders
    .command("get")
    .description("Get a single order by ID")
    .requiredOption("--order <orderId>", "The order ID")
    .option("--json", "Output raw JSON")
    .action(async (opts: { order: string; json?: boolean }) => {
      await runCommand("get order", async () => {
        const result = (await client.callAPI({
          operation: "getOrder",
          endpoint: "orders",
          options: { version: "v0" },
          path: { orderId: opts.order },
        })) as OrderRecord;

        if (opts.json) {
          printJson(result);
          return;
        }

        formatOrderDetail(result);
      });
    });

  orders
    .command("items")
    .description("List items for an order")
    .requiredOption("--order <id>", "The order ID")
    .option("--json", "Output raw JSON instead of table")
    .action(async (opts: { order: string; json?: boolean }) => {
      await runCommand("get order items", async () => {
        const result = (await client.callAPI({
          operation: "getOrderItems",
          endpoint: "orders",
          options: { version: "v0" },
          path: { orderId: opts.order },
        })) as GetOrderItemsResult;

        const items = result.OrderItems ?? [];

        if (opts.json) {
          printJson(items);
          return;
        }

        if (items.length === 0) {
          console.log("No items found for this order.");
          return;
        }

        const rows = items.map((item) => [
          item.ASIN,
          item.SellerSKU ?? "",
          item.Title ?? "",
          String(item.QuantityOrdered),
          String(item.QuantityShipped ?? 0),
          formatCurrency(item.ItemPrice?.Amount, item.ItemPrice?.CurrencyCode),
        ]);

        printTable(["ASIN", "SKU", "Title", "Qty Ordered", "Qty Shipped", "Price"], rows, {
          maxWidths: [undefined, undefined, TITLE_WIDTH],
        });
      });
    });
}
