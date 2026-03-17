import { Command } from "commander";
import type { SellingPartner } from "amazon-sp-api";
import { printTable, printJson, printError } from "../output.js";

interface CatalogItemSummary {
  marketplaceId: string;
  itemName?: string;
  brand?: string;
  productType?: string;
  websiteDisplayGroup?: string;
}

interface SearchCatalogItem {
  asin: string;
  summaries?: CatalogItemSummary[];
}

interface SearchCatalogItemsResult {
  items: SearchCatalogItem[];
}

interface GetCatalogItemResult {
  asin: string;
  summaries?: CatalogItemSummary[];
  attributes?: Record<string, unknown>;
}

function isAuthError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("401") || msg.includes("403") || msg.includes("unauthorized") || msg.includes("forbidden");
  }
  return false;
}

export function registerCatalogCommands(
  program: Command,
  client: SellingPartner,
  resolveMarketplaceId: (opts: { marketplace?: string }) => string
): void {
  const catalog = program.command("catalog").description("Search and get catalog items");

  catalog
    .command("search")
    .description("Search catalog items")
    .requiredOption("--query <term>", "Search keyword")
    .option("--marketplace <id>", "Marketplace ID override")
    .option("--json", "Output raw JSON instead of table")
    .action(async (opts: { query: string; marketplace?: string; json?: boolean }) => {
      try {
        const marketplaceId = resolveMarketplaceId({ marketplace: opts.marketplace });

        const result = await client.callAPI({
          operation: "searchCatalogItems",
          endpoint: "catalogItems",
          query: {
            keywords: [opts.query],
            marketplaceIds: [marketplaceId],
          },
        }) as SearchCatalogItemsResult;

        const items = result.items ?? [];

        if (opts.json) {
          printJson(items);
          return;
        }

        if (items.length === 0) {
          console.log("No catalog items found.");
          return;
        }

        const rows = items.map((item) => {
          const summary = item.summaries?.find(s => s.marketplaceId === marketplaceId);
          return [
            item.asin,
            summary?.itemName ?? "",
            summary?.brand ?? "",
          ];
        });

        printTable(["ASIN", "Title", "Brand"], rows);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        printError(`Failed to search catalog: ${message}`);
        if (isAuthError(err)) {
          printError("Hint: run 'auth login' to re-authenticate.");
        }
        process.exit(1);
      }
    });

  catalog
    .command("get")
    .description("Get a catalog item by ASIN")
    .requiredOption("--asin <asin>", "The ASIN")
    .option("--marketplace <id>", "Marketplace ID override")
    .option("--json", "Output raw JSON")
    .action(async (opts: { asin: string; marketplace?: string; json?: boolean }) => {
      try {
        const marketplaceId = resolveMarketplaceId({ marketplace: opts.marketplace });

        const result = await client.callAPI({
          operation: "getCatalogItem",
          endpoint: "catalogItems",
          path: { asin: opts.asin },
          query: { marketplaceIds: [marketplaceId] },
        }) as GetCatalogItemResult;

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
        printError(`Failed to get catalog item: ${message}`);
        if (isAuthError(err)) {
          printError("Hint: run 'auth login' to re-authenticate.");
        }
        process.exit(1);
      }
    });
}
