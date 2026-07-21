#!/usr/bin/env node
/**
 * ai-hat-orders.mjs — build a production dashboard of Create-Your-AI-Hat orders.
 *
 * Pulls recent orders via the Admin API, keeps the line items that carry the
 * AI-Hat artwork properties, and writes a self-contained HTML page listing each
 * job with its patch shape, preview thumbnail and download links.
 *
 * The report is written to disk and never uploaded anywhere — order data stays
 * on the machine that runs it.
 *
 *   node scripts/ai-hat-orders.mjs                 # last 60 days
 *   node scripts/ai-hat-orders.mjs --days 14
 *   node scripts/ai-hat-orders.mjs --days 90 --out ~/Desktop/ai-hats.html
 *   node scripts/ai-hat-orders.mjs --csv           # also write a .csv alongside
 *   node scripts/ai-hat-orders.mjs --open          # open the report when it's built
 *
 * Credentials come from .env.admin-api (git-ignored):
 *   SHOPIFY_STORE=citylocs.myshopify.com
 *   SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_...        (or CLIENT_ID + CLIENT_SECRET)
 * The app needs the read_orders scope. Orders older than 60 days additionally
 * require read_all_orders, which Shopify must approve.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const API_VERSION = '2024-10';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* The line-item properties written by assets/cl-ai-hat.js. `_Artwork URL` is the
   pre-2026-07-20 name for the print file — kept so older orders still resolve. */
const P = {
  shape: 'Patch Shape',
  print: ['_Artwork Print', '_Artwork URL'],
  original: ['_Artwork Original'],
  pdf: ['_Artwork PDF'],
  preview: ['_Artwork Preview'],
  score: ['_Quality Score'],
  text: ['Custom Text'],
  textColor: ['Text Color'],
};

/* ------------------------------------------------------------------ args --- */
function parseArgs(argv) {
  const out = { days: 60, scanLimit: 1000, out: null, csv: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--days') out.days = Number(argv[++i]);
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--limit') out.scanLimit = Number(argv[++i]);
    else if (a === '--csv') out.csv = true;
    else if (a === '--demo') out.demo = true;      // render sample rows, no API call
    else if (a === '--open') out.open = true;      // open the report when done
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

/* ------------------------------------------------------------------- env --- */
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (val && !process.env[key]) process.env[key] = val;
  }
}

