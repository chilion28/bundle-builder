#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const store = 'citylocs.myshopify.com';
const apiVersion = '2026-07';
const inputPath = '/private/tmp/citylocs-disable-policy.jsonl';
const workDir = '/private/tmp/citylocs-disable-policy-batches';
const batchSize = 10;
const concurrency = 3;

await mkdir(workDir, { recursive: true });
const operations = (await readFile(inputPath, 'utf8'))
  .trim()
  .split('\n')
  .map(line => JSON.parse(line));

const batches = [];
for (let index = 0; index < operations.length; index += batchSize) {
  batches.push(operations.slice(index, index + batchSize));
}

function buildOperation(batch) {
  const definitions = [];
  const fields = [];
  const variables = {};

  batch.forEach((operation, index) => {
    definitions.push(`$productId${index}: ID!`, `$variants${index}: [ProductVariantsBulkInput!]!`);
    variables[`productId${index}`] = operation.productId;
    variables[`variants${index}`] = operation.variants;
    fields.push(`
      operation${index}: productVariantsBulkUpdate(
        productId: $productId${index}
        variants: $variants${index}
        allowPartialUpdates: false
      ) {
        productVariants {
          id
          inventoryPolicy
          inventoryItem {
            id
            tracked
          }
        }
        userErrors {
          code
          field
          message
        }
      }
    `);
  });

  return {
    query: `mutation DisableVariantBatch(${definitions.join(', ')}) {${fields.join('\n')}}`,
    variables,
  };
}

async function runBatch(batch, batchIndex) {
  const number = String(batchIndex + 1).padStart(3, '0');
  const queryPath = `${workDir}/query-${number}.graphql`;
  const variablesPath = `${workDir}/variables-${number}.json`;
  const outputPath = `${workDir}/result-${number}.json`;
  const { query, variables } = buildOperation(batch);
  await writeFile(queryPath, `${query}\n`, { mode: 0o600 });
  await writeFile(variablesPath, `${JSON.stringify(variables)}\n`, { mode: 0o600 });

  await new Promise((resolve, reject) => {
    const child = spawn(
      'shopify',
      [
        'store',
        'execute',
        '--store',
        store,
        '--query-file',
        queryPath,
        '--variable-file',
        variablesPath,
        '--output-file',
        outputPath,
        '--version',
        apiVersion,
        '--allow-mutations',
        '--no-color',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Batch ${number} failed with exit ${code}: ${stderr.slice(-2000)}`));
    });
  });

  const result = JSON.parse(await readFile(outputPath, 'utf8'));
  const payload = result.data || result;
  const expectedIds = new Set(batch.flatMap(operation => operation.variants.map(variant => variant.id)));
  const returnedIds = new Set();
  const errors = [];

  for (let index = 0; index < batch.length; index += 1) {
    const operation = payload[`operation${index}`];
    if (!operation) {
      errors.push(`operation${index} returned no payload`);
      continue;
    }
    for (const error of operation.userErrors || []) {
      errors.push(`operation${index}: ${error.message}`);
    }
    for (const variant of operation.productVariants || []) {
      returnedIds.add(variant.id);
      if (variant.inventoryPolicy !== 'DENY' || !variant.inventoryItem.tracked) {
        errors.push(`${variant.id} did not return DENY + tracked`);
      }
    }
  }

  for (const id of expectedIds) {
    if (!returnedIds.has(id)) errors.push(`${id} was not returned`);
  }
  if (errors.length) throw new Error(`Batch ${number}: ${errors.join('; ')}`);

  console.log(`Policy batch ${batchIndex + 1}/${batches.length} succeeded (${expectedIds.size} variants).`);
}

let nextBatch = 0;
async function worker() {
  while (nextBatch < batches.length) {
    const index = nextBatch;
    nextBatch += 1;
    await runBatch(batches[index], index);
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
console.log(`Policy stage succeeded: ${operations.length} products in ${batches.length} batches.`);
