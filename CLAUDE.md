# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build       # Compile TypeScript to build/ (tsconfig.build.json, excludes tests)
npm run dev         # Run with tsx watch (no compile step)
npm run test        # Run all tests once
npm run test:watch  # Run tests in watch mode
npm run typecheck   # tsc --noEmit over src AND tests (tsconfig.json)
npm run lint        # eslint
npm run format      # prettier --write (markdown is excluded)
npm run check       # typecheck + lint + format:check + test — what CI runs
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

**Entry point** (`src/index.ts`): Loads config (exiting on a `CliError` such as an invalid region), then calls `buildProgram(config, { createClient, version }).parse()`.

**Program assembly** (`src/cli.ts`): `buildProgram` creates the commander `Command`, adds the root `--sandbox` option, and registers command groups. Auth commands register without a client; all other groups receive a `clientProxy` whose first property access builds the real client via `deps.createClient` (so `--sandbox` has been parsed and help/version never touch credentials). Missing credentials surface as a `CliError` with `EXIT.AUTH`. `resolveMarketplaceId` and `resolveSellerId` resolve from CLI options → config → `CliError`. Tests build the program with a fake `createClient` (`src/__tests__/cli.test.ts`).

**Command groups:** `auth`, `orders`, `inventory`, `catalog`, `listings`, `sellers`, `reports`, `finances`, `fba` under `src/commands/`. `reports` takes an optional `{ sleep, now }` deps object so `--wait` polling is testable without timers.

**Completion** (`src/completion.ts`): `generateCompletion(program, "bash" | "zsh")` walks `program.commands` (groups → subcommands → long option flags) and emits a static script; `registerCompletionCommand` exposes it as `completion <shell>`. New commands and options appear automatically.

**Prompts** (`src/prompt.ts`): `createPrompter()` wraps readline with `ask` and `askSecret`; the latter mutes readline's echo so secrets are not shown. `auth login` uses it; tests mock the module.

**Config** (`src/config.ts`): Persists credentials to `~/.config/amazon-sp-cli/config.json` (dir 0700, file 0600). Environment variables (`AMAZON_SP_*`) override file values. Config is always a `Partial<Config>` — the client validates completeness at construction time. `loadConfig` throws a `CliError` if the merged region is not one of `REGIONS`.

**SP client** (`src/sp-client.ts`): Thin wrapper around the `amazon-sp-api` `SellingPartner` class. Required because `amazon-sp-api` is CJS-only, so it's loaded via `createRequire`. All API calls go through `client.callAPI({ operation, endpoint, options, path, query, body })`.

**Command modules** (`src/commands/`): Each module exports a `register*Commands(program, client, ...)` function. Every action body is wrapped in `runCommand(label, async () => { ... })` from `src/errors.ts`, which owns all error printing and `process.exit` calls. Inside, commands resolve marketplace/seller IDs, call `client.callAPI(...)`, then render table or JSON based on `--json` flag. All SP-API calls use explicit version strings (e.g., `"2021-08-01"`).

**Errors and exit codes** (`src/errors.ts`): Throw `CliError(message, exitCode)` for user-facing input problems; `runCommand` prints it verbatim. API errors are formatted with `formatApiError` and auth failures detected by `isAuthError`. Exit codes live in `EXIT` (`FAILURE`=1, `USAGE`=2, `AUTH`=3). Don't call `process.exit` from command bodies.

**Pagination** (`src/paginate.ts`): List commands fetch pages through `collectPages(fetchPage, { all, limit })`. `fetchPage(nextToken)` returns `{ items, nextToken }`; the helper handles single-page default, `--all`, and `--limit` truncation. Use `parseLimit` as the commander argParser for `--limit` and `pageSizeFor(limit, apiMax)` for the per-API page-size cap.

**Output** (`src/output.ts`): Centralized rendering — `printTable` (pass `{ maxWidths }` to truncate wide columns such as titles), `printJson`, `printSuccess`, `printError`, `printWarning`, `colorState`, `formatCurrency(amount, currencyCode)`.

**Tests** (`src/__tests__/`): Vitest tests mock `client.callAPI` via `vi.fn()`, spy on `console.log`/`console.error` and `process.exit`, then parse commands via `program.parseAsync(["node", "test", ...args])`. Tests are type-checked by `npm run typecheck` but excluded from the build.

## Releasing

1. `npm version <x.y.z> -m "v%s"` on `main` (creates the commit and the `vX.Y.Z` tag).
2. `git push origin main && git push origin vX.Y.Z`.
3. The tag push runs `.github/workflows/publish.yml`: install, build, test, `npm publish`.
4. Draft release notes with `gh release create vX.Y.Z --draft --notes-file ...`, then publish the release.

Publishing uses **npm trusted publishing** (OIDC), not a stored token. The workflow has `id-token: write` and the npm package has a trusted publisher configured for this repo and `publish.yml`. If a run fails after the tag exists, fix the cause and re-run with `gh workflow run publish.yml --ref main`; it publishes whatever version `package.json` holds.

## Adding a New Command Group

1. Create `src/commands/<name>.ts` exporting `register<Name>Commands(program, client, resolveMarketplaceId, ...)`
2. Import and call it in `src/index.ts`, passing `clientProxy` and resolvers
3. Add tests at `src/__tests__/commands/<name>.test.ts`