async function getAccessToken(store) {
  if (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) return process.env.SHOPIFY_ADMIN_ACCESS_TOKEN.trim();
  const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      'No Admin API credentials.\n' +
      '  Shopify admin > Settings > Apps and sales channels > Develop apps > Create an app\n' +
      '  Add the read_orders scope, install it, then put the token in .env.admin-api:\n' +
      '    SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_...',
    );
  }
  const res = await fetch(`https://${store}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload.access_token) {
    throw new Error(`Token exchange failed (${res.status}): ${payload.error_description || payload.error || 'unknown'}`);
  }
  return payload.access_token;
}

function createApi({ store, token }) {
  const endpoint = `https://${store}/admin/api/${API_VERSION}/graphql.json`;
  return async function graphql(query, variables) {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({ query, variables }),
      });
      if (res.status === 429 || res.status >= 500) {           // throttled / transient
        await new Promise((r) => setTimeout(r, attempt * 1000));
        continue;
      }
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Admin API ${res.status}: ${JSON.stringify(payload).slice(0, 300)}`);
      if (payload.errors) throw new Error(`GraphQL: ${JSON.stringify(payload.errors).slice(0, 400)}`);
      return payload.data;
    }
    throw new Error('Admin API kept throttling — try again shortly.');
  };
}

/* ----------------------------------------------------------------- fetch --- */
const ORDERS_QUERY = `
  query AiHatOrders($cursor: String) {
    orders(first: 50, after: $cursor, reverse: true, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      edges { node {
        id
        name
        createdAt
        displayFulfillmentStatus
        lineItems(first: 25) { edges { node {
          title
          quantity
          variantTitle
          customAttributes { key value }
        } } }
      } }
    }
  }`;

const pick = (attrs, keys) => {
  for (const k of keys) if (attrs[k]) return attrs[k];
  return '';
};

async function collectJobs(graphql, { days, scanLimit }) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const jobs = [];
  let cursor = null;
  let scanned = 0;

  while (scanned < scanLimit) {
    const data = await graphql(ORDERS_QUERY, { cursor });
    const conn = data.orders;
    for (const { node: order } of conn.edges) {
      scanned += 1;
      if (new Date(order.createdAt).getTime() < cutoff) return jobs;   // sorted desc — done
      for (const { node: li } of order.lineItems.edges) {
        const attrs = Object.fromEntries((li.customAttributes || []).map((a) => [a.key, a.value]));
        const print = pick(attrs, P.print);
        if (!print) continue;                                          // not an AI-Hat line
        jobs.push({
          order: order.name,
          orderId: order.id.split('/').pop(),
          createdAt: order.createdAt,
          fulfillment: order.displayFulfillmentStatus,
          title: li.title,
          variant: li.variantTitle || '',
          qty: li.quantity,
          shape: attrs[P.shape] || '',
          print,
          original: pick(attrs, P.original),
          pdf: pick(attrs, P.pdf),
          preview: pick(attrs, P.preview),
          score: pick(attrs, P.score),
          text: pick(attrs, P.text),
          textColor: pick(attrs, P.textColor),
        });
      }
    }
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return jobs;
}

/* ------------------------------------------------------------------ html --- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/* Cloudinary serves inline by default, and the HTML `download` attribute is
   ignored cross-origin — so force a download with fl_attachment, which also
   lets us replace the random public ID with a name production can file. */
function attachmentUrl(url, kind, job) {
  if (!url || !url.includes('/upload/')) return url;
  const safe = (s) => String(s || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  const name = [safe(job.order), safe(job.shape) || 'patch', kind].filter(Boolean).join('-');
  return url.replace('/upload/', `/upload/fl_attachment:${name}/`);
}

function renderHtml(jobs, { store, days }) {
  const handle = store.replace('.myshopify.com', '');
  const rows = jobs.map((j) => {
    const adminUrl = `https://admin.shopify.com/store/${handle}/orders/${j.orderId}`;
    const link = (href, label, kind) => (href
      ? `<a class="dl" href="${esc(attachmentUrl(href, kind, j))}" download>${label}</a>`
      : `<span class="dl dl--off" title="not supplied">${label}</span>`);
    const date = new Date(j.createdAt).toLocaleString();
    return `<tr data-search="${esc((j.order + ' ' + j.shape + ' ' + j.variant + ' ' + j.title + ' ' + (j.text || '')).toLowerCase())}">
      <td class="thumb">${j.preview ? `<a href="${esc(j.preview)}" target="_blank" rel="noopener"><img src="${esc(j.preview)}" alt="patch preview" loading="lazy"></a>` : '<span class="none">—</span>'}</td>
      <td>
        <a class="order" href="${esc(adminUrl)}" target="_blank" rel="noopener">${esc(j.order)}</a>
        <div class="meta">${esc(date)}</div>
        <div class="meta"><span class="pill pill--${esc(String(j.fulfillment).toLowerCase())}">${esc(j.fulfillment)}</span></div>
      </td>
      <td>
        <div class="strong">${esc(j.shape || '—')}</div>
        <div class="meta">${esc(j.variant)}</div>
        <div class="meta">Qty ${esc(j.qty)}</div>
      </td>
      <td class="txt">${j.text
        ? `<div class="strong">${esc(j.text)}</div><div class="meta"><span class="chip chip--${esc(String(j.textColor || '').toLowerCase())}"></span>${esc(j.textColor || '')}</div>`
        : '<span class="none">—</span>'}</td>
      <td class="meta score">${esc(j.score || '—')}</td>
      <td class="links">
        ${link(j.original, '⬇ Original', 'original')}
        ${link(j.print, '⬇ Print 600dpi', 'print')}
        ${link(j.pdf, '⬇ PDF', 'print')}
        ${link(j.preview, '⬇ Preview', 'preview')}
      </td>
    </tr>`;
  }).join('\n');

  return `<!doctype html>
<meta charset="utf-8">
<title>AI Hat production queue</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root{--blue:#00a0ea;--ink:#1a1f26;--muted:#6b7280;--line:#e5e7eb}
  *{box-sizing:border-box}
  body{margin:0;padding:28px;font:15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:#f7f9fb}
  h1{margin:0 0 4px;font-size:24px}
  .sub{color:var(--muted);font-size:13px;margin-bottom:18px}
  .bar{display:flex;gap:12px;align-items:center;margin-bottom:14px;flex-wrap:wrap}
  input[type=search]{flex:1;min-width:240px;padding:10px 14px;border:1.5px solid var(--line);border-radius:10px;font-size:15px}
  input[type=search]:focus{outline:none;border-color:var(--blue)}
  .count{color:var(--muted);font-size:13px}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden}
  th,td{padding:12px 14px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}
  th{background:#f2f6f9;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#475569}
  tr:last-child td{border-bottom:0}
  .thumb{width:132px}
  .thumb img{width:116px;height:116px;object-fit:contain;background:#fbfbfb;border:1px solid var(--line);border-radius:8px;display:block}
  .order{font-weight:700;color:var(--blue);text-decoration:none;font-size:16px}
  .order:hover{text-decoration:underline}
  .meta{color:var(--muted);font-size:12.5px}
  .strong{font-weight:700}
  .score{max-width:230px}
  .links{white-space:nowrap}
  .dl{display:block;margin-bottom:6px;padding:7px 11px;border:1.5px solid var(--line);border-radius:8px;
      text-decoration:none;color:var(--ink);font-size:13px;font-weight:600;background:#fff}
  .dl:hover{border-color:var(--blue);color:var(--blue)}
  .dl--off{color:#c2c8d0;border-style:dashed;font-weight:500}
  .pill{display:inline-block;padding:2px 8px;border-radius:999px;background:#eef2f6;font-size:11px;font-weight:700;color:#475569}
  .pill--fulfilled{background:#e6f6ec;color:#1a7f45}
  .pill--unfulfilled{background:#fdf3d7;color:#8a6100}
  .none{color:#c2c8d0}
  .txt{max-width:190px}
  .chip{display:inline-block;width:11px;height:11px;border-radius:3px;border:1px solid #c2c8d0;margin-right:6px;vertical-align:-1px}
  .chip--black{background:#000}
  .chip--white{background:#fff}
  .empty{padding:40px;text-align:center;color:var(--muted);background:#fff;border:1px solid var(--line);border-radius:12px}
</style>
<h1>AI Hat production queue</h1>
<div class="sub">${jobs.length} item${jobs.length === 1 ? '' : 's'} from the last ${days} days · generated ${esc(new Date().toLocaleString())} · ${esc(store)}</div>
${jobs.length ? `
<div class="bar">
  <input type="search" id="q" placeholder="Filter by order #, shape, colour…" autocomplete="off">
  <span class="count" id="count"></span>
