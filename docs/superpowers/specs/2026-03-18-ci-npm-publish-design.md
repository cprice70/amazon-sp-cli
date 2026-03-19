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

**Trigger:** `push` of tags matching `v*` (e.g. `v1.0.0`, `v1.2.3`)

**Steps:**
1. `actions/checkout@v4`
2. `actions/setup-node@v4` with `node-version: 20` and `registry-url: https://registry.npmjs.org`
3. `npm ci`
4. `npm run build`
5. `npm test` — safety gate, publish only if tests pass
6. `npm publish --access public`

**Secret required:** `NPM_TOKEN` — set in GitHub repo Settings → Secrets and variables → Actions. Generate a Granular Access Token on npmjs.com scoped to this package with `Read and write` permissions.

**Environment variable:** `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` — required by `actions/setup-node` to authenticate with the npm registry.

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

Signals the Node requirement to npm and consumers. The existing `files: ["build"]`, `bin`, and `main` fields are already correct for publishing.

---

## What Is Not Included

- No automated version bumping (version is set manually in `package.json` before tagging)
- No GitHub Release creation (tag push is sufficient to trigger publish)
- No pre-release or beta channel support
- No Dependabot or other automation
