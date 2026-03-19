import readline from "readline/promises";
import https from "https";
import { Command } from "commander";
import { loadConfig, saveConfig, deleteConfig, getConfigPath, Config } from "../config.js";
import { printSuccess, printError, printWarning } from "../output.js";

function maskSecret(value: string | undefined): string {
  if (!value) return "(not set)";
  if (value.length <= 8) return "****";
  return value.slice(0, 4) + "****" + value.slice(-4);
}

async function fetchJson(options: https.RequestOptions, body?: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function detectSellerId(config: Partial<Config>): Promise<string | undefined> {
  try {
    // Get LWA access token
    const tokenBody = JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: config.refreshToken,
    });
    const tokenRes = (await fetchJson(
      {
        method: "POST",
        hostname: "api.amazon.com",
        path: "/auth/o2/token",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(tokenBody),
        },
      },
      tokenBody
    )) as { access_token?: string };

    if (!tokenRes.access_token) return undefined;

    // Determine API endpoint based on region
    const region = config.region ?? "na";
    const hostname = `sellingpartnerapi-${region}.amazon.com`;
    const now = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, "");

    const participationsRes = (await fetchJson({
      method: "GET",
      hostname,
      path: "/sellers/v1/marketplaceParticipations",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        host: hostname,
        "x-amz-access-token": tokenRes.access_token,
        "x-amz-date": now,
      },
    })) as {
      payload?: Array<{ marketplace: { name: string }; storeName: string }>;
    };

    const entries = participationsRes.payload ?? [];
    for (const entry of entries) {
      // The SP-API seller ID is embedded in the Invoicing Shadow Marketplace storeName
      // Format: "Invoicing_<number>_<sellerID>"
      if (entry.marketplace.name.includes("Invoicing Shadow")) {
        const match = entry.storeName.match(/Invoicing_\d+_([A-Z0-9]+)$/);
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

        const sandboxInput = await rl.question("Sandbox mode? (y/N): ");
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
          const sellerIdInput = await rl.question(
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
