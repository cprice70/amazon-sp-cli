# amazon-sp-cli

A command-line tool for Amazon sellers to manage orders, inventory, listings, and catalog items directly from the terminal using the Amazon Selling Partner API (SP-API).

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

```bash
# Clone and install
git clone https://github.com/cprice70/amazon-sp-cli.git
cd amazon-sp-cli
npm install

# Build
npm run build

# Make the `amazon-sp` command available globally
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

Credentials are saved to `~/.config/amazon-sp-cli/config.json`.

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
amazon-sp orders list --start 2026-01-01 --end 2026-03-01
amazon-sp orders list --json
```

| Flag | Description |
|------|-------------|
| `--status <status>` | Filter by status: `PENDING`, `UNSHIPPED`, `SHIPPED`, `CANCELED`, etc. |
| `--start <date>` | ISO date for CreatedAfter (default: 30 days ago) |
| `--end <date>` | ISO date for CreatedBefore |
| `--marketplace <id>` | Override default marketplace ID |
| `--json` | Output raw JSON |

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
amazon-sp inventory list --json
```

| Flag | Description |
|------|-------------|
| `--sku <sku>` | Filter by seller SKU |
| `--marketplace <id>` | Override default marketplace ID |
| `--json` | Output raw JSON |

---

### Listings

**Search your listings:**

```bash
amazon-sp listings search
amazon-sp listings search --sku MY-SKU-123
amazon-sp listings search --json
```

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
amazon-sp catalog search --query "blue widget" --json
```

---

**Get a catalog item by ASIN:**

```bash
amazon-sp catalog get --asin B001234567
amazon-sp catalog get --asin B001234567 --json
```

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

Environment variables override values in the config file.

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
