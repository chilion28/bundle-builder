# CityLocs sold-out SKU shutdown runbook

Use this runbook when a physical hat color is sold out but the same SKU exists
as a variant on hundreds of separate Shopify products.

## Store and objective

- Store: `citylocs.myshopify.com`
- Match variants by exact, case-insensitive SKU.
- Enable inventory tracking.
- Set the inventory policy to `DENY` so customers can't purchase at zero.
- Set every existing location's `available` quantity to `0`.
- Verify the final state independently.

Do not delete variants. A backend shutdown can leave a variant visible as sold
out, depending on the theme, but it prevents checkout. Theme hiding is a
separate optional step.

## Authentication

The preferred workflow uses Shopify CLI store authentication and does not
require a custom app, app URL, client ID, or client secret.

```sh
shopify store auth \
  --store citylocs.myshopify.com \
  --scopes read_products,write_products,read_inventory,write_inventory
```

The merchant approves the requested permissions in Shopify Admin. Re-run this
command if the stored session expires.

## Mandatory safety sequence

1. Run an exact-SKU, read-only scan with `scripts/shopify-variant-scan.graphql`.
2. Follow every result page; don't assume the first 250 variants are complete.
3. Filter the returned results to exact, case-insensitive SKU matches.
4. Report counts and current states to the user.
5. Obtain explicit approval that includes the total number of variants.
6. Group the approved variant IDs by product.
7. Update only those IDs with `productVariantsBulkUpdate`:
   - `inventoryPolicy: DENY`
   - `inventoryItem: { tracked: true }`
8. Read the variants again and verify every one is tracked and set to `DENY`.
9. Refresh inventory quantities immediately before changing them.
10. Set nonzero `available` quantities to `0` in batches of no more than 100.
11. Use `changeFromQuantity` for compare-and-set protection and include the
    required `@idempotent` key.
12. Read all pages again and verify the exact match count, tracking, policy, and
    zero availability. Report any failure instead of claiming success.

Mutations require Shopify CLI's explicit `--allow-mutations` flag. Never add it
to read-only scan commands.

## Important Shopify CLI note

Shopify CLI `3.93.2` supported `shopify store auth` and
`shopify store execute`, but did not recognize `shopify store bulk execute` in
this environment. The successful workflow used guarded direct mutations with
several product operations aliased into each request.

The live `2026-07` schema expects `changeFromQuantity` inside
`InventoryQuantityInput`. It rejected the older `compareQuantity` field even
though some documentation examples still showed that name.

## Project utilities

- `shopify-variant-scan.graphql`: read-only SKU and inventory state query.
- `shopify-disable-variant-policy.graphql`: tracking and overselling policy.
- `shopify-set-inventory-zero.graphql`: idempotent inventory zeroing.
- `shopify-disable-variant.mjs`: reusable Admin API implementation with dry-run
  and exact multi-SKU confirmation support.
- `shopify-prepare-disable-cli.mjs`: prepares guarded CLI execution artifacts.
- `shopify-run-disable-policy-cli.mjs`: runs and validates policy batches.
- `shopify-run-zero-inventory-cli.mjs`: runs and validates quantity batches.

The CLI preparation and runner scripts currently contain the July 14, 2026
target set and expected count. For a future shutdown, update their targets only
after a fresh read-only scan and never reuse old `/private/tmp` scan files.

## Completed shutdown: July 14, 2026

The following exact SKUs were successfully disabled and independently verified
on the production store:

| SKU | Variants |
| --- | ---: |
| `PB222MGrn/Blk` | 216 |
| `P5AF-BLK` | 318 |
| `P5AF-WHT` | 237 |
| **Total** | **771** |

Final state: 771 tracked, 771 set to `DENY`, total available quantity `0`, and
zero verification failures.

The live theme explicitly hides all three SKUs from its product selectors and
custom CityLocs/GemPages product forms.
