#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const STORE = 'citylocs.myshopify.com';
const API_VERSION = '2026-07';
const TITLE = 'Trucker / One Size Fits All / Olive & Blk Mesh TR';
const CORRECT_SKU = 'PB222MGrn/Blk';
const EXPECTED_TARGETS = 135;
const EXPECTED_PROTECTED = 7;
const ROOT = '/private/tmp/citylocs-olive-repair';

const paths = {
  before: [
    '/private/tmp/citylocs-olive-approved-before-page1.json',
    '/private/tmp/citylocs-olive-approved-before-page2.json',
  ],
  afterPolicy: [
    '/private/tmp/citylocs-olive-after-policy-page1.json',
    '/private/tmp/citylocs-olive-after-policy-page2.json',
  ],
  afterFinal: [
    '/private/tmp/citylocs-olive-after-final-page1.json',
    '/private/tmp/citylocs-olive-after-final-page2.json',
  ],
  targets: `${ROOT}/targets.json`,
  protected: `${ROOT}/protected.json`,
  reportRows: `${ROOT}/report-rows.json`,
  policyOps: `${ROOT}/policy-operations.json`,
  quantityBatches: `${ROOT}/quantity-batches.json`,
  verification: `${ROOT}/verification.json`,
};

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function connection(payload) {
  return payload.data?.productVariants || payload.productVariants;
}

function available(level) {
  return level.quantities.find(quantity => quantity.name === 'available')?.quantity ?? 0;
}

async function readVariants(files) {
  const variants = [];
  for (const file of files) {
    const payload = JSON.parse(await readFile(file, 'utf8'));
    variants.push(...connection(payload).nodes);
  }
  return variants;
}

function isExactTitle(variant) {
  return variant.title === TITLE;
}

function isTargetBefore(variant) {
  return (
    isExactTitle(variant) &&
    variant.product.status === 'ACTIVE' &&
    Boolean(variant.product.onlineStoreUrl) &&
    normalize(variant.sku) !== normalize(CORRECT_SKU)
  );
}

function isProtectedMismatch(variant) {
  return (
    isExactTitle(variant) &&
    (variant.product.status !== 'ACTIVE' || !variant.product.onlineStoreUrl) &&
    normalize(variant.sku) !== normalize(CORRECT_SKU)
  );
}

function assertCount(label, actual, expected) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, found ${actual}.`);
}

async function prepare() {
  await mkdir(ROOT, { recursive: true });
  const variants = await readVariants(paths.before);
  const targets = variants.filter(isTargetBefore);
  const protectedVariants = variants.filter(isProtectedMismatch);
  assertCount('Approved active Online Store targets', targets.length, EXPECTED_TARGETS);
  assertCount('Protected draft/archived targets', protectedVariants.length, EXPECTED_PROTECTED);

  const uniqueProducts = new Set(targets.map(variant => variant.product.id));
  assertCount('Unique target products', uniqueProducts.size, EXPECTED_TARGETS);

  const targetRecords = targets.map(variant => ({
    variantId: variant.id,
    inventoryItemId: variant.inventoryItem.id,
    productId: variant.product.id,
  }));
  const protectedRecords = protectedVariants.map(variant => ({
    variantId: variant.id,
    sku: variant.sku || '',
    tracked: variant.inventoryItem.tracked,
    inventoryPolicy: variant.inventoryPolicy,
    quantities: variant.inventoryItem.inventoryLevels.nodes.map(level => ({
      locationId: level.location.id,
      available: available(level),
    })),
  }));
  const policyOps = targets.map(variant => ({
    productId: variant.product.id,
    variants: [{
      id: variant.id,
      inventoryPolicy: 'DENY',
      inventoryItem: { sku: CORRECT_SKU, tracked: true },
    }],
  }));
  const reportRows = targets.map(variant => ({
    productTitle: variant.product.title,
    productId: variant.product.id.split('/').pop(),
    productHandle: variant.product.handle,
    onlineStoreUrl: variant.product.onlineStoreUrl,
    adminUrl: `https://admin.shopify.com/store/citylocs/products/${variant.product.id.split('/').pop()}`,
    variantTitle: variant.title,
    variantId: variant.id.split('/').pop(),
    previousSku: variant.sku || '',
    correctedSku: CORRECT_SKU,
    previousTracked: variant.inventoryItem.tracked,
    previousInventoryPolicy: variant.inventoryPolicy,
    previousAvailable: variant.inventoryItem.inventoryLevels.nodes.reduce(
      (sum, level) => sum + available(level),
      0,
    ),
  }));

  await writeFile(paths.targets, `${JSON.stringify(targetRecords, null, 2)}\n`);
  await writeFile(paths.protected, `${JSON.stringify(protectedRecords, null, 2)}\n`);
  await writeFile(paths.policyOps, `${JSON.stringify(policyOps, null, 2)}\n`);
  await writeFile(paths.reportRows, `${JSON.stringify(reportRows, null, 2)}\n`);
  console.log(JSON.stringify({ targets: targets.length, protected: protectedVariants.length }, null, 2));
}

