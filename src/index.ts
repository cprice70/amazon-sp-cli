#!/usr/bin/env node
import { createRequire } from "module";
import { program } from "commander";
import { loadConfig } from "./config.js";
import { createClient } from "./sp-client.js";
import { CliError, EXIT } from "./errors.js";
import { registerAuthCommands } from "./commands/auth.js";
import { registerOrdersCommands } from "./commands/orders.js";
import { registerInventoryCommands } from "./commands/inventory.js";
import { registerCatalogCommands } from "./commands/catalog.js";
import { registerListingsCommands } from "./commands/listings.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const config = loadConfig();

program.name("amazon-sp").description("Amazon Selling Partner API CLI").version(version);

// Auth commands don't need a client
registerAuthCommands(program);

// For all other commands, we need the SP client
// Try to create client; if config is missing, commands that use it will error
let client: ReturnType<typeof createClient> | null = null;

try {
  client = createClient(config);
} catch {
  // Config missing or incomplete — auth commands still work
}

function resolveMarketplaceId(opts: { marketplace?: string }): string {
  const marketplaceId = opts.marketplace ?? config.marketplaceId;

  if (!marketplaceId) {
    throw new CliError(
      'Marketplace ID is required. Use --marketplace <id>, set AMAZON_SP_MARKETPLACE_ID, or run "amazon-sp auth login" to set a default.'
    );
  }

  return marketplaceId;
}

// Create a Proxy that throws a helpful CliError if client wasn't created.
// Commands run inside runCommand, which turns it into a message + exit code.
// Methods must be bound to `client` so that `this` inside callAPI etc.
// refers to the real client instance (not the proxy), ensuring state like
// _access_token is read/written on the correct object.
const clientProxy = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    if (!client) {
      throw new CliError(
        'Not authenticated. Run "amazon-sp auth login" to configure credentials.',
        EXIT.AUTH
      );
    }
    const val = (client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof val === "function" ? val.bind(client) : val;
  },
});

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

program.parse();
