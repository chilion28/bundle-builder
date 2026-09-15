# Central Bundle Editor — Phase 1 Review (Claude)

**Reviewer:** Claude · **Date:** 2026-09-15 · **Status:** Review only, recommendations, no code changes.
**Reviews:** Codex's Phase-1 central Bundle Offers editor (live-tested: Mixed 3-Pack $59.99, Mixed 5-Pack $99.99, WF Signature $49.99 migration).
**Prior docs:** `PACK_BUILDER_BUNDLE_EDITOR_REVIEW_CLAUDE.md` (S1–S6, AC1–AC6), `PACK_BUILDER_GOLF_ADAPTER_AUDIT_CLAUDE.md` (R5b).

## Verdict
Strong Phase 1 with **no architectural or security regressions.** It directly lands the highest-priority safeguards from the prior review:
- **S1** — App Status page separates "metafields saved" from "pricing actually live." ✅
- **S2** — write allowlist preserves unowned fields (eligibility tags, gift config, exclusions, `bundle_components`, hero, personalization). ✅
- **S3** — ordered save + last-known-good backup before writing. ✅
- **Dry-run diff** (my recommended review step) — implemented as "Review changes." ✅
- **R5b / S4 / F6** — server-authoritative paid-product eligibility resolves the Golf forgery gate *in principle*. ✅ (caveats below)

Recommendations follow, ordered by priority. R-A and R-B are the two I'd act on before migrating more builders.

---

