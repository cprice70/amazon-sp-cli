# CI and npm Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub Actions CI workflow (runs tests on every push/PR) and a publish workflow (publishes to npm on semver tags), plus an `engines` field in `package.json`.

**Architecture:** Three small, independent changes: a `package.json` edit, a CI YAML file, and a publish YAML file. No code logic is involved — these are pure configuration files. No unit tests exist for GitHub Actions workflows; correctness is verified by linting the YAML and checking the files match the spec exactly.

**Tech Stack:** GitHub Actions, npmjs.com, Node 20, YAML

---

## File Map

- **Modify:** `package.json` — add `engines` field
- **Create:** `.github/workflows/ci.yml` — CI workflow (test on push/PR)
- **Create:** `.github/workflows/publish.yml` — publish to npm on semver tag push

---

## Task 1: Add `engines` to `package.json`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add `engines` field**

In `package.json`, add after the `"license"` field:

```json
"engines": { "node": ">=18" },
```

The complete relevant section of `package.json` should look like:

```json
{
  "name": "amazon-sp-cli",
  "version": "0.1.0",
  "description": "CLI for Amazon Selling Partner API",
  "type": "module",
  "main": "build/index.js",
  "bin": {
    "amazon-sp": "build/index.js"
  },
  "files": ["build"],
  "engines": { "node": ">=18" },
  "scripts": {
    ...
  }
}
```

- [ ] **Step 2: Verify JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('valid')"
```

Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add engines field (node >=18)"
```

---

## Task 2: CI Workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the `.github/workflows/` directory and `ci.yml`**

```bash
mkdir -p .github/workflows
```

Create `.github/workflows/ci.yml` with this exact content:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci

      - run: npm run build

      - run: npm test
```

- [ ] **Step 2: Verify YAML is valid**

```bash
node -e "
const yaml = require('js-yaml');
const fs = require('fs');
" 2>/dev/null || python3 -c "
import yaml, sys
with open('.github/workflows/ci.yml') as f:
    yaml.safe_load(f)
print('valid')
"
```

If neither `js-yaml` nor `python3` with yaml is available, just visually inspect the indentation (YAML is whitespace-sensitive — 2 spaces per level, no tabs).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions CI workflow"
```

---

## Task 3: Publish Workflow

**Files:**
- Create: `.github/workflows/publish.yml`

**Background:** This workflow fires only when a tag matching the pattern `v[0-9]+.[0-9]+.[0-9]+` is pushed (e.g. `v1.0.0`). It uses `NODE_AUTH_TOKEN` (set as an `env` on the publish step) to authenticate with the npm registry. The `actions/setup-node` step with `registry-url` writes an `.npmrc` file that references `${NODE_AUTH_TOKEN}` — so the token must be present in the environment when `npm publish` runs, not just at setup time.

The `NPM_TOKEN` secret must be configured in the GitHub repo before this workflow can succeed. Instructions are in the commit message.

- [ ] **Step 1: Create `.github/workflows/publish.yml`**

```yaml
name: Publish to npm

on:
  push:
    tags:
      - 'v[0-9]+.[0-9]+.[0-9]+'

permissions:
  contents: read

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: https://registry.npmjs.org

      - run: npm ci

      - run: npm run build

      - run: npm test

      - run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 2: Verify YAML is valid**

Visually inspect indentation — 2 spaces per level, no tabs. The `env:` block on the last step must be at the same indentation level as `run:`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/publish.yml
git commit -m "ci: add npm publish workflow (triggers on semver tags)

Before this workflow can publish, add NPM_TOKEN to GitHub repo secrets:
1. npmjs.com → Profile → Access Tokens → Generate New Token (Granular)
2. Scope: this package, Read and Write permissions
3. GitHub repo → Settings → Secrets and variables → Actions → New secret
   Name: NPM_TOKEN, Value: <token from step 2>

To publish a release:
  # 1. Bump version in package.json, commit and push
  git tag v1.0.0
  git push --tags
  # Workflow fires automatically"
```

- [ ] **Step 4: Push to remote**

```bash
git push origin main
```

Expected: CI workflow fires on GitHub for the pushed commits.
