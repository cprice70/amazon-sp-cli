# Command Enhancements Design

**Date:** 2026-03-18
**Scope:** Additive enhancements to three existing command modules

## Changes

### 1. `orders items --order <id>` (`src/commands/orders.ts`)

New subcommand added to the existing `orders` group. Consistent with `orders get --order <id>`.

**API call:**
```typescript
client.callAPI({
  operation: "getOrderItems",
  endpoint: "orders",
  path: { orderId: opts.order },
})
```

Note: No `options: { version }` field — matches the pattern of existing `orders list` and `orders get` commands which also omit it.

**Response shape:**
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

**Default output:** Table with columns `["ASIN", "SKU", "Title", "Qty Ordered", "Qty Shipped", "Price"]`. Qty Shipped defaults to `0` if absent. Price uses `formatCurrency(item.ItemPrice?.Amount)`. `CurrencyCode` is intentionally not shown in the table (consistent with `orders list` which also discards `CurrencyCode`).

**`--json`:** calls `printJson(result.OrderItems ?? [])` — outputs the items array, not the wrapper object.

**Empty:** if `OrderItems` is empty, print `"No items found for this order."`.

**Error handling:** `printError` + `process.exit(1)`; auth hint if 401/403.

**Required option:** `--order <id>` (use `.requiredOption`)

**Optional:** `--json`

Note: No `--marketplace` option — unlike `orders get` which accepts it for consistency, `orders items` omits it entirely since the API call does not use a marketplace ID.

**Error message prefix:** `Failed to get order items: ${message}`

---

### 2. `listings create --sku <sku> --body <json>` (`src/commands/listings.ts`)

New subcommand added to the existing `listings` group, sibling to `patch`.

**API call:**
```typescript
client.callAPI({
  operation: "putListingsItem",
  endpoint: "listingsItems",
  options: { version: "2021-08-01" },
  path: { sellerId, sku: opts.sku },
  query: { marketplaceIds: [marketplaceId] },
  body: parsedBody,
})
```

**Response shape:** Same as `PatchListingsItemResult`:
```typescript
interface PutListingsItemResult {
  status: string;
  submissionId?: string;
  issues?: Array<{ code: string; message: string; severity: string }>;
}
```

**Default output:** (2-space indent for issue lines — same as `patch`, not the 4-space used by `get`)
```
Status: ACCEPTED
Submission ID: SUB123    ← only if present
Issues:                  ← only if present
  [WARNING] CODE: message
```

**`--json`:** outputs full result object (`printJson(result)`).

**Body parsing:** Same inner try/catch pattern as `patch` — call `printError("Invalid JSON provided for --body")` then `process.exit(1)` before calling the API.

**Required options:** `--sku <sku>`, `--body <json>`

**Optional:** `--marketplace <id>`, `--seller <id>`, `--json`

**Error message prefix:** `Failed to create listings item: ${message}`

**Error handling:** `printError` + `process.exit(1)`; auth hint if 401/403.

---

### 3. `inventory list --sku <sku>` (`src/commands/inventory.ts`)

Adds an optional `--sku` filter to the existing `inventory list` command. All existing behaviour is unchanged when `--sku` is omitted.

**Option addition:** `.option("--sku <sku>", "Filter by seller SKU")` — also add `sku?: string` to the opts type annotation in the action handler.

**Query change:**
```typescript
query: {
  granularityType: "Marketplace",
  granularityId: marketplaceId,
  marketplaceIds: [marketplaceId],
  ...(opts.sku ? { sellerSkus: [opts.sku] } : {}),
}
```

**No output changes** — the table/JSON/empty handling remains identical.

---

## Test Coverage

Each enhancement gets tests in its existing test file, following established patterns:

### `orders items` tests (`src/__tests__/commands/orders.test.ts`)
- Table output by default (with items) — assert `callAPI` called with `operation: "getOrderItems"`
- `--json` flag outputs OrderItems array (assert `consoleSpy` called with `JSON.stringify(items, null, 2)`)
- Empty result prints "No items found for this order."
- API error → exit 1
- Auth hint on 401/403 error — assert `consoleErrorSpy` called with string containing `"auth login"`

### `listings create` tests (`src/__tests__/commands/listings.test.ts`)
- Success output — Status + Submission ID — assert `callAPI` called with `operation: "putListingsItem"`
- Issues present — assert issues lines in output
- `--json` flag — assert `consoleSpy` called with `JSON.stringify(result, null, 2)`
- Invalid `--body` JSON (processExit throws pattern) — assert `callAPI` NOT called
- Success output — Status only, no Submission ID (omits Submission ID line when absent)
- API error → exit 1
- Auth hint on 401/403 error — assert `consoleErrorSpy` called with string containing `"auth login"`

### `inventory list --sku` tests (`src/__tests__/commands/inventory.test.ts`)
- `--sku` passed → `sellerSkus: [sku]` in query
- No `--sku` → `sellerSkus` absent from query
