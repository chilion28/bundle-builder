# CL_BUILDER_CONFIG — Unified Pack Builder Contract

Date: 2026-09-03  
Status: **technical schema approved by Claude and Codex; merchant/release approval pending; no live wiring approved**  
Owners: Codex (core/config integration), Claude (personalization/preview adapters), Diane (product and release approval)

This document combines the shared engine, product source, selection, pricing, reward, personalization, preview, cart, checkout, state, event, and GemPages contracts for the CityLocs pack builders.

## 1. Architectural boundary

- `cl-pack-engine.js` owns selection state, totals, restore/clear, cart synchronization, checkout, rendering coordination, and public events.
- `cl-pack-perso.js` owns personalization fields, validation, normalized values, and `selectionId` generation. It never writes cart lines.
- `cl-plate-preview.js` owns optional image-overlay previews. It is not a source of field eligibility.
- Liquid emits normalized configuration and product/card data. It must not contain a second builder implementation.
- GemPages controls layout by placing independent mounts for the grid, personalization/shared form, and summary.
- The discount app/Shopify backend remains authoritative for charged prices. Browser totals are explanatory estimates and must use the same approved rule data.

## 2. Canonical configuration

All money values are integer cents. Unknown or unused optional values are omitted rather than emitted as malformed JSON.

```jsonc
{
  "schemaVersion": 1,
  "builder": {
    "key": "hypro-3-pack",
    "title": "Hypro Sunglasses 3-Pack",
    "itemLabel": "pair",
    "itemLabelPlural": "pairs",
    "addButtonText": "Add 3-Pack to Cart",
    "builderUrl": "/collections/hypro-3-pack"
  },

  "source": {
    "mode": "collection", // collection | products | mixed
    "collectionHandle": "hypro-3-pack",
    "productHandles": [],
    "eligibleProductTypes": [],
    "excludedHandles": []
  },

  "selection": {
    "target": 3,
    "maximum": 3,
    "milestones": [3],
    "milestoneStyle": "slots",
    "minimumCheckout": 1,
    "allowPartialCheckout": true,
    "allowDuplicateVariant": true
  },

  "personalization": {
    "mode": "per_item", // none | shared | per_item
    "fieldsMode": "per_product", // per_product | explicit | auto_from_preview (legacy)
    "fields": [
      {
        "property": "Custom Text",
        "label": "Engraving text",
        "maxLength": 20,
        "required": true,
        "placeholder": "ENTER CUSTOM TEXT",
        "transform": "uppercase",
        "eligibleTypes": [],
        "eligibleHandles": []
      }
    ]
  },

  "preview": {
    "mode": "none", // none | image_overlay
    "keyedBy": "handle"
  },

  "pricing": {
    "mode": "fixed_total", // regular | fixed_total | tiered
    "currency": "USD",
    "fixedTotal": 9900,
    "tiers": [],
    "displayUnitPrice": 3300,
    "discountAuthority": "backend"
  },

  "rewards": [],

  "cart": {
    "bundleIdStrategy": "uuid",
    "mergePersonalizedLines": false,
    "restoreOnLoad": true,
    "clearScope": "bundle_id",
    "properties": {
      "pack": "Pack",
      "builder": "_builder",
      "bundleName": "_bundle_name",
      "bundleId": "_bundle_id",
      "bundleCollection": "_bundle_collection",
      "bundleItem": "_bundle_item",
      "bundleSize": "_bundle_size",
      "bundleMax": "_bundle_max",
      "bundleBuilderUrl": "_bundle_builder_url",
      "freeGift": "_bundle_free_gift",
      "freeGiftMin": "_bundle_free_gift_min",
      "freeGiftLabel": "_bundle_free_gift_label"
    }
  },

  "checkout": {
    "destination": "/checkout",
    "syncBeforeRedirect": true
  },

  "ui": {
    "gridColumnsDesktop": 2,
    "headerCartAction": "scroll_to_summary",
    "summarySticky": true,
    "showSelectionBadges": true,
    "showUnitSavings": true
  },

  "mounts": {
    "grid": "[data-cl-pack-grid]",
    "personalization": "[data-cl-pack-personalization]",
    "summary": "[data-cl-pack-summary]"
  }
}
```

## 3. Product-source contract

| Mode | Required value | Meaning |
|---|---|---|
| `collection` | `collectionHandle` | Cards come from one Shopify collection. |
| `products` | `productHandles` | Cards come from an explicit ordered product list. |
| `mixed` | `productHandles` and/or server-emitted records | Supports future cross-type packs such as tumbler + sunglasses + wallet. |

