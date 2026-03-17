import { Command } from "commander";
import type { SellingPartner } from "amazon-sp-api";
import { printTable, printJson, printError } from "../output.js";

interface InventoryDetails {
  fulfillableQuantity?: number;
}

interface InventorySummary {
  asin: string;
  fnSku: string;
  sellerSku: string;
  condition: string;
  inventoryDetails?: InventoryDetails;
  totalQuantity: number;
}

interface GetInventorySummariesResult {
  inventorySummaries: InventorySummary[];
}

function isAuthError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("401") || msg.includes("403") || msg.includes("unauthorized") || msg.includes("forbidden");
  }
  return false;
}

export function registerInventoryCommands(
  program: Command,
  client: SellingPartner,
  resolveMarketplaceId: (opts: { marketplace?: string }) => string
): void {
  const inventory = program.command("inventory").description("Manage inventory");

  inventory
    .command("list")
    .description("List inventory summaries")
    .option("--marketplace <id>", "Marketplace ID override")
    .option("--json", "Output raw JSON instead of table")
    .action(async (opts: { marketplace?: string; json?: boolean }) => {
      try {
        const marketplaceId = resolveMarketplaceId({ marketplace: opts.marketplace });

        const result = await client.callAPI({
          operation: "getInventorySummaries",
          query: {
            granularityType: "Marketplace",
            granularityId: marketplaceId,
            marketplaceIds: [marketplaceId],
          },
        }) as GetInventorySummariesResult;

        const summaries = result.inventorySummaries ?? [];

        if (opts.json) {
          printJson(summaries);
          return;
        }

        if (summaries.length === 0) {
          console.log("No inventory found.");
          return;
        }

        const rows = summaries.map((item) => {
          const qty = item.inventoryDetails?.fulfillableQuantity ?? item.totalQuantity ?? 0;
          return [
            item.asin,
            item.fnSku,
            item.sellerSku,
            item.condition,
            String(qty),
          ];
        });

        printTable(["ASIN", "FNSKU", "Seller SKU", "Condition", "Qty"], rows);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        printError(`Failed to list inventory: ${message}`);
        if (isAuthError(err)) {
          printError("Hint: run 'auth login' to re-authenticate.");
        }
        process.exit(1);
      }
    });
}
