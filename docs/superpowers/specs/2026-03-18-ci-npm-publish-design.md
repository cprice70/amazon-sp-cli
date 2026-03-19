# CI and npm Publish Design

**Date:** 2026-03-18
**Scope:** GitHub Actions CI workflow + npm publish workflow

---

## Overview

Two GitHub Actions workflows and one `package.json` addition. No external services beyond GitHub Actions and npmjs.com.

---

## Workflow 1: CI (`ci.yml`)

**File:** `.github/workflows/ci.yml`

**Trigger:** `push` to `main`, `pull_request` targeting `main`

**Permissions:** `contents: read`

**Steps:**
1. `actions/checkout@v4`
2. `actions/setup-node@v4` with `node-version: 20`
3. `npm ci`
4. `npm run build`
5. `npm test`

**Purpose:** Validates every commit to main and every PR. No secrets required.

---

## Workflow 2: Publish (`publish.yml`)

**File:** `.github/workflows/publish.yml`

**Trigger:** `push` of tags matching `v[0-9]+.[0-9]+.[0-9]+` (e.g. `v1.0.0`, `v1.2.3`) — intentionally narrow to prevent accidental publishes from tags like `vtest` or `v-wip`

**Permissions:** `contents: read`

**Steps:**
1. `actions/checkout@v4`
2. `actions/setup-node@v4` with `node-version: 20` and `registry-url: https://registry.npmjs.org`
3. `npm ci`
4. `npm run build`
5. `npm test` — safety gate, publish only if tests pass
6. `npm publish --access public` with `env: NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`

**Secret required:** `NPM_TOKEN` — set in GitHub repo Settings → Secrets and variables → Actions. Generate a Granular Access Token on npmjs.com scoped to this package with `Read and write` permissions.

**Authentication note:** `NODE_AUTH_TOKEN` must be set as an `env` variable on the `npm publish` step (not on `setup-node`). The `actions/setup-node` step with `registry-url` writes an `.npmrc` that references `${NODE_AUTH_TOKEN}` — the token must be in the environment at publish time.

**Publish flow:**
```
# 1. Bump version in package.json manually
# 2. Commit and push to main
# 3. Tag and push tag
git tag v1.0.0
git push --tags
# Workflow fires, tests run, package publishes
```

---

## package.json Change

Add `engines` field:
```json
"engines": { "node": ">=18" }
```

The floor is `>=18` (not `>=20`) because the package uses no Node 20-specific APIs — Node 18+ is sufficient. CI runs on Node 20 (current LTS), which satisfies the `>=18` constraint. Consumers on Node 18 or 19 are supported by declaration; if a compatibility issue surfaces later the floor can be raised.

---

## What Is Not Included

- No automated version bumping (version is set manually in `package.json` before tagging)
- No GitHub Release creation (tag push is sufficient to trigger publish)
- No pre-release or beta channel support
- No Dependabot or other automation
