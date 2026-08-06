#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

function argsFrom(argv) {
  const parsed = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument near ${key || '(end)'}.`);
    parsed.set(key.slice(2), value);
  }
  return parsed;
}

function required(args, name) {
  const value = args.get(name);
  if (!value) throw new Error(`Missing required --${name}.`);
  return value;
}

const args = argsFrom(process.argv.slice(2));
const scan = JSON.parse(await readFile(required(args, 'scan'), 'utf8'));
const optionName = args.get('option-name') || 'Style';
const optionValues = new Set(required(args, 'option-values').split(',').map(value => value.trim()).filter(Boolean));
const expectedCount = Number(required(args, 'expected-count'));
const expectedDestinationTotal = args.has('expected-destination-total') ? Number(args.get('expected-destination-total')) : null;
const requireImages = args.get('require-images') !== 'false';

const selectedValue = (variant, name) => variant.selectedOptions.find(option => option.name === name)?.value;
const keyFor = variant => variant.selectedOptions.map(option => `${option.name}=${option.value}`).join('\u0000');
const selected = product => product.variants.nodes.filter(variant => optionValues.has(selectedValue(variant, optionName)));
const inventory = variant => Object.fromEntries(variant.inventoryItem.inventoryLevels.nodes.map(level => [
  level.location.id,
  level.quantities.find(quantity => quantity.name === 'available')?.quantity ?? 0,
]));
const source = selected(scan.source);
const destination = selected(scan.destination);
const sourceByKey = new Map(source.map(variant => [keyFor(variant), variant]));
const destinationByKey = new Map(destination.map(variant => [keyFor(variant), variant]));
const failures = [];

if (source.length !== expectedCount || destination.length !== expectedCount) {
  failures.push(`Expected ${expectedCount} source/destination matches; found ${source.length}/${destination.length}.`);
}
if (sourceByKey.size !== expectedCount || destinationByKey.size !== expectedCount) {
  failures.push('Duplicate or missing option combinations detected.');
}
if (expectedDestinationTotal !== null && scan.destination.variants.nodes.length !== expectedDestinationTotal) {
  failures.push(`Expected ${expectedDestinationTotal} total destination variants, found ${scan.destination.variants.nodes.length}.`);
}

const comparisons = [
  ['SKU', variant => variant.sku],
  ['price', variant => variant.price],
  ['compare-at price', variant => variant.compareAtPrice],
  ['barcode', variant => variant.barcode],
  ['tax setting', variant => variant.taxable],
  ['inventory policy', variant => variant.inventoryPolicy],
  ['tracking', variant => variant.inventoryItem.tracked],
  ['shipping setting', variant => variant.inventoryItem.requiresShipping],
  ['weight', variant => JSON.stringify(variant.inventoryItem.measurement?.weight ?? null)],
  ['inventory', variant => JSON.stringify(inventory(variant))],
];
for (const [key, sourceVariant] of sourceByKey) {
  const destinationVariant = destinationByKey.get(key);
  if (!destinationVariant) {
    failures.push(`Missing ${sourceVariant.title}.`);
    continue;
  }
  for (const [label, read] of comparisons) {
    if (read(sourceVariant) !== read(destinationVariant)) failures.push(`${sourceVariant.title}: ${label} mismatch.`);
  }
  if (requireImages && !destinationVariant.image?.url) failures.push(`${sourceVariant.title}: image missing.`);
}

const summary = {
  destinationTotalVariants: scan.destination.variants.nodes.length,
  failures,
  imagesPresent: destination.filter(variant => variant.image?.url).length,
  matchedVariants: destination.length,
  optionCounts: Object.fromEntries([...optionValues].map(value => [value, destination.filter(variant => selectedValue(variant, optionName) === value).length])),
  verified: failures.length === 0,
  zeroInventory: destination.filter(variant => Object.values(inventory(variant)).every(quantity => quantity === 0)).map(variant => ({ sku: variant.sku, title: variant.title })),
};
console.log(JSON.stringify(summary, null, 2));
if (failures.length) process.exitCode = 1;
