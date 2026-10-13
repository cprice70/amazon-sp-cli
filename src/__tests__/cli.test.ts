import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildProgram } from "../cli.js";
import { EXIT } from "../errors.js";

const fullConfig = {
  clientId: "id",
  clientSecret: "secret",
  refreshToken: "token",
  region: "na" as const,
  sandbox: false,
  marketplaceId: "ATVPDKIKX0DER",
  sellerId: "SELLER1",
};

describe("buildProgram", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  const mockCallAPI = vi.fn();
  const createClient = vi.fn();

  function program(config: Partial<typeof fullConfig>) {
    const p = buildProgram(config, { createClient, version: "0.0.0-test" });
    p.exitOverride();
    p.configureOutput({ writeOut: () => {}, writeErr: () => {} });
    return p;
  }

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
    mockCallAPI.mockReset().mockResolvedValue({ Orders: [] });
    createClient.mockReset().mockReturnValue({ callAPI: mockCallAPI });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports the given version", async () => {
    const p = program(fullConfig);
    await expect(p.parseAsync(["node", "amazon-sp", "--version"])).rejects.toMatchObject({
      code: "commander.version",
      message: "0.0.0-test",
    });
  });

  it("does not build an SP client until a command needs one", async () => {
    const p = program(fullConfig);
    await expect(p.parseAsync(["node", "amazon-sp", "--help"])).rejects.toMatchObject({
      code: "commander.helpDisplayed",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("builds the client from config once and routes calls through it", async () => {
    const p = program(fullConfig);
    await p.parseAsync(["node", "amazon-sp", "orders", "list", "--json"]);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "id", sandbox: false })
    );
    expect(mockCallAPI).toHaveBeenCalledWith(expect.objectContaining({ operation: "getOrders" }));
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it("--sandbox overrides the configured sandbox setting and says so on stderr", async () => {
    const p = program(fullConfig);
    await p.parseAsync(["node", "amazon-sp", "orders", "list", "--sandbox", "--json"]);
    expect(createClient).toHaveBeenCalledWith(expect.objectContaining({ sandbox: true }));
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("sandbox"));
  });

  it("warns on stderr when the config enables the sandbox", async () => {
    const p = program({ ...fullConfig, sandbox: true });
    await p.parseAsync(["node", "amazon-sp", "orders", "list", "--json"]);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("sandbox"));
  });

  it("exits with the auth code when credentials are missing", async () => {
    createClient.mockImplementation(() => {
      throw new Error("Missing SP-API credentials");
    });
    const p = program({ marketplaceId: "ATVPDKIKX0DER" });
    await p.parseAsync(["node", "amazon-sp", "orders", "list"]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Not authenticated"));
    expect(processExitSpy).toHaveBeenCalledWith(EXIT.AUTH);
    expect(mockCallAPI).not.toHaveBeenCalled();
  });

  it("exits with the usage code when no marketplace ID is available", async () => {
    const p = program({ ...fullConfig, marketplaceId: undefined });
    await p.parseAsync(["node", "amazon-sp", "orders", "list"]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Marketplace ID is required")
    );
    expect(processExitSpy).toHaveBeenCalledWith(EXIT.USAGE);
  });

  it("prefers --marketplace over the configured default", async () => {
    const p = program(fullConfig);
    await p.parseAsync([
      "node",
      "amazon-sp",
      "orders",
      "list",
      "--marketplace",
      "A1F83G8C2ARO7P",
      "--json",
    ]);
    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ MarketplaceIds: ["A1F83G8C2ARO7P"] }),
      })
    );
  });

  it("exits with the usage code when listings need a seller ID that is not set", async () => {
    mockCallAPI.mockResolvedValue({ items: [] });
    const p = program({ ...fullConfig, sellerId: undefined });
    await p.parseAsync(["node", "amazon-sp", "listings", "search"]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Seller ID is required"));
    expect(processExitSpy).toHaveBeenCalledWith(EXIT.USAGE);
  });
});
