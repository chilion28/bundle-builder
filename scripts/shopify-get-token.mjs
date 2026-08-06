#!/usr/bin/env node
/**
 * shopify-get-token.mjs — mint an offline Admin API access token, once.
 *
 * Why this exists: the simpler `client_credentials` grant is rejected for this
 * store (`Oauth error shop_not_permitted`) because the app lives in the
 * "CityLocs" organisation while the store belongs to "Carving Image LLC". The
 * standard OAuth authorization-code flow doesn't care about org ownership, so
 * we use it to obtain a long-lived offline token.
 *
 *   node scripts/shopify-get-token.mjs
 *
 * It starts a local server, prints a URL to open, catches the callback, swaps
 * the code for a token and writes SHOPIFY_ADMIN_ACCESS_TOKEN into
 * .env.admin-api. Run it once; after that the reporting scripts just work.
 *
 * Requires http://localhost:3456/auth/callback to be a registered redirect URL
 * on the app (see Custom App/citylocs-order-tools/shopify.app.toml).
 */

import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, '.env.admin-api');
const PORT = 3456;
const REDIRECT = `http://localhost:${PORT}/auth/callback`;
const SCOPES = 'read_orders,read_products';

function loadEnv(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

/* Rewrites (or appends) a single key, leaving the rest of the file intact. */
function writeEnvKey(file, key, value) {
  const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n') : [];
  let found = false;
  const out = lines.map((l) => {
    if (l.trim().startsWith(key + '=')) { found = true; return `${key}=${value}`; }
    return l;
  });
  if (!found) {
    if (out.length && out[out.length - 1].trim() !== '') out.push('');
    out.splice(out.length ? out.length - 1 : 0, 0, `${key}=${value}`);
  }
  fs.writeFileSync(file, out.join('\n'), 'utf8');
}

const env = loadEnv(ENV_FILE);
const store = (env.SHOPIFY_STORE || '').trim();
const clientId = (env.SHOPIFY_CLIENT_ID || '').trim();
const clientSecret = (env.SHOPIFY_CLIENT_SECRET || '').trim();

if (!store || !clientId || !clientSecret) {
  console.error('\nSHOPIFY_STORE, SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET must all be set in .env.admin-api\n');
  process.exit(1);
}

const state = crypto.randomBytes(16).toString('hex');
const authUrl = `https://${store}/admin/oauth/authorize` +
  `?client_id=${encodeURIComponent(clientId)}` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT)}` +
  `&state=${state}`;

const reply = (res, code, title, body) => {
  res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta charset="utf-8"><title>${title}</title>
    <div style="font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
                max-width:520px;margin:80px auto;padding:0 20px">
      <h1 style="font-size:22px">${title}</h1><p>${body}</p>
    </div>`);
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/auth/callback') { reply(res, 404, 'Not found', 'Waiting for the Shopify callback…'); return; }

  const code = url.searchParams.get('code');
  if (url.searchParams.get('state') !== state) {
    reply(res, 400, 'State mismatch', 'Possible CSRF — nothing was saved. Re-run the script.');
    console.error('\n✗ state mismatch — aborted.\n'); server.close(); process.exit(1);
  }
  if (!code) { reply(res, 400, 'No code', 'Shopify did not return an authorization code.'); return; }

  try {
    const r = await fetch(`https://${store}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const text = await r.text();
    let payload = {};
    try { payload = JSON.parse(text); } catch { /* HTML error page */ }

    if (!r.ok || !payload.access_token) {
      const title = (text.match(/<title>([^<]*)<\/title>/) || [])[1] || text.slice(0, 200);
      reply(res, 500, 'Token exchange failed', 'Check the terminal.');
      console.error(`\n✗ Token exchange failed (${r.status}): ${title}\n`);
      server.close(); process.exit(1);
    }

    writeEnvKey(ENV_FILE, 'SHOPIFY_ADMIN_ACCESS_TOKEN', payload.access_token);
    reply(res, 200, '✓ Token saved', 'You can close this tab and return to the terminal.');
    console.log(`\n✓ Access token saved to .env.admin-api (scopes: ${payload.scope || SCOPES})`);
    console.log('  Next: node scripts/ai-hat-orders.mjs --days 30\n');
    server.close(); setTimeout(() => process.exit(0), 200);
  } catch (err) {
    reply(res, 500, 'Error', 'Check the terminal.');
    console.error('\n✗ ' + (err && err.message ? err.message : err) + '\n');
    server.close(); process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log('\nOpen this URL in a browser where you are logged into the CityLocs admin:\n');
  console.log('  ' + authUrl + '\n');
  console.log('Waiting for the callback on ' + REDIRECT + ' … (Ctrl+C to cancel)\n');
});
