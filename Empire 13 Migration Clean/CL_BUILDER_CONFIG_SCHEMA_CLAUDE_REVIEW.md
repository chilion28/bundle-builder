# CL_BUILDER_CONFIG_SCHEMA.md — Claude Review of §1–10 + §12 Decisions

From: Claude · Date: 2026-09-03
Reviewing: `CL_BUILDER_CONFIG_SCHEMA.md` (merged) · Status: joint-review, nothing wired/deployed

**Overall: approve the schema.** It's faithful to the tested adapters and to live behavior. Below are findings by section (mostly confirmations + a few must-fix flags), then answers to the five §12 decisions, then my §13 checkbox with one caveat.

---

## §1–10 findings

### §2 / §5 Personalization + preview — matches the tested adapters ✅
Field resolution (`per_product` canonical, `explicit` with eligibility, `auto_from_preview` legacy), config-level field overrides, `transform`, empty-omit, frozen property names, `values`-only + core spreads into `items[].properties`, preview gated to `image_overlay` — all exactly what `cl-pack-perso.js` / `cl-plate-preview.js` implement and pass tests for.

**⚠️ FLAG 5.1 — the §5 DOM-hook list is missing two hooks the current UX needs.** Today's inline personalization has (a) an **accordion toggle** ("✏️ Personalize this pin") that collapses the whole block, and (b) an optional **"Add a second line" control** that reveals `Custom Text Two`. The §5 hook list has neither. Decision needed: either the card snippet renders these (server-side, revert-safe) and exposes hooks the adapter wires —

```
[data-cl-perso-toggle]        (accordion open/close)
[data-cl-perso-second-line]   (checkbox revealing Custom Text Two)
```

— or we accept a flatter UX (always-open, second line always visible). My recommendation: **snippet renders, adapter wires** (keeps markup out of JS, matches the "no builder logic in JS-built DOM" goal). I'll add the wiring to `cl-pack-perso.js` once we agree the hooks. This is the one delta between the merged §5 and my current draft adapter.

### §4 / §8 Selection identity — correct ✅
`selectionKey` matches production `makeItemKey`/`personalizationHash` byte-for-byte. Keying by variant+perso-hash is right and load-bearing.

**⚠️ FLAG 4.1 — stringify variantId at the boundary.** The state example (§8) shows `variantId` as a **number**; `selectionKey` concatenates it as a string. Restore reads `variant_id` from `/cart.js` (number). To guarantee restore keys equal live keys, coerce `variantId` to string consistently before `selectionKey` (production uses `String(variantId)`). §10 already says "coerce IDs consistently" — just make it explicit that `selectionKey` is computed on the stringified id on both paths.

### §7 Cart envelope — improvement over live, with a migration watch ✅⚠️
Moving the clear/restore scope from `_bundle_collection` (current live) to **`_bundle_id`** fixes the real "two bundles in the same collection get cleared together" bug I flagged. Good. Two watch-items:
- **FLAG 7.1** — current live `clearExistingBundleFromCart` and `restoreBundleFromCart` key on `_bundle_collection`. The legacy fallback (§7) covers old carts; just confirm `snippets/cl-bundle-cart.liquid` grouping/edit-link logic (which reads `_bundle_collection` today) is updated in lockstep, or it will group by the old key while the engine clears by the new one.
- **FLAG 7.2** — `_bundle_builder_url` is new. Confirm `cl-bundle-cart.liquid` uses it for the edit link (today the edit link is derived from `_bundle_collection` → `/collections/<handle>`). Fine, just don't leave both link sources active.

### §6 Pricing/rewards — matches live shapes ✅
`free_product` + `autoAdd:true` mirrors the current `$0` gift line. Unit-price tiers match the buy-more-save-more model. See Decision 3 + 5 below for the authority mapping, which is the important part.

### §3 Product source — fine ✅
One note (not a blocker): current pins/plates serialize **every variant of every product** into the grid — a real collection-page scalability cost (172-product configs, paginate caveats). Not a schema issue, but the engine's `source`→card emission should keep the existing client-side pagination or it regresses load time.

### §9 / §10 GemPages + defensive Liquid — correct and important ✅
§10 captures the exact lesson that has bitten this builder: a single unguarded value in the `CL_BUILDER_CONFIG` object literal (e.g. an `image_url` on a gift with no image) nukes the whole builder to defaults. Keep "emit null, never a partially-quoted value" as a hard rule. **Add one line:** the builder root must neutralize GemPages' global `* { max-width:100% !important }` within its scope (it silently broke plate-text fit-measurement historically; the preview adapter forces `max-width:none` inline before measuring — the containment rule should be belt-and-suspenders in the reset layer).

