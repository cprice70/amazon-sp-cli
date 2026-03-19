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
});
