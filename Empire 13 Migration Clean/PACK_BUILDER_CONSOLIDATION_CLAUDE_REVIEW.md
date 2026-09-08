# Pack Builder Consolidation — Claude Review

Reviewer: Claude
Date: 2026-09-03
Reviewing: `PACK_BUILDER_CONSOLIDATION_HANDOFF.md` (Codex proposal)
Verdict: **Architecture is sound. Endorse the direction with corrections below. Do not start migration until the contracts in §3 and the naming fix in §1 are locked.**

---

## 0. Live evidence for the premise (today)

The proposal's central risk — "republishing a GemPages page / theme rollback must not erase the engine" — **fired today, 2026-09-03**, on the enamel-pins builder. The live `gp-section-626317142307963757.liquid` had been reverted to an older *modal-personalization* engine (4158 lines, missing `commitInlinePersonalized` / `renderRewardTracks` / `__clWired`), while the card snippet stayed on the newer *inline-personalization* design. Result: clicking **Add to Pack** ran a dead `openProductModal` path → nothing added. Fixed by re-pushing the correct local section to live theme `153643909208`.

This is the third documented recurrence of the same class of failure (see `pack-builder-project` memory: 2026-07-17 rollback, 2026-08-13 rollback, 2026-09-03). **The business case for getting the engine out of `gp-section-*` files is proven, not theoretical.** It should be framed as the primary justification, not a footnote under "Risks."

---

## 1. Corrections to the current-system inventory

**1a. File list is missing the de-facto shared engine.** `assets/cl-bundle-builder.js` (2291 lines) + `assets/cl-bundle-builder.css` already exist and are **live on the backyard-chillin builder**. This is the closest thing to the proposed destination that already ships. It is the non-personalized engine (has `renderRewardTracks`, `renderSummaryShell`, `giftTiers`; has **no** personalization, no `[data-cl-card]` grid, no preview). ⚠️ It is **not committed to this repo** — it lives only on the live theme. Pull it before any design work.

**1b. Naming collision — do not use `assets/cl-pack-builder.js`.** The proposal (§ "Proposed destination", line 44) names the new engine `cl-pack-builder.js`. **That name is already taken** by a different, older grid engine (`[data-cl-pack-grid]`-based, ~31KB minified) that other pages load; reusing it caused a real collision before, which is why `cl-bundle-builder.*` was chosen instead. Pick a fresh unique name (e.g. `cl-pack-engine.js`) or build on `cl-bundle-builder.*`.

**1c. Name the sections precisely.** "The golf and pin sections" is ambiguous and has caused wrong-file edits before. The actual map (verified live):
- `gp-section-626317142307963757.liquid` — **pins + license-plate-hats** engine. Personalized, inline per-item perso, plate/text preview, milestones, gifts, cart restore. **Richest engine.**
- `gp-section-623576563790643742.liquid` — **golf** engine. Non-personalized. Source that `cl-bundle-builder.*` was extracted from.
- `gp-section-626317142307898221.liquid` — pins **layout/summary** section (renders `cl-pack-grid` + the summary shell); sibling to the engine, not the engine itself.

**1d. Pins personalization is inline, not modal.** The proposal calls it "per-item personalization and a product preview" (correct), but the currently-correct implementation is the **inline** card design (`commitInlinePersonalized`, `card.__clPerso`, `[data-cl-perso-input]`), not the legacy `openProductModal`. Any "compatibility adapter" must target the inline DOM contract; the modal path is dead and should not be treated as reference.

**1e. Preview config lives in `cl-pack-grid.js`.** `CL_PLATE_CFG` (172 products: 88 plate hats + 84 pins, each with per-field Zepto geometry) is embedded in `assets/cl-pack-grid.js` and exposed as `window.CLPlatePreview`. It is ~large and directly relevant to Q6 (lazy preview loading).

---

## 2. Answers to the 8 questions

