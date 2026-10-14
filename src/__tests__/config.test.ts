import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { getConfigPath, loadConfig, saveConfig, deleteConfig } from "../config.js";
import { CliError } from "../errors.js";

describe("config", () => {
  const testConfigDir = path.join(os.tmpdir(), "amazon-sp-cli-test-" + Date.now());

  beforeEach(() => {
    vi.spyOn(os, "homedir").mockReturnValue(testConfigDir);
    // Clear all SP env vars
    delete process.env.AMAZON_SP_CLIENT_ID;
    delete process.env.AMAZON_SP_CLIENT_SECRET;
    delete process.env.AMAZON_SP_REFRESH_TOKEN;
    delete process.env.AMAZON_SP_REGION;
    delete process.env.AMAZON_SP_SANDBOX;
    delete process.env.AMAZON_SP_MARKETPLACE_ID;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("getConfigPath returns correct path", () => {
    const p = getConfigPath();
    expect(p).toContain("amazon-sp-cli");
    expect(p).toContain("config.json");
  });

  it("loadConfig returns empty config when file does not exist", () => {
    const config = loadConfig();
    expect(config.clientId).toBeUndefined();
    expect(config.refreshToken).toBeUndefined();
  });

  it("saveConfig and loadConfig round-trip", () => {
    const testConfig = {
      clientId: "test-client-id",
      clientSecret: "test-secret",
      refreshToken: "test-refresh-token",
      region: "na" as const,
      sandbox: true,
      marketplaceId: "ATVPDKIKX0DER",
    };

    saveConfig(testConfig);
    const loaded = loadConfig();

    expect(loaded.clientId).toBe("test-client-id");
    expect(loaded.clientSecret).toBe("test-secret");
    expect(loaded.refreshToken).toBe("test-refresh-token");
    expect(loaded.region).toBe("na");
    expect(loaded.sandbox).toBe(true);
    expect(loaded.marketplaceId).toBe("ATVPDKIKX0DER");
  });

  it("env vars take precedence over file config", () => {
    saveConfig({ clientId: "file-client-id", region: "na" });

    process.env.AMAZON_SP_CLIENT_ID = "env-client-id";
    process.env.AMAZON_SP_REGION = "eu";

    const config = loadConfig();
    expect(config.clientId).toBe("env-client-id");
    expect(config.region).toBe("eu");
  });

  it("saveConfig writes the config file readable only by the owner", () => {
    saveConfig({ clientId: "test", clientSecret: "secret" });
    const fileMode = fs.statSync(getConfigPath()).mode & 0o777;
    const dirMode = fs.statSync(path.dirname(getConfigPath())).mode & 0o777;
    expect(fileMode).toBe(0o600);
    expect(dirMode).toBe(0o700);
  });

  it("loadConfig rejects an invalid region from the environment", () => {
    process.env.AMAZON_SP_REGION = "us";
    expect(() => loadConfig()).toThrow(CliError);
    expect(() => loadConfig()).toThrow(/AMAZON_SP_REGION.*na, eu, fe/);
  });

  it("loadConfig rejects an invalid region from the config file", () => {
    fs.mkdirSync(path.dirname(getConfigPath()), { recursive: true });
    fs.writeFileSync(getConfigPath(), JSON.stringify({ region: "xx" }));
    expect(() => loadConfig()).toThrow(/region.*na, eu, fe/i);
  });

  it("loadConfig accepts each valid region from the environment", () => {
    for (const region of ["na", "eu", "fe"]) {
      process.env.AMAZON_SP_REGION = region;
      expect(loadConfig().region).toBe(region);
    }
  });

  it("deleteConfig removes the config file", () => {
    saveConfig({ clientId: "test" });
    expect(fs.existsSync(getConfigPath())).toBe(true);

    deleteConfig();
    expect(fs.existsSync(getConfigPath())).toBe(false);
  });

  it("deleteConfig does not throw when file does not exist", () => {
    expect(() => deleteConfig()).not.toThrow();
  });
});
