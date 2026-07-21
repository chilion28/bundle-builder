# AI Hat production queue

Generates a local HTML dashboard of Create-Your-AI-Hat orders so production can
view and download each job's artwork without opening every order in Shopify.

For each job it lists: order # (links straight to the Shopify admin order), date,
fulfilment status, patch shape, variant, quantity, the print-quality score, and
download buttons for **Original / Print 600dpi / PDF / Preview**.

## Setup — already done (2026-07-21)

Admin API access is configured and working. Recorded here in case it ever needs
redoing.

The app is **CityLocs Order Tools**, a UI-less app defined in
`Custom App/citylocs-order-tools/` (scope: `read_orders`, custom distribution).

**Legacy custom apps can no longer be created** (Shopify removed that on
2026-01-01), so it lives in the Dev Dashboard.

### Getting a token

`client_credentials` does **not** work here — it returns
`Oauth error shop_not_permitted`, because that grant requires the app's
organisation to *own* the store. The app is in the **CityLocs** org while the
store belongs to **Carving Image LLC**; custom distribution allows the install
but not org-level API access. (`citylocs-functions` is in the same org and works
fine — but it's a Shopify Function using direct API access, so it never performs
this exchange. It isn't a counter-example.)

Use the standard OAuth flow instead, which ignores org ownership:

```bash
node scripts/shopify-get-token.mjs
```

Open the URL it prints in a browser logged into the CityLocs admin, approve, and
it writes `SHOPIFY_ADMIN_ACCESS_TOKEN` into `.env.admin-api` (git-ignored). The
token is offline/long-lived — this is a one-time step.

Requires `http://localhost:3456/auth/callback` to stay registered under
`[auth] redirect_urls` in the app's `shopify.app.toml`.

## Usage

```bash
node scripts/ai-hat-orders.mjs                 # last 60 days
node scripts/ai-hat-orders.mjs --days 14       # last 2 weeks
node scripts/ai-hat-orders.mjs --csv           # also emit a spreadsheet
node scripts/ai-hat-orders.mjs --out ~/Desktop/ai-hats.html
node scripts/ai-hat-orders.mjs --demo          # sample rows, no API call
```

Report is written to `scripts/out/ai-hat-orders.html` — open it in any browser.
There's a live filter box for order #, shape or colour.

## Notes

- **Order data never leaves the machine.** The report is a local file; nothing is
  uploaded or hosted. `scripts/out/` is git-ignored for the same reason.
- **Orders older than 60 days** need the `read_all_orders` scope, which Shopify
  has to approve. Recent orders work with plain `read_orders`.
- The dashboard is a **snapshot** — re-run it to pick up new orders.
- A job is any line item carrying an `_Artwork Print` property (the older
  `_Artwork URL` name is still recognised, so pre-2026-07-20 orders resolve too).
- Files live in **Cloudinary** (`ai_hat_unsigned` folder), not Shopify. The PDF is
  the same asset as the print PNG, converted on the fly — it needs
  *Settings ▸ Security ▸ Allow delivery of PDF and ZIP files* enabled.
