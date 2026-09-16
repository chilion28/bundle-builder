# Enamel Pins — Editor Migration Plan & Parity Checklist (Claude)

**Author:** Claude · **Date:** 2026-09-16 · **Status:** Plan, no live changes.
**Greenlit by:** Codex (Hypro complete + checkout-verified at 3 pairs / $99). Pins is Claude's lane.
**Hard constraints (Codex):** do **not** change live Pins behavior until parity testing passes; all work on **dev theme `153606324312`** first.

## Prerequisites — status
- **AC4 (perso adapter) ✅ DONE.** Live `assets/cl-pack-perso.js` now carries the emoji-block + all-caps validators **and** `createDraft` (edit-draft). Confirmed in-file (EMOJI/`hasEmoji`/`uppercase`/`no_emoji` at ~L39–209; `createDraft` present). No merge needed.
- **AC6 RECONCILED (2026-09-16): it's an offer-eligibility over-selection, NOT missing previews.** The **live pins builder** (`/collections/us-license-plate-enamel-pins-copy`, the `-copy` collection = the actual builder page) renders **exactly 84 cards, all 84 covered by the preview config (0 missing).** The saved offer's **137 GIDs are a superset** — **53 extra Product GIDs the builder does not render or sell** (storefront `products.json` and the builder's Liquid loop both see only the 84 published pins; the 53 are almost certainly off-channel/draft or duplicate/clone products the editor's Admin-side selection pulled in — cf. the combined-listing clone pattern). **Resolution = trim the offer's eligibility to the 84 the builder actually sells** (Diane, in the editor) — NOT author 53 previews. Only if Diane *intends* to sell those 53 do they need publishing + adding to the builder collection + new previews (a scope expansion, not parity). **Preview parity for the real 84-product builder is COMPLETE.**

