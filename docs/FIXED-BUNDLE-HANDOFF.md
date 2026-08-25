# Fixed 3-Hat Bundle Handoff

## Goal

The `3-Hat Fixed Bundle Exclusive` is a constrained personalization bundle:

- The customer chooses one US state.
- Each state resolves to one CityLocs-approved plate product/design.
- The chosen design exposes its own 1–4 production-facing text fields.
- The exact field names and entered values apply to all three hats.
- CityLocs chooses the three physical hat variants through the parent product's
  `custom.bundle_components` metafield.
- The customer cannot choose or personalize the hats independently.

## Existing Shopify architecture retained

The implementation deliberately preserves the existing two-product setup:

1. **Parent:** `3-Hat Fixed Bundle Exclusive` (`8858683703384`)
   - Owns the $60 selling price.
   - Does not track inventory.
   - Stores three variant references in `custom.bundle_components`.
2. **Components:** `Bundle Hat` (`8858678722648`)
   - Contains the available style/size/color combinations.
   - Tracks inventory per physical variant.
3. **Cart Transform:** expands one parent cart line into the three configured
   component variants at checkout. Its source is in the sibling
   `Custom App/citylocs-functions/extensions/bundle-cart-transform` project.
   Commit `ab2ebcf` was released during this project; it fixes parent-quantity
   multiplication and copies all plate/customization properties to each child.

## Plate-product relationship

The flexible builder at `/collections/3-pack-license-plate-hats-bundle` does not
mount a complete Zepto form for every card. Each card references a real Shopify
product and serializes its variants, while the builder uses:

- `custom.personalization_fields` for exact Zepto/production property names.
- `CL_PLATE_CFG` in `assets/cl-pack-grid.js` for the copied Zepto preview image,
  geometry, font, size, and color.

