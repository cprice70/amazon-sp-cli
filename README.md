# amazon-sp-cli

A command-line tool for Amazon sellers to manage orders, inventory, listings, catalog items, reports, finances, and FBA inbound shipments directly from the terminal using the Amazon Selling Partner API (SP-API).

```
$ amazon-sp orders list
┌─────────────────────┬──────────┬──────────────────────┬───────┬─────────┐
│ Order ID            │ Status   │ Purchase Date        │ Items │ Total   │
├─────────────────────┼──────────┼──────────────────────┼───────┼─────────┤
│ 123-4567890-1234567 │ SHIPPED  │ 2026-03-15T14:22:00Z │ 2     │ $49.98  │
│ 234-5678901-2345678 │ PENDING  │ 2026-03-17T09:11:00Z │ 1     │ $24.99  │
└─────────────────────┴──────────┴──────────────────────┴───────┴─────────┘
```

---

## Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **Amazon SP-API credentials** — you'll need:
  - Client ID and Client Secret (from your SP-API app in Seller Central)
  - Refresh Token (generated when you authorize your app)
  - Your selling region (`na`, `eu`, or `fe`)

If you haven't set up SP-API access yet, start at [Seller Central → Apps & Services → Develop Apps](https://sellercentral.amazon.com/developer/applications).

---

## Installation

### From npm (recommended)

```bash
npm install -g amazon-sp-cli
```

### From source

```bash
git clone https://github.com/cprice70/amazon-sp-cli.git
cd amazon-sp-cli
npm install
npm run build
npm link
```

Verify it's working:

```bash
amazon-sp --version
```

---

## Authentication

Run the login wizard to store your credentials:

```bash
amazon-sp auth login
```

You'll be prompted for:

| Prompt | What to enter |
|--------|---------------|
| Client ID | Your SP-API app's Client ID (`amzn1.application-oa2-client...`) |
| Client Secret | Your SP-API app's Client Secret |
| Refresh Token | Your LWA Refresh Token (`Atzr|...`) |
| Region | `na` (North America), `eu` (Europe), or `fe` (Far East) |
| Marketplace ID | Your default marketplace (e.g. `ATVPDKIKX0DER` for US). Press Enter to skip. |
| Sandbox mode | `y` to use the SP-API sandbox, `n` for production |

The CLI will attempt to auto-detect your Seller ID. If that fails, you'll be prompted to enter it manually (required for listings commands).

The Client Secret and Refresh Token are not echoed as you type them.

Credentials are saved to `~/.config/amazon-sp-cli/config.json`, readable only by your user.

**Check your auth status:**

```bash
amazon-sp auth status
```

**Log out / clear credentials:**

```bash
amazon-sp auth logout
```

---

## Commands

### Orders

**List recent orders** (last 30 days by default):

```bash
amazon-sp orders list
amazon-sp orders list --status UNSHIPPED
amazon-sp orders list --status PENDING,UNSHIPPED
amazon-sp orders list --start 2026-01-01 --end 2026-03-01
amazon-sp orders list --limit 500
amazon-sp orders list --all --json
```

| Flag | Description |
|------|-------------|
| `--status <statuses>` | Filter by status, comma-separated: `PENDING`, `UNSHIPPED`, `SHIPPED`, `CANCELED`, etc. |
| `--start <date>` | ISO date for CreatedAfter (default: 30 days ago) |
| `--end <date>` | ISO date for CreatedBefore |
| `--limit <n>` | Return at most `n` orders, fetching more pages as needed |
| `--all` | Follow pagination until every matching order is returned |
| `--marketplace <id>` | Override default marketplace ID |
| `--json` | Output raw JSON |

Without `--limit` or `--all`, a single page (up to 100 orders) is returned. Order totals are formatted in the order's own currency.

---

**Get a single order:**

```bash
amazon-sp orders get --order 123-4567890-1234567
amazon-sp orders get --order 123-4567890-1234567 --json
```

---

**List items in an order:**

```bash
amazon-sp orders items --order 123-4567890-1234567
amazon-sp orders items --order 123-4567890-1234567 --json
```