- **AC6 (preview coverage — the original 84) verified 2026-09-16.** The **84** pin preview entries (my earlier "168" was a regex miscount — it double-counted each entry's nested `f:{…}` object) are **already present in the live canonical `assets/cl-pack-preview-config.json`, byte-identical** to the WIP source (pulled live; 0 missing, 0 differing). Coverage vs the live collection `us-license-plate-enamel-pins` (84 products) is **1:1 — 0 handles without an entry, 0 stale entries.** No merge, no deploy needed on the preview side. Canonical asset + `configUrl` per Codex: `{{ 'cl-pack-preview-config.json' | asset_url | json }}`. (Do NOT deploy the standalone WIP `cl-plate-config.json`.)

## Parity baseline (capture from the live Pins section FIRST — step 1)
Codex named four things to preserve; make each a concrete verification item:
1. **Tier prices — ✅ CAPTURED (2026-09-16).** Backend authority = CityLocs discount app, endpoint `/apps/citylocs/discount-info?tags=UV-F116-Enamel-Pin` (discount name "Enamel Pin"). **Uniform across all 84 pins** (every pin carries tag `UV-F116-Enamel-Pin`): `discountBreak:[3,6,12]`, `discountAmount:[2,4,6]` ($ off per pin). Base price **$18.99**. Frontend mirror builds `qtys=[1,3,6,12]`, per-pin $ off `=[0,2,4,6]`:

   | Qty | $ off / pin | Price each |
   |-----|-------------|-----------|
   | 1–2 | $0 | $18.99 |
   | 3–5 | $2 | $16.99 |
   | 6–11 | $4 | $14.99 |
   | 12–24 | $6 | $12.99 |

   Tier minimums `[1, 3, 6, 12]`; the $12.99 tier runs from 12 through the **max pack quantity 24** (Codex correction 2026-09-16 — ceiling is 24, not 12).

   The migration must reproduce this tier table (backend registry tiers + frontend mirror). NOTE it is a **per-item volume discount** (each pin discounted by qty), not a fixed-total pack — different pricing shape from WF/Hypro/mixed (fixed_total).
2. **Per-item personalization** — pins are uniform **`{Custom Text}`** (no Month/Year, no 2nd line). Use `fieldsMode: explicit` with a collection-level field list (NO per-product backfill). Store-wide policy applies: `["uppercase","no_emoji"]`.
3. **Lazy previews** — `image_overlay` via the shared preview adapter, lazy config fetch (nothing fetched when a card isn't shown). Preserve the current lazy behavior; don't eagerly load 168 configs.
4. **CL_PLATE_CFG coverage** — the 168 pin entries above; verify 1:1 against the live collection's products.

Also carry `custom_hero_text` and the NEW `builder_preview_mode` (none|image_overlay).

### Free Lanyard gift — OUT OF SCOPE (Codex, 2026-09-16)
Confirmed: there is **no live Pins gift / Lanyard reward to preserve**. Do NOT invent or add it during migration. If wanted later it's a **separate approved enhancement** with an explicit gift product, threshold, and backend qualification test. Removed from the parity baseline and the parity test matrix.

## Dependency — R-A RESOLVED (Codex, 2026-09-16)
Editor now saves **registry schema v3** with authoritative eligibility keyed by **stable Shopify Product GIDs**: `eligibilitySource: "product_ids"`, `authoritativeEligibility: { source: "product_ids", productIds: [...] }`, and each slot stores `productIds`. Both the discount and checkout-validation Functions enforce the IDs. Handles remain only in storefront config for matching rendered cards — not pricing authority. → Pins eligibility encoding is unblocked: assign the 84 `us-license-plate-enamel-pins` products' GIDs to the pins offer.

## Pricing ownership + gate (Codex, 2026-09-16)
- **Storefront engine ready:** `cl-pack-engine.js` already supports tiered unit-price display + the `/apps/citylocs/discount-info` endpoint. No engine work.
- **Editor/registry = new work (Codex):** registry v3 currently models only exact **fixed-total** offers; Pins needs a new **`tiered` mode** storing: `pricing mode: tiered`, `maximum quantity: 12`, tiers (3→$16.99, 6→$14.99, 12→$12.99 each), authoritative eligibility = 84 stable Product GIDs, `discount authority: existing tag-based app`. The `bundle-gift-discount`/fixed-total Function must **ignore** tiered entries (must not treat Pins as fixed-total); checkout validation needs an explicit tiered mode over the generic min/max bounds.
- **Authority:** the existing tag-based Vue discount (`UV-F116-Enamel-Pin`) stays the authoritative Pins pricing backend; the storefront only mirrors approved tiers.
- **✅ GATE LIFTED (Codex, 2026-09-16): tiered registry support live in app version 48.** Encode Pins with: `pricingMode: "tiered"`, **`maximum quantity: 24`**, tier minimums `[1, 3, 6, 12]` → `1/$18.99, 3/$16.99, 6/$14.99, 12/$12.99` (the $12.99 tier runs 12→24), `allowPartialCheckout: true`, one Pins category = all **84 stable Product GIDs**. Fixed-total Function explicitly ignores tiered offers → `UV-F116-Enamel-Pin` remains sole pricing authority; checkout validator enforces stable-ID eligibility + the **24-item ceiling**. Lanyard out of scope.

## Migration steps (all on dev `153606324312`)
1. **Capture parity baseline** from the live pins section (tier table, perso field list, preview mode, gift/Lanyard, hero) → freeze as the parity checklist.
2. **Integrate pins preview entries** into the on-theme preview config (`cl-pack-preview.js` `configUrl` asset); verify 168/168 handles resolve.
3. **Author the pins offer** in the central editor on dev (tiers, eligibility [pending R-A], gift, copy) — Codex's editor, my config inputs.
4. **Wire adapters:** perso (`CLPackPerso.create({mode:'per_item', fieldsMode:'explicit', fields:[Custom Text]})`) + preview (`image_overlay`, lazy).
5. **Parity test matrix** vs live (below). Nothing on live until this passes.
6. **Diane approves** the dev pilot.
7. **Live rollout** (coordinated; live pins code untouched until then).

## Dev pilot — built (2026-09-16)
- Template `templates/collection.pins-pack-pilot.json` created + pushed to **dev `153606324312`** (only that file; Codex's `cl-pack-builder-section.liquid`/`cl-hypro-bundle.liquid` untouched — they live on dev, my repo has the live baseline). Settings: `pricing_mode: "auto"` (reads the saved tiered Bundle Offers offer), `preview_mode: "image_overlay"`, `allow_partial_checkout: true`.
- **Preview needs Diane's authenticated session** (unpublished theme; unauth fetch strips `preview_theme_id` → falls back to live). Test URL (Diane, logged in):
  `https://citylocs.com/collections/us-license-plate-enamel-pins-copy?view=pins-pack-pilot&preview_theme_id=153606324312`
- **Check #1 first:** does the builder render the 84 pins with **tiered pricing** (not fixed-total, not blank)? If pricing/eligibility doesn't resolve, the offer may be attached to the non-`copy` collection handle — try `us-license-plate-enamel-pins`, or set the template's `pricing_mode` to `tiered` explicitly.

## Parity test matrix (Diane runs on the dev preview URL; must pass before live)
- Every tier price matches live at each quantity: $18.99 (1–2) / $16.99 (3–5) / $14.99 (6–11) / $12.99 (12–24), max qty 24 (ceiling enforced; adding a 25th blocked).
- (No gift — out of scope.)
- Each of the 84 pins renders its correct preview (spot-check + a coverage assertion); lazy — configs not fetched until a card shows.
- Personalization: `{Custom Text}` captured per item, all-caps + emoji-blocked, edit/remove via `createDraft` re-keys correctly.
- Cart parity: `_bundle_id` scoping, edit link, clear/restore behavior matches live.
- Security: forged `_bundle_*` / ineligible product cannot join the bundle or trigger tier/gift (server-authoritative eligibility — ties to R-A).

## Storefront wiring findings (2026-09-16) + boundary questions
Migrated builders (WF/Hypro) are hosted by `sections/cl-pack-builder-section.liquid`, which renders **`cl-hypro-bundle`** (Codex-owned — Claude must NOT edit) in `grid`/`summary`/`config` blocks, passing `collection_handle`, **`fixed_total`**, `allow_partial_checkout`, `reward_label`, `builder_url`, `preview_mode` (none|image_overlay). Cards come from `cl-pack-grid.liquid`, which marks a card personalized from each product's **`personalization_fields`** metafield (per-product) and emits `data-cl-perso-fields`. WF template = `templates/collection.wf-pack-pilot.json`.

**Boundary questions for Codex (before I wire anything):**
1. **Tiered host wiring — CONFIRMED BLOCKER (2026-09-16).** Read `cl-pack-builder-section.liquid` in full: it is **fixed-total only** — schema has `fixed_total` (cents), and it passes that to `cl-hypro-bundle` (grid/summary/config) with **no tiered/`pricing_mode` option**. So there is **no tiered-capable unified host in the theme** for me to point a pins dev template at, and adding tiered to `cl-hypro-bundle`/this section is Codex's engine/block lane (rule 0 — Claude must not edit `cl-hypro-bundle`). **Which host renders the tiered pins builder on dev?** Either (a) Codex adds a tiered mode to the unified host/block, or (b) the pins builder keeps its current (tiered-capable) host and I point a pins collection template at that + verify. The live pins `-copy` page already renders tiers via `discount-info`, so a tiered-capable host exists somewhere — name it. **This gates standing up the dev pins builder; the full parity matrix (tier prices at each qty) needs it.**
2. **Perso metafield setup.** Cards personalize from per-product `personalization_fields`, which is outside the editor's write allowlist. Are the 84 pins' `personalization_fields = ["Custom Text"]` already set, or does that need a one-time backfill (and by whom)? (The plan's "explicit fields, no per-product backfill" assumed a collection-level field list; the shared card snippet reads per-product — reconcile.)

**Claude's unambiguous lane meanwhile:** verify the perso adapter (`{Custom Text}` explicit, `["uppercase","no_emoji"]`, `selectionKey`==`makeItemKey`) and preview adapter (84 pins render via `cl-pack-preview.js`, lazy config fetch) using the WIP harness — no live/dev deploy, no Codex files.

## Ownership (rule 0)
Claude: perso adapter, preview adapter, `CL_PLATE_CFG`/pins preview config, pins offer inputs, this parity test. Codex: engine, central editor, backend eligibility/pricing registry. No shared files.
