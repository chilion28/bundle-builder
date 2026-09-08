# CityLocs Pack Builder Consolidation — Claude Handoff

Status: proposal for joint review  
Prepared: 2026-09-03  
Owners involved: Diane / Codex / Claude

## Why this document exists

CityLocs currently has several pack-builder implementations that solve similar problems with separate Liquid, JavaScript, CSS, and GemPages code. The goal is to converge them into one reusable engine without breaking the live builders or tying business logic to generated GemPages sections.

Claude: please review this proposal, challenge the boundaries, and identify anything in the existing pack builders that this model misses. No migration should begin until we agree on the contracts and rollout order.

## Current builder families

The known builders include:

- Golf hats: fixed pack size, tier/reward messaging, free gift, variant/swatch selection, cart editing and restoration.
- Enamel pins: customizable pack builder with per-item personalization and a product preview.
- Canvas wallets: pack-builder behavior that should be included in the architecture comparison.
- Hypro sunglasses: fixed 3-pair offer; now uses per-item engraving without a preview. The previous shared-text implementation is being retained as a reusable mode.
- Combined listings and the fixed 3-hat bundle: related selection/cart patterns that may share lower-level utilities, but should not automatically be folded into the first migration phase.

Important current files include:

- `snippets/cl-pack-grid.liquid`
- `assets/cl-pack-grid.js`
- `assets/cl-pack-grid.css`
- `snippets/cl-hypro-bundle.liquid`
- `assets/cl-hypro-bundle.js`
- `assets/cl-hypro-bundle.css`
- `snippets/cl-bundle-cart.liquid`
- `snippets/cl-bundle-breakdown.liquid`
- GemPages-generated builder sections, especially the golf and pin sections

The live theme is the source of truth. Generated GemPages section files can contain live-only builder code and must always be pulled before inspection or editing.

## Proposed destination

Build one configuration-driven pack-builder engine with small, independently placeable GemPages blocks.

Suggested file boundary:

```text
assets/cl-pack-builder.js        shared state, events, validation, cart and restore logic
assets/cl-pack-builder.css       shared component styles and GemPages reset layer
snippets/cl-pack-builder.liquid  configuration and reusable block renderer
snippets/cl-pack-card.liquid     product/variant/personalization card markup
snippets/cl-pack-summary.liquid  summary, progress, rewards and checkout markup
snippets/cl-bundle-cart.liquid   cart grouping/edit-link presentation contract
```

Names are provisional. The important decision is the separation of concerns, not the exact filenames.

## GemPages integration contract

GemPages should own page composition and marketing content. The theme engine should own commerce state and behavior.

The builder should expose independently placeable Custom Liquid blocks:

```liquid
{% render 'cl-pack-builder', block: 'config', builder_id: '...' %}
{% render 'cl-pack-builder', block: 'personalization', builder_id: '...' %}
{% render 'cl-pack-builder', block: 'grid', builder_id: '...' %}
{% render 'cl-pack-builder', block: 'summary', builder_id: '...' %}
{% render 'cl-pack-builder', block: 'mobile_bar', builder_id: '...' %}
```

Rules:

- `config` appears exactly once.
- Other blocks can be positioned independently anywhere on the same GemPages page.
- Blocks connect using stable `data-cl-*` attributes and a shared `builder_id`.
- No core business logic should live inside a generated `gp-section-*.liquid` file.
- GemPages CSS resets must be contained under the builder root so global GemPages button/input styles cannot change behavior or layout.
- Republishing a GemPages page must not erase the engine.

## Configuration model

Prefer collection metafields for merchant-editable configuration, emitted by Liquid as one JSON configuration payload.

Proposed capabilities:

| Concern | Example values |
| --- | --- |
| Personalization | `none`, `shared`, `per_item` |
| Preview | `none`, `image_overlay`, product-specific adapter |
| Pack rule | exact quantity, maximum quantity, tiered milestones |
| Product source | collection, explicit product list, mixed collections/products |
| Pricing display | regular subtotal, fixed bundle total, per-item tier price |
| Rewards | discount only, free gift, multiple milestones |
| Checkout | allow partial packs, require full pack |
| Product mix | unrestricted, category slots, required product types |

The Hypro use cases illustrate why personalization and preview must be separate settings:

- Hypro today: `personalization = per_item`, `preview = none`.
- Enamel pins: `personalization = per_item`, `preview = image_overlay`.
- Future tumbler + sunglasses + wallet bundle: `personalization = shared`, with preview independently enabled or disabled per product type.

## State model

Use one canonical in-memory state object, rather than deriving state independently in the grid and summary.

Conceptually:

```js
{
  builderId,
  configuration,
  items: [
    {
      selectionId,
      productId,
      variantId,
      quantity,
      price,
      image,
      options,
      personalization: { "Custom Text": "..." }
    }
  ],
  rewards,
  totals,
  status
}
```

`selectionId` must not always equal `variantId`. Two copies of the same variant may need different personalization and therefore must remain distinct selections/cart lines.

The engine should publish namespaced events such as:

- `cl:pack:ready`
- `cl:pack:changed`
- `cl:pack:validation-error`
- `cl:pack:cart-synced`

