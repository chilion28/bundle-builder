# Mixed-Pack Decisions — Claude Review

Reviewer: Claude · Date: 2026-09-11 · Reviewed against `CL_BUILDER_CONFIG_SCHEMA.md`, `PACK_BUILDER_QUICK_REFERENCE.md`, and adapter code `assets/cl-pack-perso.js`.
Trigger: Codex's mixed-pack requirements message (7 agreed decisions + open items). **No code changes made.**

## Verdict

No conflicts on decisions 1–6. Concurrence on 7 with added detail and edge cases. The one item that is *not* just a config toggle: **`shared` personalization is currently a documented stub in the adapter and is net-new work**, not live behavior.

## Agreements (decisions 1–6)

All consistent with the approved schema:

- **Mixed bundle types** (any-mix, slot-based) — matches quick-ref §2.
- **Three personalization modes** (`none` / `per_item` / `shared`) — matches adapter contract and quick-ref §3.
- **Cumulative `custom.gift_tiers` stacking** via `gift_tier` metaobjects (`minimum_quantity` + `gift_variants`) — matches schema §6.
- **Slot-gift double condition** (paid minimum reached AND every required slot valid+filled) — matches resolved decision #7.
- **Gift line exclusions** (paid counts, slot fulfillment, bounds, pricing distribution, savings; no cross-`_bundle_id` combining) — matches quick-ref §5.
- **Corrected simple-gift fallback** (`custom.builder_free_gift_variants` / `_pack_size` / `_label`); legacy singular `custom.gift_tier` dropped — adapter never consumed it.

## Flags, gaps, and recommendations

### F1 — `shared` mode is a stub, not built (implementation flag)

`assets/cl-pack-perso.js:339-342`: `attach()` returns `null` for `shared` by design ("left as a documented stub; the pins pilot only needs per_item"). When mixed bundles are scoped, `shared` is **net-new adapter work**, requiring:

- a builder-level mount (not per-card),
- one controller broadcasting a single value-set to all eligible items,
- a re-render fan-out when the shared value is edited.

Not a blocker; flagging so it is not assumed live.

### F2 — `shared` selection identity (Codex open item) — recommendation

Keep `selectionKey(variantId, values)` **unchanged and per-line**. In `shared` mode the engine passes the *same* shared `values` into every eligible item's key: different variants stay distinct (different `variantId`), identical variants with the shared value collapse correctly. Do **not** introduce a bundle-level identity. Cart restore then "just works" — rehydrate the shared form from any one restored eligible line's properties.

- **Edge case:** editing the shared value re-keys every eligible selection at once. `saveEdit()` must treat the shared re-key as **one atomic transaction**, or a mid-fan-out failure leaves mixed old/new keys.
- **Edge case:** `shared` + a non-personalizable slot item — the engine must not copy shared props onto ineligible items (adapter already returns no props for them).

### F3 — Gift dedup ordering

Concur with dedup by `variantId`, lowest qualifying minimum wins (quick-ref §4). **Ordering matters:** if a variant is both a tiered gift and the simple-fallback gift, suppress the fallback **first** (when `gift_tiers` is non-empty), **then** dedup within the surviving set — otherwise the fallback could win a lower minimum.

### F4 — `selection.slots` matching precedence (Codex open item) — recommendation

Add an explicit precedence rule to the slot schema:

- A product fills the **first** slot (in declared slot order) it is eligible for.
- A product **cannot** occupy two slots.
- If a product is eligible for multiple slots, emit a config-time `cl:pack:validation-error` at init rather than silently choosing.

This makes "can a product match multiple slots?" a **no** by default — the safe answer.

### F5 — Bounds authority for slot bundles (edge case, not in either doc)

Any-mix uses `target` / `maximum`; slot-based derives max from `sum(slot.quantity)`. When `slots` is present, `selection.maximum` should be **ignored or asserted-equal** to the slot sum, not independently enforced, to avoid a config conflict (e.g. a 3-slot bundle with a stale `maximum`). Recommend: slots, when present, are authoritative for bounds.

### F6 — Backend authority reinforcement

Per schema §6, the first mixed bundle has **no backend selected yet** (hard rollout gate). Whichever backend is chosen must validate **slot fulfillment** server-side, not only paid quantity — otherwise a manipulated cart could unlock a slot-gated gift. Already captured in decision #7; reinforcing that this is the gift-security boundary.

## Status of Codex's seven open items