Liquid is responsible for resolving Shopify objects. The browser receives normalized card records containing at least `productHandle`, `productType`, `variantId`, `title`, `variantTitle`, `image`, `available`, `price`, and `data-cl-perso-fields`.

`source` determines available cards, not the current selection. Cart restore may ignore obsolete or ineligible cart lines and report a validation error rather than silently substituting a product.

## 4. Selection and identity

`target` is the reward/offer target. `maximum` is the hard UI selection limit. `minimumCheckout` controls when checkout is allowed. Therefore Hypro may checkout with one or two pairs at regular price while three pairs unlock the fixed bundle price.

The personalization adapter owns selection identity:

```text
selectionKey(variantId, values):
  variantId = String(variantId)
  hash = sorted("k=v" for each non-empty value).join("|")
  return hash ? variantId + "::" + hash : String(variantId)
```

The engine must never key selections only by `variantId`. The same variant with different personalization is a distinct selection and cart line. Identically personalized quantities may be represented by one selection with quantity greater than one. Both card initialization and cart restoration must stringify `variantId` before calling `selectionKey`, so numeric IDs returned by `/cart.js` resolve to the same key as DOM string IDs.

## 5. Personalization and preview

### Field modes

- `per_product` is canonical and the default. Each card supplies a JSON property-label list in `data-cl-perso-fields`; the adapter merges it with the definitions in `personalization.fields`.
- `explicit` applies the configured field list, filtered by `eligibleTypes` and `eligibleHandles`.
- `auto_from_preview` is temporary legacy compatibility only and must be retired after affected builders emit field lists server-side.

Frozen visible Shopify property names are `Custom Text`, `Custom Text One`, `Custom Text Two`, `Month`, and `Year`. Display labels may differ, but property names must not.

Normalization is limited to trimming leading/trailing whitespace, applying the configured `uppercase` transform, omitting empty fields, and preserving internal whitespace. Future filtering requires an explicit field-level transform.

The core calls `perso.attach(cardEl, ctx)` during card initialization. The adapter returns a controller on `cardEl.__clPerso` with `values`, `valid`, `promptMissing()`, and `reset()`. It returns values only; the core spreads those values into `items[].properties`.

Required DOM hooks:

```text
[data-cl-personalized]
[data-cl-perso-fields='["Custom Text"]']
[data-cl-perso]
[data-cl-perso-toggle]
[data-cl-perso-second-line]
[data-cl-perso-preview]
[data-cl-perso-input="Custom Text"]
[data-cl-perso-count="Custom Text"]
```

The card snippet renders the personalization markup server-side. The adapter wires `[data-cl-perso-toggle]` to open/collapse the personalization region and `[data-cl-perso-second-line]` to reveal or hide the optional `Custom Text Two` field. JavaScript must not synthesize this UI markup. This preserves the existing pin UX while allowing Hypro to omit controls it does not need.

When `preview.mode` is `none`, no preview configuration URL is emitted or fetched. `preview.configUrl` is valid only for `image_overlay`.

## 6. Pricing and rewards

Pricing modes:

- `regular`: estimated total is the sum of selected variant prices.
- `fixed_total`: the configured total applies only when the target conditions are met; partial packs retain regular prices unless the backend rule says otherwise.
- `tiered`: the highest eligible tier applies. Each tier uses `{ "minimum": 4, "unitPrice": 2999 }` or an explicitly approved alternative adjustment shape.

`rewards` is an ordered array. Initial supported reward shape:

```jsonc
{
  "key": "golf-marker-clip",
  "type": "free_product",
  "minimum": 4,
  "variantId": "1234567890",
  "label": "Fore Life Golf Ball Marker Hat Clip",
  "quantity": 1,
  "autoAdd": true
}
```

### Collection metafield mapping for free gifts

`custom.gift_tiers` is the canonical merchant-facing source for tiered gifts. It is a
list of gift-tier metaobjects; each metaobject supplies `minimum_quantity` and a list
of `gift_variants`. The Liquid configuration layer expands every variant into one
normalized `rewards[]` entry with that tier's `minimum`. Earned tiers stack: reaching
12 may add the gifts configured at 3, 6, and 12.

When `custom.gift_tiers` is empty, the configuration layer falls back to the simple
single-threshold fields `builder_free_gift_variants`, `builder_free_gift_pack_size`,
and `builder_free_gift_label`. If tiered configuration is present, it is authoritative
and the fallback fields must not emit duplicate rewards. The legacy singular
`custom.gift_tier` field is not consumed by the unified builder.

