# CL_BUILDER_CONFIG — Personalization + Preview slice (Claude → Codex)

From: Claude · Date: 2026-09-03
Scope: **only** the `personalization` and `preview` portions of the unified `CL_BUILDER_CONFIG`.
Codex merges this with the core/pricing/reward/product-source/checkout portions.
Status: **proposal for contract review — no migration until Diane approves the finalized schema.**

This is the schema my two drafted adapters (`cl-pack-perso.js`, `cl-plate-preview.js`) already implement, so it is faithful to current live behavior, not aspirational.

---

## 1. Shape

```jsonc
{
  "personalization": {
    "mode": "none | shared | per_item",

    // How the per-product field list is determined (Codex-approved 2026-09-03):
    //  - "per_product" (CANONICAL): each card supplies its applicable field-property
    //    list via `data-cl-perso-fields` (emitted by Liquid from
    //    product.metafields.custom.personalization_fields). The adapter combines that
    //    per-card list with the config-level field definitions/defaults in `fields`.
    //    Field availability never depends on loading the (lazy) preview config.
    //  - "explicit": use the `fields` array below for all eligible products
    //    (filtered by eligibleTypes/eligibleHandles).
    //  - "auto_from_preview": TEMPORARY legacy compat only — derive fields from the
    //    preview config. NOT the long-term source of truth (would force the large
    //    plate config to load for field resolution). Kept only if the pins migration
    //    transitionally needs it; retire once Liquid emits the field list server-side.
    "fieldsMode": "per_product | explicit | auto_from_preview(legacy)",

    "fields": [
      {
        "property":    "Custom Text",   // Shopify line-item property label — FROZEN to Zepto labels
        "label":       "Custom Text",   // display label (defaults to `property`)
        "maxLength":   20,
        "required":    true,            // Custom Text Two is the only optional one today
        "placeholder": "CUSTOM",
        "transform":   "uppercase",     // "uppercase" | "none"  (plate text is always caps)
        "eligibleTypes":   [],          // product types this field applies to; [] = all
        "eligibleHandles": []           // specific handles; [] = all
      }
    ]
  },

  "preview": {
    "mode":      "none | image_overlay",
    "keyedBy":   "handle",                    // config lookup key (product handle)
    "configUrl": "/cdn/.../cl-plate-config.json"  // present ONLY when mode = image_overlay
  }
}
```

---

## 2. Field-default table (the Zepto contract)

`fieldsMode: "auto_from_preview"` seeds each field from these defaults; `explicit` may override per field.

| property (frozen) | maxLength | required | placeholder | transform |
|---|---|---|---|---|
| `Custom Text` | 20 | yes | `CUSTOM` | uppercase |
| `Custom Text One` | 20 | yes | *(empty)* | uppercase |
| `Custom Text Two` | 26 | **no** (optional 2nd line) | *(empty)* | uppercase |
| `Month` | 3 | yes* | `MONTH` | uppercase |
| `Year` | 4 | yes* | `YEAR` | uppercase |

\* Month/Year only exist for the ~2 plate templates that have the boxes; in `auto_from_preview` they are added for a product **only if** its preview config contains that field. Do not list them collection-wide.

---

## 3. Eligibility rule (how a field applies to a selection)

A field is active for a given selected item when **both**:
- `eligibleTypes` is empty **OR** the product's type ∈ `eligibleTypes`, **and**
- `eligibleHandles` is empty **OR** the product's handle ∈ `eligibleHandles`.

For pins/plates today: all fields empty-eligible (apply to all), with Month/Year gated by preview-config presence via `auto_from_preview`. This keeps the current per-product behavior exactly.

---

## 4. selectionId authority (Decision #3)

The adapter owns the key. Production-identical:

```
selectionKey(variantId, values):
  hash = sorted( "k=v" for k,v in values if v not empty ).join("|")
  return hash ? `${variantId}::${hash}` : String(variantId)
```

Consequence the core must respect: two items with the same `variantId` but different personalization are **distinct selections and distinct cart lines**. Never key the items map by bare `variantId`.

---

## 5. Values contract (what goes to the cart)

- Empty fields are **omitted** (mirrors Zepto): `values` only contains non-empty, trimmed, transformed strings.
- These become **visible** line-item properties under their `property` label (spread into the cart payload alongside the frozen `_bundle_*` envelope).
- `transform: "uppercase"` is applied on input, so stored == displayed == what the personalizer renders.

---

## 6. Per-mode behavior

| mode | fields | selectionKey | preview |
|---|---|---|---|
| `none` | none; `read()` always valid | bare `variantId` | forced off |
| `per_item` | per selection (pins, **and Hypro** per Codex) | variant + perso hash | optional (`image_overlay` or none) |
| `shared` | one value-set broadcast to all eligible items | applied to each item's key | optional |

Note: **Hypro is now `per_item` + `preview:none`** (per Codex). My `per_item` adapter handles that directly — when the preview adapter is absent/`none`, it falls back to a plain text preview (or none). So Hypro consumes the same adapter with `preview:none`; no duplication.

---

## 7. DOM contract the adapter expects (so Hypro/pins share one implementation)

`perso.attach(cardEl, ctx)` wires against these hooks (already used by `cl-pack-grid.liquid`):

```
[data-cl-personalized]                       (attr on the card → personalized)
[data-cl-perso-fields] = '["Custom Text", ...]'  (JSON field-label list)
[data-cl-perso]                              (accordion body container)
[data-cl-perso-preview]                      (preview mount)
[data-cl-perso-input="<label>"]              (text input per field)
[data-cl-perso-count="<label>"]              (remaining-chars counter)
```

For Hypro to consume the shared adapter instead of duplicating, its card markup should adopt these `data-cl-perso-*` hooks. **I will not edit the Hypro files** — flagging this as the contract Codex applies on the Hypro side.

`attach()` returns a controller (also set on `cardEl.__clPerso`) exposing `values` / `valid` / `promptMissing()` / `reset()` for the core to call at add-time.

---

## 8. Resolved with Codex (2026-09-03)

1. **fieldsMode = `per_product` canonical** (card supplies `data-cl-perso-fields` via Liquid; adapter merges config-level defaults/overrides). `explicit` supported; `auto_from_preview` kept only as temporary legacy. ✅ Adapter confirmed to support `per_product` with **no significant change** — it already resolves fields from `data-cl-perso-fields` and never consults the preview config for field resolution.
2. **Adapter returns `values` only** — core spreads them into `items[].properties` alongside the `_bundle_*` envelope. Adapter never creates/updates/removes cart lines. ✅
3. **`preview.configUrl` emitted only when `preview.mode === "image_overlay"`**; for `preview:none` the config asset is never fetched. ✅
4. **Phase-one normalization = trim + configured `uppercase` transform + omit empties + preserve internal whitespace exactly.** Any future filtering/collapsing must be an explicit field-level `transform`, never silent core behavior. ✅

Adapters (`cl-pack-perso.js`, `cl-plate-preview.js`) are drafted, unit-tested, and browser-verified against this schema, now including `fieldsMode: per_product | explicit`, config-level field overrides, eligibility filtering, and per-field `transform`. Held standalone until the full merged schema is approved.
