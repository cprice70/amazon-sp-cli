import type { Command } from "commander";
import type { Config, Region } from "../config.js";
import { REGIONS, loadConfig, saveConfig, deleteConfig, getConfigPath } from "../config.js";
import { createPrompter } from "../prompt.js";
import { createClient } from "../sp-client.js";
import { printSuccess, printError, printWarning } from "../output.js";

function maskSecret(value: string | undefined): string {
  if (!value) return "(not set)";
  if (value.length <= 8) return "****";
  return value.slice(0, 4) + "****" + value.slice(-4);
}

interface MarketplaceParticipation {
  marketplace?: { name?: string };
  storeName?: string;
}

/**
 * Derive the SP-API seller ID from getMarketplaceParticipations. The ID is
 * embedded in the "Invoicing Shadow Marketplace" storeName as
 * "Invoicing_<number>_<sellerID>". Any failure (bad credentials, network,
 * no shadow marketplace) returns undefined so login can fall back to a prompt.
 */
async function detectSellerId(config: Partial<Config>): Promise<string | undefined> {
  try {
    const client = createClient(config);
    const participations = (await client.callAPI({
      operation: "getMarketplaceParticipations",
      endpoint: "sellers",
      options: { version: "v1" },
    })) as unknown as MarketplaceParticipation[];

    for (const entry of participations ?? []) {
      if (entry.marketplace?.name?.includes("Invoicing Shadow")) {
        const match = entry.storeName?.match(/Invoicing_\d+_([A-Z0-9]+)$/);
        if (match) return match[1];
      }
    }
  } catch {
    // Silently ignore detection failures
  }
  return undefined;
}

export function registerAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Manage authentication");

  auth
    .command("login")
    .description("Store SP-API credentials interactively")
    .action(async () => {
      const rl = createPrompter();

      try {
        const clientId = await rl.ask("Client ID: ");
        if (!clientId.trim()) {
          printError("Client ID is required");
          process.exit(1);
        }

        const clientSecret = await rl.askSecret("Client Secret: ");
        if (!clientSecret.trim()) {
          printError("Client Secret is required");
          process.exit(1);
        }

        const refreshToken = await rl.askSecret("Refresh Token: ");
        if (!refreshToken.trim()) {
          printError("Refresh Token is required");
          process.exit(1);
        }

        const regionInput = await rl.ask("Region (na/eu/fe) [na]: ");
        const region = (regionInput.trim() || "na") as Region;
        if (!(REGIONS as readonly string[]).includes(region)) {
          printError("Invalid region. Must be na, eu, or fe");
          process.exit(1);
        }

        const marketplaceIdInput = await rl.ask("Marketplace ID (optional): ");
        const marketplaceId = marketplaceIdInput.trim() || undefined;

        const sandboxInput = await rl.ask("Sandbox mode? (y/N): ");
        const sandbox = sandboxInput.toLowerCase() === "y";

        const partialConfig: Partial<Config> = {
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
          refreshToken: refreshToken.trim(),
          region,
          sandbox,
          ...(marketplaceId && { marketplaceId }),
        };

        // Auto-detect SP-API seller ID
        process.stdout.write("Detecting Seller ID from SP-API... ");
        const detectedSellerId = await detectSellerId(partialConfig);
        if (detectedSellerId) {
          process.stdout.write(`found: ${detectedSellerId}\n`);
          partialConfig.sellerId = detectedSellerId;
        } else {
          process.stdout.write("not found\n");
          const sellerIdInput = await rl.ask(
            "Seller ID (required for listings commands — find it in Seller Central > Account Info > Merchant Token): "
          );
          partialConfig.sellerId = sellerIdInput.trim() || undefined;
        }

        saveConfig(partialConfig);
        const configPath = getConfigPath();
        printSuccess(`Config saved to ${configPath}`);
      } catch (err) {
        printError(`Login failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      } finally {
        rl.close();
      }
    });

  auth
    .command("status")
    .description("Show current authentication status")
    .action(() => {
      try {
        const config = loadConfig();
        const configPath = getConfigPath();

        const hasAllRequired = config.clientId && config.clientSecret && config.refreshToken;
        const statusMessage = hasAllRequired ? "Authenticated" : "Not authenticated";
        const printStatus = hasAllRequired ? printSuccess : printWarning;

        console.log("");
        console.log("Authentication Status:");
        console.log("  Client ID:      " + maskSecret(config.clientId));
        console.log("  Client Secret:  " + maskSecret(config.clientSecret));
        console.log("  Refresh Token:  " + maskSecret(config.refreshToken));
        console.log("  Region:         " + (config.region || "(not set)"));
        console.log("  Sandbox:        " + (config.sandbox ? "yes" : "no"));
        console.log("  Marketplace ID: " + (config.marketplaceId || "(not set)"));
        console.log("  Seller ID:      " + (config.sellerId || "(not set)"));
        console.log("  Config File:    " + configPath);
        console.log("");
        printStatus(statusMessage);
        console.log("");
      } catch (err) {
        printError(`Status check failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  auth
    .command("logout")
    .description("Delete stored credentials")
    .action(() => {
      try {
        deleteConfig();
        printSuccess("Logged out. Config file deleted.");
      } catch (err) {
        printError(`Logout failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
