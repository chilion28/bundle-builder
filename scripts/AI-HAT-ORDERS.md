# AI Hat production queue

Generates a local HTML dashboard of Create-Your-AI-Hat orders so production can
view and download each job's artwork without opening every order in Shopify.

For each job it lists: order # (links straight to the Shopify admin order), date,
fulfilment status, patch shape, variant, quantity, the print-quality score, and
download buttons for **Original / Print 600dpi / PDF / Preview**.

## One-time setup

The script needs Admin API access, which is **not** configured yet.

1. Shopify admin → **Settings → Apps and sales channels → Develop apps → Create an app**
2. **Configure Admin API scopes** → enable **`read_orders`**
3. **Install app**, then reveal the **Admin API access token**
4. Add it to `.env.admin-api` (git-ignored) in the repo root:

   ```
   SHOPIFY_STORE=citylocs.myshopify.com
   SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_...
   ```

`SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET` also work (client-credentials
exchange) if the app is owned by the same Shopify organisation.

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
