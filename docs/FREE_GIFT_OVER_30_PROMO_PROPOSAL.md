# Free Gift on Orders Over $30 — Implementation Proposal

**Author:** Claude · **Date:** 2026-09-14 · **Status:** Proposal, no code yet.
**Ask (boss, via Diane):** customers who spend a minimum amount get a **pre-selected** free gift, auto-added to their cart, similar to the pack-builder free-gift experience.

## Final decisions (Diane, 2026-09-14)
- Gift is **pre-selected by us** (one specific product), NOT customer's choice → known, fixed cost, no cap needed.
- Gift is **auto-added** to the cart (not "customer must find and add it").
- Zeroing method: **PREFERRED = the pack-builder tag/function approach (2b)** — tag `cl-free-gift`, function zeroes it, max 1 — for consistency with the builders. Native discount (2a) remains a no-code fallback.
- **Per-household is NOT required.** Requirement is simply: the gift must not be easily abused.
- Gift product may be an existing catalog item OR a new product we create (either is fine).

## The mechanic
> Spend **$30** (on paid items) → a pre-selected **[GIFT PRODUCT]** is auto-added and discounted to **$0**, **1 per order**.

## Architecture — two decoupled halves
1. **Auto-add / auto-remove (storefront — new, Claude's lane).** A lightweight global "free-gift manager" script that watches the cart everywhere (AMP/iCart drawer + cart page). When the **paid subtotal** (excluding the gift) reaches $30, it adds the gift variant once; if the subtotal drops below $30 — or the gift is present but not actually discounted — it removes the gift. Includes a progress nudge ("You're $6 from your free gift!"). Reuses the pattern/UX from the pack-builder free gift + the cart-milestone tracker. **Identical regardless of which zeroing method (2a or 2b) is chosen.**
2. **Make it $0 — two options for the zeroing:**
   - **(2a) Native automatic "Buy X Get Y" discount (no code).** *Customer buys a minimum of $30 → gets 1 × [GIFT] at 100% off.* No Shopify Function, no `citylocs-functions` change. Fast, but less flexible on threshold semantics and no usage caps.
   - **(2b) PREFERRED (Diane 2026-09-14): reuse the pack-builder gift function (tag-based).** Tag the gift product with a server-owned tag (e.g. `cl-free-gift`); a Shopify **discount function** in `citylocs-functions` zeroes one tagged line, **max 1**. Consistent with the pack builders, honors the exact threshold logic (see the pins example), and coexists cleanly with the pack-builder discounts. **Codex's existing builder gift function already zeroes a `cl-bundle-free-gift`-tagged product after recounting paid amount** — so this promo is best built by **extending that function** to a store-wide "$30 paid subtotal → zero one `cl-free-gift` item" rule. Backend = Codex's lane; needs a coordination note.

### ⚠️ Security boundary for 2b (non-negotiable)
The tag must **not** be the sole trigger. The function **must recount the paid subtotal server-side (excluding the gift line) and only zero the gift when it is ≥ $30** — exactly the pack-builder recount pattern. Otherwise a customer adds *only* the tagged gift to an empty cart and checks out with a **free $0 order**. Worked examples:
- 2 enamel pins × $15 = **$30 paid** → threshold met → `cl-free-gift` hat zeroes. ✅ (Diane's example — honored.)
- Only the gift in cart → **$0 paid** → not met → gift stays full price; storefront manager removes it. ❌ (Abuse blocked.)

### Threshold semantics to pin down (2b)
Decide whether the $30 is measured on **product-price subtotal** (e.g. 2 × $15 = $30, before other discounts — matches Diane's example) or on the **amount actually paid after** any pack-builder/tag discount. Must be explicit so the rule is unambiguous when the qualifying items are themselves discounted (e.g. pins under the pins builder's buy-more-save).

## Rules & anti-abuse
Because the gift is **pre-selected**, the "any product / customer picks the priciest" exploit is gone — the giveaway is a fixed, known cost. Remaining levers:

| Lever | How | Enforced by |
|---|---|---|
| 1 gift per order | BXGY "get 1"; manager guards against duplicate add | Native + storefront |
| $30 on **paid** items | Subtotal computed excluding the gift line; Shopify re-checks at checkout | Native + storefront |
| No $0 / gamed orders | Manager removes gift if subtotal < $30 or gift not discounted | Storefront |
| Total giveaway budget | Set the gift product's **inventory** = promo budget; when it depletes, promo stops and out-of-stock item isn't added | Inventory |
| Farming not profitable | Choose a gift whose value is comfortably **under $30** | Merchant choice |
| Time-box | Discount start/end dates | Native |

**Honest limitation:** native *automatic* discounts have **no per-customer or total-use cap** (those exist only on discount *codes*, which need login and can't be auto-applied). Per-household is not enforceable with guest checkout. Mitigation = the inventory cap + a sub-$30-value gift + 1-per-order; repeat real $30 orders are self-limiting.

## Key engineering risk (the part to build carefully)
Reliable **auto-add/remove in the AMP/iCart Vue drawer** without loops, and the critical safeguard: **if the native discount ever fails to apply** (e.g. a combination conflict with the tag-based pack-builder discounts), the manager must detect "gift in cart but NOT $0" and remove it, so a customer is **never charged** for the "free" gift. Also verify the promo's **discount-combination settings** against the existing tag-discount app and pack-builder gifts so they don't fight or double-apply.

## Gift product setup
- Must be **on the Online Store sales channel** so the variant is addable to cart (off-channel → "cannot find variant"). Can otherwise be hidden (no collection / SEO-hidden).
- If tracking a giveaway budget, **enable inventory tracking** and set stock to the budget.

## Open merchant inputs (for the boss)
1. Exact **gift product** + variant (existing or new).
2. Confirm threshold = **$30** (paid subtotal).
3. **Promo dates** (start/end), if time-limited.
4. **Giveaway budget** (→ gift inventory count), or unlimited.
5. Should this discount **combine** with existing pack-builder/tag discounts, or be exclusive?

## Suggested rollout
1. Boss confirms the open inputs + the threshold semantics (product-price vs amount-paid).
2. Create/prepare the gift product (on-channel, inventory set, tagged `cl-free-gift`).
3. **Coordinate with Codex** to extend the existing `citylocs-functions` gift function to the store-wide "$30 paid subtotal → zero one `cl-free-gift` item, max 1" rule (server-side threshold recount). *Or* configure the native BXGY discount if going the 2a fallback. Note: activating/registering discount functions has historically hit permission/scope walls (owner-only for cart transforms; discount functions may already be registered for the builders — Codex to confirm).
4. Build + test the storefront gift-manager on a dev theme (cross $30, drop below $30, discount-fails-to-apply safeguard, drawer + cart page, checkout shows $0, 2-pins-$30 example).
5. Diane approves → go live.
