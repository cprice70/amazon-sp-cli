import fs from "fs";
import path from "path";
import os from "os";

export interface Config {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  region: "na" | "eu" | "fe";
  sandbox: boolean;
  marketplaceId?: string;
}

export function getConfigPath(): string {
  return path.join(os.homedir(), ".config", "amazon-sp-cli", "config.json");
}

export function loadConfig(): Partial<Config> {
  const configPath = getConfigPath();
  let fileConfig: Partial<Config> = {};

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    fileConfig = JSON.parse(raw) as Partial<Config>;
  } catch {
    // File doesn't exist or is invalid — start with empty config
  }

  const config: Partial<Config> = { ...fileConfig };

  if (process.env.AMAZON_SP_CLIENT_ID) config.clientId = process.env.AMAZON_SP_CLIENT_ID;
  if (process.env.AMAZON_SP_CLIENT_SECRET) config.clientSecret = process.env.AMAZON_SP_CLIENT_SECRET;
  if (process.env.AMAZON_SP_REFRESH_TOKEN) config.refreshToken = process.env.AMAZON_SP_REFRESH_TOKEN;
  if (process.env.AMAZON_SP_REGION) config.region = process.env.AMAZON_SP_REGION as "na" | "eu" | "fe";
  if (process.env.AMAZON_SP_SANDBOX) config.sandbox = process.env.AMAZON_SP_SANDBOX === "true";
  if (process.env.AMAZON_SP_MARKETPLACE_ID) config.marketplaceId = process.env.AMAZON_SP_MARKETPLACE_ID;

  return config;
}

export function saveConfig(config: Partial<Config>): void {
  const configPath = getConfigPath();
  const configDir = path.dirname(configPath);

  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

export function deleteConfig(): void {
  const configPath = getConfigPath();

  try {
    fs.unlinkSync(configPath);
  } catch {
    // File doesn't exist — ignore error
  }
}
