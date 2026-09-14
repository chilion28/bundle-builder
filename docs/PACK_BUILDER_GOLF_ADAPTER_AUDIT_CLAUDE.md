# Golf Pack Builder — Adapter Audit (Claude)

**Author:** Claude · **Date:** 2026-09-14 · **Status:** Audit only, no code changes.
**Purpose:** Capture Golf's personalization / preview / pricing / gift / scope shape so it's editor-eligible, same pass we did for Boonie & Sunglasses.
**Source of truth:** `sections/gp-section-626317142307963757.liquid` (4550 lines, the live golf builder; a near-duplicate `623576563790643742.liquid` is an older copy). Line refs below are to the primary section.

## Headline finding
**Golf is already a metafield-driven, collection-scoped, config-authored builder** — it is the closest existing thing to what the central "Bundle offers" editor is meant to produce. Its entire runtime config is read from **collection metafields** into `window.CL_BUILDER_CONFIG` (lines 1883–1926) plus per-product `personalization_fields` into `window.CL_PRODUCT_PERSONALIZATION` (1929–1936). So authoring Golf in the editor = authoring exactly these metafields; the migration is mostly **swapping Golf's three bespoke runtimes (perso, preview, pricing-mirror) for the shared engine/adapters**, not inventing new config.

## Shape summary

| Dimension | Golf today |
|---|---|
| **Identity / scope** | Collection-scoped, and **ONE section is shared across MULTIPLE collections** (confirmed: `golf-hats` **and** `golf-towels-copy`). ⚠️ The section still contains **hardcoded golf-hats copy** that leaks onto the other collections (e.g. golf-hats wording shows on the towels page) — only part of the copy is metafield-driven today. |
| **Personalization** | **Golf Hats are NOT customizable → perso mode `none` in practice** (their `personalization_fields` metafield is empty, so `CL_PRODUCT_PERSONALIZATION` has no entry and nothing renders). The section still *carries* per_item machinery (`makeItemKey` 2081, `data-cl-perso-input` 2111, fields Custom Text/One/Two at 2044–2048) as a shared capability for whichever sharing collection sets the metafield. Bespoke inline impl — NOT the shared `cl-pack-perso.js`. **Store-wide policy (Diane 2026-09-14): any customizable text = ALL-CAPS + no emoji.** |
| **Preview** | `image_overlay` via the **legacy** `window.CLPlatePreview(box, handle, values)` (2123–2124, from `cl-pack-grid.js` / `CL_PLATE_CFG`), text fallback (`.cl-plate-main`/`.cl-plate-sub`, 2137–2138). NOT Codex's `cl-pack-preview.js` adapter. |
| **Pricing** | **Tiered** (buy-more-save-more milestones): frontend mirror via `discountRulesByHandle` + `sharedDiscountRule` fallback (2368, 2464–2473, 2869); config from `builder_milestones` / `builder_milestone_style`. Backend authority = tag-based Vue discount app. |
| **Gifts** | **Cumulative gift tiers** (`gift_tiers` metaobject list: `{minimum_quantity, gift_variants[]}`, 1890–1908) **AND** a simple free-gift fallback (`builder_free_gift_variants/pack_size/discount_code/label`, 1909–1925). Two labeled reward tracks (discount + gift), locked/unlock states. |
| **Bundle attrs** | **Mid-migration.** Writes legacy `_bundle_collection(s)` / `_bundle_item` (4063–4149) **and** the newer `_builder` / `_bundle_id` / `_bundle_name` / `_bundle_size` / `_bundle_max` / `_bundle_free` (4212–4237). |
| **Config source** | Collection metafields: `custom_hero_text`, `builder_title`, `builder_item_singular/plural`, `builder_add_button_text`, `builder_milestones`, `builder_milestone_style`, `gift_tiers`, `builder_free_gift_variants/pack_size/discount_code/label`, per-product `personalization_fields`. |

## Adapter mapping (what the migration replaces)
1. **Perso → shared adapter.** Golf's `personalization_fields` per-product model maps cleanly to `CLPackPerso.create({ mode:'per_item', fieldsMode:'per_product' })` — the adapter already supports `per_product` (reads a per-product field list). Golf's `makeItemKey(variantId, p)` == the adapter's `selectionKey`. Straight swap.
2. **Preview → shared adapter.** Repoint from legacy `CLPlatePreview` (cl-pack-grid.js) to Codex's on-theme `cl-pack-preview.js` (`configUrl`-driven). Requires Golf's product handles to exist in `cl-plate-config.json` (see R3).
3. **Pricing/gift mirror → engine.** Golf's `discountRulesByHandle` + gift-track logic becomes engine-driven from the same `builder_milestones` / `gift_tiers` config the editor authors. Backend pricing (tag discount) unchanged.