---

### Inventory

**List FBA inventory:**

```bash
amazon-sp inventory list
amazon-sp inventory list --sku MY-SKU-123
amazon-sp inventory list --all --json
```

| Flag | Description |
|------|-------------|
| `--sku <sku>` | Filter by seller SKU |
| `--all` | Follow pagination until every summary is returned |
| `--marketplace <id>` | Override default marketplace ID |
| `--json` | Output raw JSON |

---

### Listings

**Search your listings:**

```bash
amazon-sp listings search
amazon-sp listings search --sku MY-SKU-123
amazon-sp listings search --limit 50
amazon-sp listings search --all --json
```

| Flag | Description |
|------|-------------|
| `--sku <sku>` | Look up a single SKU |
| `--limit <n>` | Return at most `n` listings, fetching more pages as needed |
| `--all` | Follow pagination until every listing is returned |
| `--marketplace <id>` | Override default marketplace ID |
| `--seller <id>` | Override default seller ID |
| `--json` | Output raw JSON |

---

**Get a listing by SKU:**

```bash
amazon-sp listings get --sku MY-SKU-123
amazon-sp listings get --sku MY-SKU-123 --json
```

---

**Create a listing:**

```bash
amazon-sp listings create --sku MY-SKU-123 --body '{"productType":"LUGGAGE","requirements":"LISTING",...}'
```

| Flag | Description |
|------|-------------|
| `--sku <sku>` | The SKU to create (required) |
| `--body <json>` | Full listing body as a JSON string (required) |
| `--marketplace <id>` | Override default marketplace ID |
| `--seller <id>` | Override default seller ID |
| `--json` | Output raw JSON |

---

**Update a listing (patch):**

```bash
amazon-sp listings patch --sku MY-SKU-123 --body '{"patches":[{"op":"replace","path":"/attributes/price","value":[{"value":"19.99","currency":"USD"}]}]}'
```

| Flag | Description |
|------|-------------|
| `--sku <sku>` | The SKU to update (required) |
| `--body <json>` | Patch body as a JSON string (required) |
| `--marketplace <id>` | Override default marketplace ID |
| `--seller <id>` | Override default seller ID |
| `--json` | Output raw JSON |

---

**Delete a listing:**

```bash
amazon-sp listings delete --sku MY-SKU-123
```

---

### Catalog

**Search catalog items:**

```bash
amazon-sp catalog search --query "blue widget"
amazon-sp catalog search --query "blue widget" --limit 40
amazon-sp catalog search --query "blue widget" --all --json
```

| Flag | Description |
|------|-------------|
| `--query <term>` | Search keywords (required) |
| `--limit <n>` | Return at most `n` items, fetching more pages as needed |
| `--all` | Follow pagination until every result is returned |
| `--marketplace <id>` | Override default marketplace ID |
| `--json` | Output raw JSON |

---

**Get a catalog item by ASIN:**

```bash
amazon-sp catalog get --asin B001234567
amazon-sp catalog get --asin B001234567 --json
```

---

### Sellers

```bash
amazon-sp sellers participations          # marketplaces you sell in, with IDs
amazon-sp sellers account                 # business details
amazon-sp sellers participations --json
```

---

### Reports

**Request a report and wait for it:**

```bash
amazon-sp reports create --type GET_MERCHANT_LISTINGS_ALL_DATA --wait --out listings.tsv
amazon-sp reports create --type GET_SALES_AND_TRAFFIC_REPORT \
  --start 2026-01-01T00:00:00Z --end 2026-02-01T00:00:00Z \
  --option dateGranularity=DAY --option asinGranularity=CHILD --wait
```

Without `--wait` the command prints the report ID and returns immediately. With `--wait` it polls every 15 seconds (up to 30 minutes) and then prints the document to stdout, or saves it with `--out`.

| Flag | Description |
|------|-------------|
| `--type <type>` | Report type (required). See Amazon's report type list. |
| `--start <date>` / `--end <date>` | ISO dates for `dataStartTime` / `dataEndTime` |
| `--option <key=value>` | Report option; repeat for several |
| `--wait` | Poll until done, then download |
| `--out <file>` | With `--wait`, save to a file instead of stdout |
| `--marketplace <id>` | Override default marketplace ID |
| `--json` | Output raw JSON |