</div>
<table>
  <thead><tr><th>Preview</th><th>Order</th><th>Patch</th><th>Text</th><th>Quality</th><th>Files</th></tr></thead>
  <tbody id="rows">
${rows}
  </tbody>
</table>
<script>
  var q=document.getElementById('q'), rows=[].slice.call(document.querySelectorAll('#rows tr')), count=document.getElementById('count');
  function apply(){
    var t=q.value.trim().toLowerCase(), n=0;
    rows.forEach(function(r){ var hit=!t||r.dataset.search.indexOf(t)>-1; r.style.display=hit?'':'none'; if(hit)n++; });
    count.textContent=n+' shown';
  }
  q.addEventListener('input',apply); apply();
</script>` : '<div class="empty">No AI Hat orders found in this window.</div>'}
`;
}

function renderCsv(jobs) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Order', 'Date', 'Fulfillment', 'Product', 'Variant', 'Qty', 'Shape', 'Text', 'Text Color', 'Quality', 'Original', 'Print', 'PDF', 'Preview'];
  const lines = [head.map(cell).join(',')];
  for (const j of jobs) {
    lines.push([j.order, j.createdAt, j.fulfillment, j.title, j.variant, j.qty, j.shape, j.text, j.textColor, j.score, j.original, j.print, j.pdf, j.preview].map(cell).join(','));
  }
  return lines.join('\n');
}

