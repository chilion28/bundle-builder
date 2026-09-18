# Generic Bulk Builder — Future-Phase Plan (Pins pilot)

**Author:** Claude · **Date:** 2026-09-18 · **Status:** PLANNING ONLY — future phase, no implementation, no changes to the live Pins builder.
**Origin:** Codex proposal (2026-09-18). Prompted by a live customer wanting >24 pins. Decision: **keep the consumer Pins builder capped at 24 (working as intended)**; serve 25+ via a **separate** bulk-order experience.

## Objective
A **generic, product-neutral bulk-order builder** for quantities above the consumer cap, reusable across pins, sunglasses, hats, golf, etc. It must NOT change the consumer builder's pricing, validation, milestones, or behavior. Pins is the pilot, but the architecture must carry **no pin-specific assumptions**.

## Core principle: it's a SEPARATE offer, not a bigger consumer offer
The existing unified engine is already config-driven and type-agnostic, so a bulk builder is mostly a **new offer + new builder instance**, reusing the same engine/adapters — with its own identity so nothing collides with the consumer builder:
- **Separate registry offer** and **separate `_bundle_collection` / `_bundle_id` identity** (distinct cart scope, edit links, clear/restore).
- **Separate pricing milestones** from the consumer reward milestones.
- **Same config authority (registry)** drives BOTH the storefront limits AND checkout validation for bulk — no drift.

## Smallest reusable config schema
Reuse the existing offer schema (pricingMode, tiers, eligibility by stable GID, min/max, personalization, previews, gifts) — a bulk offer is the same shape with bulk values. Add only:

1. **`offerKind`**: `"consumer"` | `"bulk"` (default `"consumer"`). Distinguishes a bulk offer; lets validation/UX branch without pin-specific logic.
2. **`fulfillment`**: `"checkout"` | `"quote"` (bulk only; default `"checkout"`). Direct purchase vs. request-a-quote.
3. **On the CONSUMER offer — a `bulkUpsell` block** (drives the "Need more than 24? Shop bulk →" link):
   ```json
   "bulkUpsell": {
     "enabled": false,            // keep OFF until the bulk page is ready
     "thresholdQty": 24,          // show as the shopper approaches/hits the cap
     "linkText": "Need more than 24 pins? Shop bulk orders →",
     "linkUrl": "/pages/bulk-pins",
     "showInSidebar": true,
     "showInDrawer": true
   }
   ```
   All of text/url/threshold/visibility are **offer settings** (not hardcoded), so it generalizes per product.

Everything else the bulk offer needs already exists in the schema: `minimum` (e.g. 25), `maximum` (a bulk cap or unlimited), tiered `pricingTiers` (bulk-specific), `authoritativeEligibility.productIds`, personalization fields, preview config, gifts.

## Frontend blocks needed (GemPages-compatible)
The consumer pins builder pattern already works via `cl-pack-builder-section.liquid` + `cl-hypro-bundle` on a collection, driven by the offer. Reuse it; only two genuinely new pieces:

1. **Bulk builder page** — REUSE: a collection template pointing `cl-pack-builder-section` at the **bulk collection** with `pricing_mode: auto` reading the **bulk offer**. GemPages-compatible the same way the consumer builder is (a GemPages collection template with a Liquid/custom-code element rendering the builder, or a native collection template). No new builder block.
2. **Bulk-upsell link** — NEW small snippet (e.g. `cl-bulk-upsell-link.liquid`) rendered in the consumer builder's sidebar + mobile drawer, reading the consumer offer's `bulkUpsell` settings; renders nothing when `enabled:false`. Product-neutral. (Lives in the sidebar/drawer that `cl-hypro-bundle` owns — coordinate with Codex on placement vs. a standalone insert.)
3. **Request-a-quote path** (only if `fulfillment: "quote"`) — NEW: a quote-request form → draft order / email, instead of checkout. Bigger piece; a GemPages form or a custom form snippet + a backend endpoint (Codex) to create the draft/lead. Not needed if the pilot uses `fulfillment: "checkout"`.

## Separation guarantees (must hold)
- Bulk cart lines carry a **distinct `_bundle_id`/`_bundle_collection`** so consumer and bulk bundles never merge, mis-scope edit/clear, or share milestones.
- Bulk **checkout validation** reads the **bulk** offer's min/max/eligibility/tiers — never the consumer offer's.
- The consumer builder is untouched: its 24 cap, tiers, milestones, and gifts stay exactly as they are.

## Open decisions (for Diane/boss/Codex when this phase starts)
- **Fulfillment for the pins pilot:** direct checkout with bulk pricing, or request-a-quote? (Drives whether the quote-form piece is needed.)
- **Bulk pricing tiers:** what per-pin price at 25+, and the tier breakpoints? (Merchant input.)
- **Bulk maximum:** a hard cap or unlimited?
- **Personalization at bulk scale:** entering custom text for 50+ pins per-item is heavy UX — options: same text on all, a CSV/bulk-entry mode, or per-item. Needs a design pass (this is the one genuinely new UX problem bulk introduces).
- **Eligible products:** same 84 pins, or a bulk-specific subset?

## Immediate (this week, NOT this phase)
- **Do not modify or deploy the live Pins builder.** It stays at 24.
- **A customer wanting >24 now** → serve via a **manual draft order** in Shopify admin (bulk per-pin price), as a stopgap until the bulk page exists.
- Keep the `bulkUpsell` link **disabled** everywhere until the bulk builder is live.

## Rollout sketch (when greenlit)
1. Define the bulk offer schema additions (`offerKind`, `fulfillment`, consumer `bulkUpsell`) in the registry/editor (Codex).
2. Author a bulk **pins** offer (min 25, bulk tiers, 84 GIDs, checkout fulfillment) + bulk collection identity.
3. Stand up the bulk builder page on dev (reuse `cl-pack-builder-section`); parity-style test.
4. Build the `bulkUpsell` link snippet (disabled by default).
5. If quote fulfillment: build the quote-request path.
6. Enable the upsell link + launch. Generalize to other products by authoring more bulk offers — no new architecture.
