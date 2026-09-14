# Pack Builder Live Audit — 2026-09-11

## Executive status

- **GemPages routing is correct:** Boonie and WF retain their intended GemPages templates.
- **Live builder structure is present:** cookie-free output contains exactly one config, one summary, and the expected 5 Boonie / 10 WF cards.
- **No net production change remains:** a duplicate config added during diagnosis was detected before interaction testing and removed; both GemPages files were restored to their original live content.
- The local working tree contains pre-existing work and was preserved.

## Public URL checks

| Collection | Clean URL | Explicit builder view |
| --- | --- | --- |
| Custom Boonie Hats | Assigned to `gp-template-635890669071631209` | One config, 5 cards, and one summary in published-theme output |
| WF Signature Sunglasses | Assigned to `gp-template-635873998038631078` | One config, 10 cards, and one summary in published-theme output |

The pack builder is intentionally embedded in GemPages custom-code blocks. Do not replace these assignments with the standalone pilot templates.

## Functional checks

### Boonie

- Builder reports ready.
- Five selectable cards render.
- Per-item personalization and image-overlay preview initialize.
- Preview contains five configured text fields.
- Fixed total is `$59.99` with the keychain gift at three paid hats.

### WF sunglasses

- Builder reports ready.
- Ten selectable cards render.
- Selecting three items in the browser reconstructs a valid 3/3 state.
- Checkout CTA becomes enabled with `$49.99`.
- The unlocked bundle/free-gift message and one unlocked gift render.
- The cart and checkout were not submitted or mutated during the audit.
- The original full selection test occurred in a retained development-theme preview context.
- The published theme renders the complete WF GemPages frontend and pack-builder controls when addressed explicitly as theme `153643909208`.
- Automated clicking through the browser-control layer did not change selection state, so add/remove interaction still needs one manual real-device confirmation before declaring the live flow fully clean.

## Source drift (live vs development)

Live is intentionally/accidentally behind the development source in several coordinated files. Do **not** copy the development files wholesale to live.

- `cl-pack-engine.js`: live lacks the newer tiered-pricing, modal-editing, and Phase 1 mixed-slot logic.
- `cl-pack-perso.js`: live lacks the reused-modal variant-context update (`setContext` / current variant handling). The current live pilot uses inline personalization, so this is not the routing failure.
- `cl-hypro-bundle.css`: live lacks newer catalog, modal, and dot-progress rules.
- `cl-hypro-bundle.liquid`: live is the older fixed-total/inline implementation and lacks coordinated catalog, tiered, pagination, modal, and availability features.
- `cl-pack-preview.js`: matches across the audited copies.

The engine, stylesheet, snippet, and adapters must be reconciled as a tested release unit—not file-by-file on production.

## Global console findings

- `fetchDiscounts.js` calls `response.json()` unconditionally. The app-proxy response can be empty or non-JSON, causing `Unexpected end of JSON input` on ordinary collections and builder views. Harden with response-status/content validation and a safe fallback after confirming its consumers.
- Empire quick-buy logs invalid/empty JSON warnings on product-card data.
- An app/theme script calls `MutationObserver.observe()` with a non-Node target on some loads.
- AMP pre-purchase logs a missing-target warning.

These errors are noisy and worth isolating, but the tested WF selection flow still completed successfully. They should not be mixed into the collection-template routing change.

## Safe production order

1. Keep the existing GemPages template assignments.
2. Manually verify add/remove selection once on each clean URL; then test personalization, mini gallery/lightbox, summary, gift unlock, and add-to-cart with a controlled test cart.
3. Harden `fetchDiscounts.js` separately and verify all call sites.
4. Isolate the `MutationObserver.observe()` caller and Empire quick-buy empty-JSON warnings.
5. Prepare a coordinated live-source reconciliation from the known-good development baseline, with regression tests for existing fixed and tiered builders before deployment.

## Decisions preserved

- Existing no-slot builders must bypass all `selection.slots` paths.
- Slot capacity counts units, not distinct selection keys.
- Products matching no configured slot are non-selectable, not an initialization failure.
- Products matching multiple slots are a configuration error.
- When slots exist, their summed quantities are authoritative; `selection.maximum`, if present, must match.
