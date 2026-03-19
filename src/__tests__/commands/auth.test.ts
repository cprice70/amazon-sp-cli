import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { EventEmitter } from "events";
import { registerAuthCommands } from "../../commands/auth.js";
import { loadConfig, saveConfig, deleteConfig } from "../../config.js";
import readline from "readline/promises";
import https from "https";

vi.mock("../../config.js", () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  deleteConfig: vi.fn(),
  getConfigPath: vi.fn(() => "/home/user/.config/amazon-sp-cli/config.json"),
}));

vi.mock("readline/promises", () => ({
  default: { createInterface: vi.fn() },
}));

vi.mock("https", () => ({
  default: { request: vi.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockReadline(answers: string[]) {
  let i = 0;
  const rl = {
    question: vi.fn(async () => answers[i++] ?? ""),
    close: vi.fn(),
  };
  (readline.createInterface as ReturnType<typeof vi.fn>).mockReturnValue(rl);
  return rl;
}

// detectSellerId calls https.request(options, callback). The callback receives
// a response-like EventEmitter that emits "data" and "end" events.
function mockHttpsRequest(responses: object[]) {
  let call = 0;
  (https.request as ReturnType<typeof vi.fn>).mockImplementation(
    (_opts: unknown, callback: (res: EventEmitter) => void) => {
      const res = new EventEmitter();
      const body = JSON.stringify(responses[call++] ?? {});
      const req = { on: vi.fn(), write: vi.fn(), end: vi.fn() };
      process.nextTick(() => {
        callback(res);
        res.emit("data", body);
        res.emit("end");
      });
      return req;
    }
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("auth commands", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    // Reset all module-level mocks between tests
    (loadConfig as ReturnType<typeof vi.fn>).mockReset();
    (saveConfig as ReturnType<typeof vi.fn>).mockReset();
    (deleteConfig as ReturnType<typeof vi.fn>).mockReset();
    (readline.createInterface as ReturnType<typeof vi.fn>).mockReset();
    (https.request as ReturnType<typeof vi.fn>).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── auth status ───────────────────────────────────────────────────────────

  it("auth status shows masked credentials when authenticated", async () => {
    (loadConfig as ReturnType<typeof vi.fn>).mockReturnValue({
      clientId: "client-id-value",
      clientSecret: "secret-value",
      refreshToken: "token-value",
      region: "na",
      sandbox: false,
      marketplaceId: "ATVPDKIKX0DER",
      sellerId: "SELLER123",
    });

    const program = new Command();
    program.exitOverride();
    registerAuthCommands(program);

    await program.parseAsync(["node", "test", "auth", "status"]);

    // Header line
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Authentication Status:"));
    // Masked clientId: first 4 + "****" + last 4 of "client-id-value"
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("clie****alue"));
    // printSuccess → console.log
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Authenticated"));
    // printWarning must NOT have been called
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it("auth status shows (not set) and warning when not authenticated", async () => {
    (loadConfig as ReturnType<typeof vi.fn>).mockReturnValue({});

    const program = new Command();
    program.exitOverride();
    registerAuthCommands(program);

    await program.parseAsync(["node", "test", "auth", "status"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("(not set)"));
    // printWarning → console.warn
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Not authenticated"));
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("auth status handles loadConfig error", async () => {
    (loadConfig as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("disk error");
    });

    const program = new Command();
    program.exitOverride();
    registerAuthCommands(program);

    await program.parseAsync(["node", "test", "auth", "status"]);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  // ── auth logout ───────────────────────────────────────────────────────────

  it("auth logout deletes config and prints success", async () => {
    const program = new Command();
    program.exitOverride();
    registerAuthCommands(program);

    await program.parseAsync(["node", "test", "auth", "logout"]);

    expect(deleteConfig).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Logged out"));
  });

  it("auth logout handles deleteConfig error", async () => {
    (deleteConfig as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("permission denied");
    });

    const program = new Command();
    program.exitOverride();
    registerAuthCommands(program);

    await program.parseAsync(["node", "test", "auth", "logout"]);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  // ── auth login ────────────────────────────────────────────────────────────

  it("auth login saves config with auto-detected seller ID", async () => {
    mockReadline(["my-client-id", "my-secret", "my-token", "na", "ATVPDKIKX0DER", "n"]);
    mockHttpsRequest([
      { access_token: "tok" },
      { payload: [{ marketplace: { name: "Invoicing Shadow" }, storeName: "Invoicing_1_SELLER123" }] },
    ]);

    const program = new Command();
    program.exitOverride();
    registerAuthCommands(program);

    await program.parseAsync(["node", "test", "auth", "login"]);

    expect(saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "my-client-id",
        clientSecret: "my-secret",
        refreshToken: "my-token",
        region: "na",
        sellerId: "SELLER123",
      })
    );
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Config saved"));
  });

  it("auth login rejects empty Client ID", async () => {
    mockReadline([""]);
    processExitSpy.mockImplementationOnce(() => {
      throw new Error("process.exit");
    });

    const program = new Command();
    program.exitOverride();
    registerAuthCommands(program);

    try {
      await program.parseAsync(["node", "test", "auth", "login"]);
    } catch {
      // absorb the thrown process.exit error
    }

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Client ID is required")
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("auth login rejects invalid region", async () => {
    mockReadline(["my-id", "my-secret", "my-token", "xx"]);
    processExitSpy.mockImplementationOnce(() => {
      throw new Error("process.exit");
    });

    const program = new Command();
    program.exitOverride();
    registerAuthCommands(program);

    try {
      await program.parseAsync(["node", "test", "auth", "login"]);
    } catch {
      // absorb the thrown process.exit error
    }

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Invalid region")
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("auth login prompts for manual seller ID when auto-detection fails", async () => {
    mockReadline(["my-client-id", "my-secret", "my-token", "na", "", "n", "MANUAL123"]);
    mockHttpsRequest([
      { access_token: "tok" },
      { payload: [] },
    ]);

    const program = new Command();
    program.exitOverride();
    registerAuthCommands(program);

    await program.parseAsync(["node", "test", "auth", "login"]);

    expect(saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({ sellerId: "MANUAL123" })
    );
  });

  it("auth login handles saveConfig error", async () => {
    mockReadline(["my-client-id", "my-secret", "my-token", "na", "ATVPDKIKX0DER", "n"]);
    mockHttpsRequest([
      { access_token: "tok" },
      { payload: [{ marketplace: { name: "Invoicing Shadow" }, storeName: "Invoicing_1_SELLER123" }] },
    ]);
    (saveConfig as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("write error");
    });

    const program = new Command();
    program.exitOverride();
    registerAuthCommands(program);

    await program.parseAsync(["node", "test", "auth", "login"]);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});