The fixed bundle follows this model. `STATE_DESIGNS` in
`assets/cl-fixed-bundle.js` maps each state to one real source product handle,
title, and ordered field list. The initial selections were derived from the
flexible builder's current featured order. California is explicitly mapped to
`hat-cali-plates` (California 60's Plate Hat).

## Cart/order property contract

The parent line submits these public properties:

- `Plate State`
- `Plate Design`
- Each non-empty exact design field, such as `Custom Text`, `Custom Text Two`,
  `Month`, or `Year`

It also submits these integration properties, hidden from normal cart display by
their leading underscore:

- `_plate_product_handle`
- `_plate_field_names` (ordered names joined with `|`)
- `_fxb_design_product_id` (the selected design's Shopify product ID)
- `_fxb_schema_version` (`2` for the clOrdersApp API contract)
- `_cl_template` (the current production template returned by clOrdersApp)

Do not rename production-facing customization fields casually. The custom order
production app maps those names to its Custom 1–4 columns and production files.

### clOrdersApp template lookup (added 2026-08-24)

On Add or Save Changes, `assets/cl-fixed-bundle.js` posts the selected design's
real Shopify product ID to:

`https://citylocsproduction.com/api/get-product-template`

The response's current `template` value is saved as `_cl_template`. The add is
blocked when the API fails or returns no template, so a bundle cannot enter
production without routing information. The Cart Transform explicitly queries
and copies `_cl_template` to every expanded child line. The product tag is not
saved in Shopify; Omar confirmed clOrdersApp will retrieve it on the backend.

California was used to verify the contract:

- Shopify product ID: `8993982211`
- Template: `US License Plates/prt California 60s.ai`
- Custom 1: `Custom Text`
- Custom 2: `Custom Text Two`
- Custom 3: `Month`
- Custom 4: `Year`

## Files in the focused change

- `assets/cl-fixed-bundle.js`
- `assets/cl-fixed-bundle.css`
- `assets/cl-fixed-bundle-cart-editor.js`
- `assets/cl-fixed-bundle-cart-editor.css`
- `snippets/cl-fixed-bundle-personalizer.liquid`
- `snippets/cl-bundle-breakdown.liquid`
- `snippets/cart-item-list.liquid`
- `sections/cl-fixed-bundle.liquid`
- `templates/product.fixed-bundle.liquid`
- `docs/FIXED-BUNDLE-HANDOFF.md`

## Implementation notes

- The state UI is a native `<select>` containing all 50 states.
- Selecting a state displays its assigned design and generates only that
  design's fields.
- `FIELD_DEFAULTS` defines limits, placeholders, and required/optional behavior.
- The renderer supports `Custom Text One` through `Custom Text Four` plus any
  additional configured label using a safe fallback.
- `Custom Text Two` remains optional to match the flexible builder's current
  behavior. It is hidden behind an `Add a second line of text` checkbox; while
  unchecked, it is omitted from both the live preview and cart properties. All
  other listed fields default to required.
- The preview calls `window.CLPlatePreview(previewEl, productHandle, values)`.
- The cart breakdown loops over all public properties instead of hardcoding two
  text fields.
- Eligible parent bundle lines show `Edit personalization` in the cart. The
  action returns the customer to the fixed-bundle page, reopens the original
  state/design and exact fields with their current values, restores the live
  preview, and changes the CTA to `Save changes`. Saving updates the same cart
  line through `/cart/change.js` without changing its quantity. One edit
  therefore applies to every unit on that parent line; different text requires
  a separate bundle line.
- The edit link includes the cart line key plus explicit URL parameters for the
  state, design, quantity, ordered field names, and values. It also retains a
  JSON/session-storage fallback. Explicit per-field `data-*` attributes are
  intentional: Shopify Liquid's serialized `item.properties` did not survive
  reliably inside the button dataset during storefront testing.
- Supported explicit edit-transfer fields are `Custom Text`, `Custom Text One`,
  `Custom Text Two`, `Custom Text Three`, `Custom Text Four`, `Month`, and
  `Year`. Keep these names synchronized with `FIELD_DEFAULTS` and the production
  app if the property contract changes.

## Validation completed locally

- `node --check assets/cl-fixed-bundle.js`
- `git diff --check`
- Shopify theme check at error failure level
- Confirmed 50 unique mapped handles
- Confirmed every mapped handle exists in `CL_PLATE_CFG`
- Browser-tested the fixed-bundle template against Shopify's local theme preview:
  California renders four exact fields and the 60's plate preview; Texas replaces
  them with its two exact fields and the Texas Black Plate preview.

## Deployment status

- Unpublished theme: `Fixed Bundle Test 2026-07-30` (`153264947288`)
- Live theme: `OG-Empire` (`121696682072`)
- The focused bundle files were deployed to the live theme on 2026-07-30.
- The parent product is reachable at
  `/products/3-hat-fixed-bundle-exclusive` using the fixed-bundle experience.
- Incognito smoke testing passed after the production deployment.

## Completed acceptance validation

1. Select California and confirm four fields appear:
   `Custom Text`, `Custom Text Two`, `Month`, and `Year`.
2. Confirm California uses the 60's plate preview.
3. Select a normal two-field state and confirm old fields/values are removed.
4. Confirm required-field validation and optional `Custom Text Two` behavior.
5. Add the parent bundle to cart and verify public and hidden properties via
   `/cart.js`.
6. Verify the cart page shows all public properties on the parent and each
   cosmetic component row.
7. Continue to checkout and confirm Cart Transform expands the three exact
   variants configured in `custom.bundle_components`.
8. Quantity 2 produces six component hats, remains $120 total, and does not
   double-multiply component quantities.
9. Month and Year propagate to the component line items.
10. Edit personalization restores state, design, exact text fields, counters,
    and preview; Save Changes updates the existing cart line while preserving
    quantity and price.

The four final production acceptance cases (edit/save, one $60 bundle line,
updated properties on all three hats, and checkout display) passed, followed by
an incognito live-store smoke test.

## Focused theme commit history

- `d63eca8` — Build fixed bundle personalization engine
- `dbd3ab2` — Add optional second-line toggle
- `bcc5c43` — Document Cart Transform bundle fix
- `755c205` — Add fixed bundle cart personalization editor
- `be5b2a3` — Move bundle cart edits to product builder
- `2147264` — Load cart edit data from cart line
- `0369fe2` — Fix fixed-bundle edit prefill redirect
- `5d9489d` — Make bundle edit prefill deterministic
- `b26498e` — Pass bundle edit fields explicitly

## Business-data review still required

- Approve all 50 initial bestseller choices. The Alaska featured mapping is
  currently the live builder product handle `test-plate` and deserves explicit
  review.
- Confirm whether any selected designs have Zepto fields or requiredness that
  differ from the current `personalization_fields` metafield and defaults.
- Confirm the production app will route generic `Bundle Hat` components using
  `_plate_product_handle`/`Plate Design`, or update that app's mapping if needed.
- If field names are added or renamed, update the production app, Cart Transform
  propagation allowlist, `FIELD_DEFAULTS`, and the explicit cart-edit transfer
  attributes together.

---

## Production-routing refactor — SKU-bridge (added 2026-07-31)

### Why

`clOrdersApp` routes orders **by product**, not by line-item property. It assigns
an Illustrator template per design product and uses the `UV-F100-Rectangle-Patch`
tag to locate the Dropbox template path. The original cart transform expanded the
bundle into the three generic `Bundle Hat` component variants — those carry **no
per-design template**, so production had nothing to route. `_plate_product_handle`
/ `Plate Design` are just text properties the app doesn't key on.

### The fix (refined Option A)

Instead of the fixed `Bundle Hat` variants, each order line now becomes the
customer's **real chosen design product** variant, resolved via a shared SKU. The
promo `Bundle Hat` component variants and every design product share the same SKUs
per style/color (validated across California, Texas, Tennessee, Wyoming):

| Promo SKU        | Style / Color         |
| ---------------- | --------------------- |
| `6089BLK`        | Snapback / Black      |
| `6606BROWN/KH`   | Trucker / Brown&Khaki |
| `P5AF-NVY`       | Pro Five / Navy       |

Because the SKU is stable across all ~700 design products, the SKU acts as a
bridge: promo style/color → the matching variant on whatever design the customer
picked. Price ($60), checkout grouping, and personalization are unchanged.

### The three coordinated pieces

1. **Liquid** — `snippets/cl-fixed-bundle-personalizer.liquid`
   Emits the three promo SKUs from `product.metafields.custom.bundle_components`
   onto the root element as `data-component-skus="SKU|SKU|SKU"`. Team can still
   swap the component variants via the admin metafield picker — the SKUs follow.

2. **Storefront JS** — `assets/cl-fixed-bundle.js`
   - `COMPONENT_SKUS` read from `data-component-skus`.
   - `resolveComponentVariants(handle)` fetches `/products/<design-handle>.js`
     (cached per handle), maps each promo SKU → that design product's numeric
     variant id, and returns pipe-joined `gid://shopify/ProductVariant/<id>`.
   - **Fail-safe:** if any SKU is missing on the chosen product, it returns `''`
     so the transform falls back to the metafield. Never blocks add-to-cart.
   - `addToCart` awaits resolution and sets the `_component_variants` line
     property before POSTing to `/cart/add.js` (or `/cart/change.js` on edit).

3. **Cart transform** — `Custom App/citylocs-functions/extensions/bundle-cart-transform`
   - `cart_transform_run.graphql`: added
     `componentVariantsAttr: attribute(key: "_component_variants") { value }`.
   - `cart_transform_run.js`: reads `line.componentVariantsAttr.value` first
     (split on `|`), else falls back to the `custom.bundle_components` metafield.
     **Backward-compatible** — old carts / other themes keep working.
   - Released as app version **`citylocs-functions-15`**. Functions are global
     (not per-theme); this release is live but inert for any line lacking the new
     attribute, so it was safe to ship while the promo runs.

### Deploy status

- Function: **deployed live** (v15, backward-compatible).
- Storefront: pushed to **DEV theme `153264947288`** and then **promoted to LIVE
  theme OG-Empire `121696682072`** on 2026-07-31 — the two files
  (`assets/cl-fixed-bundle.js`, `snippets/cl-fixed-bundle-personalizer.liquid`)
  are live. SKU-bridge routing is now active on the storefront.
- Diane confirmed all hat products share the same promo SKUs, so every offered
  design resolves (no silent fallback expected in practice).

### How to verify (DEV theme)

1. Preview: `https://citylocs.myshopify.com?preview_theme_id=153264947288`.
2. Pick a state, personalize, add to cart.
3. Inspect the cart line's `_component_variants` property — three GIDs that match
   the chosen design product's Snapback/Black, Trucker/Brown&Khaki, Pro Five/Navy
   variants (confirm on `/products/<handle>.js`).
4. Reach checkout; confirm the three expanded lines are the **design product**
   (not generic `Bundle Hat`), price splits to $20 each, and all plate
   properties propagate.
5. Place a real test order and confirm `clOrdersApp` routes each line to the
   correct Illustrator template.

### Tests

`extensions/bundle-cart-transform/src/cart_transform_run.test.js` — added two
cases: `_component_variants` takes priority over the metafield, and the metafield
is still used when the attribute is absent. `npx vitest run` → 4 passing.

### Open items

- **Alaska** still maps to `test-plate` (placeholder handle) — replace with the
  real product before live.
- Confirm the three promo SKUs exist on **every** offered design product (spot-
  checked 4 states so far). Any design missing a SKU silently falls back to the
  generic `Bundle Hat` for that line — safe, but not production-routable.

### Validating component colors before a swap

Only colors stocked on **all 51 offered designs** route natively. Before changing
the `custom.bundle_components` colors, run:

```
node scripts/check-fixed-bundle-colors.mjs 6089BLK 6606BROWN/KH P5AF-NVY
```

It lists the universally-safe SKUs and flags any candidate that would fall back.
(No args → prints the full safe menu.) Verified end-to-end in production
2026-07-31: a California test order routed all 3 lines in clOrdersApp with the
correct `UV-F100-Rectangle-Patch` template + Dropbox path.

### Odd / non-universal colors → needs a clOrdersApp change

The business wants to clear hat colors that are **not** stocked on the design
products. Those can't use the SKU-bridge (there's no design-product variant to
match), so they arrive as generic `Bundle Hat` lines with no template. Routing
them requires a **production-side change**: clOrdersApp must select the template
from the line's `_plate_product_handle` / `Plate Design` property and print it on
the odd-color blank from the line's variant. Full developer spec:
[`docs/CLORDERSAPP-BUNDLE-ROUTING-SPEC.md`](CLORDERSAPP-BUNDLE-ROUTING-SPEC.md).
