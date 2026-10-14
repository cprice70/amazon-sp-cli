import { Command } from "commander";
import type { SellingPartner } from "amazon-sp-api";
import type { Config } from "./config.js";
import { CliError, EXIT } from "./errors.js";
import { printWarning } from "./output.js";
import { registerAuthCommands } from "./commands/auth.js";
import { registerOrdersCommands } from "./commands/orders.js";
import { registerInventoryCommands } from "./commands/inventory.js";
import { registerCatalogCommands } from "./commands/catalog.js";
import { registerListingsCommands } from "./commands/listings.js";
import { registerSellersCommands } from "./commands/sellers.js";
import { registerReportsCommands } from "./commands/reports.js";
import { registerFinancesCommands } from "./commands/finances.js";
import { registerFbaCommands } from "./commands/fba.js";
import { registerCompletionCommand } from "./completion.js";

export interface CliDeps {
  createClient: (config: Partial<Config>) => SellingPartner;
  version: string;
}

/**
 * Assemble the commander program. Kept separate from index.ts so tests can
 * build it with a fake client factory and parse argv without side effects.
 */
export function buildProgram(config: Partial<Config>, deps: CliDeps): Command {
  const program = new Command();

  program
    .name("amazon-sp")
    .description("Amazon Selling Partner API CLI")
    .version(deps.version)
    .option("--sandbox", "Use the SP-API sandbox for this invocation");

  // Auth commands don't need a client
  registerAuthCommands(program);

  // The client is built on first use so that --sandbox (a root option) has
  // been parsed, and so help/version/auth never touch credentials.
  let client: SellingPartner | undefined;
  function getClient(): SellingPartner {
    if (client) return client;
    const sandbox = program.opts<{ sandbox?: boolean }>().sandbox || config.sandbox || false;
    try {
      client = deps.createClient({ ...config, sandbox });
    } catch {
      throw new CliError(
        'Not authenticated. Run "amazon-sp auth login" to configure credentials.',
        EXIT.AUTH
      );
    }
    if (sandbox) printWarning("Using the SP-API sandbox.");
    return client;
  }

  // Methods must be bound to the real client so that `this` inside callAPI
  // etc. refers to the instance, keeping state like _access_token intact.
  const clientProxy = new Proxy({} as SellingPartner, {
    get(_target, prop) {
      const real = getClient();
      const val = (real as unknown as Record<string | symbol, unknown>)[prop];
      return typeof val === "function" ? val.bind(real) : val;
    },
  });

  function resolveMarketplaceId(opts: { marketplace?: string }): string {
    const marketplaceId = opts.marketplace ?? config.marketplaceId;
    if (!marketplaceId) {
      throw new CliError(
        'Marketplace ID is required. Use --marketplace <id>, set AMAZON_SP_MARKETPLACE_ID, or run "amazon-sp auth login" to set a default.'
      );
    }
    return marketplaceId;
  }

  function resolveSellerId(opts: { seller?: string }): string {
    const sellerId = opts.seller ?? config.sellerId;
    if (!sellerId) {
      throw new CliError(
        'Seller ID is required. Use --seller <id>, set AMAZON_SP_SELLER_ID, or run "amazon-sp auth login" to set a default.'
      );
    }
    return sellerId;
  }

  registerOrdersCommands(program, clientProxy, resolveMarketplaceId);
  registerInventoryCommands(program, clientProxy, resolveMarketplaceId);
  registerCatalogCommands(program, clientProxy, resolveMarketplaceId);
  registerListingsCommands(program, clientProxy, resolveMarketplaceId, resolveSellerId);
  registerSellersCommands(program, clientProxy);
  registerReportsCommands(program, clientProxy, resolveMarketplaceId);
  registerFinancesCommands(program, clientProxy, resolveMarketplaceId);
  registerFbaCommands(program, clientProxy, resolveMarketplaceId);
  registerCompletionCommand(program);

  return program;
}
