# Command Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `orders items`, `listings create`, and `inventory list --sku` to the existing CLI command modules.

**Architecture:** Each enhancement is additive — new subcommands or an extra option are added to existing `src/commands/*.ts` files. Tests are added to existing `src/__tests__/commands/*.test.ts` files following the established TDD pattern: write failing tests first, implement, confirm green.

**Tech Stack:** TypeScript, Commander.js, Vitest, amazon-sp-api

---

## File Map

- **Modify:** `src/commands/orders.ts` — add `orders items` subcommand
- **Modify:** `src/commands/listings.ts` — add `listings create` subcommand
- **Modify:** `src/commands/inventory.ts` — add `--sku` option to `inventory list`
- **Modify:** `src/__tests__/commands/orders.test.ts` — add 5 tests for `orders items`
- **Modify:** `src/__tests__/commands/listings.test.ts` — add 7 tests for `listings create`
- **Modify:** `src/__tests__/commands/inventory.test.ts` — add 2 tests for `inventory list --sku`

---

## Task 1: `orders items` — tests + implementation

**Files:**
- Modify: `src/__tests__/commands/orders.test.ts`
- Modify: `src/commands/orders.ts`

### Background: key patterns

- Tests use `mockCallAPI.mockResolvedValueOnce(value)` to fake the API response.
- Commands are driven via `program.parseAsync(["node", "test", ...args])`.
- `consoleSpy` captures `console.log`, `consoleErrorSpy` captures `console.error`.
- `processExitSpy` is mocked as a no-op by default — execution continues past `process.exit(1)`.
- `formatCurrency` (already imported in `orders.ts`) formats a price string or returns `"—"` when absent.

### Step 1: Add failing tests for `orders items`

Add inside the `describe("orders commands")` block in `src/__tests__/commands/orders.test.ts`, after the existing `orders list handles API errors gracefully` test:

```typescript
  // ── orders items ──────────────────────────────────────────────────────────

  it("orders items outputs table by default", async () => {
    mockCallAPI.mockResolvedValueOnce({
      OrderItems: [
        {
          ASIN: "B001234567",
          SellerSKU: "SKU1",
          Title: "Widget Pro",
          QuantityOrdered: 2,
          QuantityShipped: 1,
          ItemPrice: { Amount: "19.99", CurrencyCode: "USD" },
        },
      ],
    });

    const program = new Command();
    program.exitOverride();
    registerOrdersCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "orders", "items", "--order", "123-456-789"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "getOrderItems",
        path: { orderId: "123-456-789" },
      })
    );
    // Table renders ASIN, SKU, and the formatted price
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("B001234567"));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("SKU1"));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("19.99"));
  });

  it("orders items outputs JSON with --json flag", async () => {
    const orderItems = [
      {
        ASIN: "B001234567",
        SellerSKU: "SKU1",
        Title: "Widget Pro",
        QuantityOrdered: 2,
      },
    ];
    mockCallAPI.mockResolvedValueOnce({ OrderItems: orderItems });

    const program = new Command();
    program.exitOverride();
    registerOrdersCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "orders", "items", "--order", "123-456-789", "--json"]);

    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(orderItems, null, 2));
  });

  it("orders items prints message when no items found", async () => {
    mockCallAPI.mockResolvedValueOnce({ OrderItems: [] });

    const program = new Command();
    program.exitOverride();
    registerOrdersCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "orders", "items", "--order", "123-456-789"]);

    expect(consoleSpy).toHaveBeenCalledWith("No items found for this order.");
  });

  it("orders items handles API errors gracefully", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("API Error"));

    const program = new Command();
    program.exitOverride();
    registerOrdersCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "orders", "items", "--order", "123-456-789"]);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to get order items")
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("orders items shows auth hint on 401 error", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("401 Unauthorized"));

    const program = new Command();
    program.exitOverride();
    registerOrdersCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "orders", "items", "--order", "123-456-789"]);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("auth login")
    );
  });
```

