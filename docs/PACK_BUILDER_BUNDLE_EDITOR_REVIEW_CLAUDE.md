# Pack Builder — Central "Bundle Offers" Editor: Claude Review

**Reviewer:** Claude · **Date:** 2026-09-14 · **Status:** Design review only, no code changes.
**Reviews:** Codex's proposal to make `citylocs-functions → Bundle offers` the central no-JSON editor for all pack builders.
**Companions:** `Empire 13 Migration Clean/CL_BUILDER_CONFIG_SCHEMA.md`, `PACK_BUILDER_QUICK_REFERENCE.md`, `docs/PACK_BUILDER_MIXED_BUNDLE_REVIEW.md` (F1–F6).

## Proposal as understood
One central editor (in the `citylocs-functions` app) that authors every pack builder without hand-edited JSON. Requirements:
- Supports fixed-total any-mix, fixed-total required-category (slots), tiered pricing, tiered + cumulative gifts, and none / per-item / (eventually) shared personalization.
- **Storefront metafield synchronization stays independent from backend pricing activation.**
- Existing builders imported by collection handle, **preserving settings the editor does not own**.
- Changes previewed before saving; **incomplete configs must never overwrite a working live builder.**
- Migration order: WF Signature + Boonie → Hypro → Pins → Golf → shared personalization.

## Verdict
Direction is sound and consistent with the established principle: **pricing authority is backend; the storefront only mirrors it.** "Metafield sync independent from backend pricing activation" is the correct restatement of that. Almost the entire risk surface is in two places:
- **(A)** importing/writing metafields without clobbering settings the editor doesn't own, and
- **(B)** not letting a metafield "Save" imply the backend pricing is actually live.

No conflicts with the agreed decisions — this is concurrence plus the safeguards below.

---

## Adapter conflicts

### AC1 — `shared` personalization is still a stub (confirmed live)
`assets/cl-pack-perso.js:339` — shared mode is documented but `attach()` returns null; only `per_item` was built for the pins pilot. Scoping shared bundles is net-new adapter work (builder-level mount + broadcast controller + edit fan-out — per F1), not a config flip. Putting shared last is right, but the **editor needs a guard** so a merchant cannot select-and-save shared before the adapter exists. Show it disabled / "coming soon."

### AC2 — import-by-collection-handle vs the `_bundle_id` runtime scope
The live cart (`snippets/cl-bundle-cart.liquid`) scopes clear / restore / gift by **`_bundle_id`** (lines 365, 494, 646) and reads `_bundle_collection` only as an edit-link fallback (499, 553). Import by collection handle is fine as a *lookup key*, but the editor must deterministically map collection → `_bundle_id` and key its written config to `_bundle_id`, or edit/remove/gift scoping silently breaks. Do not let import reintroduce collection as the identity.

### AC3 — two preview implementations; editor must use Codex's on-theme one
There is Claude's WIP `_pack-builder-adapters-wip/cl-plate-preview.js` **and** Codex's integrated **`assets/cl-pack-preview.js`** (config via `configUrl`, with the `vc:true` vertical-centering + the `!important` font-family fix). The editor's preview must render through the on-theme file. Pushing the WIP over it would regress boonie.

### AC4 — perso adapter merge is a hard prerequisite
The live-installed `cl-pack-perso.js` predates the emoji-validator + all-caps + `createDraft` (still only in `_pack-builder-adapters-wip/`). Any editor path that enables a **personalized** builder (Pins, Boonie) must gate on merging those into the live asset first, or validation/edit-draft behavior differs from what the editor promises.

### AC5 — global CSS reset leak (confirmed live)
`assets/cl-hypro-bundle.css:11` applies `.cl-hypro *{font-family:…!important}` (and `max-width:none!important`). A central editor that renders any builder near Hypro markup inherits this bleed. Contain the reset before centralizing, or the editor's live preview won't match production.

### AC6 — preview config coverage gap
`cl-plate-config.json` still lacks the runtime-added blackout / engraved / `bundle-generic` entries. If import pulls preview configs from it, those designs render blank. Capture during the real Pins migration (as planned), and have the editor **validate that every referenced preview handle resolves** and refuse to mark a config "complete" if any is missing.

---

## Missing safeguards

