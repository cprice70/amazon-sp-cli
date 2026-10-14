import type { Command } from "commander";
import type { SellingPartner } from "amazon-sp-api";
import { printTable, printJson } from "../output.js";
import { runCommand } from "../errors.js";
import { collectPages, parseLimit, pageSizeFor } from "../paginate.js";

interface CatalogItemSummary {
  marketplaceId: string;
  itemName?: string;
  brand?: string;
  manufacturer?: string;
  modelNumber?: string;
  color?: string;
  size?: string;
  productType?: string;
  itemClassification?: string;
  websiteDisplayGroup?: string;
  websiteDisplayGroupName?: string;
}

interface CatalogIdentifiers {
  marketplaceId: string;
  identifiers?: Array<{ identifierType?: string; identifier?: string }>;
}

interface CatalogSalesRanks {
  marketplaceId: string;
  displayGroupRanks?: Array<{ title?: string; rank?: number }>;
  classificationRanks?: Array<{ title?: string; rank?: number }>;
}

/** Maximum width of the Title column in `catalog search`. */
const TITLE_WIDTH = 60;

function printField(label: string, value: string | undefined): void {
  if (value === undefined || value === "") return;
  console.log(`  ${(label + ":").padEnd(16)}${value}`);
}

function formatCatalogDetail(item: GetCatalogItemResult, marketplaceId: string): void {
  const summary = item.summaries?.find((s) => s.marketplaceId === marketplaceId);
  const identifiers =
    item.identifiers?.find((i) => i.marketplaceId === marketplaceId)?.identifiers ?? [];
  const ranks = item.salesRanks?.find((r) => r.marketplaceId === marketplaceId);

  console.log("");
  printField("ASIN", item.asin);
  printField("Title", summary?.itemName);
  printField("Brand", summary?.brand);
  printField("Manufacturer", summary?.manufacturer);
  printField("Model", summary?.modelNumber);
  printField("Color", summary?.color);
  printField("Size", summary?.size);
  printField("Product Type", summary?.productType);
  printField("Category", summary?.websiteDisplayGroupName ?? summary?.websiteDisplayGroup);
  printField("Classification", summary?.itemClassification);
  for (const id of identifiers) {
    if (id.identifierType && id.identifier) printField(id.identifierType, id.identifier);
  }
  const rankLines = [...(ranks?.displayGroupRanks ?? []), ...(ranks?.classificationRanks ?? [])]
    .filter((r) => r.title && r.rank !== undefined)
    .map((r) => `${r.title} #${r.rank!.toLocaleString("en-US")}`);
  if (rankLines.length > 0) {
    console.log(`  ${"Sales Rank:".padEnd(16)}${rankLines[0]}`);
    for (const line of rankLines.slice(1)) console.log(`  ${"".padEnd(16)}${line}`);
  }
  console.log("");
  console.log("  Use --json for the full catalog record.");
  console.log("");
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
  identifiers?: CatalogIdentifiers[];
  salesRanks?: CatalogSalesRanks[];
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

          printTable(["ASIN", "Title", "Brand"], rows, { maxWidths: [undefined, TITLE_WIDTH] });
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
          query: {
            marketplaceIds: [marketplaceId],
            includedData: ["summaries", "identifiers", "salesRanks", "productTypes"],
          },
        })) as GetCatalogItemResult;

        if (opts.json) {
          printJson(result);
          return;
        }

        formatCatalogDetail(result, marketplaceId);
      });
    });
}
