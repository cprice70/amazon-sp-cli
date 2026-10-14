import fs from "fs";
import path from "path";
import os from "os";
import { CliError } from "./errors.js";

export const REGIONS = ["na", "eu", "fe"] as const;
export type Region = (typeof REGIONS)[number];

function isRegion(value: unknown): value is Region {
  return typeof value === "string" && (REGIONS as readonly string[]).includes(value);
}

export interface Config {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  region: Region;
  sandbox: boolean;
  marketplaceId?: string;
  sellerId?: string;
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
  if (process.env.AMAZON_SP_CLIENT_SECRET)
    config.clientSecret = process.env.AMAZON_SP_CLIENT_SECRET;
  if (process.env.AMAZON_SP_REFRESH_TOKEN)
    config.refreshToken = process.env.AMAZON_SP_REFRESH_TOKEN;
  if (process.env.AMAZON_SP_REGION)
    config.region = process.env.AMAZON_SP_REGION as "na" | "eu" | "fe";
  if (process.env.AMAZON_SP_SANDBOX) config.sandbox = process.env.AMAZON_SP_SANDBOX === "true";
  if (process.env.AMAZON_SP_MARKETPLACE_ID)
    config.marketplaceId = process.env.AMAZON_SP_MARKETPLACE_ID;
  if (process.env.AMAZON_SP_SELLER_ID) config.sellerId = process.env.AMAZON_SP_SELLER_ID;

  if (config.region !== undefined && !isRegion(config.region)) {
    const source = process.env.AMAZON_SP_REGION ? "AMAZON_SP_REGION" : `region in ${configPath}`;
    throw new CliError(
      `Invalid ${source}: "${String(config.region)}". Must be one of: ${REGIONS.join(", ")}.`
    );
  }

  return config;
}

export function saveConfig(config: Partial<Config>): void {
  const configPath = getConfigPath();
  const configDir = path.dirname(configPath);

  // Config holds the client secret and refresh token: keep it owner-only.
  // mkdirSync/writeFileSync only apply `mode` on creation, so chmod explicitly
  // to tighten permissions on pre-existing files and directories too.
  fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(configDir, 0o700);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { encoding: "utf-8", mode: 0o600 });
  fs.chmodSync(configPath, 0o600);
}

export function deleteConfig(): void {
  const configPath = getConfigPath();

  try {
    fs.unlinkSync(configPath);
  } catch {
    // File doesn't exist — ignore error
  }
}