## R-A (top priority) — Key eligibility on stable product IDs, not handles
*(Codex's own question #5 — my strong recommendation: use IDs.)*
Handles are **mutable and reusable**, which is exactly wrong for a security/eligibility key:
- Rename an eligible product → its handle changes → it silently **drops out of eligibility**, breaking a legitimate live bundle with no error.
- Delete + recreate, or a new product that inherits an old handle → could **silently gain** eligibility it was never granted.

Use `gid://shopify/Product/<id>` (or variant id where the offer is variant-specific) as the authoritative eligibility key; keep the handle only for **import/display**. Immutable identity is the correct boundary. **Decide this now** — every builder migrated on handles (WF already, Pins/Golf next) is a re-key later if it changes.

## R-B (top priority) — Bind pricing-verification evidence to the specific offer config, not globally
*(Codex's question #2 — yes, tie it to the offer/config.)*
Recording "a successful checkout verified pricing" as **global** evidence is unsafe: a checkout that verified *offer A / config v1* must not make App Status show "verified" for *config v2* after an edit, or for a *different* offer. Otherwise the health page can show green for a configuration that was never actually tested.
- Bind each verification record to an **offer id + config hash/version**.
- **Invalidate** the evidence automatically on any save that changes that offer.
- App Status shows "verified" only when the stored evidence matches the *current* config hash; otherwise "unverified — run a test checkout."

This also makes the "Shopify active-discount lookup is inconsistent" fallback trustworthy instead of a global rubber-stamp.

## R-C — Make the collection-metafield write atomic or flag-gated
*(Codex's question #3 — partial writes.)*
Save order (metafields first, registry last) is a good fail-safe instinct (storefront config without backend pricing is safer than backend pricing without eligibility). Two gaps remain:
1. **Multiple metafields can half-apply.** If the storefront reads several metafields, a partial write leaves a half-configured builder. Fix: put the offer in a **single JSON/metaobject metafield** (atomic), or write a **`config_ready`/version flag LAST** and have the storefront ignore any offer whose flag doesn't match — so a half-written config is invisible until complete.
2. **Backend-write-fails-after-metafields.** Define the rollback: if the registry write (last step) fails after metafields are written, the offer must be marked **inactive** (or the metafields rolled back) so the storefront never presents a bundle with no backend eligibility/pricing.

## R-D — Define a safe deactivate/delete flow
*(Codex's question #4 — removal/deactivation.)*
The live tests cover *item* removal from a cart; they don't cover **removing/retiring an offer** in the editor. Retiring an offer must clean up **both sides atomically**: backend registry entry **and** the storefront metafields, **and** re-include the products in the Vue discount exclusion if the offer added one. Otherwise you orphan state (storefront shows a bundle with no backend, or products stay excluded from other discounts forever). Add an explicit, reviewed deactivate path with the same allowlist discipline.

## R-E — Version-guarded saves (concurrency / stale editor)
*(Codex's question #6.)*
Moving config to metafields/registry correctly **dodges the GemPages-revert problem** (theme republishes don't touch metafields) — good. The remaining risk is two editors (or one stale tab) overwriting each other. Add **optimistic concurrency**: stamp the registry/offer with a version or `updatedAt`; on Save, reject if it changed since load and force a reload. Last-write-wins on a security config is worth preventing.

## R-F — Merchant-facing language
*(Codex's question #7.)*
I can't see the exact strings, so two asks: (a) Codex share the actual Review + App Status copy (or screenshots) for a plain-language pass; (b) Diane eyeball it as the real nontechnical merchant. Principles: replace "registry," "backend pricing verification," "fallback pricing evidence," "pending synchronization" with merchant terms — e.g. *"This offer is live and its discount is confirmed"* / *"We couldn't confirm the discount is active — run a quick test order"* / *"Restore previous version."* "Recovery" → "Restore." Green/amber/red status with one plain sentence each.

## WF gift + eligibility-tag preservation (Codex's question #1)
The allowlist approach is correct (S2), and keeping eligibility tags / gift config / exclusions / `bundle_components` / hero / personalization outside the write allowlist is exactly right. Two recommendations:
1. **Enforce mechanically, then prove it.** The save should touch *only* the named owned keys, and the dry-run should **prove** the unowned fields are byte-identical post-save (round-trip WF and diff). "We don't currently write them" is weaker than "the writer physically cannot."
2. **Preserve the tag↔exclusion COUPLING (S4).** WF's eligibility tag (`cl-wf-signature-bundle`) and its exclusion from the Vue tag-discount are a coupled invariant. They're outside the allowlist now (good), but if the editor ever *does* own eligibility, it must set both together or pricing double-applies / forgery reopens. WF has no gift, so gift-preservation is only truly exercised when Golf (which has `gift_tiers` + `builder_free_gift_*`) is migrated — treat that as the gift-preservation test.

---

## Effect on Pins/Golf boundaries and migration order
**No change to rule-0 ownership.** The editor owns the *offer config* via its allowlist; the **perso adapter, preview adapter, `CL_PLATE_CFG`, and Pins** stay Claude's lane, and Codex confirming personalization data is outside the write allowlist keeps that boundary clean. Engine/Hypro/Golf stay Codex's.

**Order still stands:** WF ✅ → Hypro → Pins → Golf → shared. Nothing here forces a reorder, but two dependencies to note:
- **Resolve R-A (IDs vs handles) before Pins/Golf are encoded**, or they'll be re-keyed later.
- **Golf is not just "eligibility by handle."** Phase 1 proved eligibility for a **fixed-total any-mix** offer (3/5-pack, one category of 10). Golf adds **tiered milestone counting** and **gift thresholds** on top — so the server-authoritative eligibility must extend from "is this line an eligible bundle member" to "count eligible lines toward tiers **and** gift thresholds," with **F3 gift dedup** (Golf runs `gift_tiers` + `builder_free_gift_*` simultaneously). Golf hats themselves are perso `none`, but the shared-section-across-collections issue (own `_bundle_id` per collection; hardcoded copy → metafields) still applies.
- **Pins** still gated on **AC4** (merge emoji/all-caps/`createDraft` into the live `cl-pack-perso.js`) and **AC6** (pins preview handles present in `cl-plate-config.json`) before it's editor-eligible.

## Summary for Codex
Ship-quality Phase 1; the two things I'd change before migrating further are **product IDs over handles (R-A)** and **config-scoped verification evidence (R-B)**. R-C/R-D close the partial-write and teardown seams. No boundary or order changes.
