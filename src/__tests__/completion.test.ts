import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerCompletionCommand, generateCompletion } from "../completion.js";

function sampleProgram(): Command {
  const program = new Command().name("amazon-sp").option("--sandbox", "Use sandbox");
  const orders = program.command("orders").description("Manage orders");
  orders.command("list").option("--status <s>", "Status").option("--json", "JSON");
  orders.command("get").requiredOption("--order <id>", "Order");
  program.command("auth").command("login");
  return program;
}

describe("generateCompletion", () => {
  it("bash script completes groups, subcommands, and options", () => {
    const script = generateCompletion(sampleProgram(), "bash");
    expect(script).toContain("complete -F _amazon_sp_completion amazon-sp");
    expect(script).toMatch(/orders auth/);
    expect(script).toContain("--sandbox");
    expect(script).toContain("list get");
    expect(script).toContain("--status --json");
    expect(script).toContain("--order");
  });

  it("zsh script is a compdef for amazon-sp", () => {
    const script = generateCompletion(sampleProgram(), "zsh");
    expect(script.startsWith("#compdef amazon-sp")).toBe(true);
    expect(script).toContain("orders");
    expect(script).toContain("login");
    expect(script).toContain("--status");
    expect(script).toContain("compadd");
  });

  it("rejects unsupported shells", () => {
    expect(() => generateCompletion(sampleProgram(), "powershell" as never)).toThrow(/bash, zsh/);
  });
});

describe("completion command", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints the script for the requested shell", async () => {
    const program = sampleProgram();
    program.exitOverride();
    registerCompletionCommand(program);

    await program.parseAsync(["node", "amazon-sp", "completion", "bash"]);

    const out = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(out).toContain("complete -F");
    // The completion command itself is listed so users can tab to it
    expect(out).toContain("completion");
  });

  it("fails on an unknown shell with a usage error", async () => {
    const program = sampleProgram();
    program.exitOverride();
    program.configureOutput({ writeErr: () => {} });
    registerCompletionCommand(program);

    await expect(program.parseAsync(["node", "amazon-sp", "completion", "fish"])).rejects.toThrow(
      /bash, zsh/
    );
  });
});