## Golf-specific risks / conflicts

- **R1 — Perso: RESOLVED for golf hats (none).** Golf Hats aren't customizable, so the emoji/all-caps parity concern is moot for them. **Store-wide policy confirmed (Diane): any customizable text is ALL-CAPS + no emoji** — so wherever this section IS used with perso (a sharing collection that sets `personalization_fields`), it must run the shared adapter's `["uppercase","no_emoji"]`, and the live `cl-pack-perso.js` still needs the validator merge first (AC4).
- **R2 — Legacy scope must resolve to `_bundle_id`.** Golf still writes `_bundle_collection`; the live cart (`cl-bundle-cart.liquid`) now scopes clear/restore/gift by `_bundle_id`. The editor importing Golf by collection handle must key its output to `_bundle_id` and the migration must drop/relegate the legacy `_bundle_collection` write, or edit/remove/gift scoping is inconsistent.
- **R3 — Preview config coverage.** Golf's preview handles must be present in `cl-plate-config.json` before repointing to the adapter, or previews render blank (AC6). Capture golf-hats handles during migration.
- **R4 — F3 gift dedup is LIVE in golf.** Golf runs **both** `gift_tiers` (cumulative) and `builder_free_gift_*` (simple) simultaneously. The editor/engine must enforce F3: **suppress the simple free-gift fallback before dedup whenever `gift_tiers` is non-empty**, else golf could grant two gifts. This is not hypothetical for golf — both are populated.
- **R5 — Free-gift granting must be backend-validated (open — needs backend confirmation).** Golf adds the gift as a normal full-price line item flagged `_bundle_free_gift='true'` + `_bundle_free_gift_min` (4235–4237); the **$0 happens backend-side**. Golf has **no eligibility-tag forgery guard** (no `cl-*-bundle` tag like WF). So the risk is concrete: if the backend rule zeroes the gift by **trusting the `_bundle_free_gift` line attribute**, anyone can `POST /cart/add.js` with that property and claim the gift without qualifying. Confirm the zeroing rule **re-counts the earned quantity** (safe) rather than trusting the attr. There IS a cart-validation function on add (4260) — verify it (or the discount rule) enforces gift eligibility. This lives in the `citylocs-functions` app / Shopify discounts, not the theme. (S4/F6.)
- **R6 — CSS reset bleed.** Golf shares the space where `cl-hypro-bundle.css` `.cl-hypro *{!important}` leaks (font-family + max-width). Verify golf's preview/perso aren't affected once centralized (same class of bug that hit boonie's font).

## Editor implications (feeds the Bundle-offers editor spec)
Golf is the **fullest** capability exercise, so the editor must author, for one collection: milestone tiers (`builder_milestones` + style), cumulative `gift_tiers` **and** the simple free-gift fallback (with the F3 mutual-exclusion baked in), per-product `personalization_fields`, and the copy fields. Everything Golf reads is already a metafield — so Golf is the ideal **round-trip fidelity test** for the editor's import (S2 unowned-field preservation, S3 atomic write) before it touches simpler builders.

## Diane's answers (2026-09-14)
1. **Golf Hats aren't customizable** → perso `none` for them. Store-wide policy: any customizable text = **ALL-CAPS + no emoji**. (Resolves R1.)
2. Needs a plain-language follow-up → answered inline: the gift is added full-price + attr-flagged and zeroed backend-side; the open item is confirming the backend **re-counts** eligibility rather than trusting `_bundle_free_gift` (R5). Backend-config check, not a theme change.
3. **Multiple collections share this one section** (`golf-hats` + `golf-towels-copy`), with residual **hardcoded golf-hats copy leaking** onto the others. → Two implications: **(a)** the editor migration must move ALL remaining hardcoded copy into per-collection metafields (this shared-section-with-leaked-copy is itself a strong argument for the central editor); **(b)** each sharing collection needs its **own `_bundle_id`** so cart scoping/edit/gift don't collide across collections (R2).

## Verification basis (checked 2026-09-14)
`sections/gp-section-626317142307963757.liquid` — perso fields 2044–2048, `makeItemKey` 2081, `CLPlatePreview` 2123, `CL_BUILDER_CONFIG` 1883–1926, `CL_PRODUCT_PERSONALIZATION` 1929–1936, bundle attrs 4063–4237, discount mirror 2368/2464/2869.
