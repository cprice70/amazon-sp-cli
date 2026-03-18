# Inventory Commands Test Design

**Date:** 2026-03-18
**Scope:** `src/__tests__/commands/inventory.test.ts`

## Overview

Add unit tests for the single `inventory list` subcommand. Tests follow the existing pattern in `orders.test.ts` and `listings.test.ts`: mock `client.callAPI` via `vi.fn()`, spy on `console.log`/`console.error`/`process.exit`, and drive commands via `program.parseAsync`.

`registerInventoryCommands` takes `(program, client, resolveMarketplaceId)` — no `resolveSellerId`.

Shared fixtures:
- `resolveMarketplaceId` returns `"ATVPDKIKX0DER"`

Note: `printError` calls `chalk.red(message)` → `console.error(chalk.red(message))`. Chalk sets level=0 in non-TTY (Vitest), so assertions on error content work with plain strings.

---

## `inventory list`

**Happy path — table output**
- Mock returns `{ inventorySummaries: [{ asin: "B001", fnSku: "FN001", sellerSku: "SKU1", condition: "NewItem", inventoryDetails: { fulfillableQuantity: 10 }, totalQuantity: 10 }] }`
- Assert `callAPI` called with `expect.objectContaining({ operation: "getInventorySummaries", query: expect.objectContaining({ granularityType: "Marketplace", granularityId: "ATVPDKIKX0DER", marketplaceIds: ["ATVPDKIKX0DER"] }) })`
- Assert `console.log` was called (table rendered)

**`--json` flag**
- Mock returns `{ inventorySummaries: [{ asin: "B001", fnSku: "FN001", sellerSku: "SKU1", condition: "NewItem", totalQuantity: 3 }] }`
- Assert `console.log` called with `JSON.stringify(summaries, null, 2)` where `summaries` is the `inventorySummaries` array extracted from the result (not the full result object)
- There is exactly one `console.log` call in the `--json` path, so `toHaveBeenCalledWith` is unambiguous

**Empty result**
- Mock returns `{ inventorySummaries: [] }`
- Assert `console.log("No inventory found.")` — called directly via `console.log`, not through an output helper

**Qty uses `inventoryDetails.fulfillableQuantity` when present**
- Mock returns `{ inventorySummaries: [{ asin: "B001", fnSku: "FN001", sellerSku: "SKU1", condition: "NewItem", inventoryDetails: { fulfillableQuantity: 5 }, totalQuantity: 99 }] }`
- Implementation: `qty = inventoryDetails?.fulfillableQuantity ?? totalQuantity ?? 0` → yields `5`
- `printTable` calls `console.log(table.toString())` — the table string contains the qty value as a cell
- Assert `console.log` was called with a string containing `"5"` (the fulfillableQuantity value; use a unique number not present in ASIN/FNSKU/etc to avoid false matches)
- Assert `console.log` was NOT called with a string containing `"99"` (the totalQuantity that should be ignored)

**Qty falls back to `totalQuantity` when `inventoryDetails` is absent**
- Mock returns `{ inventorySummaries: [{ asin: "B001", fnSku: "FN001", sellerSku: "SKU1", condition: "NewItem", totalQuantity: 7 }] }` — no `inventoryDetails` field
- Implementation: `qty = undefined ?? 7 ?? 0` → yields `7`
- Assert `console.log` was called with a string containing `"7"`

**API error**
- Mock rejects with `new Error("API Error")`
- Assert `console.error` called and `process.exit(1)`

**Auth-error hint**
- Mock rejects with `new Error("401 Unauthorized")`
- `isAuthError` checks message for "401"/"403"/"unauthorized"/"forbidden" (case-insensitive) — "401 Unauthorized" matches
- Assert `console.error` called exactly twice (`toHaveBeenCalledTimes(2)`)
- Assert second call contains `"auth login"`: `expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("auth login"))`
