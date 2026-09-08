# Pack Builder Adapters — WIP (NOT DEPLOYED)

Draft, unit-tested + browser-tested adapters built against the finalized
`CL_BUILDER_CONFIG_SCHEMA.md` (Claude's lane in the Codex/Claude consolidation).

**These are inert. This folder is NOT a Shopify theme directory, so `shopify theme
push` will not deploy it. Do not move these into `assets/` until the §13 rollout
gate is cleared (Diane's merchant/release approval + Hypro dev-theme pilot).**

- `cl-pack-perso.js`  — personalization adapter (none/shared/per_item), field
  resolution (per_product canonical + explicit w/ eligibility), config overrides,
  per-field transform, accordion + second-line wiring, selectionKey (= production
  makeItemKey, variantId stringified per §4). `window.CLPackPerso.create(config)`.
- `cl-plate-preview.js` — image_overlay preview adapter, lazy config fetch,
  faithful port of renderPlatePreview/fitPlateText/measurePlateText from
  cl-pack-grid.js. `window.CLPackPreview.create(config)`.
- `cl-plate-config.json` — 172-product CL_PLATE_CFG split out of cl-pack-grid.js
  (84 pins + 88 hats). NOTE: still missing the runtime-added blackout/engraved/
  bundle-generic entries — capture those during the real pins migration.
- `harness.html` — local test harness (serve the folder, open harness.html).

Tested: field wiring, uppercase transform, char counters, accordion open/close,
second-line reveal/hide (removes Custom Text Two from values AND selectionKey),
reset() collapse, numeric==string variantId key parity, explicit-mode eligibility.

## Boonie hats preview config (added 2026-09-03)

Added 5 handle-keyed entries to `cl-plate-config.json` (total now 177):
`boonie-hat-wreckage / -dark-forrest / -sugar-skull / -tropical / -palm-camo`.

- **Personalization = single `Custom Text` free-text field** (verified on the live product page) → reuses `cl-pack-perso.js` unchanged (`per_item`, `fieldsMode: explicit`, one field). Boonie is uniform → explicit collection field list, no per-product backfill.
- **Canvas width = 800** (base images are 800x600, same as plates) → **NO per-config canvas-width generalization needed** (`PLATE_CANVAS_W=800` holds).
- **Shared geometry** across all 5 (same physical patch position): `Custom Text {cx:50, cy:31, w:70, size:150, color:#ffffff, font:Clocs-license-plate.ttf}`. Text centers in the patch; white reads on every patch (tropical black-center + the busy dark full-coverage ones like wreckage/sugar-skull). Tuned visually against the local base image.

**Open QA items (do at builder-assembly, not now):**
1. **Font assumption** — used `Clocs-license-plate.ttf` (CityLocs plate font, already loaded) as a brand-consistent default; the boonie Zepto config did NOT expose a font (no `cstmfy_meta`). Compare against the live boonie preview once the builder page exists; swap if Zepto uses a different face.
2. Final visual QA of cy/size once rendered on the real CDN image at true grid size (the local-image tune confirmed centering; CDN images are blocked from localhost so couldn't render in-adapter here).

## Emoji validation (no_emoji) added 2026-09-03 — standalone, UNWIRED

Per Codex's approved policy: **block submission + one inline field error, preserve what the customer typed**, applied per production personalization field.

- Config: a field's `transform` accepts a **string or array**; include `"no_emoji"` to enable (production fields: `transform: ["uppercase","no_emoji"]`). `no_emoji` is a **validator** (never mutates the value) — distinct from mutating transforms like `uppercase`.
- Detection: **Unicode-property based, no hand-maintained range list** — `\p{Extended_Pictographic}` + regional-indicator flags (`\u{1F1E6}-\u{1F1FF}`) + keycap combiner (`⃣`), `u` flag (broad browser support; avoided the `v`-flag/`RGI_Emoji` which is newer). Detects grinning/skin-tone/ZWJ/flags/keycaps/VS16-hearts.
- Exemptions: `© ® ™` (Extended_Pictographic but legitimate text) are allowed.
- Behavior: emoji present → field invalid (`errors[{label,code:'emoji',message}]`), value KEPT (uppercase still applies but nothing is stripped); live inline notice while typing; `promptMissing()` focuses the errored field and shows its one message; `read()`/`valid` reflect it.
- Tested: 18 cases (detection, block-not-strip, uppercase+no_emoji composition, ©®™/accents/whitespace allowed, read() errors, selectionKey preserves value) + 5 regression — all pass.

**Open for Codex to confirm:** (a) the `transform: ["uppercase","no_emoji"]` config shape; (b) the ©®™ exemption; (c) Extended_Pictographic breadth (blocks a lone pictograph even without VS16 — the safe direction for a block policy). Message copy is placeholder ("Emojis aren't allowed in <field>.").

### Allowed-symbols guarantee (confirmed 2026-09-03, Diane)
`no_emoji` ALLOWS these (verified): `-` hyphen, `•` bullet, `*` asterisk, `@` at, `#` hash — individually, combined, and in names (O-BRIEN). It only BLOCKS emoji keycap forms (`*⃣` `#⃣` `1⃣`) and true emoji (😀). `*`/`#` are keycap *bases* but plain ASCII alone; they only trip the filter with the enclosing-keycap combiner `⃣`.

Also confirmed allowed (2026-09-03): `&` `/` `+` `"` and all accented Latin letters (é ñ ü ç Ø É …). Realistic mixes like `JOSÉ & CAFÉ +1 "BEST"` pass; emoji still blocked.

### All-caps everywhere (Diane, 2026-09-03)
Fields with the `uppercase` mutation (the default) are caps end-to-end: stored value is uppercased (→ cart/checkout/order/preview all caps), AND the adapter sets `text-transform:uppercase` on the input box so it displays caps too — via CSS (no caret-jump; we never rewrite input.value per keystroke). Accents survive (é→É). Production personalized fields must keep `uppercase` in their `transform` (e.g. `["uppercase","no_emoji"]`).

## Enamel-pin migration handoff (2026-09-03)

- **`cl-pins-preview-entries.json`** — clean handoff: the **84 enamel-pin** preview-config entries only (extracted from `cl-plate-config.json`), for Codex to merge into the generic preview config during the pin dev-theme cutover. All validated (img + `Custom Text` {cx,cy,w,size,color,font}); **none use `vc`** (pins are flat plate art, top-anchored — only boonie patches use vertical-centering). Same geometry the current live pin previews use, so preview parity is preserved. **Do not wire/deploy independently — Codex integrates during cutover; the current live pin builder stays until full parity passes.**

## Adapter canonical status (2026-09-03)
- **CANONICAL = the deployed `assets/cl-pack-perso.js` on the theme** (Codex's integrated version). Per the reconciliation, it's functionally equivalent to the WIP and better in two spots (createDraft/hydrate for the reused modal; reset() toggle guard).
- **`_pack-builder-adapters-wip/cl-pack-perso.js` is REFERENCE-ONLY** — do not push it over the deployed file. Kept for diff/history. Same for `cl-plate-preview.js` (deployed canonical = `cl-pack-preview.js`).
