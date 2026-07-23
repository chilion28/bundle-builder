# CityLocs editable mega menu

The editable mega menu uses the Shopify Navigation menu named **CityLocs Editable Mega Menu**. Its handle is `citylocs-editable-mega-menu`.

## What the team can edit

- Menu structure, titles, destinations, and ordering: **Shopify Admin → Content → Menus → CityLocs Editable Mega Menu**
- Global menu choice and image visibility: **Online Store → Themes → Customize → Header**
- Item-specific image override: the linked resource's `custom.mega_menu_image` metafield
- Item-specific shorter label: the linked resource's `custom.mega_menu_short_title` metafield

The renderer supports three levels:

1. Header category
2. First flyout item
3. Nested flyout item

Keep the menu to three levels. Deeper links are intentionally not rendered.

## Image behavior

For each second- or third-level link, the menu uses this order:

1. `custom.mega_menu_image`
2. The linked collection, product, or article image
3. A neutral empty thumbnail

Link to Shopify resources instead of pasting URLs whenever possible. Resource links are what allow automatic images and metafields to work.

## Safe publishing and rollback

The Header setting **Use editable native mega menu** controls the new renderer. When it is off, the current generated mega menu remains the fallback. Build and review changes on the staging theme before enabling this setting on live.

Never paste HTML, JavaScript, or script tags into navigation labels.
