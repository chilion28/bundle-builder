#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DEFAULT_API_VERSION = '2026-07';
const DEFAULT_ENV_FILE = '.env.admin-api';
const DEFAULT_HANDLE = 'main-menu-native-rebuild';
const DEFAULT_TITLE = 'Main Menu - Native Rebuild';

// Keep the editable menu aligned with the approved generated fallback.
const EXCLUDED_MENU_TITLES = new Set([
  'T-Shirts',
  'License Plate Beanies',
  'Xmas Stocking',
  'Switch Blade Comb',
  'Phone Cases',
  'License Plate Frames',
  'Chain Wallets',
  'Monogram License Plates',
  'Work Hats',
  'Street Signs',
]);

const MENUS_QUERY = `#graphql
  query NativeMenuLookup($query: String!) {
    menus(first: 10, query: $query) {
      nodes { id handle title }
    }
  }
`;

const CREATE_MENU_MUTATION = `#graphql
  mutation CreateNativeMenu($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
    menuCreate(title: $title, handle: $handle, items: $items) {
      menu { id handle title }
      userErrors { field message }
    }
  }
`;

const UPDATE_MENU_MUTATION = `#graphql
  mutation UpdateNativeMenu($id: ID!, $title: String!, $handle: String!, $items: [MenuItemUpdateInput!]!) {
    menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
      menu { id handle title }
      userErrors { field message }
    }
  }
`;

function parseArgs(argv) {
  const args = {
    apiVersion: DEFAULT_API_VERSION,
    apply: false,
    envFile: DEFAULT_ENV_FILE,
    handle: DEFAULT_HANDLE,
    source: '',
    title: DEFAULT_TITLE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--source') args.source = argv[++index] || '';
    else if (arg === '--env-file') args.envFile = argv[++index] || '';
    else if (arg === '--api-version') args.apiVersion = argv[++index] || '';
    else if (arg === '--handle') args.handle = argv[++index] || '';
    else if (arg === '--title') args.title = argv[++index] || '';
    else if (arg === '--confirm-handle') args.confirmHandle = argv[++index] || '';
    else if (arg === '--help') args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (args.help) return args;
  if (!args.source) throw new Error('--source is required.');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(args.handle)) throw new Error('Invalid menu handle.');
  if (args.apply && args.confirmHandle !== args.handle) {
    throw new Error(`Apply mode requires --confirm-handle ${args.handle}`);
  }
  return args;
}

function printHelp() {
  console.log(`
Rebuild the former Qikify hierarchy as a safe native Shopify navigation menu.

Dry run:
  node scripts/shopify-rebuild-native-mega-menu.mjs --source /path/to/storefront-source.txt

Apply:
  node scripts/shopify-rebuild-native-mega-menu.mjs \\
    --source /path/to/storefront-source.txt \\
    --apply --confirm-handle ${DEFAULT_HANDLE}
`);
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function normalizeStore(value) {
  const store = String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(store)) {
    throw new Error('SHOPIFY_STORE must look like store-name.myshopify.com.');
  }
  return store;
}

async function getAccessToken(store) {
  if (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) return process.env.SHOPIFY_ADMIN_ACCESS_TOKEN.trim();
  const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error('Admin API credentials are missing.');
  const response = await fetch(`https://${store}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new Error(`Unable to obtain access token (${response.status}).`);
  return payload.access_token;
}

function extractQikifyMenu(source) {
  const marker = '_SM.newEntries = ';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('Qikify newEntries configuration was not found.');
  const jsonStart = start + marker.length;
  const tail = '"data_file_url":null}}';
  const jsonEndMarker = source.indexOf(tail, jsonStart);
  if (jsonEndMarker < 0) throw new Error('Qikify configuration ending was not found.');
  const entries = JSON.parse(source.slice(jsonStart, jsonEndMarker + tail.length));
  const entry = entries.entry_205678;
  if (!entry?.data?.data?.megamenu) throw new Error('Qikify entry_205678 mega menu was not found.');
  return entry.data.data.megamenu;
}

function cleanTitle(value) {
  const source = String(value || '');
  const firstTag = source.indexOf('<');
  const title = (firstTag >= 0 ? source.slice(0, firstTag) : source).trim();
  if (!title) throw new Error('A menu item has an empty title after sanitization.');
  return title;
}

function itemUrl(node) {
  const value = node?.setting?.url || {};
  let url = value.link || '';
  if (!url && value.product?.handle) url = `/products/${value.product.handle}`;
  if (!url && value.collection?.handle) url = `/collections/${value.collection.handle}`;
  if (!url && value.page?.handle) url = `/pages/${value.page.handle}`;
  if (!url && value.blog?.handle) url = `/blogs/${value.blog.handle}`;
  if (/^https?:\/\/(www\.)?citylocs\.com\//i.test(url)) {
    url = new URL(url).pathname + new URL(url).search + new URL(url).hash;
  }
  if (!url) url = '#';
  if (!(url.startsWith('/') || url === '#')) throw new Error(`Blocked non-CityLocs URL: ${url}`);
  return url;
}

function toNativeItem(node) {
  return {
    title: cleanTitle(node?.setting?.title),
    type: 'HTTP',
    url: itemUrl(node),
    items: (node.menus || []).map(toNativeItem),
  };
}

function removeExcludedItems(nodes) {
  return nodes
    .filter(node => !EXCLUDED_MENU_TITLES.has(cleanTitle(node?.setting?.title)))
    .map(node => ({ ...node, menus: removeExcludedItems(node.menus || []) }));
}

function countItems(items) {
  return items.reduce((total, item) => total + 1 + countItems(item.items || []), 0);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();

  const source = await readFile(resolve(args.source), 'utf8');
  const items = removeExcludedItems(extractQikifyMenu(source)).map(toNativeItem);
  const summary = {
    handle: args.handle,
    title: args.title,
    topLevelItems: items.length,
    totalItems: countItems(items),
    topLevelTitles: items.map(item => item.title),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!args.apply) {
    console.log('Dry run only. No Shopify data was changed.');
    return;
  }

  await loadEnvFile(args.envFile);
  const store = normalizeStore(process.env.SHOPIFY_STORE);
  const token = await getAccessToken(store);
  const endpoint = `https://${store}/admin/api/${args.apiVersion}/graphql.json`;
  const graphql = async (query, variables) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.errors?.length) {
      throw new Error(`Shopify Admin API error (${response.status}): ${JSON.stringify(payload.errors || payload)}`);
    }
    return payload.data;
  };

  const lookup = await graphql(MENUS_QUERY, { query: `handle:${args.handle}` });
  const existing = lookup.menus.nodes.find(menu => menu.handle === args.handle);
  const data = existing
    ? await graphql(UPDATE_MENU_MUTATION, { id: existing.id, title: args.title, handle: args.handle, items })
    : await graphql(CREATE_MENU_MUTATION, { title: args.title, handle: args.handle, items });
  const result = existing ? data.menuUpdate : data.menuCreate;
  if (result.userErrors?.length) throw new Error(JSON.stringify(result.userErrors));
  console.log(`${existing ? 'Updated' : 'Created'} native Shopify menu: ${result.menu.title} (${result.menu.handle})`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