The UI may show locked/unlocked progress, savings, and gifts, but Shopify/app pricing is authoritative. If config and returned cart prices disagree, the UI must refresh from the cart response rather than claim an unverified discount.

### Backend pricing authority map

| Builder | Frontend pricing mode | Authoritative backend | Synchronization rule |
|---|---|---|---|
| Hypro 3-Pack | `fixed_total` ($99 at 3) | `citylocs-functions` cart-transform function | Config mirrors the function's qualifying quantity and fixed total. Partial packs use returned regular cart prices. |
| Enamel Pins | `tiered` | CityLocs tag-based discount app | Config tiers mirror the app's approved `minimum → unitPrice` table. |
| Golf Hats | `tiered` plus `free_product` reward | CityLocs tag-based discount app for unit price; existing cart/bundle gift enforcement for the reward | Config mirrors both the approved tier and gift threshold; returned cart state wins. |
| Other existing tiered builders | `tiered` | CityLocs tag-based discount app | Record the exact app rule/table before migration; do not infer prices from theme code alone. |
| Future mixed pack | To be approved | To be selected before implementation | No frontend pricing may ship until its backend authority and mirrored values are documented. |

The discount app does not consume this configuration or `_bundle_*` properties. Version 1 deliberately does not require a coordinated discount-app change: the configuration mirrors backend rules and never becomes the pricing authority.

## 7. Cart envelope and lifecycle

Each selected line receives its visible personalization values plus the frozen bundle envelope. `_bundle_item` is the string `"true"`. `_bundle_size` records the quantity actually submitted for that bundle instance; `_bundle_max` records the selection maximum. This keeps partial packs valid under the deployed checkout validator while backend pricing independently decides which reward threshold is unlocked.

`_bundle_id` identifies one bundle instance and is the canonical clear/restore/edit scope. `_bundle_collection` remains for compatibility and grouping labels, but must not cause all instances of the same builder to be cleared together. Existing legacy lines without `_bundle_id` may fall back to `_bundle_collection` during migration. The engine and `snippets/cl-bundle-cart.liquid` must migrate in lockstep so grouping, restore, clear, and edit all resolve the same instance boundary.

`_bundle_builder_url` is the sole edit-link source for new cart lines. Cart edit links must be ordinary valid anchors and must not depend on a second click or AMP drawer interception. Legacy lines without this property may derive `/collections/<handle>` from `_bundle_collection`; new lines must never keep both link sources active.

On load, when `restoreOnLoad` is true, the engine reads matching cart lines, reconstructs quantities and personalization, updates card badges/controls, and renders the summary. Clear removes all cart lines for the current `_bundle_id`, resets local state and personalization, then publishes a changed/cart-synced event.

Checkout sequence:

1. Validate the current selection and required fields.
2. Reconcile the current bundle instance with `/cart.js`.
3. Apply additions/updates/removals through Shopify cart endpoints.
4. Confirm the returned cart state.
5. Navigate directly to `/checkout`.

## 8. State and public events

Minimum normalized selection record:

```jsonc
{
  "selectionId": "41931001069656::Custom Text=DIANE",
  "variantId": 41931001069656,
  "productHandle": "hypro-black-blue",
  "productType": "Sunglasses",
  "title": "Hypro Black/Blue",
  "quantity": 1,
  "unitPrice": 4999,
  "properties": { "Custom Text": "DIANE" }
}
```

The engine dispatches these document-level `CustomEvent`s:

| Event | When | Minimum `detail` |
|---|---|---|
| `cl:pack:ready` | Builder initialized and restore completed | `builderKey`, `bundleId`, `state` |
| `cl:pack:changed` | Selection or personalization changed | `builderKey`, `bundleId`, `state`, `reason` |
| `cl:pack:validation-error` | An action cannot proceed | `builderKey`, `bundleId`, `code`, `message` |
| `cl:pack:cart-synced` | Cart reconciliation completed | `builderKey`, `bundleId`, `cart`, `state` |

Consumers must treat event detail as read-only. Adapters must not independently emit cart-synced events.

## 9. GemPages integration

The grid, personalization/shared field form, and summary are independent render blocks. Their order and containers may be controlled by GemPages, while one hidden config block emits the JSON once. Multiple mounts connect to the same engine instance using `builder.key`.

The config block has no visual UI. It provides normalized JSON and loads/initializes the engine and enabled adapters once. Moving visual blocks in GemPages must not duplicate configuration, state, listeners, or cart requests.