### S1 — never conflate "metafields saved" with "pricing is live" (highest priority)
Backend activation is a separate, permissioned step:
- `cartTransformCreate` hit **ACCESS_DENIED** (owner-only staff permission + `write_cart_transforms` scope + the caller-app trap).
- WF fixed-total uses a **Product Discount Function**.
- Tiered uses the **tag-based Vue discount app**.

The editor writes storefront metafields with **none** of those permissions. Save must **report backend pricing status** (is the transform / discount function actually registered for this builder?) rather than implying "done." Otherwise a merchant publishes a fixed-total builder whose price never applies.

### S2 — unowned-field preservation must be an explicit allowlist + read-modify-write
"Preserve settings the editor doesn't own" is only safe if enforced mechanically. Never blind-write a config object over the live one — merge into the current value and leave these untouched:
- eligibility tags (e.g. `cl-wf-signature-bundle`),
- the Vue discount **exclusion** list,
- cart-transform `custom.bundle_components`,
- gift / reward metafields (`gift_tiers`, `builder_free_gift_*`),
- `custom_hero_text`, `builder_preview_mode`,
- per-product perso fields (`data-cl-perso-fields`).

Recommend a hard allowlist of editor-owned keys; everything else round-trips verbatim.

### S3 — atomic, all-or-nothing write + prior-version backup
"Incomplete configs must never overwrite a working live builder" needs teeth: (a) a completeness gate before Save is enabled; (b) a single atomic write (no partial multi-metafield update that can half-apply); (c) stash the previous config value for one-click rollback. Metafields have no native versioning, so the editor keeps the last-good snapshot itself.

### S4 — fixed-total eligibility coupling must be enforced together
The WF pattern is a coupled invariant: eligibility tag (blocks forged `_bundle_*` attrs) **and** exclusion from the Vue tag discount — or pricing double-applies / gifts can be forged. If the editor can create a fixed-total builder, it must checklist/enforce both sides, not just write the storefront config. Backend still owns activation (S1), but the editor should surface the coupling.

### S5 — slots: keep the backend as the security boundary
The engine already enforces F4/F5 on the frontend (`assets/cl-pack-engine.js` — slot-sum authoritative; `selection.maximum must equal the total slot quantity`; multi-slot-eligible = config error). The editor generating slot configs must preserve those invariants at save-time, **and** its frontend validation must not become the gift-security boundary — F6 (server-side slot-fulfillment validation) still has to exist for cumulative gifts.

### S6 — gift dedup ordering (F3)
For "tiered + cumulative gifts": dedup by variantId lowest-min-wins, and suppress the simple free-gift fallback **before** dedup whenever `gift_tiers` is non-empty. Add a config-time assertion so an editor-built tiered+gift config can't emit both a fallback gift and a tier gift.

---

## Migration order
`WF + Boonie → Hypro → Pins → Golf → shared` is well-ordered (simplest / non-perso first, perso-heavy later, stub last) and matches the agreed sequence. Two coordination notes:
1. **Ownership split still holds (rule 0 — never two agents in one file):** Codex owns the engine / Hypro / Golf; **Claude owns Pins + the perso / preview / `CL_PLATE_CFG` adapters.** The Pins step in this editor is Claude's lane.
2. **Golf has not had an adapter review** (no captured perso / preview / pricing shape). It needs a quick audit before it is editor-eligible, same as Boonie / Sunglasses got.

## Recommended addition to the proposal
A **dry-run diff in the preview step**: import the live builder and show `owned fields changing` vs `unowned fields (untouched)` vs `backend pricing status`, and require explicit confirm. That single view operationalizes S1–S3 at once and is the cleanest guard against "incomplete config clobbers a working builder."

---

## Verification basis (checked against current code, 2026-09-14)
- `assets/cl-pack-perso.js:339` — shared still stubbed.
- `snippets/cl-bundle-cart.liquid` — `_bundle_id` is the scope key (365/494/646); `_bundle_collection` is edit-link fallback only.
- `assets/cl-hypro-bundle.css:11` — global `!important` font/reset leak present.
- `assets/cl-pack-engine.js` — slot-sum authoritative + `selection.maximum == slot sum` + multi-slot config-error checks present (F4/F5).
