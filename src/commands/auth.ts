import readline from "readline/promises";
import { Command } from "commander";
import { loadConfig, saveConfig, deleteConfig, getConfigPath, Config } from "../config.js";
import { printSuccess, printError, printWarning } from "../output.js";

function maskSecret(value: string | undefined): string {
  if (!value) return "(not set)";
  if (value.length <= 8) return "****";
  return value.slice(0, 4) + "****" + value.slice(-4);
}

export function registerAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Manage authentication");

  auth
    .command("login")
    .description("Store SP-API credentials interactively")
    .action(async () => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      try {
        const clientId = await rl.question("Client ID: ");
        if (!clientId.trim()) {
          printError("Client ID is required");
          process.exit(1);
        }

        const clientSecret = await rl.question("Client Secret: ");
        if (!clientSecret.trim()) {
          printError("Client Secret is required");
          process.exit(1);
        }

        const refreshToken = await rl.question("Refresh Token: ");
        if (!refreshToken.trim()) {
          printError("Refresh Token is required");
          process.exit(1);
        }

        const regionInput = await rl.question("Region (na/eu/fe) [na]: ");
        const region = (regionInput.trim() || "na") as "na" | "eu" | "fe";
        if (!["na", "eu", "fe"].includes(region)) {
          printError("Invalid region. Must be na, eu, or fe");
          process.exit(1);
        }

        const marketplaceIdInput = await rl.question("Marketplace ID (optional): ");
        const marketplaceId = marketplaceIdInput.trim() || undefined;

        const sellerIdAnswer = await rl.question("Seller ID (optional): ");

        const sandboxInput = await rl.question("Sandbox mode? (y/N): ");
        const sandbox = sandboxInput.toLowerCase() === "y";

        const config: Partial<Config> = {
          clientId,
          clientSecret,
          refreshToken,
          region,
          sandbox,
          ...(marketplaceId && { marketplaceId }),
          sellerId: sellerIdAnswer.trim() || undefined,
        };

        saveConfig(config);
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
        console.log(`Seller ID:        ${maskSecret(config.sellerId)}`);
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
