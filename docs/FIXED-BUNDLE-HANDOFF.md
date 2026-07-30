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

Do not rename production-facing customization fields casually. The custom order
production app maps those names to its Custom 1–4 columns and production files.

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
