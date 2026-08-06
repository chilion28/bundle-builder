# Customizer Config — metaobject + metafield setup (admin)

Goal: assign the in-house artwork editor (the AI-Hat engine, `assets/cl-ai-hat.js`)
to any product from Shopify admin — the "like Zepto" ask — without editing theme
code per product. The engine already reads per-shape geometry from a config JSON
block (`[data-cl-ai-config]`); this metaobject is what feeds that JSON.

Two pieces to create in admin (Settings → Custom data):
1. A **metaobject definition** "Customizer Config".
2. A **product metafield** that references it.

The read-only API token can't create these — they must be made in admin by Diane.
Once they exist, the theme change (my side) reads `product.metafield` → builds the
same `config_json` the pendant template now hardcodes → a generic
`product.customizer.liquid` any product can be assigned.

---

## 1. Metaobject definition: "Customizer Config"

Settings → Custom data → Metaobjects → **Add definition**.
- Name: `Customizer Config`  (type/handle becomes `customizer_config`)
- Leave "Storefront access" ON (theme needs to read it). No "publishable" URLs.

### Fields

Most CityLocs custom products are **single-shape** (e.g. the pendant), so the
common case uses the typed fields below. A `shapes_json` escape hatch covers
multi-shape products (like the 4-shape hat) later.

| Field name (admin)   | Key            | Type                       | Notes / example |
|----------------------|----------------|----------------------------|-----------------|
| Label                | `label`        | Single line text           | Admin-only name, e.g. `Image Pendant` |
| Shape name           | `shape_name`   | Single line text           | The shape key the engine uses, e.g. `Pendant` |
| File prefix          | `file_prefix`  | Single line text           | Stored-file prefix, e.g. `image-pendant` |
| Frame image          | `frame_image`  | File reference (image)     | The patch frame PNG (transparent window), e.g. `cl-patch-pendant.png` |
| Mask image           | `mask_image`   | File reference (image)     | The window mask PNG, e.g. `cl-patch-mask-pendant.png` |
| Frame aspect (w/h)   | `frame_aspect` | Decimal                    | Frame PNG width/height. Square hat frames = `1`; pendant = `0.565611` (500/884) |
| Window left          | `window_l`     | Decimal (0–1)              | Window inset from left, fraction of frame. Pendant `0.1220` |
| Window top           | `window_t`     | Decimal (0–1)              | Pendant `0.1742` |
| Window width         | `window_w`     | Decimal (0–1)              | Pendant `0.7580` |
| Window height        | `window_h`     | Decimal (0–1)              | Pendant `0.7624` |
| Safe width           | `safe_w`       | Decimal (0–1)              | Safe-area width as fraction of window. Pendant `0.950` |
| Safe height          | `safe_h`       | Decimal (0–1)              | Pendant `0.965` |
| Patch width (in)     | `patch_in_w`   | Decimal                    | Finished patch width in INCHES (drives print DPI). Pendant `1.40` *(placeholder — confirm w/ production)* |
| Patch height (in)    | `patch_in_h`   | Decimal                    | Pendant `2.49` *(placeholder)* |
| Usable fraction      | `usable`       | Decimal (0–1)              | Auto-frame fill for transparent logos. Pendant `0.90` |
| Text baseline Y      | `text_y`       | Decimal (0–1)              | Caption vertical anchor. Pendant `0.90` |
| Text max width       | `text_maxw`    | Decimal (0–1)              | Caption max width vs window. Pendant `0.84` |
| Show variants        | `show_variants`| True/false (boolean)       | `false` = single-variant product (plain qty stepper, no Style/Colour grid). Pendant `false` |
| Show prompt          | `show_prompt`  | True/false (boolean)       | `false` = upload-only (no AI-prompt step). Pendant `false` |
| Upload title         | `upload_title` | Single line text           | e.g. `UPLOAD YOUR PHOTO` |
| Upload note          | `upload_note`  | Single line text           | e.g. `JPG, PNG or WEBP up to 25MB…` |
| Quality title        | `qc_title`     | Single line text           | e.g. `PRINT QUALITY` |
| Preview title        | `preview_title`| Single line text           | e.g. `YOUR PENDANT` |
| Customize title      | `customize_title`| Single line text         | e.g. `CUSTOMIZE YOUR PENDANT` |
| CTA label            | `cta_label`    | Single line text           | e.g. `ADD TO CART` |
| Shapes JSON (advanced)| `shapes_json` | Multi-line text (or JSON)  | OPTIONAL. If set, overrides ALL typed geometry above — used for MULTI-shape configs (the hat's 4 shapes). Holds the full `{ "shapes": { … } }` object the engine consumes. Leave blank for single-shape products. |

Field-type notes:
- "Decimal" fields: set validation **Min 0** (and **Max 1** for the fraction
  fields `window_*`, `safe_*`, `usable`, `text_*`) so bad values are caught in admin.
- "File reference": restrict to **Images** only.
- Keys must match exactly (lowercase, underscores) — the Liquid reads them by key.

---

## 2. Product metafield → references the config

Settings → Custom data → **Products** → Add definition.
- Name: `Customizer Config`
- Namespace and key: **`custom.customizer_config`**
- Type: **Metaobject reference** → select "Customizer Config"
- One value (not a list).
- Storefront access: ON.

Then on any product you want customizable: open the product → Metafields →
**Customizer Config** → pick the metaobject entry. That's the whole "assign it
like Zepto" flow.

---

## How the theme uses it (my side, after you create the above)

- A generic `templates/product.customizer.liquid` reads
  `product.metafield('custom','customizer_config')`.
- If `shapes_json` is present, it's passed straight through as `config_json`.
- Otherwise the template assembles `{ "shapes": { "<shape_name>": { window, frame_aspect,
  safe, patch_in, usable, text_y, text_maxw } } }` from the typed fields.
- It renders `cl-ai-hat-builder` with `shapes`, `show_variants`, `show_prompt`,
  `file_prefix`, the titles, and `config_json` — exactly the params the engine
  already accepts today.
- Frame/mask images resolve from `frame_image`/`mask_image` (falls back to the
  `cl-patch-<shape>.png` asset convention if unset).

## First config to create (mirrors the current pendant)

Label `Image Pendant`, shape_name `Pendant`, file_prefix `image-pendant`,
frame_image `cl-patch-pendant.png`, mask_image `cl-patch-mask-pendant.png`,
frame_aspect `0.565611`, window `0.1220 / 0.1742 / 0.7580 / 0.7624`,
safe `0.950 / 0.965`, patch_in `1.40 / 2.49` (placeholder), usable `0.90`,
text_y `0.90`, text_maxw `0.84`, show_variants `false`, show_prompt `false`,
titles as in `templates/product.pendant.liquid`. Assign it to `image-pendant-test`
and we can retire that template's inline `config_json`.
