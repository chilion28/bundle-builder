# clOrdersApp — Fixed Bundle Routing Spec (odd-color / non-universal hats)

**Audience:** the developer who maintains **clOrdersApp** (the production automation
that assigns Illustrator templates to order lines).
**Author:** CityLocs web (Diane) · **Date:** 2026-07-31
**Status:** implementation request for Omar — the current SKU bridge works for
universal SKUs, but this change is required before CityLocs can offer clearance
SKUs that exist only on the `Bundle Hat` product.

## Executive request

Please add **production-configuration inheritance** to clOrdersApp for Fixed
Bundle component lines.

When an order line is a `Bundle Hat` variant and contains
`_fxb_design_product_id`, clOrdersApp must:

1. Keep the order line's own variant as the physical blank to pull.
2. Load the complete saved automation configuration belonging to the Shopify
   product identified by `_fxb_design_product_id`.
3. Apply that referenced product's Illustrator template, production tag/Dropbox
   routing, and Custom 1–4 editable-variable mappings to the `Bundle Hat` line.

Normal products and older orders without this property must behave exactly as
they do today.

This is not asking clOrdersApp to create new templates or maintain a second
state-to-template table. It should reuse the configuration already assigned to
the referenced design product in the clOrdersApp UI.

---

## 1. The problem in one paragraph

The **3-Hat Fixed Bundle Exclusive** lets a customer pick a US state, gets that
state's featured plate **design**, personalizes it, and receives that design on
**3 hats** sold as one $60 bundle. At checkout a Shopify Cart Transform expands
the single bundle line into **3 component lines** (one per hat). clOrdersApp
already routes lines when the component is a **real design product** (see §3).
It does **not** route the component lines that come in as the generic **"Bundle
Hat"** product, because that product has **no design template** assigned. Those
"Bundle Hat" lines are exactly the **odd / non-universal hat colors** the
business wants to clear through this promo. **This spec adds property-based
routing so those lines print correctly.**

## 2. Background: why two kinds of lines exist

