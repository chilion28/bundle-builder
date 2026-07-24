#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const DEFAULT_SKU = 'PB222MGrn/Blk';
const DEFAULT_API_VERSION = '2026-07';
const DEFAULT_ENV_FILE = '.env.admin-api';
const PAGE_SIZE = 100;
const QUANTITY_BATCH_SIZE = 100;

const VARIANTS_QUERY = `#graphql
  query FindVariantsBySku($first: Int!, $after: String, $query: String!) {
    productVariants(first: $first, after: $after, query: $query, sortKey: SKU) {
      nodes {
        id
        title
        sku
        inventoryPolicy
        product {
          id
          title
          handle
        }
        inventoryItem {
          id
          tracked
          inventoryLevels(first: 100) {
            nodes {
              id
              location {
                id
                name
              }
              quantities(names: ["available"]) {
                name
                quantity
              }
            }
            pageInfo {
              hasNextPage
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const UPDATE_POLICIES_MUTATION = `#graphql
  mutation DisableVariantSales(
    $productId: ID!
    $variants: [ProductVariantsBulkInput!]!
  ) {
    productVariantsBulkUpdate(
      productId: $productId
      variants: $variants
      allowPartialUpdates: false
    ) {
      productVariants {
        id
        inventoryPolicy
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const ENABLE_TRACKING_MUTATION = `#graphql
  mutation EnableInventoryTracking($id: ID!, $input: InventoryItemInput!) {
    inventoryItemUpdate(id: $id, input: $input) {
      inventoryItem {
        id
        tracked
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const SET_QUANTITIES_MUTATION = `#graphql
  mutation SetInventoryToZero(
    $input: InventorySetQuantitiesInput!
    $idempotencyKey: String!
  ) {
    inventorySetQuantities(input: $input)
      @idempotent(key: $idempotencyKey) {
      inventoryAdjustmentGroup {
        createdAt
        reason
        changes {
          name
          delta
        }
      }
      userErrors {
        code
        field
        message
      }
    }
  }
`;

function printHelp() {
  console.log(`
Disable one or more Shopify variant SKUs across the store.

Dry run (default):
  node scripts/shopify-disable-variant.mjs
  node scripts/shopify-disable-variant.mjs --sku SKU-ONE --sku SKU-TWO

Apply after reviewing the dry-run report:
  node scripts/shopify-disable-variant.mjs --apply --confirm-sku ${DEFAULT_SKU}
  node scripts/shopify-disable-variant.mjs --sku SKU-ONE --sku SKU-TWO \\
    --apply --confirm-sku SKU-ONE --confirm-sku SKU-TWO

Options:
  --sku <value>          Exact SKU to target; repeat for multiple SKUs
                         (default when omitted: ${DEFAULT_SKU})
  --apply                Make changes; omitted means read-only dry run
  --confirm-sku <value>  Required with --apply; repeat for every --sku value
  --env-file <path>      Credentials file (default: ${DEFAULT_ENV_FILE})
  --api-version <value>  Shopify Admin API version (default: ${DEFAULT_API_VERSION})
  --report-dir <path>    Report directory (default: operating system temp folder)
  --help                 Show this help

Apply mode changes only exact SKU matches. It enables inventory tracking,
sets inventory policy to DENY, and sets Available to 0 at existing locations.
`);
}

function parseArgs(argv) {
  const args = {
    apiVersion: DEFAULT_API_VERSION,
    apply: false,
    confirmSkus: [],
    envFile: DEFAULT_ENV_FILE,
    reportDir: tmpdir(),
    skus: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help') {
      args.help = true;
    } else if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--sku') {
      args.skus.push(requireValue(argv, ++index, arg));
    } else if (arg === '--confirm-sku') {
      args.confirmSkus.push(requireValue(argv, ++index, arg));
    } else if (arg === '--env-file') {
      args.envFile = requireValue(argv, ++index, arg);
    } else if (arg === '--api-version') {
      args.apiVersion = requireValue(argv, ++index, arg);
    } else if (arg === '--report-dir') {
      args.reportDir = requireValue(argv, ++index, arg);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!args.skus.length) args.skus.push(DEFAULT_SKU);

  if (args.skus.some(sku => !sku.trim())) {
    throw new Error('--sku cannot be empty.');
  }

  const normalizedSkus = args.skus.map(normalizeSku);
  if (new Set(normalizedSkus).size !== normalizedSkus.length) {
    throw new Error('Each --sku value must be unique.');
  }

  if (args.apply) {
    const normalizedConfirmations = args.confirmSkus.map(normalizeSku);
    const confirmedAll =
      normalizedConfirmations.length === normalizedSkus.length &&
      normalizedSkus.every(sku => normalizedConfirmations.includes(sku));
    if (!confirmedAll) {
      throw new Error('--apply requires one matching --confirm-sku for every --sku value.');
    }
  }

  return args;
}

function requireValue(argv, index, option) {
  const value = argv[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

async function loadEnvFile(path) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) return;

  const contents = await readFile(absolutePath, 'utf8');
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) process.env[key] = value;
  }
}

function normalizeStore(value) {
  const store = value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '')
    .toLowerCase();

  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(store)) {
    throw new Error('SHOPIFY_STORE must look like store-name.myshopify.com.');
  }

  return store;
}

function normalizeSku(value) {
  return String(value || '').trim().toUpperCase();
}

async function getAccessToken(store) {
  if (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) {
    return process.env.SHOPIFY_ADMIN_ACCESS_TOKEN.trim();
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      'Set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET, or SHOPIFY_ADMIN_ACCESS_TOKEN, in the ignored credentials file.',
    );
  }

  const response = await fetch(`https://${store}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(
      `Unable to obtain an Admin API access token (${response.status}): ${payload.error_description || payload.error || 'unknown error'}`,
    );
  }

  return payload.access_token;
}

