# Image Customizer — Unified Entry + AI Studio Build Spec

Build spec for merging the "upload your own" customizer and Omar's AI generation
studio into one flow. Companion to [IMAGE-CUSTOMIZER-ONBOARDING.md](IMAGE-CUSTOMIZER-ONBOARDING.md)
(how masks / frame_behind / geometry work). This doc is the *flow and settings*.

Last updated: 2026-10-16. Status: approved design, not yet built.

---

## 1. The problem it fixes

Today a product can show TWO separate upload forms:
- the customizer's own "upload your artwork" (the customer's finished design), and
- the AI studio's "upload a source photo" (for the AI to transform).

To a customer that reads as two confusing upload boxes. Fix: **one entry step with
two tabs**, only one visible at a time, both feeding the same downstream editor.

---

## 2. Unified Step 1 — "Add your design"

One block with two tabs. Each tab has a helper line:

| Tab | Helper line | What it is |
|-----|-------------|------------|
| **Upload photo** | "I already have my design" | the current upload form (final artwork) |
| **Create with AI** | "Make one from a photo" | Omar's studio (source + prompt + style → generate → pick) |

Whatever image results from either tab is handed to the **same** editor → quality
check → preview → options → add to cart. Only the *entry* differs; the rest is shared.

---

## 3. Per-product settings (metafields)

Not every product needs AI, and placement should be flexible, so three new product
metafields drive Step 1 (alongside the existing `custom.customizer_config`):

| Metafield | Type | Values | Effect |
|-----------|------|--------|--------|
| `custom.customizer_ai_enabled` | boolean | true / false | false → no tabs, just the upload form |
| `custom.customizer_default_view` | text | `upload` \| `ai` | which tab loads first (AI on only) |
| `custom.customizer_ai_display` | text | `inline` \| `modal` | AI studio embeds in the page, or opens in a modal |

Behavior:
- **AI disabled** → tabs hidden, product shows the plain upload form only.
- **Inline** → the "Create with AI" tab swaps the studio in, in-page.
- **Modal** → the "Create with AI" tab opens the studio in a modal (like the
  "Position your artwork" editor), result drops into the preview, modal closes.
- **Default view** sets which tab is active on load.

---

## 4. Dynamic steps (not fixed numbering)

Step chrome adapts to the product; don't hardcode "Step 1 / 2 / 3":
- **Has variants** (color/style) → show a numbered "Choose options" step (color + qty grid).
- **Simple product** (single variant) → skip it; show just a quantity stepper and let
  the flow read as one smooth form, no step numbers.

Driven by the existing `show_variants` hook on `cl-customizer-colors`.

---

## 5. Custom text — conditional on image source

The editor's "Add text" overlay is **only for the upload path**.

| Path | "Add text" option | Where text comes from |
|------|-------------------|-----------------------|
| **Upload** | shown | customer types it, our editor composites it onto the image |
| **AI** | hidden | the AI generates the text from the customer's prompt |

Boss's call (2026-10-16): on the AI path, text is part of the generation, not a manual
overlay. Marketing will publish prompt how-to videos. The bridge already tags an image
as AI-sourced; the editor reads that flag and hides the text controls.

Watch item: AI-rendered text legibility/spelling can vary by model — spot-check the
first real orders, especially the 12-inch plate (read up close).

---

## 6. Two integration points with Omar's app

Everything between is the existing customizer. Omar owns only the two ends.

### 6a. Front end — the select event
When the customer picks an AI design, Omar's app fires:
```js
document.dispatchEvent(new CustomEvent('cl:ai-image:selected', {
  bubbles: true,
  detail: {
    imageUrl:     'https://cdn.shopify.com/s/files/.../ai-design-....jpg', // full-res, CORS-safe, final (post any re-run)
    generationId: '…',
    prompt:       '…',
    styleName:    '…',
    aspectRatio:  '…'
  }
}));
```
- Fire only on the user's "use this" action, with the FINAL image (not the browse preview).
- `imageUrl` must be a stable public `cdn.shopify.com/s/files/...` URL (CORS-enabled, full-res).
- The four non-image fields become order provenance, all `_`-prefixed
  (`_AI Generation ID` / `_AI Prompt` / `_AI Style` / `_AI Aspect Ratio`) so they are
  hidden from the customer in cart/checkout but kept on the order (admin + exports).

### 6b. Back end — the 4K upscale on purchase
- Resolution need is product-size driven: small patches/mini-plates clear print at ~1K;
  the full **12-inch plate** needs ~4K at 300 DPI.
