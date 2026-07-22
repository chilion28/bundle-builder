#!/usr/bin/env node
/**
 * cl-storefront-watch.mjs — outside-in integrity watch for the live storefront.
 *
 * Fetches public pages exactly like a shopper's browser and records what scripts
 * the store is serving. Alerts when that changes. It installs NOTHING in Shopify,
 * holds no credentials, and only ever performs GET requests.
 *
 * Written 2026-07-22 after a checkout-hijacking payload was found injected into
 * the Qikify Smart Menu app's menu data (entry 205678, written 14:43:56 that day)
 * and served on every storefront page.
 *
 * Deliberately vendor-neutral: it does not assume Qikify. It fingerprints every
 * external script domain and every inline eval/atob on the page, so a change from
 * ANY source — another app, or theme code — is flagged just the same.
 *
 *   node scripts/cl-storefront-watch.mjs            # one pass, alert on change
 *   node scripts/cl-storefront-watch.mjs --verbose  # print the full snapshot
 *   node scripts/cl-storefront-watch.mjs --reset    # re-baseline, no alerts
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHARE = '/Volumes/CL Media Server/WEB/AI Hat Orders/security';
const OUTDIR = fs.existsSync(path.dirname(SHARE)) ? SHARE : path.join(ROOT, 'scripts', 'out', 'security');
const STATE = path.join(OUTDIR, 'storefront-state.json');
const HISTORY = path.join(OUTDIR, 'storefront-history.log');

const BASE = 'https://citylocs.com';
const PAGES = ['/', '/collections/custom-hats', '/products/hat-cali-plates', '/cart', '/account/login', '/pages/about-us'];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/* Substrings that identify the known injection. Kept broad on purpose — the
   generic ones (eval(atob, onerror=) catch re-injection under a new name. */
const MARKERS = ['jwt_empty_sig', 'QIKIFY_TMENU_MERGED', '__CHECKIOUT_QIKIFY', 'paytrend.top', 'googlecheck'];

const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const RESET = args.includes('--reset');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const uniq = (a) => [...new Set(a)].sort();

async function fetchPage(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' }, redirect: 'follow', signal: ctrl.signal });
    return { ok: r.ok, status: r.status, body: await r.text() };
  } catch (e) {
    return { ok: false, status: 0, body: '', error: e.message };
  } finally { clearTimeout(t); }
}

/* Pull the base64 blob out of an eval(atob('...')) and decode it, so we can see
   where the payload actually sends people. */