**Q1 — What's missing from the proposal?**
- **Lazy preview rendering.** Pins/plates use an `IntersectionObserver` to draw previews only on scroll-into-view (88+ previews at load was a perf problem). The state/adapter model must not force eager preview render.
- **The GemPages `max-width:100%` clamp.** The GemPages root applies `* { max-width:100% !important }` to every descendant, which silently broke plate-text fit measurement (cost hours historically). The CSS-reset-containment rule (§ "GemPages integration contract") must explicitly cover this, and any measure-and-fit code must force `max-width:none` inline before measuring. Call this out as a named contract, not general "reset containment."
- **`CL_BUILDER_CONFIG` fragility.** A single Liquid error inside the emitted config object literal (e.g. an image with no `image_url`) nukes the whole builder to defaults. The config emitter needs defensive `null` guards on every interpolated value. This is a recurring, non-obvious failure mode.
- **Header/AMP cart coexistence** is listed in the test matrix but not in the architecture. The engine explicitly fights the AMP cart drawer and Qikify/Gorgias click interception; event ownership scoping (§ State model) must be a first-class design item, not a test.

**Q2 — Best reference for canonical state + cart restoration.**
`gp-section-626317142307963757` (pins). It already implements distinct selection keys, per-item personalization, milestone rewards, gift tiers, and `restoreBundleFromCart`. Golf is the reference for reward/gift *richness* on the non-personalized side, but pins is the superset for **state shape**. Build the canonical state from pins and prove it can degrade to golf, not the reverse.

**Q3 — Non-negotiable cart/discount contracts.** These property names are consumed downstream and **cannot be renamed** without coordinated changes:
- `_bundle_collection` — used by cart grouping + `clearExistingBundleFromCart` (replace/restore keying) and edit-link routing in `cl-bundle-cart.liquid`.
- `_bundle_item: 'true'` — marks a line as bundle-owned (restore + grouping filter).
- `_bundle_id`, `_bundle_size`, `_bundle_max` — cart-validation / checkout gating.
- `_builder`, `Pack`, `_bundle_name` — display + pack identity.
- `_bundle_free_gift`, `_bundle_free_gift_min`, `_bundle_free_gift_label` — $0 gift lines.
- **Visible personalization props** spread verbatim (`Custom Text`, `Custom Text Two`, `Month`, `Year`) — **locked to the Zepto app's field labels**; these are a contract with the Product Personalizer app, not free-form.
- **Discount dependency:** the CityLocs buy-more-save-more discount is the tag-based custom app and **computes on individual cart lines**. Do **not** collapse/merge bundle lines (e.g. `linesMerge` cart-transform) without first proving the discount still applies post-transform — this was analyzed and deliberately deferred ("leave them alone, they work fine").

**Q4 — `selectionId` distinct from `variantId`?** **Strongly agree, and it's already the case.** Pins uses `makeItemKey(variantId, personalization)` (a hash of variant + personalization values) as the Map key, precisely so two copies of the same SKU with different text stay separate lines. Adopt this as the canonical `selectionId`. Grouping by bare `variantId` (as golf/cl-bundle-builder does) is the thing to fix, not preserve.

**Q5 — First pilot: reuse Hypro markup or new DOM contract behind an adapter?** Introduce the **new DOM contract immediately, behind a compatibility adapter** — but only because Hypro is low-risk. Reusing old markup forward-ports the old contract's debt. Hypro has no preview and clean blocks, so it's the safe place to debut the real `data-cl-*` contract.

**Q6 — Packaging large preview config for on-demand load.** Split `CL_PLATE_CFG` out of the engine into its own asset (e.g. `assets/cl-plate-config.json` or a `cl-plate-preview.js` adapter) loaded **only when `preview != none`**. Keep the preview renderer as a pluggable adapter (`image_overlay`) so builders with `preview = none` (Hypro, golf) never pay for it. Long-term, rehost the Zepto CDN images to drop that external dependency (already flagged, deferred).