Builder pages may intercept the header cart icon only within that builder's active page scope. `headerCartAction: "scroll_to_summary"` prevents the AMP drawer and scrolls/focuses the summary. Other pages retain normal cart behavior.

### Selection editing presentation (proposed for joint review)

Editing is one engine capability with a configurable presentation, rather than separate builder-specific implementations:

```jsonc
"editing": {
  "enabled": true,
  "presentation": "inline", // inline | modal | none
  "showEdit": true,
  "showRemove": true
}
```

The presentation is explicit merchant/config policy. Catalog size is useful guidance, but must not silently choose behavior: small visible catalogs such as Hypro should normally use `inline`; large, paginated, filtered, or virtualized catalogs such as Enamel Pins should normally use `modal`.

The engine owns the edit transaction by `selectionId`:

1. `beginEdit(selectionId)` copies the current selection into an edit draft without mutating cart-bound state.
2. The engine sets `data-cl-editing="<selectionId>"` on the active edit host and calls the adapter's `createDraft(hostEl, ctx, initialValues)`. The draft hydrates, reads, normalizes, and validates the same field contract in a card or modal host; it never mutates selected state. The presenter changes its primary action from Add to Update while this marker is present.
3. The configured presenter opens the editor. Inline locates the card, scrolls to it, opens `[data-cl-perso-toggle]`, hydrates fields, and focuses the first field. Modal mounts the same field contract in a dialog and does not require the source card to be present. Preview remains an injected adapter and never leaks product-specific plate logic into the engine or presenter.
4. `saveEdit()` asks the draft for normalized values and a new `selectionId`, then atomically replaces the old map key while preserving quantity, variant, bundle ID, and pricing data.
5. If the new key already exists, the engine merges quantities only when the resulting total is within the configured maximum; otherwise it returns a validation error.
6. `cancelEdit()`/internal `endEdit()` discards the draft and removes the marker. `removeSelection(selectionId)` removes only that personalized selection and uses the normal `cl:pack:changed` event with reason `remove`.

Summary markup exposes `[data-cl-pack-edit="<selectionId>"]` and `[data-cl-pack-remove="<selectionId>"]`. Presenters never edit the selected map or cart directly. No new public event is required for version 1: successful edit/remove operations publish the existing `cl:pack:changed` event with reasons `edit` and `remove`.

### Catalog tools and filtering (proposed for joint review)

Search, filtering, sorting, result counts, and empty states belong to an optional `cl-pack-catalog.js` presentation module. They must not be implemented independently inside each builder engine.

```jsonc
"catalogTools": {
  "enabled": true,
  "mode": "client", // client | remote
  "search": {
    "enabled": true,
    "placeholder": "Search products",
    "fields": ["title", "handle", "tags", "productType"]
  },
  "filters": [
    { "key": "state", "label": "State", "type": "select" },
    { "key": "productType", "label": "Product type", "type": "buttons" }
  ],
  "sort": {
    "enabled": true,
    "default": "featured",
    "options": ["featured", "title_asc", "price_asc", "price_desc"]
  },
  "showResultCount": true,
  "emptyMessage": "No matching products found.",
  "persistInUrl": false
}
```

GemPages may position the tools and grid independently:

```liquid
{% render 'cl-pack-builder', block: 'catalog-tools' %}
{% render 'cl-pack-builder', block: 'grid' %}
```

Module boundaries:

- `cl-pack-engine.js` owns selection, personalization, pricing, rewards, cart synchronization, and checkout. It does not implement search/filter UI.
- `cl-pack-catalog.js` owns search/filter/sort state, result visibility/order, result counts, URL persistence, and the empty state. It never adds, removes, or mutates selections.
- Liquid emits normalized searchable card data through stable per-card `data-cl-catalog-*` attributes. At minimum, Pins emits `data-cl-catalog-state` and a normalized lowercase `data-cl-catalog-search` blob. This replaces the client-side `deriveState()` table. GemPages controls placement, not behavior.
- Filtering hides or reorders product discovery cards only. Selected items remain in engine state and in the summary even when their cards are not visible.
- An inline Edit request may ask the catalog module to reveal a product by clearing only the filters that exclude it, then scroll/open/focus the card. Modal Edit does not require the card to be visible.
- `client` mode operates on rendered cards and is suitable for current catalogs such as the roughly 200 Enamel Pins. Filtering and sorting must move existing card nodes; it must never rebuild cards with `innerHTML`, because node identity preserves lazy preview state and `card.__clPerso`. `remote` reserves the same interface for future server-side pagination; it must not be implemented until a real scale requirement exists.
- Enablement and controls are explicit configuration. Product count may guide merchant choice but must not silently switch modes or expose filters.
- Search uses normalized case-insensitive text and debounced input; controls must be keyboard accessible, announce result counts, and provide Clear filters.

