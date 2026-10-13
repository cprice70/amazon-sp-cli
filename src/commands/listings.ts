import type { Command } from "commander";
import type { SellingPartner } from "amazon-sp-api";
import { printTable, printJson } from "../output.js";
import { CliError, runCommand } from "../errors.js";
import { collectPages, parseLimit, pageSizeFor } from "../paginate.js";

interface ListingsSummary {
  marketplaceId: string;
  itemName?: string;
  status?: string[];
  asin?: string;
}

interface ListingsItem {
  sku: string;
  summaries?: ListingsSummary[];
  attributes?: Record<string, Array<{ value: unknown }>>;
  issues?: Array<{ code: string; message: string; severity: string }>;
  offers?: unknown;
  fulfillmentAvailability?: unknown;
  procurement?: unknown;
  relationships?: unknown;
  productTypes?: unknown;
}

interface SearchListingsItemRow {
  sku: string;
  summaries?: ListingsSummary[];
}

interface SearchListingsItemsResult {
  items?: SearchListingsItemRow[];
  pagination?: { nextToken?: string };
}

/** listingsItems 2021-08-01 searchListingsItems accepts pageSize of 1-20. */
const LISTINGS_PAGE_MAX = 20;

const LISTINGS_INCLUDED_DATA = [
  "summaries",
  "attributes",
  "issues",
  "offers",
  "fulfillmentAvailability",
  "procurement",
  "relationships",
  "productTypes",
];

function parseJsonBody(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new CliError("Invalid JSON provided for --body");
  }
}

interface PatchListingsItemResult {
  status: string;
  submissionId?: string;
  issues?: Array<{ code: string; message: string; severity: string }>;
}

function formatListingDetail(item: ListingsItem, marketplaceId: string): void {
  console.log("");
  console.log(`SKU:      ${item.sku}`);

  const summary = item.summaries?.find((s) => s.marketplaceId === marketplaceId);
  if (summary?.asin) console.log(`ASIN:     ${summary.asin}`);
  if (summary?.itemName) console.log(`Title:    ${summary.itemName}`);
  if (summary?.status) console.log(`Status:   ${summary.status.join(", ")}`);

  const attrs = item.attributes;

  // product_description is an array of objects with {language_tag, value, marketplace_id}
  if (attrs?.product_description) {
    const descObj = attrs.product_description[0];
    const desc =
      typeof descObj === "object" && descObj !== null && "value" in descObj
        ? descObj.value
        : descObj;
    if (desc && typeof desc === "string") {
      console.log("");
      console.log("Description:");
      console.log(`  ${desc}`);
    }
  }

  // bullet_point is an array of objects with {language_tag, value, marketplace_id}
  if (attrs?.bullet_point) {
    const bullets = (attrs.bullet_point as Array<{ value?: unknown }>)
      .map((item) =>
        typeof item === "object" && item !== null && "value" in item ? item.value : item
      )
      .filter((val): val is string => typeof val === "string");

    if (bullets.length > 0) {
      console.log("");
      console.log("Bullet Points:");
      bullets.forEach((bullet) => {
        console.log(`  • ${bullet}`);
      });
    }
  }

  if (item.issues && item.issues.length > 0) {
    console.log("");
    console.log("Issues:");
    item.issues.forEach((issue) => {
      console.log(`  [${issue.severity}] ${issue.code}: ${issue.message}`);
    });
  }

  console.log("");
}

