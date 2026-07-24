# Runbook: getting an Admin API token for the Image Hat dashboard

Use this whenever the dashboard shows **"Couldn't refresh from Shopify: Admin API
401"** — i.e. the token stopped working (app uninstalled, token revoked, etc.).

The dashboard just needs a valid **`shpat_…` Admin API access token** with
**`read_orders`** scope in `.env.admin-api`. Everything below is how to mint one.

---

## Quick decision

- **Token just needs refreshing, app still installed?** → jump to **Step C** (OAuth).
- **App was uninstalled / "installation link is invalid"?** → do **Step A → B → C**
  with a FRESH app (do not fight the old one — see the gotcha).

---

## The gotcha that wasted hours once (read this first)

Our store **citylocs** is owned by the **Carving Image LLC** org. Our custom apps
live in a **different** dev org (**CityLocs**, `dev.shopify.com/dashboard/223326541`).

Shopify **blocks reinstalling a custom-distribution app across orgs.** So once an
app here is uninstalled, its install link reads **"installation link is invalid"**
forever. **Don't try to revive it — make a new app instead.** A brand-new app
installs cleanly the first time.

Also: `client_credentials` grant **never works** here (`shop_not_permitted`, same
cross-org reason). The **browser OAuth flow (Step C)** is the only way that works.

---

## Step A — create a fresh app (only if the old one won't install)

Fastest is to clone the existing local project and repoint it:

```bash
cd "/Volumes/CL Media Server/WEB/Shopify/Custom App"
cp -R citylocs-order-reader citylocs-order-NEWNAME
cd citylocs-order-NEWNAME
rm -rf .shopify node_modules .git
```

Then in the **Dev Dashboard** (dev.shopify.com) create an app (or the CLI will
create one on first deploy). Note its **Client ID**. Edit `shopify.app.toml`:
- set `client_id = "<new app Client ID>"`
- set `name = "<new app name>"`
- confirm `scopes = "read_orders"` under `[access_scopes]`
- confirm `[auth] redirect_urls` includes `http://localhost:3456/auth/callback`

## Step B — deploy the config (registers scope + redirect URL)

```bash
cd "/Volumes/CL Media Server/WEB/Shopify/Custom App/citylocs-order-NEWNAME"
shopify app deploy --force
```

Wait for **"New version released to users."** This is what makes the redirect URL
and `read_orders` scope live on the app — without it, OAuth fails.

## Step C — mint the token (browser OAuth)

1. Get the app's **Client ID + Client secret**: Dev Dashboard → the app →
   **Settings → Credentials** (click the eye to reveal the secret).
2. Put them in the env file (leave the token line blank):
   ```bash
   open -e "/Volumes/CL Media Server/WEB/Shopify/Live Site/.env.admin-api"
   ```
   ```
   SHOPIFY_STORE=citylocs.myshopify.com
   SHOPIFY_CLIENT_ID=<app Client ID>
   SHOPIFY_CLIENT_SECRET=<app Client secret, shpss_…>
   SHOPIFY_ADMIN_ACCESS_TOKEN=
   ```
3. Run the helper:
   ```bash
   cd "/Volumes/CL Media Server/WEB/Shopify/Live Site"
   node scripts/shopify-get-token.mjs
   ```
   It prints an **authorize URL**. Open it in a browser **logged into the CityLocs
   admin**, click **Install / Approve** (read orders). The tab shows
   **"Token saved"** and the helper writes `SHOPIFY_ADMIN_ACCESS_TOKEN` (`shpat_…`)
   into `.env.admin-api`.

## Step D — verify + refresh the dashboard

```bash
cd "/Volumes/CL Media Server/WEB/Shopify/Live Site"
node -e 'import("./scripts/ai-hat-core.mjs").then(async m=>{m.loadEnvFile();const r=await m.getJobs({days:60});console.log("OK —",r.jobs.length,"jobs");}).catch(e=>console.log("FAIL:",e.message))'
launchctl kickstart -k "gui/$(id -u)/com.citylocs.aihat-server"   # restart so it picks up the new token now
```

Then open the dashboard — the red banner should be gone and "data refreshed"
should show the current time.

---

## Common errors → meaning

| What you see | Meaning | Do |
|---|---|---|
| `Install` greyed out / "installation link is invalid" | cross-org reinstall block | make a NEW app (Step A) |
| `Oauth error shop_not_permitted` | tried `client_credentials` cross-org | use OAuth (Step C) |
| token prefix `shpss_` in the token slot | that's the *secret*, not the token | the token is `shpat_`, minted by Step C |
| `redirect_uri is not whitelisted` | redirect URL not deployed | run Step B (`shopify app deploy`) |
| Port 3456 EADDRINUSE | a previous helper is still running | `lsof -ti :3456 \| xargs kill -9` |

## The last-resort clean fix

If a fresh app also refuses, the real fix is an app created **inside the Carving
Image LLC org** (the store owner) by whoever has that org access — then there's no
cross-org block at all. That's a ~2-minute task for the backend dev.
