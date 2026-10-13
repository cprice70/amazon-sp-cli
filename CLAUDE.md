# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build       # Compile TypeScript to build/
npm run dev         # Run with tsx watch (no compile step)
npm run test        # Run all tests once
npm run test:watch  # Run tests in watch mode
```

Run a single test file:
```bash
npx vitest run src/__tests__/commands/orders.test.ts
```

Run the CLI locally without installing:
```bash
npx tsx src/index.ts <command>
# or after build:
node build/index.js <command>
```

## Architecture

**Entry point** (`src/index.ts`): Loads config, attempts to create the SP-API client, and registers command groups. Auth commands register without a client; all other command groups receive a `clientProxy` that defers the "not authenticated" error to runtime. `resolveMarketplaceId` and `resolveSellerId` helpers resolve from CLI options → config → error, and are passed into each command group.

**Config** (`src/config.ts`): Persists credentials to `~/.config/amazon-sp-cli/config.json`. Environment variables (`AMAZON_SP_*`) override file values. Config is always a `Partial<Config>` — the client validates completeness at construction time.

**SP client** (`src/sp-client.ts`): Thin wrapper around the `amazon-sp-api` `SellingPartner` class. Required because `amazon-sp-api` is CJS-only, so it's loaded via `createRequire`. All API calls go through `client.callAPI({ operation, endpoint, options, path, query, body })`.

**Command modules** (`src/commands/`): Each module exports a `register*Commands(program, client, ...)` function. Commands follow the pattern: resolve marketplace/seller IDs, call `client.callAPI(...)`, then render table or JSON based on `--json` flag. All SP-API calls use explicit version strings (e.g., `"2021-08-01"`).

**Output** (`src/output.ts`): Centralized rendering — `printTable`, `printJson`, `printSuccess`, `printError`, `printWarning`, `colorState`, `formatCurrency`.

**Tests** (`src/__tests__/`): Vitest tests mock `client.callAPI` via `vi.fn()`, spy on `console.log`/`console.error` and `process.exit`, then parse commands via `program.parseAsync(["node", "test", ...args])`. Tests are excluded from `tsconfig.json` compilation.

## Adding a New Command Group

1. Create `src/commands/<name>.ts` exporting `register<Name>Commands(program, client, resolveMarketplaceId, ...)`
2. Import and call it in `src/index.ts`, passing `clientProxy` and resolvers
3. Add tests at `src/__tests__/commands/<name>.test.ts`