**Check, list, download, or cancel:**

```bash
amazon-sp reports get --report 123456789
amazon-sp reports list --type GET_MERCHANT_LISTINGS_ALL_DATA --status DONE
amazon-sp reports list --all --json
amazon-sp reports download --report 123456789 --out report.tsv
amazon-sp reports download --report 123456789 --wait      # still processing? poll first
amazon-sp reports cancel --report 123456789
```

`reports list` takes `--type`, `--status` (comma-separated), `--limit`, `--all`, `--marketplace`, and `--json`.

---

### Finances

```bash
amazon-sp finances groups                            # settlement periods, last 90 days
amazon-sp finances groups --start 2026-01-01 --all
amazon-sp finances events                            # all financial events, last 30 days
amazon-sp finances events --order 123-4567890-1234567
amazon-sp finances events --group 12345678901234567890
amazon-sp finances transactions                      # Finances 2024-06-19 transactions, last 30 days
amazon-sp finances transactions --status DEFERRED --all --json
```

Every finances command accepts `--start`, `--end`, `--limit`, `--all`, and `--json`. `finances events` renders each event list (shipments, refunds, fees, adjustments, ...) as one table with the event type in the first column; `--json` prints the raw `FinancialEvents` object.

---

### FBA inbound shipments

```bash
amazon-sp fba shipments                              # active shipments
amazon-sp fba shipments --status CLOSED,CANCELLED
amazon-sp fba shipments --shipment FBA15ABCDEFG
amazon-sp fba shipment-items --shipment FBA15ABCDEFG
```

---

### Shell completion

```bash
# bash
amazon-sp completion bash > ~/.local/share/bash-completion/completions/amazon-sp
# or for the current shell only
eval "$(amazon-sp completion bash)"

# zsh
amazon-sp completion zsh > "${fpath[1]}/_amazon-sp" && compinit
```

The script is generated from the command tree, so it stays current with the installed version.

---

## Configuration

Credentials are stored at:

```
~/.config/amazon-sp-cli/config.json
```

You can also set credentials via environment variables (useful for CI/scripts):

| Environment Variable | Config Field |
|----------------------|--------------|
| `AMAZON_SP_CLIENT_ID` | Client ID |
| `AMAZON_SP_CLIENT_SECRET` | Client Secret |
| `AMAZON_SP_REFRESH_TOKEN` | Refresh Token |
| `AMAZON_SP_REGION` | Region (`na`, `eu`, `fe`) |
| `AMAZON_SP_MARKETPLACE_ID` | Default Marketplace ID |
| `AMAZON_SP_SELLER_ID` | Default Seller ID |
| `AMAZON_SP_SANDBOX` | Sandbox mode (`true`/`false`) |

Environment variables override values in the config file. An invalid `AMAZON_SP_REGION` is rejected at startup.

### Sandbox

Pass `--sandbox` on any command to hit the SP-API sandbox for that one invocation, regardless of the saved setting. A note is printed to stderr whenever the sandbox is in use.

```bash
amazon-sp orders list --sandbox
```

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | The command ran but failed (API error, network error, etc.) |
| `2` | Bad input: missing marketplace or seller ID, malformed `--body` JSON, invalid flag value |
| `3` | Not authenticated, or credentials were rejected by Amazon |

---

## Troubleshooting

**"Not authenticated" error**
Run `amazon-sp auth login` to set up your credentials, then `amazon-sp auth status` to verify they're stored correctly.

**401 or 403 errors on commands**
Your refresh token may have expired or been revoked. Run `amazon-sp auth login` again to re-authenticate.

**"Seller ID not set" error on listings commands**
Either re-run `amazon-sp auth login` (the wizard will attempt to detect your Seller ID) or pass `--seller <id>` directly, or set `AMAZON_SP_SELLER_ID` in your environment.

---

## License

MIT