**Q7 — Can all GemPages-embedded code move to assets/snippets?** **Yes for the JS engine; no for the config emission.** The engine `<script>` body can move wholesale to an asset **iff** it contains no Liquid interpolation (this was the exact feasibility gate I was checking when we stopped — it needs confirming per section, but pins routes config through `window.CL_BUILDER_CONFIG`, so it looks clean). The **config block must stay Liquid** in a `{% render 'cl-...' block:'config' %}` snippet because it reads collection metafields. This matches the proposed block model exactly. Editor flexibility is preserved because GemPages still owns page composition and the `{% render %}` block placement.

**Q8 — Rollback/parity approach for golf.** Golf last (agree). Before touching it: (a) `git tag` + a `.cl-backups/` copy of the live section (the established pattern), (b) a scripted **canary diff** — `curl` the live builder collection and grep for a function that only exists in the new engine — run after every push and after any theme publish, (c) full reward/gift/inventory boundary tests from the matrix on a DEV theme first. Golf's free-gift + inventory coupling means parity tests must include gift lock/unlock/removal *and* sold-out-at-each-milestone.

---

## 3. Non-negotiable contracts to lock before any code

1. **Cart property envelope** = the exact names in Q3. Frozen. Any change is a coordinated migration with the discount app + cart snippets + validation function.
2. **`selectionId` = hash(variantId + normalized personalization)**, never bare variantId.
3. **Personalization field labels** = Zepto labels (`Custom Text`, `Custom Text Two`, `Month`, `Year`). Contract with the Personalizer app.
4. **GemPages containment** must neutralize `* { max-width:100% !important }` within the builder root, and fit-measurement forces `max-width:none` inline.
5. **Config stays Liquid; engine goes to a uniquely-named asset** (not `cl-pack-builder.js`).
6. **No line merging** without a proven discount-survival spike.

---

## 4. Recommended pilot + migration order

Endorse the proposal's order with one change: **do the shared-utility extraction (step 3) against `cl-bundle-builder.js` since it already exists**, rather than greenfield. Then:

1. Lock §3 contracts (this doc + Codex sign-off).
2. Confirm engine-JS-has-no-Liquid per section (the feasibility gate).
3. Extract shared utils into the renamed engine; no UI change.
4. Pilot on **Hypro** (new DOM contract, adapter).
5. **Pins** (validates `per_item` + `image_overlay` preview adapter + inline perso). ← highest learning, do before wallets.
6. Wallets.
7. Golf last (rewards/gifts/inventory).
8. Remove old engines only after parity tests + rollback copies.

---

## 5. Suggested ownership split (avoid simultaneous edits)

The hard rule: **never two agents editing the same file (asset or `gp-section`) in the same window.** Split by subsystem, not by task:

- **Codex** — engine scaffolding + shared state/events/cart/restore core (`cl-pack-engine.js`), the `config`/`grid`/`summary`/`mobile_bar` block snippets, Hypro pilot, golf migration, `cl-bundle-cart.liquid` cart-presentation contract.
- **Claude** — the **personalization + preview adapter layer** (`none`/`shared`/`per_item`, field-definition schema, `image_overlay` + `CL_PLATE_CFG` split/lazy-load), the pins migration + parity validation, and maintaining the cart/discount contract documentation (I hold the deepest context on the perso/preview/Zepto subsystem and the discount property dependencies).
- **Shared, sequential only:** the canonical-state object and the cart-envelope schema — draft jointly, one owner commits, the other reviews. Never edited concurrently.
- **Coordination:** every edit = live pull → narrow push → re-pull verify (the theme changes out of band). Announce which `gp-section`/asset you're holding before editing.

---

## 6. Bottom line

The model is right. Three things would sink it if not fixed first: the **`cl-pack-builder.js` name collision**, treating the **cart-property/discount envelope as renamable**, and **eager preview loading**. Lock §3, rename the engine, keep bundle lines separate, and this is a clean win. And ship the extraction soon — today's outage is the running cost of not having it.
