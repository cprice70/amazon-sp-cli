# Listings Commands Test Design

**Date:** 2026-03-18
**Scope:** `src/__tests__/commands/listings.test.ts`

## Overview

Add unit tests for the four `listings` subcommands (`search`, `get`, `delete`, `patch`). Tests follow the existing pattern in `orders.test.ts`: mock `client.callAPI` via `vi.fn()`, spy on `console.log`/`console.error`/`process.exit`, and drive commands via `program.parseAsync`.

Shared fixtures:
- `resolveMarketplaceId` returns `"ATVPDKIKX0DER"`
- `resolveSellerId` returns `"SELLER123"`

---

## `listings search`

**Happy path — table output (no `--sku`)**
- Mock returns `{ items: [{ sku: "SKU1", summaries: [{ marketplaceId: "ATVPDKIKX0DER", asin: "B001", itemName: "Widget", status: ["BUYABLE"] }] }] }`
- Assert `callAPI` called with `expect.objectContaining({ operation: "searchListingsItems", query: expect.objectContaining({ pageSize: 20 }) })`
- Assert `console.log` was called (table rendered)

**`--json` flag**
- Mock returns same shape; assert `console.log` called with `JSON.stringify(result.items, null, 2)` (the extracted items array, not the full result object)

**Empty result**
- Mock returns `{ items: [] }`; assert `console.log("No listings items found.")`

**`--sku` filter**
- Pass `--sku SKU1`; assert `callAPI` called with `query: expect.objectContaining({ identifiers: ["SKU1"], identifiersType: "SKU" })`
- Also assert `callAPI` was NOT called with `query: expect.objectContaining({ pageSize: expect.anything() })` — the two query shapes are mutually exclusive

**API error**
- Mock rejects with `new Error("API Error")`; assert `console.error` called and `process.exit(1)`

**Auth-error hint**
- Mock rejects with `new Error("401 Unauthorized")`
- `isAuthError` checks the message for `"401"`, `"403"`, `"unauthorized"`, `"forbidden"` (case-insensitive) — `"401 Unauthorized"` matches both checks
- Assert `console.error` called twice: once with the failure message, once with the auth hint containing `"auth login"`

---

## `listings get`

**Happy path — default output**
- Mock returns `{ sku: "SKU1", summaries: [{ marketplaceId: "ATVPDKIKX0DER", asin: "B001", itemName: "Widget", status: ["BUYABLE"] }] }`
- Assert `callAPI` called with `expect.objectContaining({ operation: "getListingsItem", path: { sellerId: "SELLER123", sku: "SKU1" } })`
- Implementation calls `console.log("")` (blank line) before and after the detail block
- All field lines have a 2-space indent: `"  SKU: SKU1"`, `"  ASIN: B001"`, `"  Title: Widget"`, `"  Status: BUYABLE"`
- Use `toHaveBeenCalledWith(expect.stringContaining(...))` assertions — do not assert on call count

**With issues**
- Mock returns same but adds `issues: [{ code: "ERR1", message: "Bad data", severity: "ERROR" }]`
- Implementation prints `console.log("  Issues:")` then `console.log("    [ERROR] ERR1: Bad data")` (4 leading spaces on the issue line)
- Assert `console.log` was called with a string containing `"[ERROR] ERR1: Bad data"`

**No matching summary**
- Mock returns `{ sku: "SKU1", summaries: [{ marketplaceId: "OTHER_MP" }] }`
- Implementation still calls `console.log("")` twice (blank lines) but skips the summary block
- Assert `console.log` was called with a string containing `"SKU1"`
- Assert `console.log` was NOT called with a string containing `"ASIN:"` or `"Title:"` or `"Status:"`

**`--json` flag**
- Mock returns the full `ListingsItem` object; assert `console.log` called with `JSON.stringify(result, null, 2)` where `result` is the entire mock return value

**API error**
- Assert `console.error` called and `process.exit(1)`

---

## `listings delete`

**Explicit status**
- Mock returns `{ status: "PURGED" }`
- Pass `--sku SKU1`
- Assert `callAPI` called with `expect.objectContaining({ operation: "deleteListingsItem", path: { sellerId: "SELLER123", sku: "SKU1" } })`
- Assert `console.log("Result: PURGED")`

**No status field fallback**
- Mock returns `{}` (no `status` key)
- Assert `console.log("Result: deleted")`

**API error**
- Assert `console.error` called and `process.exit(1)`

**Auth-error hint**
- Mock rejects with `new Error("403 Forbidden")` — matches `isAuthError` on `"403"` and `"forbidden"`
- Assert `console.error` called twice: failure message + auth hint containing `"auth login"`

---

## `listings patch`

**Success with submissionId**
- Mock returns `{ status: "ACCEPTED", submissionId: "SUB123" }`
- Pass `--sku SKU1 --body '{"patches":[]}'`
- Assert `callAPI` called with `expect.objectContaining({ operation: "patchListingsItem", path: { sellerId: "SELLER123", sku: "SKU1" }, body: { patches: [] } })`
- Assert `console.log("Status: ACCEPTED")` and `console.log("Submission ID: SUB123")`

**Success without submissionId**
- Mock returns `{ status: "ACCEPTED" }` (no `submissionId` key)
- Assert `console.log("Status: ACCEPTED")` was called; assert no call with a string containing `"Submission ID"`

**With issues**
- Mock returns `{ status: "INVALID", issues: [{ code: "ERR1", message: "Bad", severity: "WARNING" }] }`
- Implementation prints `console.log("Issues:")` (no indent) then `console.log("  [WARNING] ERR1: Bad")` (2 leading spaces — different from `get` which uses 4)
- Assert `console.log` was called with a string containing `"[WARNING] ERR1: Bad"`

**`--json` flag**
- Mock returns `{ status: "ACCEPTED" }`; assert `console.log` called with `JSON.stringify(result, null, 2)`

**Invalid `--body` JSON**
- Pass `--sku SKU1 --body 'not-json'`
- The JSON parse failure is caught in an inner `try/catch` inside the action — it calls `printError` then `process.exit(1)`; the outer catch is never reached
- **Important**: `process.exit` is mocked and does NOT actually exit, so execution continues after the inner catch with `parsedBody = undefined`, and `callAPI` would be called. To prevent this, override the mock for this test to throw: `processExitSpy.mockImplementationOnce(() => { throw new Error("process.exit"); })`
- Wrap `program.parseAsync` in `try/catch` to absorb the thrown error
- Assert `console.error` called, `process.exit(1)` called, and `mockCallAPI` was NOT called

**API error**
- Assert `console.error` called and `process.exit(1)`
