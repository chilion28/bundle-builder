# Getting Started: Boonie Hats + Sunglasses Pack Builders

Date: 2026-09-03 · For Diane (cc Codex)

Two new builders requested:
- **Boonie Hats** (`/collections/boonie-hats-bundle`) — customizable **with preview** (like enamel pins).
- **Sunglasses** (`/collections/wf-signature-sunglasses-bundle`) — **no customization**.

Current state (verified live): **neither collection has a builder yet** — both are plain collection pages (no `cl-pack-grid`, no engine section, no `CL_BUILDER_CONFIG`). We're building both from scratch. Members are the 6 `boonie-hat-*` products and the `wf-*-sunglasses` products.

---

## The one strategic decision first: which engine?

The unified `cl-pack-engine.js` (Codex's consolidation) is **designed and approved but not shipped yet** — Codex is mid-pilot on Hypro. So there are two paths:

### Path A — build on the unified engine (recommended)
Fold these into the consolidation rollout instead of adding two more builders to the old, revert-prone system:
- **Sunglasses is the ideal *next* unified pilot after Hypro** — it's non-personalized and simple (`personalization: none`, `preview: none`), so it exercises the core engine + catalog with zero perso/preview risk.
- **Boonie Hats follows the pins migration** — same `per_item` + `image_overlay` path we already built and tested. Its preview config is pulled the same way as pins.

Why recommended: building new builders on the *old* gp-section engine means they inherit the exact fragility we're consolidating away (theme-rollback / GemPages-republish reverts — the thing that broke pins this morning). Two new old-engine builders = two more things to migrate + two more revert risks.

### Path B — build now on the current live system (if you need them live before the consolidation ships)
The current engine is already type-agnostic (see the `pack-builder-new-product-types` note), so this works today. Steps are in §3–§5 below. **If you go this way, use the standardized `builder_*` metafield names Codex finalized** so migration to the unified engine is near-trivial later.

**→ The deciding question is timing: do these need to be live before Codex's unified engine ships, or can they ride the rollout?** Tell me and I'll drive the matching path.

---

## Mapping (either path)

| Collection | Personalization | Preview | Current-engine analog | Unified config |
|---|---|---|---|---|
| Sunglasses | none | none | golf engine `gp-section-623576563790643742` | `personalization.mode:none`, `preview.mode:none` |
| Boonie Hats | per_item (text) | image_overlay | pins/hats engine `gp-section-626317142307963757` | `personalization.mode:per_item`, `fieldsMode:explicit` if uniform, `preview.mode:image_overlay` |

---

## 3. Setup steps common to BOTH builders

1. **GemPages collection page** — add the builder blocks to the collection's page: the product **grid** (`cl-pack-grid`), the **engine** section, and the **summary**. Fastest is to duplicate an existing working builder page (golf for sunglasses; pins for boonie) and repoint it at the new collection. *(GemPages editor — your side; I can hand you the exact block source to paste.)*
2. **Collection metafields** (`custom.*`) — this is what drives the builder copy/behavior:
   - `builder_title`, `builder_item_singular`, `builder_item_plural`, `builder_add_button_text`
   - `builder_milestones` (the pack sizes / discount ladder), `builder_milestone_style` (`slots`)
   - `builder_personalization_mode` (`none` for sunglasses, `per_item` for boonie)
   - Gifts (if any): `gift_tiers` / `builder_free_gift_variants` / `builder_free_gift_label` / `builder_free_gift_pack_size` / `builder_free_gift_discount_code`
3. **Discount tags** on the products — the buy-more-save-more tiers come from product tags via the CityLocs discount app, not from the builder. Tag the new products to match the intended tier ladder.

## 4. Boonie Hats — the extra work (preview + personalization)

1. **Pull each boonie hat's Zepto preview config** (confirmed available — e.g. `Palm-Tree-Boonie-Hat-Patch-Preview.jpg`). Same process as pins/plates: for each product, hit
   `cdn-zeptoapps.com/product-personalizer/canvas-script.php?shop=citylocs.myshopify.com&prid=<PRODUCT_ID>` → parse `cstmfy_meta_*` → `{img, f:{<Field>:{cx,cy,w,size,color,font}}}` → add to the preview config keyed by product handle. (In the unified engine this lands in `cl-plate-config.json`; on the current system it's `CL_PLATE_CFG` in `cl-pack-grid.js`.) **This is a task I can do.**
2. **Field type — CONFIRMED plain text (2026-09-03).** The live boonie personalizer is a single `Custom Text` free-text field (verified on the product page — no selects/upload; the `Choose Letter`/dropdown stuff in the Zepto payload is generic boilerplate, identical on non-personalized sunglasses). So it's a drop-in for the text personalization adapter, exactly like pins. See `PACK_BUILDER_BOONIE_SUNGLASSES_ADAPTER_REVIEW.md`.
3. **Personalization fields** — if the 6 boonie hats are uniform, use `fieldsMode: explicit` with one collection-level field list (no per-product backfill), exactly as recommended for pins.

## 5. Sunglasses — the simple one

- `personalization: none`, `preview: none`. No Zepto work, no field config.
- Just the grid + summary + milestones + gift (if any) + discount tags.
- This is why it's the ideal early unified-engine pilot: it proves the core + catalog with none of the perso/preview surface.

## 6. Deploy (either path)

- Live theme is **`153643909208`** (Empire 13). Asset/section pushes: `shopify theme push --store citylocs --theme 153643909208 --allow-live --only <path> --nodelete`.
- GemPages page composition is done in the GemPages editor (your side).
- Pilot/dev theme for testing first: **`153606324312`** (Dev 8-10-2026).

---

## What I need from you

1. **Timing** — live before the unified engine ships (Path B), or ride the consolidation (Path A)? This picks the path.
2. **Boonie customization type** — is it custom **text** (like pins) or a **patch/graphic swap**? I can confirm from the Zepto config, but your intent decides scope.
3. Then I can: pull the boonie Zepto preview configs, draft the metafield values, and hand you the exact GemPages block source — while looping Codex in so (on Path A) sunglasses/boonie slot into the rollout.