- To avoid paying 4K for window-shoppers: generate/show low-res while browsing, and only
  produce 4K for real buyers. Chosen trigger: **paid order**.
- Mechanism (Omar's approach): on a paid order, his app reads the finished `_Artwork Print`
  URL off the order line item and **upscales that exact image to 4K** (not a re-generation,
  so it stays the image the customer approved; any AI text upscales with it). Big plate only;
  small items print as-is.
- A per-session **regeneration cap** (server-side, enforced in Omar's app) protects against
  window-shoppers and bots running up generation cost.

---

## 7. The full journey

1. **Add your design** (Step 1) — Upload photo OR Create with AI. Both hand one image
   to the editor (AI via `cl:ai-image:selected`).
2. **Position and edit** (opens automatically) — place on patch, zoom, rotate, pick shape,
   add text (upload path only). Same editor for both.
3. **Quality check + preview** (automatic) — resolution / margins / file type; live preview.
4. **Choose options** (only if the product has variants) — color + quantity grid.
5. **Add to cart** — editor flattens image (+ text on upload path), saves to Cloudflare,
   writes `_Artwork Print` on the order.
6. **Upscale to 4K** (after payment, backend, big plate only) — Omar's app reads
   `_Artwork Print` and upscales for production.

---

## 8. Ownership

| Area | Owner |
|------|-------|
| Customizer UI, tabs, editor, preview, flatten + save, bridge listener, metafield reads | Claude |
| AI studio widget, generation, the select event, the 4K upscale, the regen cap | Omar |

Dashboard production queue reads `_Artwork Print` as it does today.

---

## 9. Reusing across product types

The whole system is config-driven — the same blocks/engine serve any product type
(hat, mini plate, full 12" plate, wallet, phone case, patch, …) with **zero per-product
code**. To add a product type you only touch config:

1. **Geometry + mask** — run the frame through the geometry generator and fill that
   product's `custom.customizer_config` metaobject (window, frame_aspect, safe, patch_in,
   `frame_behind`, and a mask with any cut-outs/screw holes). See the onboarding guide.
2. **Metafields** — set `customizer_ai_enabled` / `customizer_default_view` /
   `customizer_ai_display` on the product.
3. **Page** — place the same split blocks in GemPages (ai-bootstrap + ai-entry + preview/
   style/colors/cta).

The engine is shape-agnostic (fit → mask → composite). Product differences are all config:
- **`frame_behind`** → solid product (art on top) vs patch (art through a window).
- **mask** → which pixels print (punch out hardware/cut-outs).
- **variants** → color+qty grid; **simple** → qty stepper (`show_variants`).
- **Style option present** → style pills; absent → nothing.
- **multiple shapes in config** → shape picker appears automatically.

Per-type backend note: the **4K upscale is gated per product** in Omar's app (only the
12" plate needs it; small items ship as-is).

---

## 10. Status / open items (as of 2026-10-16)

- **Built + verified live (isolated, stable `image-hat-rectangle` byte-identical throughout):**
  forked engine/CSS/bootstrap, unified Step-1 tabs + 3 metafields, inline/modal, the
  `cl:ai-image:selected` bridge, AI-source hides "Add text", AI provenance written to the
  order, dynamic steps, dev mock studio. GemPages styling fixed (tokens on `:root` + `.cl-ai`
  wrappers so the existing `.gps .cl-ai` armor applies; tab styles specificity-boosted).
- **End-to-end confirmed:** real add-to-cart carries `_Artwork Print` (R2) + all four AI
  provenance props, no Custom Text. Full positioning editor available on the AI path.
- **Pending Omar (this afternoon):** his real studio widget mounts at
  `[data-cl-ai-studio-mount]` (replaces the dev mock); his tests — 4K upscale quality, the
  regeneration cap, confirming the `_Artwork Print` read on paid orders.
- **Housekeeping:** remove the leftover ChatGPT-prompt block from the GemPages page; `.cl-ai`
  wrapper not yet added to `cl-customizer-style` (renders nothing on no-style products, so
  only needed when a product uses style pills).
- **Watch:** AI text legibility on first real orders.
- **Cache note:** theme changes to inline snippet HTML are edge-cached by Shopify; a browser
  hard-refresh does not clear it — use `?cb=…` or wait a few minutes. Asset files (`.css`/`.js`)
  self-bust via `?v=`.
