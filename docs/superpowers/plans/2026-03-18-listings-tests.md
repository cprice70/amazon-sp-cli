# Listings Commands Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete Vitest test suite for the four `listings` subcommands (search, get, delete, patch).

**Architecture:** Single test file `src/__tests__/commands/listings.test.ts` following the existing pattern from `orders.test.ts` and `catalog.test.ts`. Mocks `client.callAPI` via `vi.fn()`, spies on `console.log`/`console.error`/`process.exit`, drives commands via `program.parseAsync`.

**Tech Stack:** Vitest, Commander.js, TypeScript

---

## File Map

- **Create:** `src/__tests__/commands/listings.test.ts` — all test cases
- **Reference (read-only):** `src/commands/listings.ts` — implementation being tested
- **Reference (read-only):** `src/__tests__/commands/orders.test.ts` — pattern to follow

---

## Task 1: Scaffold the test file with `listings search` happy path

**Files:**
- Create: `src/__tests__/commands/listings.test.ts`

- [ ] **Step 1: Create the test file with boilerplate and first test**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerListingsCommands } from "../../commands/listings.js";

describe("listings commands", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockCallAPI = vi.fn();
  const mockClient = { callAPI: mockCallAPI } as any;

  const resolveMarketplaceId = (_opts: { marketplace?: string }) => "ATVPDKIKX0DER";
  const resolveSellerId = (_opts: { seller?: string }) => "SELLER123";

  // Note: printError calls chalk.red(message). Chalk auto-detects non-TTY
  // environments (like Vitest) and sets level=0, returning plain strings with
  // no ANSI codes. No special chalk mocking is needed for content assertions.

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
    mockCallAPI.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── listings search ──────────────────────────────────────────────────────

  it("listings search outputs table by default", async () => {
    mockCallAPI.mockResolvedValueOnce({
      items: [
        {
          sku: "SKU1",
          summaries: [
            { marketplaceId: "ATVPDKIKX0DER", asin: "B001", itemName: "Widget", status: ["BUYABLE"] },
          ],
        },
      ],
    });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "search"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "searchListingsItems",
        query: expect.objectContaining({ pageSize: 20 }),
      })
    );
    expect(consoleSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

```bash
npx vitest run src/__tests__/commands/listings.test.ts
```

Expected: 1 test passes.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/commands/listings.test.ts
git commit -m "test: scaffold listings test file with search happy path"
```

---

## Task 2: Add remaining `listings search` tests

**Files:**
- Modify: `src/__tests__/commands/listings.test.ts`

Add inside the `describe` block, after the first test.

- [ ] **Step 1: Add the four remaining search tests**

```typescript
  it("listings search outputs JSON with --json flag", async () => {
    const items = [
      {
        sku: "SKU1",
        summaries: [
          { marketplaceId: "ATVPDKIKX0DER", asin: "B001", itemName: "Widget", status: ["BUYABLE"] },
        ],
      },
    ];
    mockCallAPI.mockResolvedValueOnce({ items });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "search", "--json"]);

    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(items, null, 2));
  });

  it("listings search prints message when no items found", async () => {
    mockCallAPI.mockResolvedValueOnce({ items: [] });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "search"]);

    expect(consoleSpy).toHaveBeenCalledWith("No listings items found.");
  });

  it("listings search passes identifiers query when --sku is provided", async () => {
    mockCallAPI.mockResolvedValueOnce({ items: [] });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "search", "--sku", "SKU1"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ identifiers: ["SKU1"], identifiersType: "SKU" }),
      })
    );
    // pageSize must NOT appear when --sku is used
    expect(mockCallAPI).not.toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ pageSize: expect.anything() }),
      })
    );
  });

  it("listings search handles API errors gracefully", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("API Error"));

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "search"]);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("listings search shows auth hint on 401 error", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("401 Unauthorized"));

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "search"]);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("auth login")
    );
  });
```

- [ ] **Step 2: Run the tests**

```bash
npx vitest run src/__tests__/commands/listings.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/commands/listings.test.ts
git commit -m "test: add listings search test cases"
```

---

## Task 3: Add `listings get` tests

**Files:**
- Modify: `src/__tests__/commands/listings.test.ts`

Add inside the `describe` block, after the search tests.

- [ ] **Step 1: Add the five get tests**

```typescript
  // ── listings get ─────────────────────────────────────────────────────────

  it("listings get outputs item detail by default", async () => {
    mockCallAPI.mockResolvedValueOnce({
      sku: "SKU1",
      summaries: [
        { marketplaceId: "ATVPDKIKX0DER", asin: "B001", itemName: "Widget", status: ["BUYABLE"] },
      ],
    });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "get", "--sku", "SKU1"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "getListingsItem",
        path: { sellerId: "SELLER123", sku: "SKU1" },
      })
    );
    // All field lines have 2-space indent
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("SKU1"));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("B001"));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Widget"));
  });

  it("listings get prints issues when present", async () => {
    mockCallAPI.mockResolvedValueOnce({
      sku: "SKU1",
      summaries: [
        { marketplaceId: "ATVPDKIKX0DER", asin: "B001", itemName: "Widget", status: ["BUYABLE"] },
      ],
      issues: [{ code: "ERR1", message: "Bad data", severity: "ERROR" }],
    });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "get", "--sku", "SKU1"]);

    // Issue line has 4 leading spaces: "    [ERROR] ERR1: Bad data"
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("[ERROR] ERR1: Bad data"));
  });

  it("listings get skips summary block when no matching marketplace", async () => {
    mockCallAPI.mockResolvedValueOnce({
      sku: "SKU1",
      summaries: [{ marketplaceId: "OTHER_MP" }],
    });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "get", "--sku", "SKU1"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("SKU1"));
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining("ASIN:"));
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining("Title:"));
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining("Status:"));
  });

  it("listings get outputs JSON with --json flag", async () => {
    const result = {
      sku: "SKU1",
      summaries: [
        { marketplaceId: "ATVPDKIKX0DER", asin: "B001", itemName: "Widget", status: ["BUYABLE"] },
      ],
    };
    mockCallAPI.mockResolvedValueOnce(result);

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "get", "--sku", "SKU1", "--json"]);

    // result is the full mock return value — not a sub-field
    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(result, null, 2));
  });

  it("listings get handles API errors gracefully", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("API Error"));

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "get", "--sku", "SKU1"]);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
```

- [ ] **Step 2: Run the tests**

```bash
npx vitest run src/__tests__/commands/listings.test.ts
```

Expected: 11 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/commands/listings.test.ts
git commit -m "test: add listings get test cases"
```