Recommended defaults: Hypro disabled; Golf/Wallets optional client mode; Enamel Pins client search plus relevant facets. Filter option labels and values should come from normalized product data/metafields, not a builder-specific JavaScript table.

Enamel Pins migration parity requirements:

- The state control remains a search/filter hybrid: input matches a state name or a product-title substring (for example, `cal` matches California and partial titles).
- Sort options remain Featured, A–Z, and Z–A. Do not add price sorting during parity migration.
- Pagination remains 12 cards per page with the compact pager.
- Sold-out cards are excluded entirely.
- Inline edit may call `catalog.reveal({ handle })`, which clears only filters excluding that card. Modal edit does not call reveal.

## 10. Defensive Liquid emission

- Build the configuration with Liquid JSON filters; never concatenate unescaped merchant text into JSON.
- Emit `null` or omit optional values. Never emit a partially quoted value.
- Coerce IDs consistently before comparison; serialize variant IDs without precision loss.
- Emit `data-cl-perso-fields` as valid JSON even when empty (`[]`).
- Do not emit `preview.configUrl` unless preview mode is `image_overlay`.
- Initialize once per `builder.key`, even if GemPages duplicates a block during editing/preview.
- In the builder's scoped reset layer, neutralize GemPages' global `* { max-width: 100% !important; }` for preview/measurement elements (use a scoped `max-width: none !important` rule). This prevents plate-text fit measurements from using constrained dimensions.

## 11. Reference configurations

| Builder | Selection | Personalization | Preview | Pricing |
|---|---|---|---|---|
| Hypro 3-Pack | target/max 3; checkout 1+ | `per_item`, `per_product` | `none` | fixed total $99 at 3 |
| Enamel Pins | pack target varies | `per_item`, `per_product` | `image_overlay` where configured | tier/reward config |
| Golf Hats | target 4; checkout 1+ | current eligible mode | product imagery | $29.99/hat at 4 + gift |
| Future mixed pack | slot/rule extension required | `shared`, usually `explicit` with eligibility | per-product optional | offer-specific |

The future mixed-product builder can use this envelope and the existing shared adapter, but enforcing category slots (for example exactly one tumbler, one sunglasses, and one wallet) requires a reviewed `selection.slots` extension before implementation.

## 12. Resolved joint-review decisions

1. `_builder` is a stable machine key. `Pack` and `_bundle_name` are display strings. Legacy `_builder` title values remain tolerated and opaque.
2. `_bundle_id` is the primary instance boundary. `_bundle_collection` is a fallback only for legacy cart lines.
3. Version 1 tier rules use `{ "minimum": n, "unitPrice": cents }`. Percentage and fixed-amount adjustments are deferred.
4. `selection.slots` is deferred until a real mixed-product pack is scoped.
5. Frontend pricing mirrors rather than owns backend pricing. The authority map in Section 6 is required before any builder migration.
6. The card snippet renders the accordion and optional-second-line controls; `cl-pack-perso.js` wires `[data-cl-perso-toggle]` and `[data-cl-perso-second-line]`.

## 13. Approval and rollout gate

Verified environments as of 2026-09-03: production/live is `Empire 13 Migration Clean` (`153643909208`); the unpublished Hypro pilot target is `Dev 8-10-2026` (`153606324312`). Theme roles must be rechecked immediately before deployment.

- [x] Claude confirms the merged personalization/preview sections match the tested adapters. Both DOM hooks are wired and end-to-end tests pass, including numeric-ID restore parity and second-line changes producing a distinct selection key.
- [x] Codex confirms the core can consume the normalized selection, pricing, cart, and event contracts.
- [ ] Diane approves merchant-facing fields, pricing rules, rewards, labels, and checkout behavior.
- [x] Hypro is migrated on unpublished theme `Dev 8-10-2026` (`153606324312`). Production remains unchanged.
- [x] Restore, clear, one-click edit link, one-pair partial checkout, full three-pair discount, personalization separation, header-cart interception, and direct checkout are browser-tested. Diane's merchant acceptance test remains pending.
- [ ] Only then are adapters wired and individual files deployed under the repository pull-before-edit/push-only-touched-files rules.
