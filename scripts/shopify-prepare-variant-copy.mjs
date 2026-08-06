#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';

function argsFrom(argv) {
  const parsed = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error(`Invalid argument near ${key || '(end)'}.`);
    }
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
const scanPath = required(args, 'scan');
const optionName = args.get('option-name') || 'Style';
const optionValues = new Set(required(args, 'option-values').split(',').map(value => value.trim()).filter(Boolean));
const variablesPath = args.get('variables-output') || '/private/tmp/citylocs-variant-copy-vars.json';
const manifestPath = args.get('manifest-output') || '/private/tmp/citylocs-variant-copy-manifest.json';
const expectedCount = args.has('expected-count') ? Number(args.get('expected-count')) : null;
const expectedSourceId = args.get('expected-source-id');
const expectedDestinationId = args.get('expected-destination-id');
const requireImages = args.get('require-images') !== 'false';

if (!optionValues.size) throw new Error('At least one option value is required.');
if (expectedCount !== null && !Number.isInteger(expectedCount)) throw new Error('--expected-count must be an integer.');

const scan = JSON.parse(await readFile(scanPath, 'utf8'));
const { source, destination } = scan;
if (!source || !destination) throw new Error('Scan must contain source and destination products.');
if (expectedSourceId && source.id !== expectedSourceId) throw new Error('Source product ID changed from approval.');
if (expectedDestinationId && destination.id !== expectedDestinationId) throw new Error('Destination product ID changed from approval.');
if (source.variants.pageInfo.hasNextPage || destination.variants.pageInfo.hasNextPage) {
  throw new Error('Product scan exceeds 250 variants. Retrieve and merge every page before proceeding.');
}

for (const product of [source, destination]) {
  for (const variant of product.variants.nodes) {
    if (variant.inventoryItem.inventoryLevels.pageInfo?.hasNextPage) {
      throw new Error(`${product.title} contains an inventory item with more than 100 locations.`);
    }
  }
}

const sourceOptionNames = source.options.map(option => option.name);
const destinationOptionNames = destination.options.map(option => option.name);
if (JSON.stringify(sourceOptionNames) !== JSON.stringify(destinationOptionNames)) {
  throw new Error(`Option structures differ: ${sourceOptionNames.join(' / ')} vs ${destinationOptionNames.join(' / ')}.`);
}
const destinationOptionByName = new Map(destination.options.map(option => [option.name, option]));

const selectedValue = (variant, name) => variant.selectedOptions.find(option => option.name === name)?.value;
const keyFor = variant => variant.selectedOptions.map(option => `${option.name}=${option.value}`).join('\u0000');
const sourceVariants = source.variants.nodes.filter(variant => optionValues.has(selectedValue(variant, optionName)));
if (expectedCount !== null && sourceVariants.length !== expectedCount) {
  throw new Error(`Expected ${expectedCount} source variants, found ${sourceVariants.length}.`);
}
if (!sourceVariants.length) throw new Error('No source variants matched the approved option values.');

const destinationKeys = new Set(destination.variants.nodes.map(keyFor));
const destinationSkus = new Set(destination.variants.nodes.map(variant => variant.sku?.trim()).filter(Boolean));
for (const variant of sourceVariants) {
  if (destinationKeys.has(keyFor(variant))) throw new Error(`Destination already contains ${variant.title}.`);
  if (variant.sku?.trim() && destinationSkus.has(variant.sku.trim())) {
    throw new Error(`Destination already contains SKU ${variant.sku}.`);
  }
  if (!variant.sku?.trim()) throw new Error(`Source variant ${variant.title} has no SKU.`);
  if (requireImages && !variant.image?.url) throw new Error(`Source variant ${variant.title} has no image.`);
  if (variant.inventoryItem.tracked && !variant.inventoryItem.inventoryLevels.nodes.length) {
    throw new Error(`Tracked source variant ${variant.title} has no inventory level.`);
  }
}

const mediaByUrl = new Map();
for (const variant of sourceVariants) {
  if (variant.image?.url && !mediaByUrl.has(variant.image.url)) {
    mediaByUrl.set(variant.image.url, {
      alt: variant.image.altText || variant.title,
      mediaContentType: 'IMAGE',
      originalSource: variant.image.url,
    });
  }
}

const variants = sourceVariants.map(variant => {
  const inventoryItem = {
    requiresShipping: variant.inventoryItem.requiresShipping,
    sku: variant.sku,
    tracked: variant.inventoryItem.tracked,
  };
  if (variant.inventoryItem.measurement?.weight) {
    inventoryItem.measurement = { weight: variant.inventoryItem.measurement.weight };
  }

  const input = {
    inventoryItem,
    inventoryPolicy: variant.inventoryPolicy,
    optionValues: variant.selectedOptions.map(option => ({
      name: option.value,
      optionId: destinationOptionByName.get(option.name).id,
    })),
    price: variant.price,
    taxable: variant.taxable,
  };
  if (variant.inventoryItem.tracked) {
    input.inventoryQuantities = variant.inventoryItem.inventoryLevels.nodes.map(level => ({
      availableQuantity: level.quantities.find(quantity => quantity.name === 'available')?.quantity ?? 0,
      locationId: level.location.id,
    }));
  }
  if (variant.image?.url) input.mediaSrc = [variant.image.url];
  if (variant.barcode !== null) input.barcode = variant.barcode;
  if (variant.compareAtPrice !== null) input.compareAtPrice = variant.compareAtPrice;
  return input;
});

const manifest = {
  destination: { id: destination.id, title: destination.title, variantCountBefore: destination.variants.nodes.length },
  generatedAt: new Date().toISOString(),
  images: mediaByUrl.size,
  optionName,
  optionValues: [...optionValues],
  source: { id: source.id, title: source.title },
  variants: sourceVariants.map(variant => ({
    inventory: variant.inventoryItem.inventoryLevels.nodes.map(level => ({
      available: level.quantities.find(quantity => quantity.name === 'available')?.quantity ?? 0,
      locationId: level.location.id,
    })),
    options: variant.selectedOptions,
    sku: variant.sku,
    title: variant.title,
    tracked: variant.inventoryItem.tracked,
  })),
  variantCount: variants.length,
};

await writeFile(variablesPath, `${JSON.stringify({ productId: destination.id, media: [...mediaByUrl.values()], variants }, null, 2)}\n`, { mode: 0o600 });
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(manifest, null, 2));
