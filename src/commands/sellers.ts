import type { Command } from "commander";
import type { SellingPartner } from "amazon-sp-api";
import { printTable, printJson } from "../output.js";
import { runCommand } from "../errors.js";

interface MarketplaceParticipation {
  marketplace?: {
    id?: string;
    name?: string;
    countryCode?: string;
    defaultCurrencyCode?: string;
  };
  participation?: {
    isParticipating?: boolean;
    hasSuspendedListings?: boolean;
  };
}

function yesNo(value: boolean | undefined): string {
  return value === undefined ? "" : value ? "yes" : "no";
}

/**
 * Print an object one field per line, flattening nested objects as
 * `parent.child` and summarising arrays by length. Used for responses whose
 * shape varies by account type.
 */
function printFlattened(value: unknown, prefix = ""): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const label = prefix ? `${prefix}.${key}` : key;
    if (child === null || child === undefined) continue;
    if (Array.isArray(child)) {
      console.log(`  ${(label + ":").padEnd(32)}${child.length} entries`);
    } else if (typeof child === "object") {
      printFlattened(child, label);
    } else {
      console.log(`  ${(label + ":").padEnd(32)}${String(child)}`);
    }
  }
}

export function registerSellersCommands(program: Command, client: SellingPartner): void {
  const sellers = program.command("sellers").description("Seller account and marketplaces");

  sellers
    .command("participations")
    .description("List the marketplaces this seller participates in")
    .option("--json", "Output raw JSON instead of table")
    .action(async (opts: { json?: boolean }) => {
      await runCommand("list marketplace participations", async () => {
        const result = (await client.callAPI({
          operation: "getMarketplaceParticipations",
          endpoint: "sellers",
          options: { version: "v1" },
        })) as unknown as MarketplaceParticipation[];

        const participations = result ?? [];

        if (opts.json) {
          printJson(participations);
          return;
        }

        if (participations.length === 0) {
          console.log("No marketplace participations found.");
          return;
        }

        const rows = participations.map((entry) => [
          entry.marketplace?.id ?? "",
          entry.marketplace?.name ?? "",
          entry.marketplace?.countryCode ?? "",
          entry.marketplace?.defaultCurrencyCode ?? "",
          yesNo(entry.participation?.isParticipating),
          yesNo(entry.participation?.hasSuspendedListings),
        ]);

        printTable(
          ["Marketplace ID", "Name", "Country", "Currency", "Participating", "Suspended"],
          rows
        );
      });
    });

  sellers
    .command("account")
    .description("Show seller account details")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      await runCommand("get account", async () => {
        const result = await client.callAPI({
          operation: "getAccount",
          endpoint: "sellers",
          options: { version: "v1" },
        });

        if (opts.json) {
          printJson(result);
          return;
        }

        console.log("");
        printFlattened(result);
        console.log("");
      });
    });
}