- [ ] **Step 1: Add the 5 test cases above to `src/__tests__/commands/orders.test.ts`**

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npx vitest run src/__tests__/commands/orders.test.ts
```

Expected: the 5 new tests fail with "unknown command 'items'" or similar. Existing 4 tests still pass.

- [ ] **Step 3: Add interfaces and `orders items` subcommand to `src/commands/orders.ts`**

Add these interfaces after the existing `GetOrdersResult` interface (around line 22):

```typescript
interface OrderItem {
  ASIN: string;
  SellerSKU?: string;
  Title?: string;
  QuantityOrdered: number;
  QuantityShipped?: number;
  ItemPrice?: { Amount: string; CurrencyCode: string };
}

interface GetOrderItemsResult {
  OrderItems: OrderItem[];
}
```

Then add the `orders items` subcommand inside `registerOrdersCommands`, after the existing `orders get` block (before the closing `}`):

```typescript
  orders
    .command("items")
    .description("List items for an order")
    .requiredOption("--order <id>", "The order ID")
    .option("--json", "Output raw JSON instead of table")
    .action(async (opts: { order: string; json?: boolean }) => {
      try {
        const result = await client.callAPI({
          operation: "getOrderItems",
          endpoint: "orders",
          path: { orderId: opts.order },
        }) as GetOrderItemsResult;

        const items = result.OrderItems ?? [];

        if (opts.json) {
          printJson(items);
          return;
        }

        if (items.length === 0) {
          console.log("No items found for this order.");
          return;
        }

        const rows = items.map((item) => [
          item.ASIN,
          item.SellerSKU ?? "",
          item.Title ?? "",
          String(item.QuantityOrdered),
          String(item.QuantityShipped ?? 0),
          formatCurrency(item.ItemPrice?.Amount),
        ]);

        printTable(["ASIN", "SKU", "Title", "Qty Ordered", "Qty Shipped", "Price"], rows);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        printError(`Failed to get order items: ${message}`);
        if (isAuthError(err)) {
          printError("Hint: run 'auth login' to re-authenticate.");
        }
        process.exit(1);
      }
    });
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npx vitest run src/__tests__/commands/orders.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 5: Run the full test suite to check for regressions**

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/commands/orders.ts src/__tests__/commands/orders.test.ts
git commit -m "feat: add orders items subcommand with tests"
```

---

## Task 2: `listings create` — tests + implementation

**Files:**
- Modify: `src/__tests__/commands/listings.test.ts`
- Modify: `src/commands/listings.ts`

### Background: key patterns

- `listings create` follows `listings patch` exactly. Both use `putListingsItem`/`patchListingsItem` respectively with identical response shapes and output format.
- The implementation casts the API result to `PatchListingsItemResult` — the response shapes are identical, so no new interface is needed in `listings.ts`.
- The invalid-JSON test requires the throw-exit pattern: `processExitSpy.mockImplementationOnce(() => { throw new Error("process.exit"); })` with a try/catch around `parseAsync`. Without this, the mocked `process.exit` is a no-op and execution falls through to `callAPI`.
- Issues output uses 2-space indentation: `  [SEVERITY] CODE: message`.
- `resolveSellerId` returns `"SELLER123"` in tests (already set up in the describe block).

- [ ] **Step 1: Add 7 failing tests for `listings create`**

Add inside `describe("listings commands")` in `src/__tests__/commands/listings.test.ts`, after the last `listings patch` test (the `shows auth hint on 401 error` test):

```typescript
  // ── listings create ───────────────────────────────────────────────────────

  it("listings create prints status and submission ID on success", async () => {
    mockCallAPI.mockResolvedValueOnce({ status: "ACCEPTED", submissionId: "SUB456" });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync([
      "node", "test", "listings", "create",
      "--sku", "SKU1",
      "--body", '{"productType":"LUGGAGE","requirements":"LISTING"}',
    ]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "putListingsItem",
        path: { sellerId: "SELLER123", sku: "SKU1" },
        query: { marketplaceIds: ["ATVPDKIKX0DER"] },
        body: { productType: "LUGGAGE", requirements: "LISTING" },
      })
    );
    expect(consoleSpy).toHaveBeenCalledWith("Status: ACCEPTED");
    expect(consoleSpy).toHaveBeenCalledWith("Submission ID: SUB456");
  });

  it("listings create omits submission ID line when not in response", async () => {
    mockCallAPI.mockResolvedValueOnce({ status: "ACCEPTED" });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync([
      "node", "test", "listings", "create",
      "--sku", "SKU1",
      "--body", '{"productType":"LUGGAGE"}',
    ]);

    expect(consoleSpy).toHaveBeenCalledWith("Status: ACCEPTED");
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Submission ID")
    );
  });

  it("listings create prints issues when present", async () => {
    mockCallAPI.mockResolvedValueOnce({
      status: "INVALID",
      issues: [{ code: "ERR1", message: "Bad value", severity: "ERROR" }],
    });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync([
      "node", "test", "listings", "create",
      "--sku", "SKU1",
      "--body", '{"productType":"LUGGAGE"}',
    ]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("[ERROR] ERR1: Bad value"));
  });

  it("listings create outputs JSON with --json flag", async () => {
    const result = { status: "ACCEPTED", submissionId: "SUB456" };
    mockCallAPI.mockResolvedValueOnce(result);

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync([
      "node", "test", "listings", "create",
      "--sku", "SKU1",
      "--body", '{"productType":"LUGGAGE"}',
      "--json",
    ]);

    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(result, null, 2));
  });

  it("listings create rejects invalid JSON body without calling API", async () => {
    processExitSpy.mockImplementationOnce(() => {
      throw new Error("process.exit");
    });

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    try {
      await program.parseAsync([
        "node", "test", "listings", "create",
        "--sku", "SKU1",
        "--body", "not-json",
      ]);
    } catch {
      // absorb the thrown process.exit error
    }

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Invalid JSON provided for --body")
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
    expect(mockCallAPI).not.toHaveBeenCalled();
  });

  it("listings create handles API errors gracefully", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("API Error"));

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync([
      "node", "test", "listings", "create",
      "--sku", "SKU1",
      "--body", '{"productType":"LUGGAGE"}',
    ]);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to create listings item")
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("listings create shows auth hint on 401 error", async () => {
    mockCallAPI.mockRejectedValueOnce(new Error("401 Unauthorized"));

    const program = new Command();
    program.exitOverride();
    registerListingsCommands(program, mockClient, resolveMarketplaceId, resolveSellerId);

    await program.parseAsync([
      "node", "test", "listings", "create",
      "--sku", "SKU1",
      "--body", '{"productType":"LUGGAGE"}',
    ]);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("auth login")
    );
  });
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npx vitest run src/__tests__/commands/listings.test.ts
```

Expected: the 7 new tests fail. Existing tests still pass.

- [ ] **Step 3: Add `listings create` subcommand to `src/commands/listings.ts`**

The existing `PatchListingsItemResult` interface covers the response shape (identical structure to `PutListingsItemResult`), so no new interface is needed:

Add the `listings create` subcommand inside `registerListingsCommands`, after the existing `listings patch` block (before the closing `}`):

```typescript
  listings
    .command("create")
    .description("Create a listings item by SKU")
    .requiredOption("--sku <sku>", "The SKU")
    .requiredOption("--body <json>", "Full listing body as JSON string")
    .option("--marketplace <id>", "Marketplace ID override")
    .option("--seller <id>", "Seller ID override")
    .option("--json", "Output raw JSON")
    .action(
      async (opts: {
        sku: string;
        body: string;
        marketplace?: string;
        seller?: string;
        json?: boolean;
      }) => {
        try {
          const marketplaceId = resolveMarketplaceId({ marketplace: opts.marketplace });
          const sellerId = resolveSellerId({ seller: opts.seller });

          let parsedBody: unknown;
          try {
            parsedBody = JSON.parse(opts.body);
          } catch {
            printError("Invalid JSON provided for --body");
            process.exit(1);
          }

          const result = (await client.callAPI({
            operation: "putListingsItem",
            endpoint: "listingsItems",
            options: { version: "2021-08-01" },
            path: { sellerId, sku: opts.sku },
            query: { marketplaceIds: [marketplaceId] },
            body: parsedBody,
          })) as PatchListingsItemResult;

          if (opts.json) {
            printJson(result);
            return;
          }

          console.log(`Status: ${result.status}`);
          if (result.submissionId) {
            console.log(`Submission ID: ${result.submissionId}`);
          }
          if (result.issues && result.issues.length > 0) {
            console.log("Issues:");
            for (const issue of result.issues) {
              console.log(`  [${issue.severity}] ${issue.code}: ${issue.message}`);
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          printError(`Failed to create listings item: ${message}`);
          if (isAuthError(err)) {
            printError("Hint: run 'auth login' to re-authenticate.");
          }
          process.exit(1);
        }
      }
    );
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npx vitest run src/__tests__/commands/listings.test.ts
```

Expected: all 30 tests pass.

- [ ] **Step 5: Run the full test suite to check for regressions**

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/commands/listings.ts src/__tests__/commands/listings.test.ts
git commit -m "feat: add listings create subcommand with tests"
```

---

## Task 3: `inventory list --sku` — tests + implementation

**Files:**
- Modify: `src/__tests__/commands/inventory.test.ts`
- Modify: `src/commands/inventory.ts`

### Background: key patterns

- Only the query object changes. Output path is identical to the existing `inventory list` tests.
- When `--sku` is absent, `sellerSkus` must NOT appear in the query (use `expect.not.objectContaining`).
- The opts type in the action handler needs `sku?: string` added.

- [ ] **Step 1: Add 2 failing tests for `inventory list --sku`**

Add inside `describe("inventory commands")` in `src/__tests__/commands/inventory.test.ts`, after the existing `shows auth hint on 401 error` test:

```typescript
  // ── inventory list --sku ───────────────────────────────────────────────────

  it("inventory list passes sellerSkus when --sku is provided", async () => {
    mockCallAPI.mockResolvedValueOnce({ inventorySummaries: [] });

    const program = new Command();
    program.exitOverride();
    registerInventoryCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "inventory", "list", "--sku", "MY-SKU"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          sellerSkus: ["MY-SKU"],
        }),
      })
    );
  });

  it("inventory list omits sellerSkus when --sku is not provided", async () => {
    mockCallAPI.mockResolvedValueOnce({ inventorySummaries: [] });

    const program = new Command();
    program.exitOverride();
    registerInventoryCommands(program, mockClient, resolveMarketplaceId);

    await program.parseAsync(["node", "test", "inventory", "list"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.not.objectContaining({
          sellerSkus: expect.anything(),
        }),
      })
    );
  });
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npx vitest run src/__tests__/commands/inventory.test.ts
```

Expected: the 2 new tests fail (no `--sku` option exists yet). Existing 7 tests still pass.

- [ ] **Step 3: Add `--sku` option to `inventory list` in `src/commands/inventory.ts`**

Three changes:

**a)** Add `.option("--sku <sku>", "Filter by seller SKU")` after the existing `.option("--json", ...)` line:

```typescript
    .option("--sku <sku>", "Filter by seller SKU")
```

**b)** Add `sku?: string` to the action opts type annotation:

```typescript
    .action(async (opts: { marketplace?: string; json?: boolean; sku?: string }) => {
```

**c)** Spread the conditional `sellerSkus` into the query object:

```typescript
        const result = await client.callAPI({
          operation: "getInventorySummaries",
          endpoint: "fbaInventory",
          query: {
            granularityType: "Marketplace",
            granularityId: marketplaceId,
            marketplaceIds: [marketplaceId],
            ...(opts.sku ? { sellerSkus: [opts.sku] } : {}),
          },
        }) as GetInventorySummariesResult;
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npx vitest run src/__tests__/commands/inventory.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 5: Run the full test suite to check for regressions**

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/commands/inventory.ts src/__tests__/commands/inventory.test.ts
git commit -m "feat: add --sku filter to inventory list with tests"
```
