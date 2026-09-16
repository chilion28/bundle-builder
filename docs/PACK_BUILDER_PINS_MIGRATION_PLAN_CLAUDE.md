# Enamel Pins — Editor Migration Plan & Parity Checklist (Claude)

**Author:** Claude · **Date:** 2026-09-16 · **Status:** Plan, no live changes.
**Greenlit by:** Codex (Hypro complete + checkout-verified at 3 pairs / $99). Pins is Claude's lane.
**Hard constraints (Codex):** do **not** change live Pins behavior until parity testing passes; all work on **dev theme `153606324312`** first.

## Prerequisites — status
- **AC4 (perso adapter) ✅ DONE.** Live `assets/cl-pack-perso.js` now carries the emoji-block + all-caps validators **and** `createDraft` (edit-draft). Confirmed in-file (EMOJI/`hasEmoji`/`uppercase`/`no_emoji` at ~L39–209; `createDraft` present). No merge needed.
- **AC6 (preview coverage) ✅ DONE (verified 2026-09-16).** The **84** pin preview entries (my earlier "168" was a regex miscount — it double-counted each entry's nested `f:{…}` object) are **already present in the live canonical `assets/cl-pack-preview-config.json`, byte-identical** to the WIP source (pulled live; 0 missing, 0 differing). Coverage vs the live collection `us-license-plate-enamel-pins` (84 products) is **1:1 — 0 handles without an entry, 0 stale entries.** No merge, no deploy needed on the preview side. Canonical asset + `configUrl` per Codex: `{{ 'cl-pack-preview-config.json' | asset_url | json }}`. (Do NOT deploy the standalone WIP `cl-plate-config.json`.)

## Parity baseline (capture from the live Pins section FIRST — step 1)
Codex named four things to preserve; make each a concrete verification item:
1. **Tier prices — ✅ CAPTURED (2026-09-16).** Backend authority = CityLocs discount app, endpoint `/apps/citylocs/discount-info?tags=UV-F116-Enamel-Pin` (discount name "Enamel Pin"). **Uniform across all 84 pins** (every pin carries tag `UV-F116-Enamel-Pin`): `discountBreak:[3,6,12]`, `discountAmount:[2,4,6]` ($ off per pin). Base price **$18.99**. Frontend mirror builds `qtys=[1,3,6,12]`, per-pin $ off `=[0,2,4,6]`:

   | Qty | $ off / pin | Price each |
   |-----|-------------|-----------|
   | 1–2 | $0 | $18.99 |
   | 3–5 | $2 | $16.99 |
   | 6–11 | $4 | $14.99 |
   | 12+ | $6 | $12.99 |

   The migration must reproduce this tier table (backend registry tiers + frontend mirror). NOTE it is a **per-item volume discount** (each pin discounted by qty), not a fixed-total pack — different pricing shape from WF/Hypro/mixed (fixed_total).
2. **Per-item personalization** — pins are uniform **`{Custom Text}`** (no Month/Year, no 2nd line). Use `fieldsMode: explicit` with a collection-level field list (NO per-product backfill). Store-wide policy applies: `["uppercase","no_emoji"]`.
3. **Lazy previews** — `image_overlay` via the shared preview adapter, lazy config fetch (nothing fetched when a card isn't shown). Preserve the current lazy behavior; don't eagerly load 168 configs.
4. **CL_PLATE_CFG coverage** — the 168 pin entries above; verify 1:1 against the live collection's products.

Also carry `custom_hero_text` and the NEW `builder_preview_mode` (none|image_overlay).

### ⚠️ Free Lanyard gift — UNCONFIRMED (needs Diane/Codex)
Could NOT find a live free-Lanyard gift configured on the pins collection page — the "Lanyards" hits there were a mega-menu link, not a gift. The generic gift-cleanup recount logic IS present (removes `_bundle_free_gift` lines when `paidForBundle < _bundle_free_gift_min`), but no gift-ADD with a threshold. My earlier note ("pins MUST consume gift/reward metafields — the free Lanyard") was a **plan item, not confirmed live behavior**, so the Lanyard may be a *planned addition*, not current parity. **Confirm: is a free Lanyard currently live on the pins builder, and at what quantity threshold + which variant?** If not live, it's a post-parity enhancement, not part of the parity baseline. (Also possible the live pins builder is a separate GemPages page I haven't identified — the plain `/collections/us-license-plate-enamel-pins` shows tiers + cart gift-cleanup but not the full add-to-bundle builder UI.)

## Dependency — R-A RESOLVED (Codex, 2026-09-16)
Editor now saves **registry schema v3** with authoritative eligibility keyed by **stable Shopify Product GIDs**: `eligibilitySource: "product_ids"`, `authoritativeEligibility: { source: "product_ids", productIds: [...] }`, and each slot stores `productIds`. Both the discount and checkout-validation Functions enforce the IDs. Handles remain only in storefront config for matching rendered cards — not pricing authority. → Pins eligibility encoding is unblocked: assign the 84 `us-license-plate-enamel-pins` products' GIDs to the pins offer.

## Migration steps (all on dev `153606324312`)
1. **Capture parity baseline** from the live pins section (tier table, perso field list, preview mode, gift/Lanyard, hero) → freeze as the parity checklist.
2. **Integrate pins preview entries** into the on-theme preview config (`cl-pack-preview.js` `configUrl` asset); verify 168/168 handles resolve.
3. **Author the pins offer** in the central editor on dev (tiers, eligibility [pending R-A], gift, copy) — Codex's editor, my config inputs.
4. **Wire adapters:** perso (`CLPackPerso.create({mode:'per_item', fieldsMode:'explicit', fields:[Custom Text]})`) + preview (`image_overlay`, lazy).
5. **Parity test matrix** vs live (below). Nothing on live until this passes.
6. **Diane approves** the dev pilot.
7. **Live rollout** (coordinated; live pins code untouched until then).

## Parity test matrix (must pass before live)
- Every tier price matches live at each quantity (incl. the top tier and any partial/under-min behavior).
- Free Lanyard gift unlocks at the same threshold; not double-granted (F3 if any simple+tier overlap).
- Each of the 168 pins renders its correct preview (spot-check + a coverage assertion); lazy — configs not fetched until a card shows.
- Personalization: `{Custom Text}` captured per item, all-caps + emoji-blocked, edit/remove via `createDraft` re-keys correctly.
- Cart parity: `_bundle_id` scoping, edit link, clear/restore behavior matches live.
- Security: forged `_bundle_*` / ineligible product cannot join the bundle or trigger tier/gift (server-authoritative eligibility — ties to R-A).

## Ownership (rule 0)
Claude: perso adapter, preview adapter, `CL_PLATE_CFG`/pins preview config, pins offer inputs, this parity test. Codex: engine, central editor, backend eligibility/pricing registry. No shared files.
