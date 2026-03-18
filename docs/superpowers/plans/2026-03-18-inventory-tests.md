# Inventory Commands Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete Vitest test suite for the `inventory list` command.

**Architecture:** Single test file `src/__tests__/commands/inventory.test.ts` following the pattern from `src/__tests__/commands/orders.test.ts`. Mocks `client.callAPI` via `vi.fn()`, spies on `console.log`/`console.error`/`process.exit`, drives commands via `program.parseAsync`.

**Tech Stack:** Vitest, Commander.js, TypeScript

---

## File Map

- **Create:** `src/__tests__/commands/inventory.test.ts` — all test cases
- **Reference (read-only):** `src/commands/inventory.ts` — implementation being tested
- **Reference (read-only):** `src/__tests__/commands/listings.test.ts` — pattern to follow

---

## Task 1: Create test file with happy path, JSON, and empty tests

**Files:**
- Create: `src/__tests__/commands/inventory.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerInventoryCommands } from "../../commands/inventory.js";

describe("inventory commands", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockCallAPI = vi.fn();
  const mockClient = { callAPI: mockCallAPI } as any;

  // Note: printError calls chalk.red(message). Chalk auto-detects non-TTY
  // environments (like Vitest) and sets level=0, returning plain strings.
  // No special chalk mocking needed for content assertions.

  const resolveMarketplaceId = (_opts: { marketplace?: string }) => "ATVPDKIKX0DER";

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
    mockCallAPI.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── inventory list ────────────────────────────────────────────────────────

  it("inventory list outputs table by default", async () => {
    mockCallAPI.mockResolvedValueOnce({
      inventorySummaries: [
        {
          asin: "B001",
          fnSku: "FN001",
          sellerSku: "SKU1",
          condition: "NewItem",
          inventoryDetails: { fulfillableQuantity: 10 },
          totalQuantity: 10,
        },
      ],
    });

    const program = new Command();
    program.exitOverride();
    registerInventoryCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "inventory", "list"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "getInventorySummaries",
        query: expect.objectContaining({
          granularityType: "Marketplace",
          granularityId: "ATVPDKIKX0DER",
          marketplaceIds: ["ATVPDKIKX0DER"],
        }),
      })
    );
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("inventory list outputs JSON with --json flag", async () => {
    const inventorySummaries = [
      { asin: "B001", fnSku: "FN001", sellerSku: "SKU1", condition: "NewItem", totalQuantity: 3 },
    ];
    mockCallAPI.mockResolvedValueOnce({ inventorySummaries });

    const program = new Command();
    program.exitOverride();
    registerInventoryCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "inventory", "list", "--json"]);

    // summaries array is extracted from result — not the full result object
    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(inventorySummaries, null, 2));
  });

  it("inventory list prints message when no inventory found", async () => {
    mockCallAPI.mockResolvedValueOnce({ inventorySummaries: [] });

    const program = new Command();
    program.exitOverride();
    registerInventoryCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "inventory", "list"]);

    expect(consoleSpy).toHaveBeenCalledWith("No inventory found.");
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
npx vitest run src/__tests__/commands/inventory.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/commands/inventory.test.ts
git commit -m "test: scaffold inventory test file with basic list tests"
```

---

## Task 2: Add qty and error tests

**Files:**
- Modify: `src/__tests__/commands/inventory.test.ts`

Add inside the `describe` block, after the three existing tests.

- [ ] **Step 1: Add the four remaining tests**

```typescript
  it("inventory list uses fulfillableQuantity when inventoryDetails is present", async () => {
    mockCallAPI.mockResolvedValueOnce({
      inventorySummaries: [
        {
          asin: "B001",
          fnSku: "FN001",
          sellerSku: "SKU1",
          condition: "NewItem",
          inventoryDetails: { fulfillableQuantity: 5 },
          totalQuantity: 99,
        },
      ],
    });

    const program = new Command();
    program.exitOverride();
    registerInventoryCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "inventory", "list"]);

    // Table string contains the qty cell value "5" (fulfillableQuantity wins)
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("5"));
    // totalQuantity "99" should NOT appear (it was overridden)
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining("99"));
  });

  it("inventory list falls back to totalQuantity when inventoryDetails is absent", async () => {
    mockCallAPI.mockResolvedValueOnce({
      inventorySummaries: [
        {
          asin: "B001",
          fnSku: "FN001",
          sellerSku: "SKU1",
          condition: "NewItem",
          totalQuantity: 7,
        },
      ],
    });

    const program = new Command();
    program.exitOverride();
    registerInventoryCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "inventory", "list"]);

    // Table string contains totalQuantity "7" as the qty cell
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("7"));
  });

  it("inventory list handles API errors gracefully", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("API Error"));

    const program = new Command();
    program.exitOverride();
    registerInventoryCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "inventory", "list"]);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("inventory list shows auth hint on 401 error", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("401 Unauthorized"));

    const program = new Command();
    program.exitOverride();
    registerInventoryCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "inventory", "list"]);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("auth login")
    );
  });
```

- [ ] **Step 2: Run the full test file**

```bash
npx vitest run src/__tests__/commands/inventory.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 3: Run the full project test suite to check for regressions**

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/commands/inventory.test.ts
git commit -m "test: add inventory list qty and error test cases"
```