---

## Task 4: Add `listings delete` tests

**Files:**
- Modify: `src/__tests__/commands/listings.test.ts`

Add inside the `describe` block, after the get tests.

- [ ] **Step 1: Add the four delete tests**

```typescript
  // ── listings delete ──────────────────────────────────────────────────────

  it("listings delete prints result status from API response", async () => {
    mockCallAPI.mockResolvedValueOnce({ status: "PURGED" });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "delete", "--sku", "SKU1"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "deleteListingsItem",
        path: { sellerId: "SELLER123", sku: "SKU1" },
      })
    );
    expect(consoleSpy).toHaveBeenCalledWith("Result: PURGED");
  });

  it("listings delete falls back to 'deleted' when response has no status field", async () => {
    mockCallAPI.mockResolvedValueOnce({});

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "delete", "--sku", "SKU1"]);

    expect(consoleSpy).toHaveBeenCalledWith("Result: deleted");
  });

  it("listings delete handles API errors gracefully", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("API Error"));

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "delete", "--sku", "SKU1"]);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("listings delete shows auth hint on 403 error", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("403 Forbidden"));

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync(["node", "test", "listings", "delete", "--sku", "SKU1"]);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("auth login")
    );
  });
```

- [ ] **Step 2: Run the tests**

```bash
npx vitest run src/__tests__/commands/listings.test.ts
```

Expected: 15 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/commands/listings.test.ts
git commit -m "test: add listings delete test cases"
```

---

## Task 5: Add `listings patch` tests

**Files:**
- Modify: `src/__tests__/commands/listings.test.ts`

Add inside the `describe` block, after the delete tests.

- [ ] **Step 1: Add the six patch tests**

```typescript
  // ── listings patch ───────────────────────────────────────────────────────

  it("listings patch prints status and submission ID on success", async () => {
    mockCallAPI.mockResolvedValueOnce({ status: "ACCEPTED", submissionId: "SUB123" });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync([
      "node", "test", "listings", "patch",
      "--sku", "SKU1",
      "--body", '{"patches":[]}',
    ]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "patchListingsItem",
        path: { sellerId: "SELLER123", sku: "SKU1" },
        body: { patches: [] },
      })
    );
    expect(consoleSpy).toHaveBeenCalledWith("Status: ACCEPTED");
    expect(consoleSpy).toHaveBeenCalledWith("Submission ID: SUB123");
  });

  it("listings patch omits submission ID line when not in response", async () => {
    mockCallAPI.mockResolvedValueOnce({ status: "ACCEPTED" });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync([
      "node", "test", "listings", "patch",
      "--sku", "SKU1",
      "--body", '{"patches":[]}',
    ]);

    expect(consoleSpy).toHaveBeenCalledWith("Status: ACCEPTED");
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Submission ID")
    );
  });

  it("listings patch prints issues when present", async () => {
    mockCallAPI.mockResolvedValueOnce({
      status: "INVALID",
      issues: [{ code: "ERR1", message: "Bad", severity: "WARNING" }],
    });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync([
      "node", "test", "listings", "patch",
      "--sku", "SKU1",
      "--body", '{"patches":[]}',
    ]);

    // Issue line has 2 leading spaces (differs from `get` which uses 4)
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("[WARNING] ERR1: Bad"));
  });

  it("listings patch outputs JSON with --json flag", async () => {
    const result = { status: "ACCEPTED" };
    mockCallAPI.mockResolvedValueOnce(result);

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync([
      "node", "test", "listings", "patch",
      "--sku", "SKU1",
      "--body", '{"patches":[]}',
      "--json",
    ]);

    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(result, null, 2));
  });

  it("listings patch rejects invalid JSON body without calling API", async () => {
    // process.exit is mocked to throw here so execution halts after printError
    // (otherwise the mocked exit is a no-op and callAPI would be called with
    // parsedBody=undefined since the inner catch never assigned it)
    processExitSpy.mockImplementationOnce(() => {
      throw new Error("process.exit");
    });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    try {
      await program.parseAsync([
        "node", "test", "listings", "patch",
        "--sku", "SKU1",
        "--body", "not-json",
      ]);
    } catch {
      // absorb the thrown process.exit error
    }

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
    expect(mockCallAPI).not.toHaveBeenCalled();
  });

  it("listings patch handles API errors gracefully", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("API Error"));

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync([
      "node", "test", "listings", "patch",
      "--sku", "SKU1",
      "--body", '{"patches":[]}',
    ]);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
```

- [ ] **Step 2: Run the full test suite**

```bash
npx vitest run src/__tests__/commands/listings.test.ts
```

Expected: 21 tests pass.

- [ ] **Step 3: Run the full project tests to check for regressions**

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/commands/listings.test.ts
git commit -m "test: add listings patch test cases"
```
