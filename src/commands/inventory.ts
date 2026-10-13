import { Command } from "commander";
import type { SellingPartner } from "amazon-sp-api";
import { printTable, printJson } from "../output.js";
import { runCommand } from "../errors.js";

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
    .option("--sku <sku>", "Filter by seller SKU")
    .action(async (opts: { marketplace?: string; json?: boolean; sku?: string }) => {
      await runCommand("list inventory", async () => {
        const marketplaceId = resolveMarketplaceId({ marketplace: opts.marketplace });

        const result = await client.callAPI({
          operation: "getInventorySummaries",
          endpoint: "fbaInventory",
          options: { version: "v1" },
          query: {
            granularityType: "Marketplace",
            granularityId: marketplaceId,
            marketplaceIds: [marketplaceId],
            ...(opts.sku ? { sellerSkus: [opts.sku] } : {}),
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
      });
    });
}
