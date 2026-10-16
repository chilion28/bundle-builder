# Image Customizer — Product Onboarding Guide

How to add a new product to the "upload your image" customizer (AI-hat / image-hat /
license-plate / any print-on-product builder). Written so you can come back cold after
working on other projects and not have to re-derive anything.

Last updated: 2026-10-14.

---

## 1. The two product types (READ THIS FIRST)

The engine draws two things: the customer's **artwork** and the product **frame image**.
The only question when onboarding is which one sits on top. That is the whole mental model.

| Product type | Frame PNG looks like | `frame_behind` | Layer order |
|---|---|---|---|
| **Patch** (rectangle, circle, hexagon, pendant…) | a border with a **transparent window** cut out of the middle | `false` / omit | frame **on top**, art shows through the window |
| **Solid product** (license plate, wallet, phone case…) | a **solid opaque surface**, no see-through hole | `true` | frame **behind**, art printed **on** the face |

Deciding question: **"Does the frame image have a transparent hole where the art goes, or
is it a solid surface the art sits on?"**
- Transparent hole → `frame_behind: false` (or just leave it out).
- Solid surface → `frame_behind: true`.

If you forget `frame_behind: true` on a solid product, the opaque product gets drawn on top
and **hides the artwork**. That was the original plate bug.

---

## 2. The two things that control a solid product

For a solid product (`frame_behind: true`) there are TWO separate controls — don't confuse them:

- **`frame_behind`** = which layer is on top (whole-product level).
- **mask image** = which *pixels* of the face are printable (fine detail).

The mask is an **alpha** (transparency) image, NOT a black/white picture:
- **Opaque pixels → printable** (the flat face).
- **Transparent pixels → NOT printed** (screw holes, and everything outside the product).

A black-and-white PNG that is fully opaque does nothing — the engine reads the alpha
channel, not the color. (This is the mistake we hit: a black face / white screws image is
the right *shape* but the wrong *channel*.)

So a correct plate mask = **opaque face + transparent screw holes + transparent outside.**

---

## 3. Where everything lives

| Piece | Location |
|---|---|
| Engine (all the logic) | `assets/cl-ai-hat.js` |
| Styles | `assets/cl-ai-hat.css` |
| Legacy all-in-one block | `snippets/cl-ai-hat-builder.liquid` |
| Split blocks (GemPages-placeable) | `snippets/cl-customizer-*.liquid` (bootstrap + prompt/upload/preview/style/colors/cta) |
| Per-product config | product metafield **`custom.customizer_config`** → a **Customizer Config** metaobject |
| Geometry + mask generator | https://citylocs-dashboard.vercel.app/geometry.html |

The bootstrap snippet reads `product.metafields.custom.customizer_config.value` and emits a
`[data-cl-ai-config]` JSON blob the engine parses. The engine **slugs** every shape key
(lowercase, strip non-alphanumerics), so `Mini LP`, `minilp`, and `mini lp` all resolve to
`minilp`. The shape key in the config must match the product's shape option the same way.

---

## 4. Onboarding a new product — step by step

### A. Get the frame image
A clean PNG of the product on a transparent background.
- Patch: the border with a transparent window.
- Solid product: the whole product (opaque face is fine).

Upload it to Shopify **Files**. Copy its URL.

### B. Generate geometry + mask (the generator does the math)
Open **https://citylocs-dashboard.vercel.app/geometry.html** and drop the frame PNG in.

- **Shape name** = the engine key (e.g. `Mini LP`).
- **Safe area** sliders = how far in the dashed "keep important stuff inside" guide sits.
- **Patch width/height (in)** = real finished size (drives print DPI).
- If the frame has a transparent window, the box + mask are auto-detected.
- If it's a **solid product**: drag the box over the printable face, set **Corner radius**
  to match, and **tick "Frame behind the artwork."**
- **Screw holes / cut-outs**: click **+ Add hole** for each screw, drag each red circle
  onto a screw, set **R** to size them. These get punched transparent in the mask.
- **Download mask PNG** → upload it to Shopify Files.
- Copy the **Advanced `shapes_json`** (or the individual values).

### C. Fill the Customizer Config metaobject
On the product's **Customizer Config** metaobject entry:
- **Frame image** = the frame PNG.
- **Mask image** = the mask PNG from the generator.
- **Shapes JSON (advanced)** = paste the generator's JSON. It looks like:
  ```json
  {
    "shapes": {
      "minilp": {
        "window": { "l": 0.0476, "t": 0.0905, "w": 0.9067, "h": 0.8314 },
        "frame_aspect": 1.7595,
        "safe": { "w": 0.84, "h": 0.995 },
        "patch_in": { "w": 1.4, "h": 2.49 },
        "usable": 0.9, "text_y": 0.9, "text_maxw": 0.84,
        "frame_behind": true
      }
    }
  }
  ```
  (`frame_behind` only appears for solid products.)
- Set the text/label fields (titles, CTA label, show variants/prompt) as needed.
- Make sure the metaobject's **References** section links the product.

### D. Verify
Hard-refresh the product (CDN serves old JS/CSS for a few minutes).
- Upload a test image.
- Editor ("Position your artwork"): art sits on the product, handles work, screw holes show.
- "YOUR PATCH" preview: same.
- Add to cart: the print file has the art masked correctly.

---

## 5. Deploying engine/CSS changes (only if you touch cl-ai-hat.js/.css)

Live theme is the source of truth, not git. **Always pull before edit.**

```bash
# pull live first (local may be stale; live carries hand-written code the repo lacks)
shopify theme pull --store citylocs --theme 153643909208 --only assets/cl-ai-hat.js --path /tmp/live

# edit the PULLED copy, then push only the file you touched
shopify theme push --store citylocs --theme 153643909208 --allow-live --nodelete \
  --path "Empire 13 Migration Clean" --only assets/cl-ai-hat.js

# re-pull to verify (CDN serves stale bytes for minutes; a re-pull is the only remote truth)
```

