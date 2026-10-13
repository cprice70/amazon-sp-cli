import type { Command } from "commander";
import type { SellingPartner } from "amazon-sp-api";
import { printTable, printJson } from "../output.js";
import { runCommand } from "../errors.js";
import { collectPages, parseLimit, pageSizeFor } from "../paginate.js";

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
  items?: SearchCatalogItem[];
  pagination?: { nextToken?: string };
}

/** catalogItems 2022-04-01 searchCatalogItems accepts pageSize of 1-20. */
const CATALOG_PAGE_MAX = 20;

interface GetCatalogItemResult {
  asin: string;
  summaries?: CatalogItemSummary[];
  attributes?: Record<string, unknown>;
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
    .option("--limit <n>", "Maximum number of items to return", parseLimit)
    .option("--all", "Fetch every page of results")
    .option("--marketplace <id>", "Marketplace ID override")
    .option("--json", "Output raw JSON instead of table")
    .action(
      async (opts: {
        query: string;
        limit?: number;
        all?: boolean;
        marketplace?: string;
        json?: boolean;
      }) => {
        await runCommand("search catalog", async () => {
          const marketplaceId = resolveMarketplaceId({ marketplace: opts.marketplace });

          const items = await collectPages<SearchCatalogItem>(async (pageToken) => {
            const result = (await client.callAPI({
              operation: "searchCatalogItems",
              endpoint: "catalogItems",
              options: { version: "2022-04-01" },
              query: {
                keywords: [opts.query],
                marketplaceIds: [marketplaceId],
                pageSize: pageSizeFor(opts.limit, CATALOG_PAGE_MAX),
                pageToken,
              },
            })) as SearchCatalogItemsResult;
            return { items: result.items, nextToken: result.pagination?.nextToken };
          }, opts);

          if (opts.json) {
            printJson(items);
            return;
          }

          if (items.length === 0) {
            console.log("No catalog items found.");
            return;
          }

          const rows = items.map((item) => {
            const summary = item.summaries?.find((s) => s.marketplaceId === marketplaceId);
            return [item.asin, summary?.itemName ?? "", summary?.brand ?? ""];
          });

          printTable(["ASIN", "Title", "Brand"], rows);
        });
      }
    );

  catalog
    .command("get")
    .description("Get a catalog item by ASIN")
    .requiredOption("--asin <asin>", "The ASIN")
    .option("--marketplace <id>", "Marketplace ID override")
    .option("--json", "Output raw JSON")
    .action(async (opts: { asin: string; marketplace?: string; json?: boolean }) => {
      await runCommand("get catalog item", async () => {
        const marketplaceId = resolveMarketplaceId({ marketplace: opts.marketplace });

        const result = (await client.callAPI({
          operation: "getCatalogItem",
          endpoint: "catalogItems",
          options: { version: "2022-04-01" },
          path: { asin: opts.asin },
          query: { marketplaceIds: [marketplaceId] },
        })) as GetCatalogItemResult;

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
      });
    });
}