| Open item | Claude position |
|---|---|
| Final `selection.slots` schema | Concur with conceptual shape; add precedence field (F4). |
| Slot matching precedence / multi-slot | Recommend first-eligible-in-order, no multi-slot, config-time error (F4). |
| `shared` identity / editing / restore | Reuse per-line key with broadcast values; atomic re-key on edit (F2). Note: adapter stub (F1). |
| Backend validation for slots + slot gifts | Required rollout gate; must be server-side (F6). |
| Backend pricing authority for first mixed bundle | Not yet selected; no frontend pricing ships before it is documented. |
| Duplicate gift dedup by `variantId`, lowest min wins | Concur; suppress fallback before dedup (F3). |

## Phase 1 — `selection.slots` frontend validation (Codex, implemented on dev)

Added 2026-09-11. Slot validation implemented in `assets/cl-pack-engine.js`, deployed only to dev theme `153606324312`; live untouched. Codex reports the automated matrix passed (legacy no-slot behavior, config failures, slot overflow, checkout gating, restore overflow/ineligibility).

**Ownership note:** the engine is **Codex-owned** (schema §1/§13); adapters are Claude-owned. No handoff needed — Codex proceeds; Claude does not touch `cl-pack-engine.js` during this slice.

**Frozen Phase 1 behavior (approved):** slots optional (legacy builders unchanged); each product occupies exactly one slot; eligibility by product type + handle; multi-slot-eligible product is a config error; required capacity = `sum(slot.quantity)`, authoritative when present; `selection.maximum` if supplied must equal slot capacity; over-capacity add/increment blocked; checkout requires all slots full; restore ignores+reports ineligible/ambiguous/over-capacity lines; failures via existing `cl:pack:validation-error`. No pricing/gift/shared/Liquid/backend changes in this slice.

### Slot test matrix

**A. Backward-compat (no `selection.slots` — must be untouched)**

1. Hypro 3-pack (`fixed_total`, no slots) — select/restore/checkout unchanged.
2. Pins (`tiered`, no slots) — unchanged.
3. Golf (`tiered` + gift, no slots) — unchanged, gift still fires.
4. Config with `selection.maximum` but no `slots` — old max logic only, no slot code path entered.

**B. Config validation (init-time `cl:pack:validation-error`)**

5. Product eligible for two slots (type→A, handle→B) → config error, not silent assignment.
6. `selection.maximum` present and ≠ `sum(slot.quantity)` → config error.
7. `selection.maximum` present and = slot capacity → accepted.
8. Slot with missing, zero, fractional, or negative `quantity` → config error. *(Ruling confirmed.)*
9. Duplicate slot `id` → config error.
10. Product eligible for no slot → remains **visible but non-selectable**; not a global config error. *(Ruling confirmed, see CF3.)*

**C. Selection behavior**

11. Fill slot to capacity, then add another eligible product → blocked with selection error.
12. Increment a variant beyond its slot's remaining capacity → blocked.
13. Same variant, two personalizations, into a `quantity:2` slot → two distinct `selectionKey`s = **two units**, one slot; slot counts units, not distinct keys. *(Ruling confirmed, CF2.)*
14. Remove a filled-slot item → slot reopens, checkout re-blocks.

**D. Checkout gating**

15. All slots full → checkout allowed.
16. One slot partial/empty → checkout blocked with which-slot message.

**E. Cart restore (ignore + report)**

17. Restore a line now ineligible for any slot → ignored + reported, no substitution.
18. Restore lines that over-fill a slot (manual cart edit) → excess ignored + reported.
19. Restore an ambiguous line (eligible for 2 slots post-config-change) → ignored + reported.
20. Restore a valid full slot set → badges/summary reconstruct correctly.

### Compatibility flags

- **CF1 — restore path is the biggest risk.** Legacy Hypro/Pins/Golf restore must not enter any slot branch. Recommend an early `if (!config.selection.slots) { legacy restore }` guard so slot logic is fully bypassed, not interleaved.
- **CF2 — slot capacity counts units, not selection keys** (test 13). A `quantity:2` slot filled by one variant with two engravings = 2 units, 1 slot, 2 cart lines. Counter sums `quantity`, not `Object.keys(selections)`. *(Confirmed.)*
- **CF3 — "eligible for no slot" (test 10) resolved:** product remains **visible but non-selectable**, not a global config error — a shared collection may legitimately contain an out-of-every-slot product. *(Confirmed.)*
- **CF4 — name collision:** the existing `milestoneStyle: "slots"` is a *visual milestone display* flag (Hypro). The new `selection.slots` *category* concept is different — ensure they don't collide despite sharing the word "slots."

**Rulings status:** All resolved 2026-09-11 (tests 8, 10/CF3, CF2, plus multi-slot = global config error, slot capacity authoritative with `selection.maximum` asserted-equal). Matrix is finalized/approved. Codex reports the automated matrix passing on dev theme `153606324312`; live untouched.

## Next step

Joint design pass to move `shared` adapter + `selection.slots` matching precedence from design to build. No code until that pass and Diane's merchant approval.