function buildPolicyOperation(batch) {
  const definitions = [];
  const fields = [];
  const variables = {};
  batch.forEach((operation, index) => {
    definitions.push(`$productId${index}: ID!`, `$variants${index}: [ProductVariantsBulkInput!]!`);
    variables[`productId${index}`] = operation.productId;
    variables[`variants${index}`] = operation.variants;
    fields.push(`operation${index}: productVariantsBulkUpdate(productId: $productId${index}, variants: $variants${index}, allowPartialUpdates: false) { productVariants { id sku inventoryPolicy inventoryItem { id tracked } } userErrors { code field message } }`);
  });
  return {
    query: `mutation RepairOliveMismatchBatch(${definitions.join(', ')}) { ${fields.join('\n')} }`,
    variables,
  };
}

async function executeCli({ queryPath, variablesPath, outputPath }) {
  await new Promise((resolve, reject) => {
    const child = spawn('shopify', [
      'store', 'execute', '--store', STORE, '--query-file', queryPath,
      '--variable-file', variablesPath, '--output-file', outputPath,
      '--version', API_VERSION, '--allow-mutations', '--no-color',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Shopify CLI exited ${code}: ${stderr.slice(-3000)}`));
    });
  });
}

async function policy() {
  const operations = JSON.parse(await readFile(paths.policyOps, 'utf8'));
  assertCount('Policy operations', operations.length, EXPECTED_TARGETS);
  const workDir = `${ROOT}/policy`;
  await mkdir(workDir, { recursive: true });
  const batchSize = 10;
  for (let start = 0; start < operations.length; start += batchSize) {
    const batch = operations.slice(start, start + batchSize);
    const batchNo = String(start / batchSize + 1).padStart(2, '0');
    const queryPath = `${workDir}/query-${batchNo}.graphql`;
    const variablesPath = `${workDir}/variables-${batchNo}.json`;
    const outputPath = `${workDir}/result-${batchNo}.json`;
    const operation = buildPolicyOperation(batch);
    await writeFile(queryPath, `${operation.query}\n`);
    await writeFile(variablesPath, `${JSON.stringify(operation.variables)}\n`);
    await executeCli({ queryPath, variablesPath, outputPath });

    const result = JSON.parse(await readFile(outputPath, 'utf8'));
    const payload = result.data || result;
    const returnedIds = new Set();
    const errors = [];
    batch.forEach((item, index) => {
      const response = payload[`operation${index}`];
      for (const error of response?.userErrors || []) errors.push(error.message);
      for (const variant of response?.productVariants || []) {
        returnedIds.add(variant.id);
        if (
          normalize(variant.sku) !== normalize(CORRECT_SKU) ||
          variant.inventoryPolicy !== 'DENY' ||
          !variant.inventoryItem.tracked
        ) errors.push(`${variant.id} did not return the required state`);
      }
    });
    for (const item of batch) {
      if (!returnedIds.has(item.variants[0].id)) errors.push(`${item.variants[0].id} was not returned`);
    }
    if (errors.length) throw new Error(`Policy batch ${batchNo}: ${errors.join('; ')}`);
    console.log(`Policy batch ${Number(batchNo)}/${Math.ceil(operations.length / batchSize)} succeeded (${batch.length}).`);
  }
}

async function prepareZero() {
  const variants = await readVariants(paths.afterPolicy);
  const targets = JSON.parse(await readFile(paths.targets, 'utf8'));
  const targetIds = new Set(targets.map(target => target.variantId));
  const found = variants.filter(variant => targetIds.has(variant.id));
  assertCount('Targets found after policy stage', found.length, EXPECTED_TARGETS);

  const stateErrors = found.filter(variant =>
    normalize(variant.sku) !== normalize(CORRECT_SKU) ||
    variant.inventoryPolicy !== 'DENY' ||
    !variant.inventoryItem.tracked
  );
  if (stateErrors.length) throw new Error(`${stateErrors.length} targets failed policy-stage verification.`);

  const quantities = found.flatMap(variant =>
    variant.inventoryItem.inventoryLevels.nodes
      .filter(level => available(level) !== 0)
      .map(level => ({
        changeFromQuantity: available(level),
        inventoryItemId: variant.inventoryItem.id,
        locationId: level.location.id,
        quantity: 0,
      })),
  );
  const batches = [];
  for (let start = 0; start < quantities.length; start += 100) {
    batches.push({
      idempotencyKey: randomUUID(),
      input: {
        name: 'available',
        quantities: quantities.slice(start, start + 100),
        reason: 'correction',
        referenceDocumentUri: `citylocs://inventory/repair-olive-sku-mismatches/${Date.now()}-${start / 100 + 1}`,
      },
    });
  }
  await writeFile(paths.quantityBatches, `${JSON.stringify(batches, null, 2)}\n`);
  console.log(JSON.stringify({ targets: found.length, quantityChanges: quantities.length, batches: batches.length }, null, 2));
}

