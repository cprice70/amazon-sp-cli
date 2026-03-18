# Auth Commands Test Design

**Date:** 2026-03-18
**Scope:** `src/__tests__/commands/auth.test.ts`

## Overview

Add unit tests for the three `auth` subcommands (`status`, `logout`, `login`). Unlike other command tests, `auth` requires module-level mocking via `vi.mock`:

- `../../config.js` — mock `loadConfig`, `saveConfig`, `deleteConfig`, `getConfigPath`
- `readline/promises` — mock `createInterface` to simulate interactive prompts
- `https` — mock `request` to simulate the `detectSellerId` HTTPS calls

`registerAuthCommands(program)` takes only `program` — no client or resolvers.

Note: chalk sets level=0 in non-TTY (Vitest) so all chalk wrappers return plain strings. No special chalk mocking needed.

---

## Spy Setup

In addition to `consoleSpy` (console.log) and `consoleErrorSpy` (console.error), also set up:
- `consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})` — needed because `printWarning` calls `console.warn`, not `console.log`

---

## Module Mocks

```typescript
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
```

Import the mocked functions:
```typescript
import { loadConfig, saveConfig, deleteConfig } from "../../config.js";
import readline from "readline/promises";
import https from "https";
import { EventEmitter } from "events";
```

---

## Helper: `mockReadline(answers)`

```typescript
function mockReadline(answers: string[]) {
  let i = 0;
  const rl = {
    question: vi.fn(async () => answers[i++] ?? ""),
    close: vi.fn(),
  };
  (readline.createInterface as ReturnType<typeof vi.fn>).mockReturnValue(rl);
  return rl;
}
```

Note: because `process.exit` is mocked (no-op), execution continues past validation failures. The `?? ""` fallback prevents crashes when the answer array is exhausted.

---

## Helper: `mockHttpsRequest(responses)`

`detectSellerId` calls `https.request(options, callback)`. The callback receives a response-like object that emits `"data"` and `"end"` events. Use `EventEmitter` (ESM import from `"events"`) to build the fake response:

```typescript
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
```

For "seller ID not detected", pass a response with no Invoicing Shadow entry:
```typescript
mockHttpsRequest([
  { access_token: "tok" },
  { payload: [{ marketplace: { name: "Regular" }, storeName: "MyStore" }] },
]);
```

For "https throws" (also results in no detected seller), mock `https.request` to call `req.on("error", cb)`:
```typescript
// Simplest: just return a response with no matching payload (shown above)
```

---

## `auth status`

**Authenticated — all credentials set**
- `loadConfig` returns `{ clientId: "client-id-value", clientSecret: "secret-value", refreshToken: "token-value", region: "na", sandbox: false, marketplaceId: "ATVPDKIKX0DER", sellerId: "SELLER123" }`
- Assert `console.log` called with string containing `"Authentication Status:"`
- Assert `console.log` called with string containing `"clie****alue"` (masked clientId: first 4 + `****` + last 4 of `"client-id-value"`)
- Assert `console.log` called with string containing `"Authenticated"` (from `printSuccess` → `console.log`)
- Assert `console.warn` NOT called

**Not authenticated — missing credentials**
- `loadConfig` returns `{}`
- Assert `console.log` called with string containing `"(not set)"` (for missing fields)
- Assert `console.warn` called with string containing `"Not authenticated"` (from `printWarning` → `console.warn`)
- Assert `console.error` NOT called

**`loadConfig` throws**
- `loadConfig` throws `new Error("disk error")`
- Assert `console.error` called
- Assert `process.exit(1)` called

---

## `auth logout`

**Success**
- `deleteConfig` is a vi.fn() that does nothing (default)
- Assert `deleteConfig` was called
- Assert `console.log` called with string containing `"Logged out"` (from `printSuccess`)

**`deleteConfig` throws**
- `(deleteConfig as ReturnType<typeof vi.fn>).mockImplementationOnce(() => { throw new Error("permission denied"); })`
- Note: the real `deleteConfig` swallows errors; the mock must throw explicitly
- Assert `console.error` called
- Assert `process.exit(1)` called

---

## `auth login`

**Happy path — seller ID auto-detected**
- `mockReadline(["my-client-id", "my-secret", "my-token", "na", "ATVPDKIKX0DER", "n"])`
  - Prompts in order: Client ID, Client Secret, Refresh Token, Region, Marketplace ID, Sandbox
- `mockHttpsRequest([{ access_token: "tok" }, { payload: [{ marketplace: { name: "Invoicing Shadow" }, storeName: "Invoicing_1_SELLER123" }] }])`
- Assert `saveConfig` called with `expect.objectContaining({ clientId: "my-client-id", clientSecret: "my-secret", refreshToken: "my-token", region: "na", sellerId: "SELLER123" })`
- Assert `console.log` called with string containing `"Config saved"` (from `printSuccess`)

**Validation: empty Client ID**
- `mockReadline([""])` — first answer is empty string
- `processExitSpy.mockImplementationOnce(() => { throw new Error("process.exit"); })` — make exit throw so execution halts (same pattern as listings invalid-JSON test; without this, execution continues past the no-op exit and eventually calls `saveConfig`)
- Wrap `program.parseAsync` in `try/catch` to absorb the thrown exit error
- Assert `console.error` called with string containing `"Client ID is required"`
- Assert `process.exit(1)` called
- Assert `saveConfig` NOT called

**Validation: invalid region**
- `mockReadline(["my-id", "my-secret", "my-token", "xx"])` — "xx" is not na/eu/fe
- `processExitSpy.mockImplementationOnce(() => { throw new Error("process.exit"); })` — halt execution at the validation failure point
- Wrap `program.parseAsync` in `try/catch`
- Assert `console.error` called with string containing `"Invalid region"`
- Assert `process.exit(1)` called
- Assert `saveConfig` NOT called

**Seller ID not detected — manual entry**
- `mockReadline(["my-client-id", "my-secret", "my-token", "na", "", "n", "MANUAL123"])`
  - 7th prompt is the manual Seller ID question shown after detection fails
- `mockHttpsRequest([{ access_token: "tok" }, { payload: [] }])` — no Invoicing Shadow match
- Assert `saveConfig` called with `expect.objectContaining({ sellerId: "MANUAL123" })`

**`saveConfig` throws**
- Valid inputs, seller ID auto-detected
- `(saveConfig as ReturnType<typeof vi.fn>).mockImplementationOnce(() => { throw new Error("write error"); })`
- Assert `console.error` called
- Assert `process.exit(1)` called
