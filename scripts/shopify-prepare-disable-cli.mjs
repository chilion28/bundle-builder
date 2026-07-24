#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const targets = [
  {
    sku: 'PB222MGrn/Blk',
    paths: ['/private/tmp/citylocs-after-policy-pb222.json'],
  },
  {
    sku: 'P5AF-BLK',
    paths: [
      '/private/tmp/citylocs-after-policy-p5af-blk.json',
      '/private/tmp/citylocs-after-policy-p5af-blk-2.json',
    ],
  },
  {
    sku: 'P5AF-WHT',
    paths: ['/private/tmp/citylocs-after-policy-p5af-wht.json'],
  },
];

const expectedCount = 771;
const policyVariablesPath = '/private/tmp/citylocs-disable-policy.jsonl';
const quantityBatchesPath = '/private/tmp/citylocs-disable-quantity-batches.json';
const manifestPath = '/private/tmp/citylocs-disable-manifest.json';

function normalized(value) {
  return String(value || '').trim().toUpperCase();
}

function connection(payload) {
  return payload.data?.productVariants || payload.productVariants;
}

function available(level) {
  return level.quantities.find(quantity => quantity.name === 'available')?.quantity ?? 0;
}

const variantsById = new Map();
const countsBySku = {};

for (const target of targets) {
  const matches = [];
  for (const path of target.paths) {
    const payload = JSON.parse(await readFile(path, 'utf8'));
    for (const variant of connection(payload).nodes) {
      if (normalized(variant.sku) === normalized(target.sku)) matches.push(variant);
    }
  }

  countsBySku[target.sku] = matches.length;
  for (const variant of matches) variantsById.set(variant.id, variant);
}

const variants = [...variantsById.values()];
if (variants.length !== expectedCount) {
  throw new Error(`Expected ${expectedCount} unique variants, found ${variants.length}.`);
}

const products = new Map();
for (const variant of variants) {
  const group = products.get(variant.product.id) || [];
  group.push({
    id: variant.id,
    inventoryItem: { tracked: true },
    inventoryPolicy: 'DENY',
  });
  products.set(variant.product.id, group);
}

const policyLines = [...products].map(([productId, productVariants]) =>
  JSON.stringify({ productId, variants: productVariants }),
);
await writeFile(policyVariablesPath, `${policyLines.join('\n')}\n`, { mode: 0o600 });

const quantities = variants.flatMap(variant =>
  variant.inventoryItem.inventoryLevels.nodes
    .filter(level => available(level) !== 0)
    .map(level => ({
      changeFromQuantity: available(level),
      inventoryItemId: variant.inventoryItem.id,
      locationId: level.location.id,
      quantity: 0,
    })),
);

const quantityBatches = [];
for (let index = 0; index < quantities.length; index += 100) {
  quantityBatches.push({
    idempotencyKey: randomUUID(),
    input: {
      name: 'available',
      quantities: quantities.slice(index, index + 100),
      reason: 'correction',
      referenceDocumentUri: `citylocs://inventory/disable-sold-out-skus/${Date.now()}-${index / 100 + 1}`,
    },
  });
}
await writeFile(quantityBatchesPath, `${JSON.stringify(quantityBatches, null, 2)}\n`, { mode: 0o600 });

const manifest = {
  countsBySku,
  generatedAt: new Date().toISOString(),
  policyOperationCount: policyLines.length,
  quantityBatchCount: quantityBatches.length,
  quantityChangeCount: quantities.length,
  skus: targets.map(target => target.sku),
  uniqueVariantCount: variants.length,
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(manifest, null, 2));
