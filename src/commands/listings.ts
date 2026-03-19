import { Command } from "commander";
import type { SellingPartner } from "amazon-sp-api";
import { printTable, printJson, printError } from "../output.js";

interface ListingsSummary {
  marketplaceId: string;
  itemName?: string;
  status?: string[];
  asin?: string;
}

interface ListingsItem {
  sku: string;
  summaries?: ListingsSummary[];
  attributes?: Record<string, unknown>;
  issues?: Array<{ code: string; message: string; severity: string }>;
}

interface SearchListingsItemsResult {
  items: Array<{
    sku: string;
    summaries?: ListingsSummary[];
  }>;
}

interface PatchListingsItemResult {
  status: string;
  submissionId?: string;
  issues?: Array<{ code: string; message: string; severity: string }>;
}

function isAuthError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("401") ||
      msg.includes("403") ||
      msg.includes("unauthorized") ||
      msg.includes("forbidden")
    );
  }
  return false;
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
    .option("--marketplace <id>", "Marketplace ID override")
    .option("--seller <id>", "Seller ID override")
    .option("--json", "Output raw JSON instead of table")
    .action(
      async (opts: { sku?: string; marketplace?: string; seller?: string; json?: boolean }) => {
        try {
          const marketplaceId = resolveMarketplaceId({ marketplace: opts.marketplace });
          const sellerId = resolveSellerId({ seller: opts.seller });

          const result = (await client.callAPI({
            operation: "searchListingsItems",
            endpoint: "listingsItems",
            options: { version: "2021-08-01" },
            path: { sellerId },
            query: {
              marketplaceIds: [marketplaceId],
              ...(opts.sku
                ? { identifiers: [opts.sku], identifiersType: "SKU" }
                : { pageSize: 20 }),
            },
          })) as SearchListingsItemsResult;

          const items = result.items ?? [];

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
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          printError(`Failed to search listings: ${message}`);
          if (isAuthError(err)) {
            printError("Hint: run 'auth login' to re-authenticate.");
          }
          process.exit(1);
        }
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
        try {
          const marketplaceId = resolveMarketplaceId({ marketplace: opts.marketplace });
          const sellerId = resolveSellerId({ seller: opts.seller });

          const result = (await client.callAPI({
            operation: "getListingsItem",
            endpoint: "listingsItems",
            options: { version: "2021-08-01" },
            path: { sellerId, sku: opts.sku },
            query: { marketplaceIds: [marketplaceId] },
          })) as ListingsItem;

          if (opts.json) {
            printJson(result);
            return;
          }

          console.log("");
          console.log(`  SKU: ${result.sku}`);
          const summary = result.summaries?.find((s) => s.marketplaceId === marketplaceId);
          if (summary) {
            console.log(`  ASIN: ${summary.asin ?? ""}`);
            console.log(`  Title: ${summary.itemName ?? ""}`);
            console.log(`  Status: ${summary.status?.join(", ") ?? ""}`);
          }
          if (result.issues && result.issues.length > 0) {
            console.log("  Issues:");
            for (const issue of result.issues) {
              console.log(`    [${issue.severity}] ${issue.code}: ${issue.message}`);
            }
          }
          console.log("");
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          printError(`Failed to get listings item: ${message}`);
          if (isAuthError(err)) {
            printError("Hint: run 'auth login' to re-authenticate.");
          }
          process.exit(1);
        }
      }
    );

  listings
    .command("delete")
    .description("Delete a listings item by SKU")
    .requiredOption("--sku <sku>", "The SKU")
    .option("--marketplace <id>", "Marketplace ID override")
    .option("--seller <id>", "Seller ID override")
    .action(async (opts: { sku: string; marketplace?: string; seller?: string }) => {
      try {
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
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        printError(`Failed to delete listings item: ${message}`);
        if (isAuthError(err)) {
          printError("Hint: run 'auth login' to re-authenticate.");
        }
        process.exit(1);
      }
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
        try {
          const marketplaceId = resolveMarketplaceId({ marketplace: opts.marketplace });
          const sellerId = resolveSellerId({ seller: opts.seller });

          let parsedBody: unknown;
          try {
            parsedBody = JSON.parse(opts.body);
          } catch {
            printError("Invalid JSON provided for --body");
            process.exit(1);
          }

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
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          printError(`Failed to patch listings item: ${message}`);
          if (isAuthError(err)) {
            printError("Hint: run 'auth login' to re-authenticate.");
          }
          process.exit(1);
        }
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
        try {
          const marketplaceId = resolveMarketplaceId({ marketplace: opts.marketplace });
          const sellerId = resolveSellerId({ seller: opts.seller });

          let parsedBody: unknown;
          try {
            parsedBody = JSON.parse(opts.body);
          } catch {
            printError("Invalid JSON provided for --body");
            process.exit(1);
          }

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
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          printError(`Failed to create listings item: ${message}`);
          if (isAuthError(err)) {
            printError("Hint: run 'auth login' to re-authenticate.");
          }
          process.exit(1);
        }
      }
    );
}
