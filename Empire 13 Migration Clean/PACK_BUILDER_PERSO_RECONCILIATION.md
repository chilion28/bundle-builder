# Personalization-Adapter Reconciliation — for the Enamel-Pin Migration

From: Claude · Date: 2026-09-03 · For Codex (cc Diane)
Compared: deployed **dev** `assets/cl-pack-perso.js` (theme 153606324312, 347 lines) vs my WIP `_pack-builder-adapters-wip/cl-pack-perso.js` (378 lines).

## Verdict: converged — adopt the DEPLOYED dev adapter as canonical.

The two implementations are **functionally equivalent** and clearly grew from the same design. Both have, with matching behavior:
- Emoji block — **identical** regex `/[\u{1F1E6}-\u{1F1FF}\u{20E3}]|\p{Extended_Pictographic}/u`, ©®™ exempt, block-not-strip, one inline error (emoji or required).
- Uppercase: value mutated on input **and** `input.style.textTransform='uppercase'` (all-caps everywhere, no caret-jump).
- `fieldsMode` (`per_product`/`explicit` + eligibility), second-line reveal, accordion toggle, `createDraft`, `validate()` returning `errors[]`, `promptMissing()` (single message).

**No behavioral merge is needed for pins.** The deployed dev file already does everything the pin migration requires. Use it as source of truth; I'll retire my WIP `cl-pack-perso.js` to reference-only to prevent divergence.

## The only real deltas (and my calls)

1. **Edit hydration — keep DEV's `controller.hydrate()` pattern (it's better for pins).**
   - DEV: `createDraft(hostEl, ctx, initialValues)` reuses `hostEl.__clPerso` (attaches once if absent) then calls `controller.hydrate(initialValues)`.
   - WIP: `createDraft` re-`attach`es a fresh controller each call, seeding at attach time.
   - **Pins uses MODAL edit** with one reused modal host — DEV's attach-once-then-`hydrate`-per-edit avoids re-wiring listeners on the modal every edit (my fresh-attach would leak listeners). **Adopt DEV's approach.**

2. **`reset()` accordion guard — keep DEV's.** DEV collapses the perso block only when a toggle exists (`if (persoBlock && persoToggle)`); mine always hides it. DEV's is correct for always-visible builders (Hypro has no toggle) — mine would wrongly hide the fields on reset. **Adopt DEV's.**

3. **`selectionKey()` on the controller — one small add worth lifting from WIP (optional).** My controller exposes `selectionKey()` (the draft's current key) for the engine to read directly; DEV's doesn't. Only add it if the engine wants the convenience — otherwise the engine computes it via `adapter.selectionKey(ctx.variantId, read(host).values)`, which DEV already supports. Your call; not required.

Everything else that differs is comments/naming (`transforms[]`+`applyTransforms` vs `parseTransform`→`{mutations,noEmoji}`+`applyMutations`) — same result, no action.

## Remaining task for the pin migration (data, my lane)

The adapter is ready; the **preview config** is the piece to reconcile. The deployed preview config (the JSON your `cl-pack-preview.js` fetches via `configUrl`) currently serves boonie (verified rendering). For pins it must also contain the **84 enamel-pin entries** (+ the plate-hat entries if that collection migrates). My `_pack-builder-adapters-wip/cl-plate-config.json` holds all 172 (84 pins + 88 hats + 5 boonie) — I'll hand you the pin entries to merge into the deployed config asset when we start the pin cutover. (Still-open: it lacks the runtime blackout/engraved/bundle-generic plate variants — I'll capture those in the same pass if the plate-hats collection migrates.)

## Pins config reminders (from the earlier metafield audit)

- `personalization.mode: per_item`, **`fieldsMode: explicit`** with one `Custom Text` field (pins are uniform — no per-product `personalization_fields` backfill needed).
- `transform: ["uppercase","no_emoji"]` on the field (uppercase = all-caps; no_emoji = block).
- `preview.mode: image_overlay`, `configUrl` → the config asset with pin entries. Pins use **modal** presentation (large catalog) vs boonie's inline.
- Gifts: pins consume `gift_tiers` / `builder_free_gift_*` (the free Lanyard) via your unified tiered-gift support.

## Bottom line
Deployed dev `cl-pack-perso.js` = canonical, pin-ready. No code merge required (optionally lift `selectionKey()` onto the controller). The pin migration's real work is (a) adding the 84 pin entries to the deployed preview config, and (b) the pins collection's `builder_*` config + `explicit` field. Ready to start the pin cutover whenever you are.
