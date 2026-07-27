/**
 * ai-hat-core.mjs — shared data layer for the Image Hat tools.
 *
 * Both the static report (ai-hat-orders.mjs) and the live server
 * (ai-hat-server.mjs) import from here, so the Shopify query and the line-item
 * property contract live in exactly one place.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const API_VERSION = '2024-10';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Line-item properties written by assets/cl-ai-hat.js. `_Artwork URL` is the
   pre-2026-07-20 name for the print file — kept so older orders still resolve. */
export const P = {
  shape: 'Patch Shape',
  print: ['_Artwork Print', '_Artwork URL'],
  original: ['_Artwork Original'],
  pdf: ['_Artwork PDF'],
  preview: ['_Artwork Preview'],
  score: ['_Quality Score'],
  text: ['Custom Text'],
  textColor: ['Text Color'],
};

const pick = (attrs, keys) => { for (const k of keys) if (attrs[k]) return attrs[k]; return ''; };

export function loadEnvFile(file = path.join(ROOT, '.env.admin-api')) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('='); if (eq === -1) continue;
    const k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (v && !process.env[k]) process.env[k] = v;
  }
}

async function getAccessToken(store) {
  if (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) return process.env.SHOPIFY_ADMIN_ACCESS_TOKEN.trim();
  const id = process.env.SHOPIFY_CLIENT_ID?.trim(), secret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
  if (!id || !secret) throw new Error('No Admin API token. Run scripts/shopify-get-token.mjs (see scripts/AI-HAT-ORDERS.md).');
  const r = await fetch(`https://${store}/admin/oauth/access_token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: id, client_secret: secret, grant_type: 'client_credentials' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Token exchange failed (${r.status}).`);
  return j.access_token;
}

function createApi(store, token) {
  const endpoint = `https://${store}/admin/api/${API_VERSION}/graphql.json`;
  return async (query, variables) => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({ query, variables }),
      });
      if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, attempt * 1000)); continue; }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`Admin API ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
      if (j.errors) throw new Error(`GraphQL: ${JSON.stringify(j.errors).slice(0, 400)}`);
      return j.data;
    }
    throw new Error('Admin API kept throttling — try again shortly.');
  };
}

const ORDERS_QUERY = `
  query AiHatOrders($cursor: String) {
    orders(first: 50, after: $cursor, reverse: true, sortKey: CREATED_AT, query: "status:any") {
      pageInfo { hasNextPage endCursor }
      edges { node {
        id name createdAt closed displayFulfillmentStatus
        lineItems(first: 25) { edges { node { id title quantity variantTitle customAttributes { key value } } } }
      } }
    }
  }`;

/* Fetch AI-Hat line items from recent orders. */
export async function getJobs({ days = 60, scanLimit = 1000 } = {}) {
  loadEnvFile();
  const store = (process.env.SHOPIFY_STORE || '').trim();
  if (!store) throw new Error('SHOPIFY_STORE missing from .env.admin-api');
  const gql = createApi(store, await getAccessToken(store));

  const cutoff = Date.now() - days * 864e5;
  const jobs = [];
  let cursor = null, scanned = 0;
  while (scanned < scanLimit) {
    const conn = (await gql(ORDERS_QUERY, { cursor })).orders;
    for (const { node: o } of conn.edges) {
      scanned += 1;
      if (new Date(o.createdAt).getTime() < cutoff) return { store, jobs };
      for (const { node: li } of o.lineItems.edges) {
        const a = Object.fromEntries((li.customAttributes || []).map((x) => [x.key, x.value]));
        const print = pick(a, P.print);
        if (!print) continue;
        jobs.push({
          order: o.name, orderId: o.id.split('/').pop(), lineId: (li.id || '').split('/').pop(), createdAt: o.createdAt,
          fulfillment: o.displayFulfillmentStatus, archived: o.closed,
          title: li.title, variant: li.variantTitle || '', qty: li.quantity,
          shape: a[P.shape] || '', print,
          original: pick(a, P.original), pdf: pick(a, P.pdf), preview: pick(a, P.preview),
          score: pick(a, P.score), text: pick(a, P.text), textColor: pick(a, P.textColor),
        });
      }
    }
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return { store, jobs };
}

/* ---- shared render helpers ---- */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function attachmentUrl(url, kind, job) {
  if (!url || !url.includes('/upload/')) return url;
  const safe = (s) => String(s || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  const name = [safe(job.order), safe(job.shape) || 'patch', kind].filter(Boolean).join('-');
  return url.replace('/upload/', `/upload/fl_attachment:${name}/`);
}

export function previewUrl(url, w = 700) {
  if (!url || !url.includes('/upload/')) return url;
  const t = /\.pdf$/i.test(url) ? `pg_1,w_${w},q_auto,f_jpg` : `w_${w},q_auto,f_auto`;
  return url.replace('/upload/', `/upload/${t}/`);
}