function extractPayload(html) {
  const m = html.match(/atob\(\s*'([A-Za-z0-9+/=_\-\\]{200,}?)'\s*\)/);
  if (!m) return null;
  let b64 = m[1].replace(/\\/g, '').replace(/-/g, '+').replace(/_/g, '/');
  b64 += '='.repeat((4 - (b64.length % 4)) % 4);
  let code = '';
  try { code = Buffer.from(b64, 'base64').toString('utf8'); } catch { return null; }
  const domains = uniq([...code.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((x) => x[1].toLowerCase()));
  const version = (code.match(/["']([\d]{8}-[a-z0-9-]+-v\d+)["']/) || [])[1] || '';
  return { hash: sha(b64), bytes: code.length, domains, version };
}

/* The payload is delivered as an ESCAPED string inside the app's config JSON —
   inert until the app's client-side renderer writes it into the page as real
   HTML. That rendering is gated on the menu's publish/active state, so publish
   state is effectively the arming switch. Capture it, plus the smoking gun:
   the payload appearing anywhere OUTSIDE the config blob = rendered as live
   markup = armed. */
function qikifySnapshot(html) {
  const m = html.match(/<script id="qikify-smartmenu-config">([\s\S]*?)<\/script>/);
  const cfg = m ? m[1] : '';
  const out = {
    configPresent: !!cfg,
    newEntries: /_SM\.newEntries\s*=\s*\{/.test(cfg) ? 'populated'
      : /_SM\.newEntries\s*=\s*null/.test(cfg) ? 'null' : 'absent',
    entries: [],
    payloadOutsideConfig: false,
  };
  const oe = cfg.match(/_SM\.oldEntries\s*=\s*(\[[\s\S]*?\]);/);
  if (oe) {
    try {
      out.entries = JSON.parse(oe[1]).map((e) =>
        `id:${e.id} status:${e.status} published_at:${e.published_at ?? 'null'} updated:${e.updated_at}`);
    } catch { /* leave empty */ }
  }
  if (cfg) out.payloadOutsideConfig = MARKERS.some((k) => html.replace(cfg, '').includes(k));
  return out;
}

function snapshotPage(html) {
  const scriptDomains = uniq([...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
    .map((m) => { try { return new URL(m[1], BASE).hostname.toLowerCase(); } catch { return ''; } })
    .filter(Boolean));
  return {
    markers: MARKERS.filter((k) => html.includes(k)),
    evalCount: (html.match(/eval\(/g) || []).length,
    atobCount: (html.match(/atob\(/g) || []).length,
    onerrorEval: /onerror=["'][^"']*(eval|atob)/i.test(html),
    scriptDomains,
    payload: extractPayload(html),
    qikify: qikifySnapshot(html),
    // Any app/menu record timestamps — a moving value means someone wrote again.
    entryUpdatedAt: uniq([...html.matchAll(/"updated_at":"(20\d\d[-\d :T.Z]+)"/g)].map((m) => m[1])),
  };
}

function notify(title, message) {
  execFile('osascript', ['-e',
    `display notification ${JSON.stringify(message.slice(0, 240))} with title ${JSON.stringify(title)} sound name "Basso"`,
  ], () => {});
}

function log(lines) {
  fs.mkdirSync(OUTDIR, { recursive: true });
  fs.appendFileSync(HISTORY, lines.map((l) => `${new Date().toISOString()}  ${l}`).join('\n') + '\n');
}

/* Compare two snapshots and describe what changed, in plain language. */
function diff(prev, now) {
  const alerts = [];
  const wasInfected = prev && prev.pages.some((p) => p.markers.length);
  const isInfected = now.pages.some((p) => p.markers.length);

  if (!prev) return alerts;

  if (!wasInfected && isInfected) alerts.push(`INJECTION APPEARED — markers now served on ${now.pages.filter((p) => p.markers.length).length}/${now.pages.length} pages`);
  if (wasInfected && !isInfected) alerts.push('INJECTION GONE — no markers on any page (cleanup appears successful)');

  const pHash = prev.payload?.hash, nHash = now.payload?.hash;
  if (pHash && nHash && pHash !== nHash) alerts.push(`PAYLOAD CHANGED — code rewritten (${pHash} -> ${nHash}). Whoever injected it still has access.`);
  if (!pHash && nHash) alerts.push(`PAYLOAD ARMED — decodable eval payload now present (${nHash})`);

  const newDomains = (now.payload?.domains || []).filter((d) => !(prev.payload?.domains || []).includes(d));
  if (newDomains.length) alerts.push(`NEW DESTINATION DOMAIN — ${newDomains.join(', ')}`);

  const newStamps = now.entryUpdatedAt.filter((s) => !prev.entryUpdatedAt.includes(s));
  if (newStamps.length) alerts.push(`APP/MENU DATA REWRITTEN — new updated_at: ${newStamps.join(', ')}`);

  const newScripts = now.scriptDomains.filter((d) => !prev.scriptDomains.includes(d));
  if (newScripts.length) alerts.push(`NEW SCRIPT DOMAIN on storefront — ${newScripts.join(', ')}`);

  // ---- arming signals (publish/render state, not payload content) ----
  const pq = prev.qikify || {}, nq = now.qikify || {};
  if (!pq.payloadOutsideConfig && nq.payloadOutsideConfig) {
    alerts.push('*** ARMED *** payload now appears OUTSIDE the config blob — it is being rendered as live markup, not inert data.');
  }
  if (pq.newEntries && nq.newEntries && pq.newEntries !== nq.newEntries) {
    alerts.push(`MENU DATA DELIVERY CHANGED — newEntries ${pq.newEntries} -> ${nq.newEntries}`);
  }
  const pe = pq.entries || [], ne = nq.entries || [];
  const changedRows = ne.filter((r) => !pe.includes(r));
  if (changedRows.length) {
    const published = changedRows.some((r) => !/published_at:null/.test(r));
    alerts.push(`${published ? 'MENU PUBLISHED (LIKELY RE-ARMS THE PAYLOAD)' : 'MENU PUBLISH STATE CHANGED'} — ${changedRows.join(' | ')}`);
  }

  return alerts;
}

async function main() {
  const pages = [];
  for (const p of PAGES) {
    const r = await fetchPage(BASE + p);
    if (!r.ok) { pages.push({ path: p, error: r.error || `HTTP ${r.status}`, markers: [], scriptDomains: [], entryUpdatedAt: [] }); continue; }
    pages.push({ path: p, ...snapshotPage(r.body) });
  }

  const now = {
    at: new Date().toISOString(),
    pages,
    infectedPages: pages.filter((p) => p.markers?.length).map((p) => p.path),
    payload: pages.map((p) => p.payload).find(Boolean) || null,
    scriptDomains: uniq(pages.flatMap((p) => p.scriptDomains || [])),
    entryUpdatedAt: uniq(pages.flatMap((p) => p.entryUpdatedAt || [])),
    qikify: (() => {
      const qs = pages.map((p) => p.qikify).filter((q) => q && q.configPresent);
      if (!qs.length) return { configPresent: false, newEntries: 'absent', entries: [], payloadOutsideConfig: false };
      return {
        configPresent: true,
        newEntries: qs[0].newEntries,
        entries: uniq(qs.flatMap((q) => q.entries)),
        // armed if ANY page renders it outside the config blob
        payloadOutsideConfig: qs.some((q) => q.payloadOutsideConfig),
      };
    })(),
  };

  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { /* first run */ }

  const alerts = RESET ? [] : diff(prev, now);

  fs.mkdirSync(OUTDIR, { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(now, null, 2));

  const status = now.infectedPages.length
    ? `INFECTED ${now.infectedPages.length}/${pages.length} pages` + (now.payload ? ` payload:${now.payload.hash} -> ${now.payload.domains.filter((d) => !d.includes('citylocs')).join(',') || '?'}` : '')
    : `clean 0/${pages.length}`;

  if (!prev || RESET) {
    log([`BASELINE  ${status}`]);
    console.log(`baseline recorded — ${status}`);
  } else if (alerts.length) {
    log(['', `!! CHANGE DETECTED  (${status})`, ...alerts.map((a) => `   ${a}`)]);
    alerts.forEach((a) => console.log('ALERT: ' + a));
    notify('CityLocs storefront changed', alerts.join(' | '));
  } else {
    log([`ok  ${status}`]);
    console.log(`no change — ${status}`);
  }

  if (VERBOSE) console.log(JSON.stringify(now, null, 2));
  process.exit(0);
}

main().catch((e) => { log([`ERROR ${e.message}`]); console.error(e.message); process.exit(1); });
