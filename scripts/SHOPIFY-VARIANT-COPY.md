# CityLocs product variant-group copy workflow

Use this workflow to copy one or more complete variant groups, such as all
`Pro Five A Frame` and `Signature Series` variants, from an existing Shopify
product to another existing product.

## Safety rules

- Identify source and destination by exact Shopify product ID.
- Run a read-only scan first and report product titles, option structures,
  matching counts, duplicate combinations, duplicate SKUs, inventory state,
  and missing images.
- Never change the destination until the user approves the exact count and
  option values.
- Abort if source and destination option names or positions differ. Do not
  automatically restructure product options because that can affect every
  existing destination variant.
- Abort if either product has more than 250 variants until every result page is
  retrieved and merged.
- Abort on an existing destination option combination or SKU.
- Copy images, SKU, price, compare-at price, barcode, tax setting, weight,
  shipping setting, inventory tracking, inventory policy, and available
  quantities at every location.
- Treat Shopify media as asynchronous. A mutation can succeed before variant
  images appear; wait and run a fresh read-back.
- Independently verify every copied field and the public product JSON. Do not
  claim completion when the mutation merely returned success.

## Files

- `shopify-product-variant-copy-scan.graphql`: reads both products and all
  fields required for the copy and verification.
- `shopify-prepare-variant-copy.mjs`: validates the approved selection and
  creates guarded mutation variables plus a human-readable manifest.
- `shopify-copy-variant-groups.graphql`: creates approved variants and media.
- `shopify-verify-variant-copy.mjs`: compares a fresh source/destination scan
  field by field and exits nonzero on any mismatch.

## Procedure

1. Create a variables file containing `sourceId` and `destinationId`.
2. Run `shopify-product-variant-copy-scan.graphql` without mutation access.
3. Inspect `pageInfo`, product options, selected groups, images, SKUs, and
   inventory. Report the proposed mapping and exact count.
4. Obtain explicit approval naming the source, destination, option values, and
   exact number of variants.
5. Refresh the read-only scan immediately before the mutation.
6. Prepare guarded inputs. Example:

   ```sh
   node scripts/shopify-prepare-variant-copy.mjs \
     --scan /private/tmp/citylocs-copy-prescan.json \
     --option-name Style \
     --option-values "Pro Five A Frame,Signature Series" \
     --expected-count 18 \
     --expected-source-id gid://shopify/Product/7420610052184 \
     --expected-destination-id gid://shopify/Product/8870946373720
   ```

7. Review the generated manifest and confirm it still exactly matches the
   approval.
8. Execute `shopify-copy-variant-groups.graphql` with Shopify CLI's explicit
   `--allow-mutations` flag.
9. Inspect `userErrors` and the returned created-variant count immediately.
10. Run a fresh read-only scan after media processing.
11. Verify the copy. Example:

    ```sh
    node scripts/shopify-verify-variant-copy.mjs \
      --scan /private/tmp/citylocs-copy-postscan.json \
      --option-name Style \
      --option-values "Pro Five A Frame,Signature Series" \
      --expected-count 18 \
      --expected-destination-total 36
    ```

12. Read the destination's public `/products/<handle>.js` response and confirm
    option counts, images, and availability. Zero-stock tracked variants with
    inventory policy `DENY` should remain unavailable.

## Completed copy: July 28, 2026

- Source: `Monogram Custom Hat` (`7420610052184`)
- Destination: `Image Hat (Test)` (`8870946373720`)
- Copied: 7 `Pro Five A Frame` + 11 `Signature Series` = 18 variants
- Destination total after copy: 36 variants
- Verification: 18 images, 18 tracked inventory items, 18 `DENY` policies,
  exact source/destination field match, zero failures
- Expected unavailable variants: `BD7586` and `SN-BANDIDO` at quantity zero

## What to tell Codex next time

> Run the CityLocs variant-group copy workflow. Source product: [Shopify Admin
> URL]. Destination product: [Shopify Admin URL]. Copy every variant where
> Style is [values]. Scan first, report the exact mapping and count, and do not
> change anything until I approve.

After reviewing the dry run:

> Approved. Copy all [count] variants, including images, SKUs, prices, and
> current inventory settings, then independently verify everything afterward.
