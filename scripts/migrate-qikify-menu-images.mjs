#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Usage: node scripts/migrate-qikify-menu-images.mjs SOURCE');

const source = await readFile(resolve(sourcePath), 'utf8');
const marker = '_SM.newEntries = ';
const start = source.indexOf(marker);
const tail = '"data_file_url":null}}';
const jsonStart = start + marker.length;
const jsonEnd = source.indexOf(tail, jsonStart);
if (start < 0 || jsonEnd < 0) throw new Error('Qikify configuration was not found.');
const menu = JSON.parse(source.slice(jsonStart, jsonEnd + tail.length)).entry_205678?.data?.data?.megamenu;
if (!Array.isArray(menu)) throw new Error('Qikify menu entry 205678 was not found.');

function sourceImage(node) {
  return node?.setting?.image ||
    node?.setting?.product?.image?.url ||
    node?.setting?.collection?.image?.src ||
    node?.setting?.collection?.image?.url ||
    '';
}

function assetName(node, rawUrl) {
  const pathname = new URL(rawUrl).pathname;
  const match = pathname.match(/\.(jpe?g|png|webp|gif)$/i);
  const extension = (match?.[1] || 'jpg').toLowerCase();
  return `cl-menu-${String(node.id || 'item').replace(/[^a-z0-9-]/gi, '-')}.${extension}`;
}

const records = [];
function walk(node) {
  const image = sourceImage(node);
  if (image) {
    const parsed = new URL(image);
    const allowed = parsed.hostname === 'cdn.shopify.com' ||
      parsed.hostname === 'cdn.qikify.com' ||
      parsed.hostname === 'qikify-cdn.nyc3.digitaloceanspaces.com';
    if (!allowed) throw new Error(`Blocked image host: ${parsed.hostname}`);
    records.push({ id: node.id, image, name: assetName(node, image) });
  }
  (node.menus || []).forEach(walk);
}
menu.forEach(walk);

await mkdir(resolve('assets'), { recursive: true });
let nextIndex = 0;
let completed = 0;
const failures = [];

async function worker() {
  while (nextIndex < records.length) {
    const record = records[nextIndex++];
    try {
      const response = await fetch(record.image, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) throw new Error(`Unexpected content type: ${contentType}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 3_000_000) throw new Error(`Invalid image size: ${bytes.length}`);
      await writeFile(resolve('assets', record.name), bytes);
      completed += 1;
    } catch (error) {
      failures.push({ id: record.id, url: record.image, error: error.message });
    }
  }
}

await Promise.all(Array.from({ length: 8 }, worker));
console.log(JSON.stringify({ discovered: records.length, completed, failures }, null, 2));
if (failures.length) process.exitCode = 1;