- **Template** for a design lives on the **design product** (e.g. *California
  60's Plate Hat*), tagged `UV-F100-Rectangle-Patch`, pointing to a Dropbox path
  like `US License Plates/prt California 60s.ai`.
- **Inventory** for the odd hat colors lives on the **"Bundle Hat"** product
  variants (that's where the clearance stock is counted).
- **Universal colors** (Snapback/Black, Trucker/Brown&Khaki, Pro Five/Navy, etc.)
  exist on *both* the Bundle Hat product **and** every design product, so the
  storefront can point those lines at the real design product → clOrdersApp
  routes them today with zero changes. ✅
- **Odd colors** exist **only** on the Bundle Hat product (that's the definition
  of "non-universal"). There is no design-product variant to point at, so the
  line stays as "Bundle Hat" → **no template → not routable today.** ❌

The physical blank's **color is independent of the design** — any blank can
receive any plate design. So the missing information for an odd-color line is
purely *"which design template goes on this blank?"* — and that is already
carried on the line as a property (§4).

## 3. What already works (do not change)

When a component line's product **is** a real design product (universal colors),
clOrdersApp routes it exactly as it does a normal single-hat order:

- template = that product's assigned template (`UV-F100-Rectangle-Patch`)
- Dropbox path = that product's path (e.g. `US License Plates/prt California 60s.ai`)
- custom fields = the line's properties

**Verified 2026-07-31:** a live California test order produced 3 pending lines in
clOrdersApp with template `UV-F100-Rectangle-Patch`, path
`US License Plates/prt California 60s.ai`, and all custom fields. Keep this path
as-is.

## 4. Required line-item contract

The web team will ensure the following properties are copied onto every
expanded component before Omar's acceptance test. Properties beginning with `_`
are internal Shopify line properties and normally hidden from cart display.

The Cart Transform copies these onto each expanded component line. Names are
exact and stable (a leading `_` marks a hidden/internal property):

| Property key            | Example value                  | Notes |
| ----------------------- | ------------------------------ | ----- |
| `_fxb_design_product_id`| `7884434538584`                | **Primary configuration lookup key**: numeric Shopify product ID for the selected design product |
| `Plate State`           | `California`                   | Customer's chosen state |
| `Plate Design`          | `California 60's Plate Hat`    | **Design display title** — human-readable routing key |
| `_plate_product_handle` | `hat-cali-plates`              | Design-product handle; diagnostic/fallback lookup key |
| `_plate_field_names`    | `Custom Text|Custom Text Two|Month|Year` | Ordered production-field contract for this design |
| `_fxb_schema_version`   | `1`                            | Allows future contract changes without guessing order age |
| `Custom Text`           | `Hello World`                  | Personalization (present when used) |
| `Custom Text One`       | …                              | Present only for designs that use it |
| `Custom Text Two`       | `ohayougozaimasu`              | Optional 2nd line |
| `Custom Text Three`     | …                              | Design-specific |
| `Custom Text Four`      | …                              | Design-specific |
| `Month`                 | `EST`                          | Present when the design uses it |
| `Year`                  | `2026`                         | Present when the design uses it |

The **variant on the line** carries the physical blank to pull (Style / Size /
Color), e.g. `Trucker / One Size Fits All / Blue, Red & Wht Mesh`.

## 5. Exact clOrdersApp change requested

For a component line whose product is **"Bundle Hat"** (equivalently: any line
that carries a `_plate_product_handle` / `Plate Design` property but has no
template of its own), route it as follows:

1. **Select the configuration source product:**
   - Primary key: `_fxb_design_product_id`.
   - Diagnostic/fallback key: `_plate_product_handle`.
   - Human-only fallback: `Plate Design` title. Avoid title matching when an ID
     is present because product titles can change.
2. **Load the complete existing clOrdersApp configuration** saved against that
   source product. This includes, at minimum:
   - Illustrator template;
   - production tag (for example `UV-F100-Rectangle-Patch`);
   - Dropbox directory/path routing derived from that tag/configuration;
   - editable-variable assignments for Custom 1, Custom 2, Custom 3, and
     Custom 4;
   - any other product-level automation setting clOrdersApp normally applies.
3. **Pull the physical blank** from the **line's own variant** (Style/Color),
   e.g. the odd Trucker Blue-Red-Wht Mesh. This is what decrements the clearance
   inventory — do **not** substitute a universal color.
4. **Fill custom fields** from the existing properties in §4 using the inherited
   design product's Custom 1–4 mappings (same mapping behavior as a normal order
   for that design product).
5. **Fail safely:** if the referenced design product or configuration cannot be
   resolved, place the line on hold/error with the order number and received
   routing properties. Do not silently choose the `Bundle Hat` product's
   template and do not send a blank patch to production.

In effect: **the complete production configuration comes from the referenced
design product; the physical blank and inventory come from the line's actual
`Bundle Hat` variant.**

### Suggested implementation shape

The exact database/service names are up to Omar, but the routing decision should
be equivalent to:

```js
const designProductId = line.properties._fxb_design_product_id;

const configurationProductId =
  line.product.handle === 'bundle-hat' && designProductId
    ? designProductId
    : line.product.id;

const productionConfig = await getSavedProductConfiguration(configurationProductId);

return createProductionJob({
  physicalProduct: line.product,
  physicalVariant: line.variant,
  productionConfig,
  customizationProperties: line.properties,
});
```

Do not replace `physicalVariant` with a variant from the configuration-source
product. The order line's variant is the clearance blank CityLocs must pull and
whose inventory Shopify must decrement.

## 6. Worked example (odd color)

Customer picks **Hawaii**, personalizes, and the bundle includes an odd
**Trucker / Blue, Red & Wht Mesh** blank. The component line arrives as:

```
Product:  Bundle Hat
Variant:  Trucker / One Size Fits All / Blue, Red & Wht Mesh   ← blank to pull
Props:    Plate State = Hawaii
          Plate Design = Hawaii Plate Hat
          _fxb_design_product_id = <Hawaii design product ID>  ← primary config selector
          _plate_product_handle = hat-hawaii-plate             ← template selector
          _fxb_schema_version = 1
          Custom Text = Ohana
          Custom Text Two = means family
```

Desired routing:

```
Template: UV-F100-Rectangle-Patch (Hawaii's existing template)
Path:     US License Plates/prt Hawaii.ai   (whatever Hawaii Plate Hat uses today)
Blank:    Trucker / Blue, Red & Wht Mesh    (from the variant)
Fields:   Ohana / means family / …
```

## 7. Web/Shopify work owned by CityLocs (not Omar)

CityLocs web will make coordinated storefront and Cart Transform changes before
the joint test:

1. Store `_fxb_design_product_id`, `_plate_product_handle`,
   `_plate_field_names`, and `_fxb_schema_version` on the parent bundle line.
2. Request those attributes explicitly in the Cart Transform input query.
3. Copy them onto every expanded child line along with the public customization
   properties.
4. For the non-universal test, expand the actual `Bundle Hat` variant IDs from
   `custom.bundle_components` instead of substituting design-product variants
   through `_component_variants`.
5. Add Function tests proving the routing contract and quantity/price behavior.

Omar does not need to modify the Shopify theme or Cart Transform.

## 8. Security and validation requirements

Shopify line-item properties can originate from the storefront and must not be
treated as trusted template paths.

- Treat `_fxb_design_product_id` only as a lookup key.
- Load the template/tag/path from clOrdersApp's trusted saved configuration.
- Confirm the referenced product is an allowed/configured CityLocs design
  product.
- Do not accept an Illustrator path, Dropbox path, or executable instruction
  directly from line properties.
- Preserve the normal routing path for lines without the Fixed Bundle contract.

## 9. Edge cases / notes

- **Universal-color lines are unaffected** — they still arrive as real design
  products and route via §3. This change only adds a branch for "Bundle Hat"
  lines. Both kinds can appear in the same order.
- **Design→template mapping source:** it's the same mapping clOrdersApp already
  maintains per design product; this spec just asks it to also be reachable by
  `_plate_product_handle` / `Plate Design`.
- **Handle stability:** product handles rarely change, but if one is renamed in
  Shopify, update the corresponding entry in the storefront `STATE_DESIGNS` map
  and any clOrdersApp lookup keyed on handle.
- **`test-plate` (Alaska):** currently the live handle used for Alaska; treat it
  as a normal design for routing.
- **Failure visibility:** if a `Plate Design`/handle can't be resolved to a
  template, surface it as an error/hold in clOrdersApp rather than silently
  printing a blank — so a mis-mapped design is caught before production.

## 10. Joint acceptance test

Use at least one clearance SKU that exists **only** on `Bundle Hat`; otherwise
the current SKU bridge can hide a routing failure.

1. CityLocs configures `custom.bundle_components` with the non-universal test
   variant and deploys the child-line routing contract.
2. Place a bundle order for a design with known Custom 1–4 settings, preferably
   California because it exercises `Custom Text`, optional second line, Month,
   and Year.
3. Confirm the Shopify order child remains product `Bundle Hat` and retains the
   exact clearance style/color/SKU.
4. Confirm the child contains `_fxb_design_product_id`, handle, field names,
   schema version, plate design, and customization values.
5. Confirm clOrdersApp loads the referenced design product's existing:
   - Illustrator template;
   - `UV-F100-Rectangle-Patch` (or configured) tag;
   - Dropbox path;
   - Custom 1–4 variable assignments.
6. Confirm the physical blank shown to production is the actual clearance
   `Bundle Hat` variant—not a universal substitute from the design product.
7. Confirm Shopify decrements that `Bundle Hat` variant's inventory and does not
   decrement a same-SKU design-product variant.
8. Confirm quantity two creates six child hats at $120, with two production
   units for each configured component.
9. Submit a deliberately invalid design product ID and confirm the line is put
   on hold/error rather than routed to an arbitrary template.
10. Confirm a normal non-bundle design-product order still follows the unchanged
    existing automation path.

## 11. Definition of done

This integration is complete when CityLocs can place a Fixed Bundle order using
a `Bundle Hat`-only clearance SKU and clOrdersApp produces the same correct
template/tag/Dropbox/custom-variable result as a normal order of the selected
design product, while keeping and decrementing the actual clearance blank.