export function registerListingsCommands(
  program: Command,
  client: SellingPartner,
  resolveMarketplaceId: (opts: { marketplace?: string }) => string,
  resolveSellerId: (opts: { seller?: string }) => string
): void {
  const listings = program.command("listings").description("Manage listings items");

  listings
    .command("search")
    .description("Search listings items")
    .option("--sku <sku>", "Filter by SKU")
    .option("--limit <n>", "Maximum number of items to return", parseLimit)
    .option("--all", "Fetch every page of results")
    .option("--marketplace <id>", "Marketplace ID override")
    .option("--seller <id>", "Seller ID override")
    .option("--json", "Output raw JSON instead of table")
    .action(
      async (opts: {
        sku?: string;
        limit?: number;
        all?: boolean;
        marketplace?: string;
        seller?: string;
        json?: boolean;
      }) => {
        await runCommand("search listings", async () => {
          const marketplaceId = resolveMarketplaceId({ marketplace: opts.marketplace });
          const sellerId = resolveSellerId({ seller: opts.seller });

          const items = await collectPages<SearchListingsItemRow>(async (pageToken) => {
            const result = (await client.callAPI({
              operation: "searchListingsItems",
              endpoint: "listingsItems",
              options: { version: "2021-08-01" },
              path: { sellerId },
              query: {
                marketplaceIds: [marketplaceId],
                identifiers: opts.sku ? [opts.sku] : undefined,
                identifiersType: opts.sku ? "SKU" : undefined,
                // pageSize is rejected when searching by identifier.
                pageSize: opts.sku ? undefined : pageSizeFor(opts.limit, LISTINGS_PAGE_MAX),
                pageToken,
                includedData: LISTINGS_INCLUDED_DATA,
              },
            })) as SearchListingsItemsResult;
            return { items: result.items, nextToken: result.pagination?.nextToken };
          }, opts);

          if (opts.json) {
            printJson(items);
            return;
          }

          if (items.length === 0) {
            console.log("No listings items found.");
            return;
          }

          const rows = items.map((item) => {
            const summary = item.summaries?.find((s) => s.marketplaceId === marketplaceId);
            return [
              item.sku,
              summary?.asin ?? "",
              summary?.itemName ?? "",
              summary?.status?.join(", ") ?? "",
            ];
          });

          printTable(["SKU", "ASIN", "Title", "Status"], rows);
        });
      }
    );

  listings
    .command("get")
    .description("Get a listings item by SKU")
    .requiredOption("--sku <sku>", "The SKU")
    .option("--marketplace <id>", "Marketplace ID override")
    .option("--seller <id>", "Seller ID override")
    .option("--json", "Output raw JSON")
    .action(
      async (opts: { sku: string; marketplace?: string; seller?: string; json?: boolean }) => {
        await runCommand("get listings item", async () => {
          const marketplaceId = resolveMarketplaceId({ marketplace: opts.marketplace });
          const sellerId = resolveSellerId({ seller: opts.seller });

          const result = (await client.callAPI({
            operation: "getListingsItem",
            endpoint: "listingsItems",
            options: { version: "2021-08-01" },
            path: { sellerId, sku: opts.sku },
            query: {
              marketplaceIds: [marketplaceId],
              includedData: LISTINGS_INCLUDED_DATA,
            },
          })) as ListingsItem;

          if (opts.json) {
            printJson(result);
            return;
          }

          formatListingDetail(result, marketplaceId);
        });
      }
    );

  listings
    .command("delete")
    .description("Delete a listings item by SKU")
    .requiredOption("--sku <sku>", "The SKU")
    .option("--marketplace <id>", "Marketplace ID override")
    .option("--seller <id>", "Seller ID override")
    .action(async (opts: { sku: string; marketplace?: string; seller?: string }) => {
      await runCommand("delete listings item", async () => {
        const marketplaceId = resolveMarketplaceId({ marketplace: opts.marketplace });
        const sellerId = resolveSellerId({ seller: opts.seller });

        const result = await client.callAPI({
          operation: "deleteListingsItem",
          endpoint: "listingsItems",
          options: { version: "2021-08-01" },
          path: { sellerId, sku: opts.sku },
          query: { marketplaceIds: [marketplaceId] },
        });

        const status =
          result && typeof result === "object" && "status" in result
            ? (result as { status: string }).status
            : "deleted";
        console.log(`Result: ${status}`);
      });
    });

  listings
    .command("patch")
    .description("Patch a listings item by SKU")
    .requiredOption("--sku <sku>", "The SKU")
    .requiredOption("--body <json>", "Patch body as JSON string")
    .option("--marketplace <id>", "Marketplace ID override")
    .option("--seller <id>", "Seller ID override")
    .option("--json", "Output raw JSON")
    .action(
      async (opts: {
        sku: string;
        body: string;
        marketplace?: string;
        seller?: string;
        json?: boolean;
      }) => {
        await runCommand("patch listings item", async () => {
          const marketplaceId = resolveMarketplaceId({ marketplace: opts.marketplace });
          const sellerId = resolveSellerId({ seller: opts.seller });

          const parsedBody = parseJsonBody(opts.body);

          const result = (await client.callAPI({
            operation: "patchListingsItem",
            endpoint: "listingsItems",
            options: { version: "2021-08-01" },
            path: { sellerId, sku: opts.sku },
            query: { marketplaceIds: [marketplaceId] },
            body: parsedBody,
          })) as PatchListingsItemResult;

          if (opts.json) {
            printJson(result);
            return;
          }

          console.log(`Status: ${result.status}`);
          if (result.submissionId) {
            console.log(`Submission ID: ${result.submissionId}`);
          }
          if (result.issues && result.issues.length > 0) {
            console.log("Issues:");
            for (const issue of result.issues) {
              console.log(`  [${issue.severity}] ${issue.code}: ${issue.message}`);
            }
          }
        });
      }
    );

  listings
    .command("create")
    .description("Create a listings item by SKU")
    .requiredOption("--sku <sku>", "The SKU")
    .requiredOption("--body <json>", "Full listing body as JSON string")
    .option("--marketplace <id>", "Marketplace ID override")
    .option("--seller <id>", "Seller ID override")
    .option("--json", "Output raw JSON")
    .action(
      async (opts: {
        sku: string;
        body: string;
        marketplace?: string;
        seller?: string;
        json?: boolean;
      }) => {
        await runCommand("create listings item", async () => {
          const marketplaceId = resolveMarketplaceId({ marketplace: opts.marketplace });
          const sellerId = resolveSellerId({ seller: opts.seller });

          const parsedBody = parseJsonBody(opts.body);

          const result = (await client.callAPI({
            operation: "putListingsItem",
            endpoint: "listingsItems",
            options: { version: "2021-08-01" },
            path: { sellerId, sku: opts.sku },
            query: { marketplaceIds: [marketplaceId] },
            body: parsedBody,
          })) as PatchListingsItemResult;

          if (opts.json) {
            printJson(result);
            return;
          }

          console.log(`Status: ${result.status}`);
          if (result.submissionId) {
            console.log(`Submission ID: ${result.submissionId}`);
          }
          if (result.issues && result.issues.length > 0) {
            console.log("Issues:");
            for (const issue of result.issues) {
              console.log(`  [${issue.severity}] ${issue.code}: ${issue.message}`);
            }
          }
        });
      }
    );
}
