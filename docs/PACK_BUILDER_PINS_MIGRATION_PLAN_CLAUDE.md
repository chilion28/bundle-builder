# Enamel Pins — Editor Migration Plan & Parity Checklist (Claude)

**Author:** Claude · **Date:** 2026-09-16 · **Status:** Plan, no live changes.
**Greenlit by:** Codex (Hypro complete + checkout-verified at 3 pairs / $99). Pins is Claude's lane.
**Hard constraints (Codex):** do **not** change live Pins behavior until parity testing passes; all work on **dev theme `153606324312`** first.

## Prerequisites — status
- **AC4 (perso adapter) ✅ DONE.** Live `assets/cl-pack-perso.js` now carries the emoji-block + all-caps validators **and** `createDraft` (edit-draft). Confirmed in-file (EMOJI/`hasEmoji`/`uppercase`/`no_emoji` at ~L39–209; `createDraft` present). No merge needed.
- **AC6 (preview coverage) — groundwork ready.** `_pack-builder-adapters-wip/cl-pins-preview-entries.json` holds **168 pin preview entries** (per-state enamel-pin handles). Remaining: integrate into the on-theme preview config that Codex's `assets/cl-pack-preview.js` fetches via `configUrl`, and **verify coverage == the live pins collection** (no missing handle → no blank preview). Per AC6, the editor must refuse "complete" if any referenced preview handle doesn't resolve.

## Parity baseline (capture from the live Pins section FIRST — step 1)
Codex named four things to preserve; make each a concrete verification item:
1. **Tier prices** — capture the exact live tier/quantity → price table (buy-more-save). Backend pricing authority = the tag-based Vue discount app (frontend mirrors). Migration must reproduce the same tiers.
2. **Per-item personalization** — pins are uniform **`{Custom Text}`** (no Month/Year, no 2nd line). Use `fieldsMode: explicit` with a collection-level field list (NO per-product backfill). Store-wide policy applies: `["uppercase","no_emoji"]`.
3. **Lazy previews** — `image_overlay` via the shared preview adapter, lazy config fetch (nothing fetched when a card isn't shown). Preserve the current lazy behavior; don't eagerly load 168 configs.
4. **CL_PLATE_CFG coverage** — the 168 pin entries above; verify 1:1 against the live collection's products.

Also carry the extra metafields the pins builder consumes (from the earlier metafield plan): the **free Lanyard** gift (`gift_tiers` / `builder_free_gift_*`), `custom_hero_text`, and the NEW `builder_preview_mode` (none|image_overlay).

## Open dependency (blocks eligibility encoding only)
- **R-A — product IDs vs handles for eligibility.** My Phase-1 review recommended keying eligibility on **stable product IDs**, not handles. **Pins makes this urgent:** it's a large (~168), frequently renamed/added collection — a handle-keyed eligibility list would silently drop renamed pins. **Confirm with Codex whether the editor now keys eligibility on product IDs before I encode the pins eligibility set.** (The perso/preview/adapter parity work below does NOT depend on this and can proceed in parallel.)

## Migration steps (all on dev `153606324312`)
1. **Capture parity baseline** from the live pins section (tier table, perso field list, preview mode, gift/Lanyard, hero) → freeze as the parity checklist.
2. **Integrate pins preview entries** into the on-theme preview config (`cl-pack-preview.js` `configUrl` asset); verify 168/168 handles resolve.
3. **Author the pins offer** in the central editor on dev (tiers, eligibility [pending R-A], gift, copy) — Codex's editor, my config inputs.
4. **Wire adapters:** perso (`CLPackPerso.create({mode:'per_item', fieldsMode:'explicit', fields:[Custom Text]})`) + preview (`image_overlay`, lazy).
5. **Parity test matrix** vs live (below). Nothing on live until this passes.
6. **Diane approves** the dev pilot.
7. **Live rollout** (coordinated; live pins code untouched until then).

## Parity test matrix (must pass before live)
- Every tier price matches live at each quantity (incl. the top tier and any partial/under-min behavior).
- Free Lanyard gift unlocks at the same threshold; not double-granted (F3 if any simple+tier overlap).
- Each of the 168 pins renders its correct preview (spot-check + a coverage assertion); lazy — configs not fetched until a card shows.
- Personalization: `{Custom Text}` captured per item, all-caps + emoji-blocked, edit/remove via `createDraft` re-keys correctly.
- Cart parity: `_bundle_id` scoping, edit link, clear/restore behavior matches live.
- Security: forged `_bundle_*` / ineligible product cannot join the bundle or trigger tier/gift (server-authoritative eligibility — ties to R-A).

## Ownership (rule 0)
Claude: perso adapter, preview adapter, `CL_PLATE_CFG`/pins preview config, pins offer inputs, this parity test. Codex: engine, central editor, backend eligibility/pricing registry. No shared files.
