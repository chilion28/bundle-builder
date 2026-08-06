#!/usr/bin/env node
/**
 * check-fixed-bundle-colors.mjs
 *
 * Validates the Fixed 3-Hat Bundle offering: for the SKU-bridge to route an
 * order to production natively, EVERY design product offered in the bundle must
 * carry a variant for EACH of the 3 promo component SKUs. If any design is
 * missing a SKU, that state's order silently falls back to the generic
 * "Bundle Hat" (safe, but not production-routable).
 *
 * This script:
 *   1. Reads the 51 offered design handles from STATE_DESIGNS in
 *      assets/cl-fixed-bundle.js.
 *   2. Fetches each design's /products/<handle>.js (public, no auth).
 *   3. Computes the set of SKUs stocked on EVERY design (the "universally safe"
 *      colors you can put in the bundle_components metafield).
 *   4. If you pass candidate SKUs, reports for each whether it's safe and, if
 *      not, exactly which designs are missing it.
 *
 * Usage:
 *   node scripts/check-fixed-bundle-colors.mjs
 *       → lists every universally-safe SKU (with its variant title).
 *
 *   node scripts/check-fixed-bundle-colors.mjs 6089BLK 6606BROWN/KH P5AF-NVY
 *       → checks those 3 candidate component SKUs against all designs.
 *
 * Tip: to get the SKUs you're considering, open the Bundle Hat variant in admin
 * (or /products/<bundle-hat-handle>.js) and copy each variant's SKU.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const STORE = "https://citylocs.com";
const CONCURRENCY = 6;
const __dirname = dirname(fileURLToPath(import.meta.url));
const JS_FILE = join(__dirname, "..", "assets", "cl-fixed-bundle.js");

const candidateSkus = process.argv.slice(2).map((s) => s.trim()).filter(Boolean);

/** Pull the design product handles out of the STATE_DESIGNS map. */
async function readHandles() {
  const src = await readFile(JS_FILE, "utf8");
  const start = src.indexOf("STATE_DESIGNS");
  const scope = start === -1 ? src : src.slice(start);
  const handles = [];
  const seen = new Set();
  const re = /design\('([^']+)'/g;
  let m;
  while ((m = re.exec(scope))) {
    const h = m[1];
    if (!seen.has(h)) { seen.add(h); handles.push(h); }
  }
  return handles;
}

async function fetchProduct(handle) {
  try {
    const res = await fetch(`${STORE}/products/${encodeURIComponent(handle)}.js`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { handle, ok: false, status: res.status };
    const data = await res.json();
    const skus = new Map(); // sku -> variant title
    for (const v of data.variants || []) {
      if (v && v.sku) skus.set(String(v.sku).trim(), v.public_title || v.title);
    }
    return { handle, ok: true, title: data.title, skus };
  } catch (e) {
    return { handle, ok: false, status: e.message };
  }
}

/** Simple concurrency-limited map. */
async function mapLimit(items, limit, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

function line(char = "─", n = 66) { return char.repeat(n); }

async function main() {
  const handles = await readHandles();
  process.stdout.write(`Fetching ${handles.length} design products…\n`);
  const results = await mapLimit(handles, CONCURRENCY, fetchProduct);

  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  if (failed.length) {
    console.log(`\n⚠️  ${failed.length} design(s) could not be fetched (excluded from the "universal" check):`);
    for (const f of failed) console.log(`   ✗ ${f.handle}  (${f.status})`);
    console.log(`   → These handles are likely wrong/unpublished. Fix them in STATE_DESIGNS.`);
  }

  if (!ok.length) { console.log("\nNo products fetched — aborting."); process.exit(1); }

  // Intersection of SKUs across every successfully-fetched design.
  let universal = null;
  const labelFor = new Map(); // sku -> a sample variant title
  for (const r of ok) {
    for (const [sku, title] of r.skus) if (!labelFor.has(sku)) labelFor.set(sku, title);
    const set = new Set(r.skus.keys());
    universal = universal === null ? set : new Set([...universal].filter((s) => set.has(s)));
  }

  console.log(`\n${line()}`);
  console.log(`UNIVERSALLY-SAFE SKUs — stocked on all ${ok.length} fetched designs`);
  console.log(`(any of these are safe to put in the bundle_components metafield)`);
  console.log(line());
  const safeSorted = [...universal].sort();
  if (!safeSorted.length) {
    console.log("  (none — no single SKU is stocked on every design)");
  } else {
    for (const sku of safeSorted) console.log(`  ✅ ${sku.padEnd(18)} ${labelFor.get(sku) || ""}`);
  }

  if (candidateSkus.length) {
    console.log(`\n${line()}`);
    console.log(`CANDIDATE CHECK — the ${candidateSkus.length} SKU(s) you passed`);
    console.log(line());
    let allSafe = true;
    for (const sku of candidateSkus) {
      const missing = ok.filter((r) => !r.skus.has(sku));
      if (missing.length === 0) {
        console.log(`  ✅ ${sku}  — stocked on all ${ok.length} designs. SAFE.`);
      } else {
        allSafe = false;
        console.log(`  ❌ ${sku}  — MISSING on ${missing.length} design(s) → those states fall back to generic Bundle Hat:`);
        for (const r of missing.slice(0, 15)) console.log(`        · ${r.handle} (${r.title})`);
        if (missing.length > 15) console.log(`        · …and ${missing.length - 15} more`);
      }
    }
    console.log(line());
    console.log(allSafe
      ? "  RESULT: ✅ All candidate colors are valid across every offered design."
      : "  RESULT: ❌ At least one color would fall back. Pick from the universally-safe list above.");
  } else {
    console.log(`\nTip: pass your 3 candidate component SKUs to validate them, e.g.`);
    console.log(`  node scripts/check-fixed-bundle-colors.mjs 6089BLK 6606BROWN/KH P5AF-NVY`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
