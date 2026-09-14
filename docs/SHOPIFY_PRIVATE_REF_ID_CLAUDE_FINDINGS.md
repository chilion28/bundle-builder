# `__ref_id` — Claude Independent Findings

Reviewer: Claude · Date: 2026-09-09 · Companion to `SHOPIFY_PRIVATE_REF_ID_INVESTIGATION.md` (Codex).
Scope: independently investigate whether the Aug 2026 bot incident or any resulting Shopify Plus/security action introduced `__ref_id`. **Evidence and inference are labeled separately. Nothing was changed or removed.**

## Bottom line

I found **no evidence CityLocs code or any storefront-visible app introduced `__ref_id`**, and **no local record of what (if anything) Shopify enabled** after the bot escalation. The bot-escalation → Shopify-feature link is a **plausible but unproven** lead. The writer operates below the storefront (server-side or Shopify platform). CityLocs' actual order downloaders are **not** at risk from `__ref_id`.

---

## EVIDENCE (verified facts)

**E1 — A Shopify Plus escalation was drafted/sent (Aug 10, 2026).** `Live Site/Shopify Bot Traffic Incident Brief - August 2026.md` is addressed to Shopify Plus Support and explicitly requests: edge-level **WAF, bot-management, managed-challenge, rate-limiting**, plus detailed **Cloudflare orange-cloud / WAF / managed-challenge** clarifications. Status "Active as of Aug 10."

**E2 — No record of Shopify's response or any enabled control.** Searched memory, all repos, docs, and the incident files. There is **no** local record that Shopify enabled a WAF, managed-challenge, bot-management, or any server-side control. (Evidence gap, not a negative finding.)

**E3 — No CityLocs code writes `__ref_id`.** `grep -rniE "__ref_id|ref_id|attributes\[|note_attributes|customAttributes"` across the live theme, `citylocs-functions`, the dashboard, `ai-hat-*` scripts, the upsell/post-purchase app, and the 07/22 backup returns **only readers** of `customAttributes` and Codex's report. **No writer of `__ref_id` / `attributes[__ref_id]` exists in any local code.** (The cart-checkout-validation Function *reads* `attributes[key]`; validation Functions cannot write cart attributes.)

**E4 — The storefront watcher detected NO change at the onset.** `cl-storefront-watch` logs external script domains + app/menu `updated_at` every ~90 min (`AI Hat Orders/security/storefront-history.log`). Around Sep 1 (onset 11:42 UTC):
- **Sep 1: zero "CHANGE DETECTED" events.**
- The only nearby changes were `assets.gemcommerce.com` (an existing app) flapping in/out of the script list, and app-`updated_at` rewrites whose **newest timestamp is `2026-08-06`** — i.e. **no app was installed or reconfigured at the onset.**
- Current tracked storefront scripts are all long-standing: gemcommerce, shopify cdn, jsdelivr, cdnjs, jquery, two cloudfront app distributions, loox, shop.app, klaviyo, luckyorange, unpkg. No new domain appeared at onset.

**E5 — citylocs.com uses Shopify's *default* Cloudflare edge, not a merchant proxy.** Response headers show `server: cloudflare` + `cf-ray` + `powered-by: Shopify` — this is Shopify's own global Cloudflare edge, present on **every** Shopify store. There is **no evidence CityLocs enabled its own orange-cloud proxy/WAF** (the thing the escalation asked about). Header `x-shopify-perf-experiments: f_sfr_upstream_forwarding_context_shim/v1` shows Shopify **does** run platform experiments/rollouts on this store.

**E6 — The order downloaders do not read `__ref_id`.** Both production paths fetch **only line-item** `customAttributes`, never order-level:
- Dashboard `citylocs-dashboard/lib/jobs.js` — `ORDERS_QUERY` order fields are `id name createdAt closed displayFulfillmentStatus` + `lineItems{...customAttributes}`. No order-level `customAttributes`/`note_attributes`.
- `Live Site/scripts/ai-hat-orders.mjs` — same; line-item `customAttributes` only. CSV writer `cell = v => '"'+String(v??'').replace(/"/g,'""')+'"'` is proper RFC-4180 quoting (safe for commas/quotes/newlines even in the customer `text` field). `api/download.js` builds filenames from order#/shape/kind, not `__ref_id`.