function createApi({ apiVersion, store, token }) {
  const endpoint = `https://${store}/admin/api/${apiVersion}/graphql.json`;

  return async function graphql(query, variables, operationName) {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token,
        },
        body: JSON.stringify({ query, variables }),
      });

      const payload = await response.json().catch(() => ({}));
      const throttled = payload.errors?.some(
        error => error.extensions?.code === 'THROTTLED',
      );

      if ((response.status === 429 || response.status >= 500 || throttled) && attempt < 5) {
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }

      if (!response.ok) {
        throw new Error(
          `${operationName} failed with HTTP ${response.status}: ${JSON.stringify(payload)}`,
        );
      }

      if (payload.errors?.length) {
        throw new Error(`${operationName} failed: ${formatErrors(payload.errors)}`);
      }

      await respectThrottle(payload.extensions?.cost?.throttleStatus);
      return payload.data;
    }

    throw new Error(`${operationName} failed after retries.`);
  };
}

function formatErrors(errors) {
  return errors
    .map(error => `${error.field?.join('.') || error.extensions?.code || 'error'}: ${error.message}`)
    .join('; ');
}

function assertNoUserErrors(payload, operationName) {
  if (payload.userErrors?.length) {
    throw new Error(`${operationName}: ${formatErrors(payload.userErrors)}`);
  }
}

async function respectThrottle(status) {
  if (!status || status.currentlyAvailable >= 100) return;
  const restoreRate = Math.max(status.restoreRate || 50, 1);
  const waitMs = Math.ceil(((100 - status.currentlyAvailable) / restoreRate) * 1000);
  await sleep(waitMs);
}

function sleep(milliseconds) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));
}

async function findExactVariants(graphql, sku) {
  const exactSku = normalizeSku(sku);
  const matches = [];
  const nonExact = [];
  let after = null;

  do {
    const data = await graphql(
      VARIANTS_QUERY,
      {
        after,
        first: PAGE_SIZE,
        query: `sku:${JSON.stringify(sku)}`,
      },
      'FindVariantsBySku',
    );

    for (const variant of data.productVariants.nodes) {
      if (variant.inventoryItem.inventoryLevels.pageInfo.hasNextPage) {
        throw new Error(
          `Inventory item ${variant.inventoryItem.id} has more than 100 locations; refusing an incomplete update.`,
        );
      }

      if (normalizeSku(variant.sku) === exactSku) matches.push(variant);
      else nonExact.push(variant);
    }

    after = data.productVariants.pageInfo.hasNextPage
      ? data.productVariants.pageInfo.endCursor
      : null;
  } while (after);

  return { matches, nonExact };
}