The generator (`geometry.html`) lives in the **citylocs-dashboard** repo and deploys via
Vercel — commit + push through GitHub Desktop.

---

## 6. Troubleshooting (symptom → cause)

| Symptom | Cause | Fix |
|---|---|---|
| Frame renders as a **stretched square** | Shapes JSON key doesn't match the product shape (slugged) | Rename the key so it slugs to the same thing (e.g. `pendant` → `minilp`) |
| **Artwork hidden behind the frame** | Solid product missing `frame_behind: true` | Add `frame_behind: true` to that shape |
| Art **prints over screw holes** | Mask has no transparent holes (or is a fully-opaque black/white image) | Regenerate the mask with the hole-puncher; it must be an alpha mask |
| Preview shows the **empty product, no art** | Same as above, or mask key ≠ product shape | Fix mask / shape key |
| Holes look **slightly off** | Hole centers need nudging | Re-place holes in the generator, re-download, re-upload |

---

## 7. Placing the customizer in GemPages (split blocks)

The customizer can be placed as 7 independent blocks so you can lay it out freely
(columns, rows, anywhere) in GemPages. In GemPages add each as a **Liquid** element
(a.k.a. "Custom Code" / "Liquid") and paste the matching render tag.

Legacy all-in-one (`cl-ai-hat-builder.liquid`) still works and is untouched — use the
split blocks only when you want custom layout.

### Two setup rules
1. **Must be a Product page.** The blocks read `product.*` (metafields, options, variants),
   so the GemPages template must have product context. On a plain page they render empty.
2. **`cl-customizer-bootstrap` goes on the page exactly once** — invisible infrastructure
   (variant data, config, the editor modal, CSS/JS). Place it anywhere (top is fine).
   Every visible block requires it on the same page.

### The blocks (place in any layout)
```liquid
{% render 'cl-customizer-bootstrap' %}   {%- comment -%} 1. once, invisible — place first {%- endcomment -%}
{% render 'cl-customizer-prompt' %}      {%- comment -%} 2. Step 1 prompt {%- endcomment -%}
{% render 'cl-customizer-upload' %}      {%- comment -%} 3. upload + quality check {%- endcomment -%}
{% render 'cl-customizer-preview' %}     {%- comment -%} 4. live "YOUR PATCH" preview {%- endcomment -%}
{% render 'cl-customizer-style' %}       {%- comment -%} 5. patch shape + hat style pills {%- endcomment -%}
{% render 'cl-customizer-colors' %}      {%- comment -%} 6. color + quantity picker {%- endcomment -%}
{% render 'cl-customizer-cta' %}         {%- comment -%} 7. add-to-cart button {%- endcomment -%}
```

### Optional params (override defaults only if needed)
```liquid
{% render 'cl-customizer-prompt', step1_title: 'DESCRIBE YOUR IDEA', prompt_text: '...', prompt_hint: '...', prompt_example: '...' %}
{% render 'cl-customizer-upload', upload_step: 2, upload_title: 'UPLOAD YOUR AI ARTWORK', upload_note: 'JPG, PNG, WEBP up to 25MB', show_prompt_tip: true, qc_step: 3, qc_title: 'PRINT QUALITY CHECK' %}
{% render 'cl-customizer-preview', preview_title: 'YOUR PATCH' %}
{% render 'cl-customizer-colors', show_variants: false %}   {%- comment -%} single-variant product → simple qty stepper instead of the color grid {%- endcomment -%}
{% render 'cl-customizer-cta', cta_label: 'ADD TO CART', price_display: '' %}
```

**Single-variant products** (one color): pass `show_variants: false` to block 6 for a −/+
quantity stepper. Multi-variant: omit it (defaults to the color + quantity grid).

### AI page variant (AI studio integration)

The AI build is kept fully ISOLATED (Option A — see
[IMAGE-CUSTOMIZER-REBUILD-SPEC.md](IMAGE-CUSTOMIZER-REBUILD-SPEC.md)): a forked engine
(`cl-ai-hat-ai.js`) so the stable `image-hat-rectangle` page is never touched. Build the
AI page in GemPages with these blocks instead of the normal ones:

```liquid
{% render 'cl-customizer-ai-bootstrap' %}
{% render 'cl-customizer-ai-entry' %}
{% render 'cl-ai-studio-mock' %}
{% render 'cl-customizer-preview' %}
{% render 'cl-customizer-style' %}
{% render 'cl-customizer-colors' %}
{% render 'cl-customizer-cta' %}
```

Rules:
- Use the **`-ai-` bootstrap**, not `cl-customizer-bootstrap` — it loads the forked engine.
  Only one bootstrap per page.
- Do NOT render `cl-customizer-upload` or `cl-customizer-prompt` separately — the entry
  renders the upload form inside its "Upload photo" tab, and the ChatGPT prompt is skipped.
- `cl-ai-studio-mock` is a DEV stand-in that fires `cl:ai-image:selected`. Omar's real
  widget mounts at `[data-cl-ai-studio-mount]` and fires the same event; remove the mock
  once it is in.
- Set the 3 product metafields: `custom.customizer_ai_enabled` (true),
  `customizer_default_view` (`upload`|`ai`), `customizer_ai_display` (`inline`|`modal`).

---

## 8. One-line summary

**`frame_behind`** picks the layer order (patch = frame on top, solid product = frame
behind). **The mask** picks which pixels are printable (face yes, screw holes no). A solid
product needs **both** set correctly. Use the geometry generator so you never hand-measure
or hand-edit a PNG.