**E7 — Value format (from Codex's audit).** 743/1000 orders; exactly **28 characters** each; every value contains ≥1 char outside `[A-Za-z0-9_-]`, with `%`(33%), `=`(28%), `&`(28%), `\`(27%), `,`(25%), `?`(21%), whitespace(20%), `"`(18%), `/`(18%), `'`(18%) spread across values. Onset #407191 @ 2026-09-01 11:42:57 UTC; progressive 56% → ~90%.

---

## INFERENCE (labeled; confidence noted)

**I1 — The writer is below the storefront layer.** [High confidence] E3 (no local writer) + E4 (no storefront change at onset) + Codex's clean browser trace (no client-side `/cart/update.js` with `__ref_id`) together **rule out** the theme, client-side scripts, and any storefront-visible app. That leaves (a) Shopify's own platform/checkout/edge, or (b) a **server-side** app integration that writes the attribute via API with no storefront script — which the watcher **cannot** see.

**I2 — Bot-escalation → Shopify feature is plausible but UNPROVEN.** [Low–moderate confidence] The onset (Sep 1, sharp progressive rollout) ~3 weeks after the Aug 10 escalation, plus "private/opaque server-side reference" shape, is *consistent* with a Shopify-side control activated for the store (managed-challenge / bot-defense / checkout experiment). But: there is **no record Shopify enabled anything** (E2), the 3-week gap is loose, and the same signature fits unrelated Shopify rollouts or a server-side attribution app. **Correlation, not causation.**

**I3 — Format ≈ 28 raw bytes, and I cannot match it to a known Shopify reference.** [Moderate confidence on format; honest unknown on identity] 28 chars with that punctuation spread is **not** base64/base64url (those never contain `%&\,?"'` or whitespace). It is most consistent with **28 raw/binary bytes** (a fixed-length opaque token — e.g. timestamp+nonce+truncated-MAC, or a 224-bit value) rendered as a string. **I am not aware of a documented Shopify-native order attribute named `__ref_id` with a 28-char/28-byte format.** The generic name (`__ref_id`, not Shopify's usual `_shopify_*` namespace) mildly *weakens* the "Shopify-native" reading and keeps a **server-side app** (attribution/"ref"erral id) equally open. Cannot confirm a match to any known Shopify security/request reference.

**I4 — `__ref_id` will not break CityLocs' order downloaders.** [High confidence] Per E6 they never fetch the order-level attribute, so the hostile-character risk Codex flagged is **latent/hypothetical here**, not active. (Pre-existing minor robustness note, unrelated to `__ref_id`: `api/download.js` concatenates the filename into `Content-Disposition` without escaping `"` — harmless today because that field is order#/shape/kind.)

---

## Answers to the five questions

1. **Shopify response/feature enabled after the escalation?** No local evidence. Escalation confirmed sent (E1); Shopify's response/enablement is **not recorded anywhere locally** (E2). Must be confirmed with Shopify Plus.
2. **App/pixel/checkout-ext/fraud tool/server integration added ~Aug 31–Sep 1?** **No storefront-visible change** at onset (E4) — rules out a new theme/client-script/app as the writer. **Cannot rule out a server-side app integration** (invisible to the watcher).
3. **Code writing `__ref_id` / `attributes[__ref_id]`?** **None** found in any CityLocs code (E3).
4. **28-char format = known Shopify reference?** Format ≈ 28 raw bytes (opaque token), **not** base64 (E7/I3). **Not matched** to any documented Shopify security/request reference.
5. **Could it break the production order downloader?** **No** — neither downloader reads order-level attributes; CSV escaping is correct (E6/I4).

## Recommended next steps (evidence-driven)

- **Only Shopify can decode the owner.** Open a Shopify Plus case citing onset **#407191 @ 2026-09-01 11:42:57 UTC**, the progressive rollout, and the prior Aug bot escalation; ask **which subsystem owns private cart attribute `__ref_id`** (bot-defense / managed-challenge / checkout / attribution / experiment) and whether it was activated in response to that case.
- **Do NOT remove/alter the attribute** until the owner is known (agree with Codex).
- **Downloader:** no action required for `__ref_id`. Optionally add an explicit ignore-unknown-order-attributes rule + a hostile-value regression fixture (defense in depth), per Codex.
- If an app-level writer is suspected, the decisive test is a **server-side** capture (the watcher/browser can't see it): inspect the raw cart just before `checkout` via the Admin API on a live test order, or ask each installed app's vendor whether they write `__ref_id`.