function summarizeVariant(variant) {
  return {
    product: variant.product.title,
    handle: variant.product.handle,
    variant: variant.title,
    sku: variant.sku,
    variantId: variant.id,
    inventoryItemId: variant.inventoryItem.id,
    inventoryPolicy: variant.inventoryPolicy,
    tracked: variant.inventoryItem.tracked,
    locations: variant.inventoryItem.inventoryLevels.nodes.map(level => ({
      id: level.location.id,
      name: level.location.name,
      available: getAvailable(level),
    })),
  };
}

function getAvailable(level) {
  return level.quantities.find(quantity => quantity.name === 'available')?.quantity ?? 0;
}

function groupByProduct(variants) {
  const groups = new Map();
  for (const variant of variants) {
    const existing = groups.get(variant.product.id) || [];
    existing.push(variant);
    groups.set(variant.product.id, existing);
  }
  return groups;
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function applyChanges(graphql, sku, variants, operations) {
  for (const [productId, productVariants] of groupByProduct(variants)) {
    try {
      const data = await graphql(
        UPDATE_POLICIES_MUTATION,
        {
          productId,
          variants: productVariants.map(variant => ({
            id: variant.id,
            inventoryPolicy: 'DENY',
          })),
        },
        'DisableVariantSales',
      );
      assertNoUserErrors(data.productVariantsBulkUpdate, 'DisableVariantSales');
      operations.push({
        action: 'inventoryPolicy',
        ids: productVariants.map(variant => variant.id),
        status: 'success',
      });
    } catch (error) {
      operations.push({ action: 'inventoryPolicy', productId, status: 'failed', error: error.message });
    }
  }

  for (const variant of variants.filter(item => !item.inventoryItem.tracked)) {
    try {
      const data = await graphql(
        ENABLE_TRACKING_MUTATION,
        { id: variant.inventoryItem.id, input: { tracked: true } },
        'EnableInventoryTracking',
      );
      assertNoUserErrors(data.inventoryItemUpdate, 'EnableInventoryTracking');
      operations.push({
        action: 'enableTracking',
        id: variant.inventoryItem.id,
        status: 'success',
      });
    } catch (error) {
      operations.push({
        action: 'enableTracking',
        id: variant.inventoryItem.id,
        status: 'failed',
        error: error.message,
      });
    }
  }

  const refreshed = (await findExactVariants(graphql, sku)).matches;
  const quantities = refreshed.flatMap(variant =>
    variant.inventoryItem.inventoryLevels.nodes
      .filter(level => getAvailable(level) !== 0)
      .map(level => ({
        changeFromQuantity: getAvailable(level),
        inventoryItemId: variant.inventoryItem.id,
        locationId: level.location.id,
        quantity: 0,
      })),
  );

  for (const quantityBatch of chunk(quantities, QUANTITY_BATCH_SIZE)) {
    try {
      const data = await graphql(
        SET_QUANTITIES_MUTATION,
        {
          idempotencyKey: randomUUID(),
          input: {
            name: 'available',
            quantities: quantityBatch,
            reason: 'correction',
            referenceDocumentUri: `citylocs://inventory/disable-sku/${encodeURIComponent(sku)}/${Date.now()}`,
          },
        },
        'SetInventoryToZero',
      );
      assertNoUserErrors(data.inventorySetQuantities, 'SetInventoryToZero');
      operations.push({
        action: 'setAvailableToZero',
        count: quantityBatch.length,
        status: 'success',
      });
    } catch (error) {
      operations.push({
        action: 'setAvailableToZero',
        count: quantityBatch.length,
        status: 'failed',
        error: error.message,
      });
    }
  }
}

function verifyFinalState(variants) {
  return variants.flatMap(variant => {
    const failures = [];
    if (variant.inventoryPolicy !== 'DENY') failures.push('inventoryPolicy is not DENY');
    if (!variant.inventoryItem.tracked) failures.push('inventory tracking is not enabled');

    for (const level of variant.inventoryItem.inventoryLevels.nodes) {
      if (getAvailable(level) !== 0) {
        failures.push(`${level.location.name} available quantity is ${getAvailable(level)}, not 0`);
      }
    }

    return failures.length
      ? [{ variantId: variant.id, sku: variant.sku, product: variant.product.title, failures }]
      : [];
  });
}

async function writeReport(reportDir, report) {
  const absoluteDir = resolve(reportDir);
  await mkdir(absoluteDir, { recursive: true });
  const safeSku = report.skus
    .join('_')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .slice(0, 120);
  const path = resolve(
    absoluteDir,
    `shopify-disable-${safeSku}-${report.startedAt.replace(/[:.]/g, '-')}.json`,
  );
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return path;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  await loadEnvFile(args.envFile);
  const store = normalizeStore(process.env.SHOPIFY_STORE || '');
  const token = await getAccessToken(store);
  const graphql = createApi({ apiVersion: args.apiVersion, store, token });
  const startedAt = new Date().toISOString();
  const searches = [];
  for (const sku of args.skus) {
    searches.push({ sku, ...(await findExactVariants(graphql, sku)) });
  }

  const missingSkus = searches.filter(search => !search.matches.length).map(search => search.sku);
  if (missingSkus.length) {
    throw new Error(`No variants exactly matched: ${missingSkus.join(', ')}. Nothing was changed.`);
  }

  const allMatches = searches.flatMap(search => search.matches);

  const report = {
    apiVersion: args.apiVersion,
    applied: args.apply,
    exactMatchCount: allMatches.length,
    exactMatchCountsBySku: Object.fromEntries(
      searches.map(search => [search.sku, search.matches.length]),
    ),
    ignoredNonExactCount: searches.reduce((total, search) => total + search.nonExact.length, 0),
    initialState: allMatches.map(summarizeVariant),
    operations: [],
    skus: args.skus,
    startedAt,
    store,
  };

  console.log(`${args.apply ? 'APPLY' : 'DRY RUN'}: ${allMatches.length} exact SKU matches found.`);
  console.table(
    searches.map(search => ({ sku: search.sku, exactMatches: search.matches.length })),
  );
  console.table(
    report.initialState.slice(0, 50).map(item => ({
      product: item.product,
      policy: item.inventoryPolicy,
      tracked: item.tracked,
      locations: item.locations.length,
    })),
  );
  if (report.initialState.length > 50) {
    console.log(`Showing the first 50 matches; the report contains all ${report.initialState.length}.`);
  }

  if (args.apply) {
    for (const search of searches) {
      await applyChanges(graphql, search.sku, search.matches, report.operations);
    }
    const finalMatches = [];
    for (const sku of args.skus) {
      finalMatches.push(...(await findExactVariants(graphql, sku)).matches);
    }
    report.finalState = finalMatches.map(summarizeVariant);
    report.verificationFailures = verifyFinalState(finalMatches);
    report.operationFailures = report.operations.filter(operation => operation.status === 'failed');
  }

  report.finishedAt = new Date().toISOString();
  const reportPath = await writeReport(args.reportDir, report);
  console.log(`Report: ${reportPath}`);

  if (!args.apply) {
    const confirmations = args.skus.map(sku => `--confirm-sku ${JSON.stringify(sku)}`).join(' ');
    console.log(`No Shopify data was changed. Review the report, then rerun with --apply ${confirmations}.`);
    return;
  }

  if (report.operationFailures.length || report.verificationFailures.length) {
    throw new Error(
      `Apply completed with ${report.operationFailures.length} operation failures and ${report.verificationFailures.length} verification failures. Review ${reportPath}.`,
    );
  }

  console.log(`Success: all ${report.exactMatchCount} matching variants are tracked, denied when sold out, and set to 0 available.`);
}

main().catch(error => {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
});
