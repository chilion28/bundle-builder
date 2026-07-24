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
3. The matching legacy thumbnail while the old menu is being retired
4. A neutral empty thumbnail

Link to Shopify resources instead of pasting URLs whenever possible. In the
menu editor, choose the collection, product, page, or article from Shopify's
link picker. Do not paste its storefront URL into **Web address**. Resource
links are what allow automatic images and metafields to work.

The initial Qikify import keeps legacy thumbnails as a transition fallback.
New links that do not point to a Shopify resource will show the neutral tile.

## Routine team workflow

1. Open **Shopify Admin → Content → Menus → CityLocs Editable Mega Menu**.
2. Add, remove, rename, reorder, or nest links there.
3. Keep the structure to three levels: header category → flyout item → nested item.
4. For a new internal link, select the Shopify resource rather than entering a web address.
5. Preview the staging theme on desktop and mobile before enabling the editable menu on live.

Changing navigation links does not require Shopify CLI, Git, or editing Liquid.
Code is only needed when changing the component's layout or behavior.

## Safe publishing and rollback

The Header setting **Use editable native mega menu** controls the new renderer. When it is off, the current generated mega menu remains the fallback. Build and review changes on the staging theme before enabling this setting on live.

If the editable-menu setting is enabled but the selected Shopify menu is empty,
missing, or deleted, the theme automatically uses the generated fallback. This
prevents an accidental menu-editor change from leaving the storefront without
navigation.

Never paste HTML, JavaScript, or script tags into navigation labels.
