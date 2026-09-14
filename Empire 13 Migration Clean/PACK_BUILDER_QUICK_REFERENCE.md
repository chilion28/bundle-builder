# CityLocs Pack Builder — Quick Reference

Last updated: September 11, 2026

Use this as the fast, merchant-facing companion to `CL_BUILDER_CONFIG_SCHEMA.md`. The schema remains the technical source of truth.

## 1. Shared implementation

All pack offers use the shared system:

- `snippets/cl-hypro-bundle.liquid` — emits config and markup
- `assets/cl-pack-engine.js` — selection, totals, gifts, cart, restore, and checkout
- `assets/cl-pack-perso.js` — personalization forms and validation
- `assets/cl-pack-preview.js` — deployed canonical optional product-preview adapter
- `assets/cl-pack-card-gallery.js` — card galleries, navigation, swipe, and lightbox
- `assets/cl-hypro-bundle.css` — shared presentation

GemPages normally uses these one-line declarations:

```liquid
{% render 'cl-hypro-bundle', block: 'config' %}
{% render 'cl-hypro-bundle', block: 'engraving' %}
{% render 'cl-hypro-bundle', block: 'grid', grid_columns: 3 %}
{% render 'cl-hypro-bundle', block: 'summary' %}
```

`grid_columns` is optional and defaults to 2. Mobile remains a two-column grid.

## 2. Mixed-item bundle types

### Any-mix bundle

Example: choose any 3 items from hats, sunglasses, wallets, and plates.

- Put every eligible product in one dedicated Shopify collection.
- Use generic nouns such as `item` and `items`.
- The existing selection target and maximum rules apply.
- Products retain their real product and variant IDs.

This is largely supported by the current engine.

### Slot-based bundle

Example: choose exactly one hat, one pair of sunglasses, and one wallet.

This requires the planned `selection.slots` extension. Each slot defines:

- A stable slot ID
- A customer-facing label
- Required quantity
- Eligible product types, handles, tags, or another approved eligibility rule

The engine must prevent overfilling a slot, show slot progress, block checkout until every required slot is valid, and revalidate restored carts.

Frozen matching rules for implementation:

- One selected product may occupy exactly one slot.
- Slots are evaluated in their declared order.
- A product eligible for more than one slot is a configuration error; initialization must emit `cl:pack:validation-error` instead of silently assigning it.
- When slots are present, their total required quantity is authoritative for the selection bound.
- `selection.maximum`, if also emitted, must equal the sum of all `slot.quantity` values; a mismatch is a configuration error.

Conceptual configuration:

```json
{
  "selection": {
    "slots": [
      { "id": "hat", "label": "Choose a hat", "quantity": 1, "eligibleProductTypes": ["Hat"] },
      { "id": "sunglasses", "label": "Choose sunglasses", "quantity": 1, "eligibleProductTypes": ["Sunglasses"] },
      { "id": "wallet", "label": "Choose a wallet", "quantity": 1, "eligibleProductTypes": ["Wallet"] }
    ]
  }
}
```

## 3. Personalization modes

Collection metafield:

- Name: **Builder personalization behavior**
- Namespace/key: `custom.builder_personalization_mode`
- Type: Single-line text
- Accepted values: `none`, `per_item`, `shared`

### `none`

- No Personalize control is shown.
- Products add directly.
- No personalization properties are added to cart lines.

### `per_item`

- Every selected item can have independent values.
- Different products may use different field sets.
- Each product reads `custom.personalization_fields` when present.
- Products without personalization fields add normally.
- The same variant with different personalization remains a distinct selection/cart line.

Example: a hat uses Month + Year + Custom Text, sunglasses use Custom Text, and a wallet uses Initials.

### `shared`

- This is documented but not implemented: the deployed adapter currently returns `null` for `shared`.
- One bundle-level form collects the personalization once.
- The shared values are copied to every eligible selected line.
- Non-personalizable products remain untouched.
- Editing the shared value updates all affected selections.
- All participating products must use a compatible shared field contract.

Implementation identity rules:

- Keep the existing per-line `selectionKey(variantId, values)` unchanged.
- Pass the same shared values to each eligible line; different variants remain distinct, while identical variants with identical shared values may merge quantities.
- A shared-value edit must re-key every eligible selection atomically.
- Cart restore hydrates the shared form from one eligible restored line, after verifying that the other eligible lines carry the same shared values.
- Conflicting restored shared values are a validation error and must not be silently reconciled.

Do not use `shared` when products require unrelated fields or incompatible limits. Use `per_item` instead.

Personalization and slots are independent: a bundle may use slots with `none`, `per_item`, or `shared`.

## 4. Free gifts and cumulative stacking

Preferred collection metafield:

- Name: **Gift tiers**
- Namespace/key: `custom.gift_tiers`
- Type: List of metaobject references
- Referenced definition: `gift_tier`

`gift_tier` fields:

- `minimum_quantity` — Integer
- `gift_variants` — List of variant references

Example:

| Paid quantity | Newly unlocked gifts | Customer has in total |
| ---: | --- | --- |
| 3 | Keychain | Keychain |
| 5 | Lanyard | Keychain + Lanyard |
| 7 | Sticker Pack + Cleaning Cloth | All four gifts |

Rules:

- Tiers stack cumulatively.
- Every configured gift variant becomes a separate reward with quantity 1.
- Rewards are deduplicated by `variantId`. If the same variant appears in multiple surviving tiers, the lowest qualifying minimum wins.
- Tiered configuration wins over legacy fallback fields.
- Nil or unavailable variants/images must emit `null`, never malformed Liquid/JSON.
- Dropping below a tier automatically removes gifts unlocked at that tier.
- Increasing quantity restores newly qualified gifts.