/* Sample rows for `--demo`, so the layout can be reviewed before the Admin API
   is connected. Uses real uploads from the ai_hat_unsigned folder. */
const DEMO_JOBS = [
  {
    order: '#403461', orderId: '0', createdAt: new Date().toISOString(), fulfillment: 'UNFULFILLED',
    title: 'Image Hat', variant: 'Snapback / Snapback Maroon', qty: 1, shape: 'Hexagon',
    score: 'Resolution 100/100 · 600 DPI · margins ok', text: 'WEST COAST', textColor: 'Black',
    print: 'https://res.cloudinary.com/ycnncucq/image/upload/v1784593419/ez9jppk7wl4wbwikkprx.png',
    original: 'https://res.cloudinary.com/ycnncucq/image/upload/v1784593419/jfle72yzhrikzdle6fhn.jpg',
    pdf: 'https://res.cloudinary.com/ycnncucq/image/upload/v1784593419/ez9jppk7wl4wbwikkprx.pdf',
    preview: 'https://res.cloudinary.com/ycnncucq/image/upload/v1784593600/ty9qzuqtnithtqsjbmlq.png',
  },
  {
    order: '#403460', orderId: '0', createdAt: new Date(Date.now() - 864e5).toISOString(), fulfillment: 'FULFILLED',
    title: 'Image Hat', variant: 'Trucker / Trucker Black', qty: 2, shape: 'Rectangle',
    score: 'Resolution 98/100 · 588 DPI · margins ok', text: '', textColor: '',
    print: 'https://res.cloudinary.com/ycnncucq/image/upload/v1784590060/vlrmu2nuvdivglzgj4oi.png',
    original: 'https://res.cloudinary.com/ycnncucq/image/upload/v1784590059/borngpu0agimjkht8xuv.jpg',
    pdf: 'https://res.cloudinary.com/ycnncucq/image/upload/v1784590060/vlrmu2nuvdivglzgj4oi.pdf',
    preview: '',
  },
];

/* ------------------------------------------------------------------ main --- */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/ai-hat-orders.mjs [--days 60] [--limit 1000] [--out file.html] [--csv] [--open] [--demo]');
    return;
  }

  loadEnvFile(path.join(ROOT, '.env.admin-api'));
  const store = (process.env.SHOPIFY_STORE || '').trim();
  if (!store) throw new Error('SHOPIFY_STORE missing from .env.admin-api');

  let jobs;
  if (args.demo) {
    console.log('Demo mode — sample rows, no Admin API call.');
    jobs = DEMO_JOBS;
  } else {
    const token = await getAccessToken(store);
    const graphql = createApi({ store, token });
    console.log(`Scanning orders from the last ${args.days} days…`);
    jobs = await collectJobs(graphql, args);
  }

  const outPath = path.resolve(args.out || path.join(ROOT, 'scripts', 'out', 'ai-hat-orders.html'));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, renderHtml(jobs, { store, days: args.days }), 'utf8');
  console.log(`✓ ${jobs.length} AI Hat item(s) → ${outPath}`);

  if (args.open) {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    execFile(opener, [outPath], () => {});
  }

  if (args.csv) {
    const csvPath = outPath.replace(/\.html?$/i, '') + '.csv';
    fs.writeFileSync(csvPath, renderCsv(jobs), 'utf8');
    console.log(`✓ CSV → ${csvPath}`);
  }
}

main().catch((err) => {
  console.error('\n' + (err && err.message ? err.message : err) + '\n');
  process.exit(1);
});