async function zero() {
  const batches = JSON.parse(await readFile(paths.quantityBatches, 'utf8'));
  const workDir = `${ROOT}/quantity`;
  await mkdir(workDir, { recursive: true });
  for (let index = 0; index < batches.length; index += 1) {
    const batchNo = String(index + 1).padStart(2, '0');
    const variablesPath = `${workDir}/variables-${batchNo}.json`;
    const outputPath = `${workDir}/result-${batchNo}.json`;
    await writeFile(variablesPath, `${JSON.stringify(batches[index])}\n`);
    await executeCli({
      queryPath: 'scripts/shopify-set-inventory-zero.graphql',
      variablesPath,
      outputPath,
    });
    const result = JSON.parse(await readFile(outputPath, 'utf8'));
    const response = result.data?.inventorySetQuantities || result.inventorySetQuantities;
    if (!response) throw new Error(`Quantity batch ${batchNo} returned no payload.`);
    if (response.userErrors?.length) {
      throw new Error(`Quantity batch ${batchNo}: ${response.userErrors.map(error => error.message).join('; ')}`);
    }
    console.log(`Quantity batch ${index + 1}/${batches.length} succeeded (${batches[index].input.quantities.length}).`);
  }
}

async function verify() {
  const variants = await readVariants(paths.afterFinal);
  const targets = JSON.parse(await readFile(paths.targets, 'utf8'));
  const protectedBefore = JSON.parse(await readFile(paths.protected, 'utf8'));
  const targetIds = new Set(targets.map(target => target.variantId));
  const foundTargets = variants.filter(variant => targetIds.has(variant.id));
  assertCount('Final targets found', foundTargets.length, EXPECTED_TARGETS);

  const failures = [];
  for (const variant of foundTargets) {
    const totalAvailable = variant.inventoryItem.inventoryLevels.nodes.reduce(
      (sum, level) => sum + available(level), 0,
    );
    if (normalize(variant.sku) !== normalize(CORRECT_SKU)) failures.push(`${variant.id}: incorrect SKU`);
    if (!variant.inventoryItem.tracked) failures.push(`${variant.id}: untracked`);
    if (variant.inventoryPolicy !== 'DENY') failures.push(`${variant.id}: policy ${variant.inventoryPolicy}`);
    if (totalAvailable !== 0) failures.push(`${variant.id}: available ${totalAvailable}`);
  }

  const byId = new Map(variants.map(variant => [variant.id, variant]));
  let protectedUnchanged = 0;
  for (const before of protectedBefore) {
    const after = byId.get(before.variantId);
    if (!after) {
      failures.push(`${before.variantId}: protected variant missing from final scan`);
      continue;
    }
    const afterQuantities = after.inventoryItem.inventoryLevels.nodes.map(level => ({
      locationId: level.location.id,
      available: available(level),
    }));
    if (
      (after.sku || '') !== before.sku ||
      after.inventoryItem.tracked !== before.tracked ||
      after.inventoryPolicy !== before.inventoryPolicy ||
      JSON.stringify(afterQuantities) !== JSON.stringify(before.quantities)
    ) {
      failures.push(`${before.variantId}: protected variant changed`);
    } else {
      protectedUnchanged += 1;
    }
  }

  const result = {
    verifiedAt: new Date().toISOString(),
    targetCount: foundTargets.length,
    correctedSkuCount: foundTargets.filter(v => normalize(v.sku) === normalize(CORRECT_SKU)).length,
    trackedCount: foundTargets.filter(v => v.inventoryItem.tracked).length,
    denyCount: foundTargets.filter(v => v.inventoryPolicy === 'DENY').length,
    zeroAvailableCount: foundTargets.filter(v => v.inventoryItem.inventoryLevels.nodes.reduce((sum, level) => sum + available(level), 0) === 0).length,
    protectedUnchanged,
    failures,
  };
  await writeFile(paths.verification, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  if (failures.length) throw new Error(`Final verification failed with ${failures.length} issue(s).`);
}

const command = process.argv[2];
if (command === 'prepare') await prepare();
else if (command === 'policy') await policy();
else if (command === 'prepare-zero') await prepareZero();
else if (command === 'zero') await zero();
else if (command === 'verify') await verify();
else throw new Error('Usage: shopify-repair-olive-mismatches.mjs <prepare|policy|prepare-zero|zero|verify>');
