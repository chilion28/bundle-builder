#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const store = 'citylocs.myshopify.com';
const apiVersion = '2026-07';
const inputPath = '/private/tmp/citylocs-disable-quantity-batches.json';
const queryPath = 'scripts/shopify-set-inventory-zero.graphql';
const workDir = '/private/tmp/citylocs-disable-quantity-results';

await mkdir(workDir, { recursive: true });
const batches = JSON.parse(await readFile(inputPath, 'utf8'));

for (let index = 0; index < batches.length; index += 1) {
  const number = String(index + 1).padStart(2, '0');
  const variablesPath = `${workDir}/variables-${number}.json`;
  const outputPath = `${workDir}/result-${number}.json`;
  await writeFile(variablesPath, `${JSON.stringify(batches[index])}\n`, { mode: 0o600 });

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
      else reject(new Error(`Quantity batch ${number} failed with exit ${code}: ${stderr.slice(-2000)}`));
    });
  });

  const result = JSON.parse(await readFile(outputPath, 'utf8'));
  const operation = result.data?.inventorySetQuantities || result.inventorySetQuantities;
  if (!operation) throw new Error(`Quantity batch ${number} returned no mutation payload.`);
  if (operation.userErrors?.length) {
    throw new Error(
      `Quantity batch ${number}: ${operation.userErrors.map(error => error.message).join('; ')}`,
    );
  }

  console.log(
    `Quantity batch ${index + 1}/${batches.length} succeeded (${batches[index].input.quantities.length} levels).`,
  );
}

console.log(`Quantity stage succeeded: ${batches.length} batches.`);