For slot-based mixed bundles, a gift unlocks only when **both** are true:

1. The reward's paid-item minimum has been reached.
2. Every required slot is valid and completely filled.

If either condition later becomes false, the gift is removed.

### Simple gift fallback

The existing fields remain available for simple offers:

- `custom.builder_free_gift_variants`
- `custom.builder_free_gift_pack_size`
- `custom.builder_free_gift_label`

When `custom.gift_tiers` is populated, these fallbacks must not add duplicate gifts.

The legacy singular `custom.gift_tier` field is audit-only and is not consumed by the unified builder.

Reward normalization order is fixed: suppress the entire simple fallback whenever `custom.gift_tiers` is non-empty, then deduplicate by `variantId` within the surviving tiered rewards. A fallback gift must never win merely because it has a lower minimum.

## 5. Gift line safety rules

Every gift line must include:

```text
_bundle_free_gift = "true"
_bundle_free_gift_min = <unlocking tier minimum>
_bundle_free_gift_label = Free Gift
_bundle_id = <qualifying bundle instance ID>
_bundle_collection = <builder collection handle>
```

Gift lines are excluded from:

- Paid-item counts
- Slot fulfillment
- Minimum and maximum selection bounds
- Fixed-total distribution
- Tiered paid-item pricing
- Savings calculations

Qualification is scoped to `_bundle_id`. Separate bundle instances never combine quantities.

## 6. Cart grouping and restore

Selected paid lines use the same bundle envelope, including:

```text
Pack
_builder
_bundle_name
_bundle_id
_bundle_collection
_bundle_item = "true"
_bundle_size
_bundle_max
_bundle_builder_url
```

- `_bundle_id` is the primary grouping key.
- Collection grouping is only a fallback for legacy lines.
- Different personalization values must not collapse into one selection.
- Cart restoration revalidates eligibility, slots, quantity bounds, personalization, pricing qualification, and gifts. Invalid or obsolete restored lines are reported and ignored; the engine must not silently substitute or normalize them into another product.

## 7. Pricing authority

The frontend displays the offer; it does not authorize the price.

Before any new mixed bundle launches, document:

- Pricing mode: regular, fixed total, or tiered
- Target/minimum quantities
- Whether partial checkout is allowed at regular price
- Eligible product/tag rules
- The Shopify Function or app that authoritatively applies the discount
- Gift qualification and stacking rules

For a mixed bundle, backend validation must eventually enforce eligible lines, the same `_bundle_id`, paid quantity, slots when present, and gift qualification. This is required future work: the current discount app does not consume the builder configuration or `_bundle_*` properties.

## 8. New mixed-bundle setup checklist

- [x] Create one dedicated collection containing all eligible products. The development pilot uses `Mixed Bundle Test (Non-Custom)`.
- [x] Create the collection metafield definition `custom.builder_selection_slots` before attempting to configure slot values. For the development pilot, use **one JSON value** with Storefront API access off.
- [ ] Decide: any mix or required category slots.
- [ ] Set target, maximum, and partial-checkout policy.
- [ ] Choose personalization mode: `none`, `per_item`, or `shared`.
- [ ] For `per_item`, verify each product's personalization fields and preview config.
- [ ] For `shared`, approve one compatible collection-level field contract.
- [ ] Choose pricing mode and confirm its backend authority.
- [ ] Configure `custom.gift_tiers` if gifts are included.
- [ ] Confirm slot-based gifts require both valid slots and the tier minimum.
- [ ] Confirm gift variants are available and safely handle missing images.
- [ ] Add the four GemPages render declarations.
- [ ] Test desktop and mobile selection, editing, swipe/gallery, summary, and checkout.
- [ ] Test direct cart manipulation and cart restoration.
- [ ] Test quantity decreases across every gift tier.
- [ ] Test two separate bundle instances do not combine.

## 9. Boonie launch reminders

Before promoting the Custom Boonie Hats bundle:

- End the `$17.50` sale and restore the original `$34.99` product price so the regular 3-hat subtotal is `$104.97` and the backend can reduce it to `$59.99`.
- Ensure the Vue/tag discount excludes the Boonie bundle so it cannot stack or conflict with fixed-total pricing.

## 10. Still pending

- Phase 1 `selection.slots` engine validation is implemented locally and on unpublished dev theme `153606324312`; the slot-configured `Mixed Bundle Test (Non-Custom)` collection is ready for a GemPages pilot page and browser QA.
- The `custom.builder_selection_slots` collection metafield definition has been created in Shopify for the pilot. It is not supplied automatically by the theme code and must be recreated explicitly in another store.
- `custom.builder_selection_slots` uses one JSON value only for the first development pilot. It is not the intended merchant-facing production interface.
- Before merchant handoff or production adoption, replace raw slot JSON entry with a `Builder Slot` metaobject plus a collection metafield containing a list of metaobject references. The merchant interface should expose Slot ID, Label, Required quantity, Eligible product types, and eligible products/collections where needed; Liquid will normalize those records into `selection.slots` JSON for the engine.
- Keep the temporary JSON field until the engine passes selection, cart restoration, checkout gating, pricing, and gift-qualification tests and the metaobject-backed output has parity.
- Add the slot-aware progress/category UI (Phase 2).
- Implement the currently stubbed bundle-level `shared` adapter, including atomic re-keying plus conflict-safe edit and cart restoration.
- Add authoritative backend enforcement for mixed-bundle slots and slot-dependent gift qualification.
- Select and document authoritative backend pricing for the first real mixed bundle.
- Decide whether future gift entries need configurable quantities greater than 1.
