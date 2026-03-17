#!/usr/bin/env node
import { createRequire } from "module";
import { program } from "commander";
import { loadConfig } from "./config.js";
import { createClient } from "./sp-client.js";
import { printError, printWarning } from "./output.js";
import { registerAuthCommands } from "./commands/auth.js";
import { registerOrdersCommands } from "./commands/orders.js";
import { registerInventoryCommands } from "./commands/inventory.js";
import { registerCatalogCommands } from "./commands/catalog.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const config = loadConfig();

program
  .name("amazon-sp")
  .description("Amazon Selling Partner API CLI")
  .version(version);

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
    printError(
      'Marketplace ID is required. Use --marketplace <id>, set AMAZON_SP_MARKETPLACE_ID, or run "amazon-sp auth login" to set a default.'
    );
    process.exit(1);
  }

  return marketplaceId;
}

// Create a Proxy that throws a helpful error if client wasn't created.
// Methods must be bound to `client` so that `this` inside callAPI etc.
// refers to the real client instance (not the proxy), ensuring state like
// _access_token is read/written on the correct object.
const clientProxy = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    if (!client) {
      printError(
        'Not authenticated. Run "amazon-sp auth login" to configure credentials.'
      );
      process.exit(1);
    }
    const val = (client as any)[prop as string];
    return typeof val === "function" ? val.bind(client) : val;
  },
});

registerOrdersCommands(program, clientProxy, resolveMarketplaceId);
registerInventoryCommands(program, clientProxy, resolveMarketplaceId);
registerCatalogCommands(program, clientProxy, resolveMarketplaceId);

program.parse();
