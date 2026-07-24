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

## Always-on copy for the team (scheduled)

A launchd agent regenerates the report every 10 minutes (and at login) and
publishes it to the shared server, so the team never runs anything:

    /Volumes/CL Media Server/WEB/AI Hat Orders/ai-hat-orders.html
                                              /ai-hat-orders.csv

Agent: `~/Library/LaunchAgents/com.citylocs.aihat-orders.plist`
(a copy is kept in `scripts/` for reference). Manage it with:

```bash
launchctl unload ~/Library/LaunchAgents/com.citylocs.aihat-orders.plist
launchctl load   ~/Library/LaunchAgents/com.citylocs.aihat-orders.plist
launchctl list | grep aihat        # col 2 = last exit code, 0 = healthy
tail ~/Library/Logs/citylocs-aihat-orders.err.log
```

Two macOS gotchas hit while setting this up — keep them in mind if it ever breaks:

1. **launchd log paths must be on the LOCAL disk.** Pointing `StandardOutPath`
   / `StandardErrorPath` at the network volume makes launchd fail with
   `EX_CONFIG` (exit 78) before the job even starts.
2. **Invoke `node` directly, not through a bash wrapper.** Running
   `/bin/bash wrapper.sh` from launchd was blocked by macOS privacy protection
   (`Operation not permitted`, exit 126) because the script lives on a network
   volume. Calling `/usr/local/bin/node` with the script path works, and means
   only one binary would ever need Full Disk Access.

`scripts/ai-hat-orders-sync.sh` still exists for manual/ad-hoc refreshes.

It only runs while this Mac is on and the share is mounted. Once the workflow
settles, a hosted or Shopify-embedded version removes that dependency.

## Verifying print files

```bash
node scripts/ai-hat-verify.mjs --days 2
```

Checks every order's print file is the right shape. Each patch has its own
window aspect, so a Hexagon order must not carry a Rectangle-shaped crop —
this catches artwork composited at the wrong aspect before it reaches print.

Expected output at 2400px wide:

| Shape     | Print size  |
|-----------|-------------|
| Rectangle | 2400 x 1277 |
| Rounded   | 2400 x 1906 |
| Circle    | 2400 x 2400 |
| Hexagon   | 2400 x 1311 |

Only the PNG header (34 bytes) is read, so it's fast despite the multi-MB files.
Exits non-zero if anything fails. The `WINDOW` table in the script mirrors the
one in `assets/cl-ai-hat.js` — keep them in step if the frames ever change.

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

## Token app change (2026-07-23)

The original app **CityLocs Order Tools** (`e8849449…`) got uninstalled during the
phishing investigation and **could not be reinstalled** — "installation link is
invalid." Root cause: that app lives in the **CityLocs dev org (223326541)** while
the store is owned by a **different org (Carving Image LLC)**, and Shopify blocks
cross-org custom-distribution *re*installs. (It only worked originally because it
was already installed from an earlier grant.)

Fix: a fresh app, **CityLocs Order Reader** (`fcd9d7a8bd45285126944ea838df094f`),
installs cleanly. Local project: `Custom App/citylocs-order-reader/` (copy of the
old one with the client_id + name swapped). Steps used:
1. `cd "Custom App/citylocs-order-reader" && shopify app deploy --force`
   — pushes `read_orders` + the `localhost:3456/auth/callback` redirect URL.
2. Put the new app's client_id + secret in `.env.admin-api`, blank the token.
3. `node scripts/shopify-get-token.mjs` → approve in browser → token written.

`client_credentials` still returns `shop_not_permitted` (same cross-org reason),
so the browser OAuth flow above remains the only way to mint the token.
