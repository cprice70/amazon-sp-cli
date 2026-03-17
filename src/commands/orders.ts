import { Command } from "commander";
import type { SellingPartner } from "amazon-sp-api";
import { printTable, printJson, printError, colorState, formatCurrency } from "../output.js";

interface OrderTotal {
  Amount?: string | number;
  CurrencyCode?: string;
}

interface OrderRecord {
  AmazonOrderId?: string;
  OrderStatus?: string;
  PurchaseDate?: string;
  NumberOfItemsShipped?: number;
  NumberOfItemsUnshipped?: number;
  OrderTotal?: OrderTotal;
  [key: string]: unknown;
}

interface GetOrdersResult {
  Orders: OrderRecord[];
}

function isAuthError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("401") || msg.includes("403") || msg.includes("unauthorized") || msg.includes("forbidden");
  }
  return false;
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
    .option("--status <status>", "Filter by order status (PENDING, UNSHIPPED, etc.)")
    .option("--start <date>", "ISO date string for CreatedAfter")
    .option("--end <date>", "ISO date string for CreatedBefore")
    .option("--marketplace <id>", "Marketplace ID override")
    .option("--json", "Output raw JSON instead of table")
    .action(async (opts: { status?: string; start?: string; end?: string; marketplace?: string; json?: boolean }) => {
      try {
        const marketplaceId = resolveMarketplaceId({ marketplace: opts.marketplace });

        const result = await client.callAPI({
          operation: "getOrders",
          query: {
            MarketplaceIds: [marketplaceId],
            OrderStatuses: opts.status ? [opts.status] : undefined,
            CreatedAfter: opts.start,
            CreatedBefore: opts.end,
          },
        }) as GetOrdersResult;

        const orderList = result.Orders ?? [];

        if (opts.json) {
          printJson(orderList);
          return;
        }

        if (orderList.length === 0) {
          console.log("No orders found.");
          return;
        }

        const rows = orderList.map((order) => {
          const items =
            (order.NumberOfItemsShipped ?? 0) + (order.NumberOfItemsUnshipped ?? 0);
          const total = formatCurrency(order.OrderTotal?.Amount);
          return [
            order.AmazonOrderId ?? "",
            colorState(order.OrderStatus ?? ""),
            order.PurchaseDate ?? "",
            String(items),
            total,
          ];
        });

        printTable(["Order ID", "Status", "Purchase Date", "Items", "Total"], rows);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        printError(`Failed to list orders: ${message}`);
        if (isAuthError(err)) {
          printError("Hint: run 'auth login' to re-authenticate.");
        }
        process.exit(1);
      }
    });

  orders
    .command("get")
    .description("Get a single order by ID")
    .requiredOption("--order <orderId>", "The order ID")
    .option("--marketplace <id>", "Marketplace ID (for consistency)")
    .option("--json", "Output raw JSON")
    .action(async (opts: { order: string; marketplace?: string; json?: boolean }) => {
      try {
        const result = await client.callAPI({
          operation: "getOrder",
          path: { orderId: opts.order },
        }) as OrderRecord;

        if (opts.json) {
          printJson(result);
          return;
        }

        console.log("");
        for (const [key, value] of Object.entries(result)) {
          if (value !== null && value !== undefined) {
            const display = typeof value === "object" ? JSON.stringify(value) : String(value);
            console.log(`  ${key}: ${display}`);
          }
        }
        console.log("");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        printError(`Failed to get order: ${message}`);
        if (isAuthError(err)) {
          printError("Hint: run 'auth login' to re-authenticate.");
        }
        process.exit(1);
      }
    });
}