### §1 boundary — agree ✅
Clean separation. `cl-plate-preview.js` explicitly "not a source of field eligibility" is the right call and matches Decision to make `per_product` canonical.

---

## §12 — Answers to the five decisions

**1. `_builder` = stable machine key; `Pack`/`_bundle_name` = display. → AGREE, with migration note.**
Today `_builder` is set to the builder **title** (a display string), not a machine key. Making it a stable key (e.g. `builder.key = "hypro-3-pack"`) is correct and low-risk — cart grouping/discount keys on `_bundle_collection` and tags, not `_builder`. Migration must tolerate legacy cart lines where `_builder` holds a title (treat as opaque; match instances by `_bundle_id`/`_bundle_collection`, not `_builder`).

**2. `_bundle_id` primary instance boundary, collection fallback for legacy. → AGREE.**
This is the correct fix for the multi-instance clear bug. Legacy carts (no `_bundle_id`) fall back to `_bundle_collection`. Ensure clear/restore/edit all use `_bundle_id` first, consistently (see FLAG 7.1).

**3. Approve `tiered` = `{minimum, unitPrice}` for v1; fixed-amount/percentage tiers? → APPROVE unit-price tiers for v1; DEFER percentage/fixed-amount.**
Every current builder uses a per-unit-price-at-quantity model (buy-more-save-more), so `{minimum, unitPrice}` covers all live cases. Don't add percentage/fixed-amount tier shapes until a builder actually needs one. Caveat: these tiers are **display estimates only** (see Decision 5) — the shape just has to mirror the authoritative table.

**4. `selection.slots` as a later extension, not now. → AGREE.**
No speculative mixed-pack slot rules in v1. Add `selection.slots` behind its own review when a real cross-type pack is scoped.

**5. Backend discount consumes/mirrors these pricing identifiers so prices can't drift. → CRITICAL: the frontend must MIRROR, not own. Map each pricing mode to its authority.**
The live discount is **tag-based** (product tags → tiered per-unit price, computed by Shopify on the cart). It does **not** read the builder's `pricing` config or `_bundle_*` properties. So:
- `tiered`: authority = the tag-based CityLocs discount app. `pricing.tiers` must be **generated from / kept in sync with** that app's tier table (same `minimum → unitPrice`), or displayed estimates drift from charged. Single source of truth = the discount app's table; the config mirrors it.
- `fixed_total` (Hypro $99): authority = the **cart-transform function** (citylocs-functions), not a config value. The frontend shows $99 as an estimate; the function enforces it.
- Because config and cart can still disagree, §6's rule — **UI refreshes from the cart response, never claims an unverified discount** — is the required safety net. Keep it.

Action for Decision 5: before wiring pricing, Codex + I should document, per builder, *which backend mechanism is authoritative* and confirm the config's tier numbers are derived from it. The discount app must not need to change to read these props — it doesn't today, and keeping it that way avoids a coordinated backend release.

---

## FLAG 5.1 — RESOLVED (2026-09-03)

Diane's UX call: **keep the collapsible "Personalize" accordion + the optional second line.** Two hooks added to the contract; the card snippet renders them server-side and the adapter wires behavior:

```
[data-cl-perso-toggle]        accordion open/close (re-renders preview on open for text fit)
[data-cl-perso-second-line]   checkbox that reveals Custom Text Two
[data-cl-perso-field]         wrapper on each field (used to hide/show the second line)
```

`cl-pack-perso.js` now wires both, and `reset()` collapses them to initial state. **Browser-tested — all pass:** initial collapsed; toggle opens; second-line reveal/hide; hiding the second line removes `Custom Text Two` from `values` **and** from `selectionKey` (a two-line pin is a distinct cart line from a one-line pin); `reset()` collapses everything. Please add these three hooks to §5 of the schema.

## §13 — My checkbox

- [x] **Claude confirms the merged personalization/preview sections match the tested adapters.** With FLAG 5.1 now resolved and wired, §5 fully matches the tested `cl-pack-perso.js` / `cl-plate-preview.js` — green, no caveat.

No other blockers from my side. The schema is ready for Diane's merchant-facing approval alongside the Decision-5 authority mapping.
