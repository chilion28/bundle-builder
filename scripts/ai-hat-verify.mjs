#!/usr/bin/env node
/**
 * ai-hat-verify.mjs — QA the print files on AI Hat orders.
 *
 * For every order it checks that the generated print file is actually the right
 * shape: each patch has its own window aspect, so a Hexagon order must not be
 * carrying a Rectangle-shaped crop. Catches the class of bug where artwork is
 * composited at the wrong aspect and would print wrong.
 *
 *   node scripts/ai-hat-verify.mjs            # last 60 days
 *   node scripts/ai-hat-verify.mjs --days 2
 *
 * Only reads the first 34 bytes of each PNG (the IHDR header), so it's quick
 * even though the files are several MB each.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const API_VERSION = '2024-10';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_W = 2400;                 // must match cl-ai-hat.js buildPrintCanvas()

/* Window geometry per shape, measured from the frame PNGs — mirrors WINDOW in
   assets/cl-ai-hat.js. Keep the two in step. */
const WINDOW = {
  rectangle: { w: 0.9317, h: 0.4958 },
  rounded:   { w: 0.9267, h: 0.7358 },
  circle:    { w: 0.9233, h: 0.9233 },
  hexagon:   { w: 0.9400, h: 0.5133 },
};
const expectedHeight = (shape) => {
  const win = WINDOW[String(shape || '').toLowerCase()];
  return win ? Math.round(TARGET_W / (win.w / win.h)) : null;
};

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('='); if (eq === -1) continue;
    const k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (v && !process.env[k]) process.env[k] = v;
  }
}

/* PNG: 8-byte signature, then IHDR with width/height at offsets 16 and 20. */
async function pngSize(url) {
  const r = await fetch(url, { headers: { Range: 'bytes=0-33' } });
  if (!r.ok && r.status !== 206) throw new Error('HTTP ' + r.status);
  const b = Buffer.from(await r.arrayBuffer());
  if (b.length < 24 || b.slice(1, 4).toString() !== 'PNG') throw new Error('not a PNG');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const ORDERS_QUERY = `
  query VerifyAiHat($cursor: String) {
    orders(first: 50, after: $cursor, reverse: true, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      edges { node { name createdAt lineItems(first: 25) { edges { node {
        customAttributes { key value }
      } } } } }
    }
  }`;

async function main() {
  const days = Number((process.argv.includes('--days') ? process.argv[process.argv.indexOf('--days') + 1] : 60));
  loadEnvFile(path.join(ROOT, '.env.admin-api'));
  const store = (process.env.SHOPIFY_STORE || '').trim();
  const token = (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '').trim();
  if (!store || !token) throw new Error('Run scripts/shopify-get-token.mjs first.');

  const gql = async (query, variables) => {
    const r = await fetch(`https://${store}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables }),
    });
    const j = await r.json();
    if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 300));
    return j.data;
  };

  const cutoff = Date.now() - days * 864e5;
  const jobs = [];
  let cursor = null;
  outer: while (true) {
    const conn = (await gql(ORDERS_QUERY, { cursor })).orders;
    for (const { node: o } of conn.edges) {
      if (new Date(o.createdAt).getTime() < cutoff) break outer;
      for (const { node: li } of o.lineItems.edges) {
        const a = Object.fromEntries(li.customAttributes.map((x) => [x.key, x.value]));
        const print = a['_Artwork Print'] || a['_Artwork URL'];
        if (print) jobs.push({ order: o.name, shape: a['Patch Shape'] || '?', text: a['Custom Text'] || '', print });
      }
    }
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }

  if (!jobs.length) { console.log(`\nNo AI Hat orders in the last ${days} days.\n`); return; }

  console.log(`\nChecking ${jobs.length} print file(s) from the last ${days} days\n`);
  console.log('ORDER      SHAPE      ACTUAL       EXPECTED     RESULT');
  console.log('─────────  ─────────  ───────────  ───────────  ──────');

  let bad = 0;
  for (const j of jobs) {
    const exp = expectedHeight(j.shape);
    let actual = '—', result;
    try {
      const { w, h } = await pngSize(j.print);
      actual = `${w}x${h}`;
      if (exp === null) result = '? unknown shape';
      else if (w === TARGET_W && Math.abs(h - exp) <= 2) result = 'PASS';
      else { result = 'FAIL — wrong crop'; bad += 1; }
    } catch (e) { result = 'FAIL — ' + e.message; bad += 1; }
    const expStr = exp ? `${TARGET_W}x${exp}` : '—';
    console.log(
      j.order.padEnd(9) + '  ' + String(j.shape).padEnd(9) + '  ' +
      actual.padEnd(11) + '  ' + expStr.padEnd(11) + '  ' + result +
      (j.text ? `   (text: "${j.text}")` : ''),
    );
  }

  console.log(bad ? `\n✗ ${bad} file(s) failed — do not send these to print.\n`
                  : `\n✓ All print files match their patch shape.\n`);
  process.exitCode = bad ? 1 : 0;
}

main().catch((e) => { console.error('\n' + (e.message || e) + '\n'); process.exit(1); });