Grid, summary, personalization, and mobile blocks should render from this state rather than calling one another directly.

## Personalization adapters

Personalization should be a small adapter layer:

- `none`: no fields or validation.
- `shared`: one value set applied to every eligible selected item.
- `per_item`: values stored against each selection.

Each field definition should provide:

- Shopify line-item property label
- display label
- maximum length
- required/optional status
- placeholder
- normalization rules
- optional preview adapter
- eligible product types or handles when needed

This avoids hard-coding `Custom Text`, `Month`, `Year`, and second-line behavior throughout the state and cart code.

## Cart contract

Every builder should write a consistent private-property envelope while preserving visible personalization properties:

```text
Custom Text: CUSTOMER TEXT
Pack: Customer-facing pack name
_builder: stable builder key
_bundle_id: unique bundle instance
_bundle_name: customer-facing name
_bundle_collection: source/configuration handle
_bundle_builder_url: canonical edit URL
_bundle_item: true
_bundle_size: selected count
_bundle_max: configured target/max count
```

Questions to resolve:

- Should `_builder` be a stable machine key rather than the current display title?
- How should multiple bundle instances from the same builder coexist?
- Does Edit replace every line for a builder, or only the selected `_bundle_id`?
- Which properties are consumed by the discount app or Shopify Function and therefore cannot be renamed?

Cart restoration should rebuild the same canonical state, including variants, quantities, per-item/shared personalization, reward state, and the correct builder URL.

## Pricing and rewards

The frontend may estimate pricing for messaging, but the cart/checkout discount implementation remains authoritative.

The engine should accept a normalized milestone array, for example:

```js
[
  { quantity: 3, fixedTotal: 9900, label: "$33 / pair" },
  { quantity: 4, unitPrice: 2999, giftVariantId: "..." }
]
```

This should drive progress bars, unlock messages, estimated totals, savings, gifts, and disabled/full states. We should avoid separate milestone calculations in product cards, summary markup, and cart code.

## Proposed migration sequence

1. Joint audit: document the exact state, cart-property, discount, reward, inventory, and restoration behavior of golf hats, enamel pins, wallets, and Hypro.
2. Agree on contracts: configuration schema, canonical state, DOM hooks/events, cart envelope, and adapter interfaces.
3. Extract shared utilities without changing live UI: money, escaping, cart fetch/update, builder URL registry, selection calculations, and events.
4. Build a compatibility layer capable of reading the current DOM contracts.
5. Pilot the unified engine on Hypro because it is small, has no visual personalization preview, and already separates GemPages blocks.
6. Migrate enamel pins to validate `per_item` plus preview adapters.
7. Migrate wallets to expose any missing product/variant rules.
8. Migrate golf last because it has the richest rewards, gift, inventory, and GemPages coupling.
9. Remove old implementations only after behavior-parity tests pass and rollback copies exist.

## Test matrix required before migration

- Desktop and mobile GemPages layouts
- One and multiple quantities of a variant
- Same variant with different personalization
- Multiple product types in one pack
- Required and optional personalization fields
- Sold-out variant behavior
- Partial-pack checkout where allowed
- Exact/full-pack enforcement where required
- Every discount/reward boundary
- Gift lock, unlock, removal, and restoration
- Add/replace existing bundle
- Multiple bundles in one cart
- Edit link on first click
- Builder restoration from cart
- Clear removes only the intended bundle instance
- Header cart icon behavior on builder pages
- AMP cart-drawer coexistence
- Direct Shopify checkout redirect
- GemPages republish resilience

## Risks and constraints

- Generated GemPages sections currently contain important behavior and may overwrite manual changes when republished.
- The current pack grid serializes every variant for every collection product; this has collection-page scalability implications.
- Existing discount code may depend on tags or private line-item properties that look incidental.
- Grouping solely by variant ID loses separate personalization instances.
- Replacing all cart lines by collection handle can erase a second bundle instance unintentionally.
- AMP/cart apps intercept clicks and cart events, so event ownership must be explicit and narrowly scoped.
- The live theme changes out of band. Every migration edit requires live pull, narrow push, and re-pull verification.

## Questions for Claude

1. Which behavior in the current golf, pin, and wallet builders is missing from this proposal?
2. Which existing implementation should be treated as the best reference for canonical state and cart restoration?
3. Which cart properties are contractual dependencies of the discount app, cart display, Shopify Functions, or fulfillment workflow?
4. Do you agree that `selectionId` must be distinct from `variantId` to support the same SKU with different personalization?
5. Should the first pilot reuse Hypro's current markup or introduce the new DOM contract immediately behind a compatibility adapter?
6. How should preview rendering be packaged so large plate configuration data is loaded only when required?
7. Can all custom code currently embedded in GemPages sections be moved into theme assets/snippets without losing editor flexibility?
8. What rollback and parity-test approach do you recommend for golf, given its free-gift and inventory complexity?

## Requested outcome from the Claude review

Please return:

- corrections to the current-system inventory;
- agreement or proposed changes to the architecture boundaries;
- a list of non-negotiable cart/discount contracts;
- a recommended pilot and migration order;
- risks or edge cases not captured above;
- suggested ownership split between Claude and Codex that avoids simultaneous edits to the same files.

