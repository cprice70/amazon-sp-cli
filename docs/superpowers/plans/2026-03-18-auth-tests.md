# Auth Commands Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete Vitest test suite for the three `auth` subcommands (`status`, `logout`, `login`).

**Architecture:** Single test file `src/__tests__/commands/auth.test.ts`. Unlike other command tests, `auth` requires module-level `vi.mock` for `../../config.js`, `readline/promises`, and `https` (the last two because `auth login` uses readline for interactive prompts and https for seller ID auto-detection). Two helper functions (`mockReadline`, `mockHttpsRequest`) abstract the setup boilerplate for interactive and network scenarios.

**Tech Stack:** Vitest, Commander.js, TypeScript, Node `EventEmitter`

---

## File Map

- **Create:** `src/__tests__/commands/auth.test.ts` — all auth test cases

**Reference files (read-only, do not modify):**
- `src/commands/auth.ts` — implementation under test
- `src/__tests__/commands/listings.test.ts` — pattern reference for throw-exit pattern

---

## Task 1: Scaffold + `auth status` tests

**Files:**
- Create: `src/__tests__/commands/auth.test.ts`

### Background

The auth test file requires module-level `vi.mock` calls at the top of the file, **before any imports of the mocked modules**. Vitest hoists `vi.mock` calls, so this works even if they appear after imports syntactically — but they must be at the top level of the file, not inside `describe` or `beforeEach`.

`printSuccess` → `console.log`, `printWarning` → `console.warn`, `printError` → `console.error`. You need a `consoleWarnSpy` in addition to the usual `consoleSpy` and `consoleErrorSpy`.

`registerAuthCommands(program)` takes only `program` — no client or resolver arguments.

`auth status` is synchronous. No readline or https mocks needed for these tests.

- [ ] **Step 1: Create `src/__tests__/commands/auth.test.ts` with scaffold and 3 `auth status` tests**

```typescript
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
```

- [ ] **Step 2: Run the tests to confirm they pass**

```bash
npx vitest run src/__tests__/commands/auth.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 3: Run the full test suite**

```bash
npm run test
```

Expected: all 68 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/commands/auth.test.ts
git commit -m "test: add auth status tests"
```

---

## Task 2: `auth logout` tests

**Files:**
- Modify: `src/__tests__/commands/auth.test.ts`

### Background

`auth logout` is synchronous and calls `deleteConfig()`. The default mock is a no-op vi.fn(). To test the error path, use `mockImplementationOnce` to throw. `printSuccess` → `console.log`, so assert `consoleSpy` for the success case.

Note from the spec: the real `deleteConfig` in `src/config.ts` swallows errors (wraps in try/catch). The mock does NOT swallow errors — the throw propagates to the auth logout catch block, which calls `printError` + `process.exit(1)`.

- [ ] **Step 1: Add 2 `auth logout` tests inside the `describe` block, after the status tests**

```typescript
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
```

- [ ] **Step 2: Run the tests**

```bash
npx vitest run src/__tests__/commands/auth.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 3: Run the full suite**

```bash
npm run test
```

Expected: all 70 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/commands/auth.test.ts
git commit -m "test: add auth logout tests"
```

---

## Task 3: `auth login` tests

**Files:**
- Modify: `src/__tests__/commands/auth.test.ts`

### Background

`auth login` uses:
1. `readline.createInterface` — use `mockReadline(answers)` helper. Answers are consumed in prompt order: Client ID → Client Secret → Refresh Token → Region → Marketplace ID → Sandbox → (Seller ID, only if auto-detection fails)
2. `https.request` — use `mockHttpsRequest(responses)` helper. `detectSellerId` makes two requests: first for the LWA access token, second for marketplace participations.

**Validation tests (empty Client ID, invalid region) require the throw-exit pattern:**
```typescript
processExitSpy.mockImplementationOnce(() => { throw new Error("process.exit"); });
```
Without this, `process.exit` is a no-op and execution continues past the validation failure, eventually calling `saveConfig`. Wrap `program.parseAsync` in `try/catch` to absorb the thrown error.

**Seller ID auto-detection:** `detectSellerId` extracts the seller ID from an entry in `payload` whose `marketplace.name` contains `"Invoicing Shadow"`, matching `storeName` against `/Invoicing_\d+_([A-Z0-9]+)$/`. To simulate success, return:
```typescript
{ payload: [{ marketplace: { name: "Invoicing Shadow" }, storeName: "Invoicing_1_SELLER123" }] }
```

To simulate no detection (manual entry fallback), return an empty array or entries with no "Invoicing Shadow":
```typescript
{ payload: [] }
```

**`process.stdout.write`** is called during detection ("Detecting Seller ID from SP-API... "). Spy on it to suppress the output:
```typescript
vi.spyOn(process.stdout, "write").mockImplementation(() => true);
```
Add this spy in `beforeEach` alongside the console spies.

- [ ] **Step 1: Add `process.stdout.write` spy to `beforeEach`**

In the existing `beforeEach`, add:
```typescript
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
```

- [ ] **Step 2: Add 5 `auth login` tests inside the `describe` block, after the logout tests**

```typescript
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
```

- [ ] **Step 3: Run the full auth test file**

```bash
npx vitest run src/__tests__/commands/auth.test.ts
```

Expected: 10 tests pass.

- [ ] **Step 4: Run the full test suite**

```bash
npm run test
```

Expected: all 75 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/commands/auth.test.ts
git commit -m "test: add auth login tests"
```
