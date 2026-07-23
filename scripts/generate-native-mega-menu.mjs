#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const sourcePath = process.argv[2];
const outputPath = process.argv[3] || 'snippets/cl-native-mega-menu.liquid';
if (!sourcePath) throw new Error('Usage: node scripts/generate-native-mega-menu.mjs SOURCE [OUTPUT]');

const source = await readFile(resolve(sourcePath), 'utf8');
const marker = '_SM.newEntries = ';
const start = source.indexOf(marker);
if (start < 0) throw new Error('Qikify configuration was not found.');
const jsonStart = start + marker.length;
const tail = '"data_file_url":null}}';
const jsonEnd = source.indexOf(tail, jsonStart);
if (jsonEnd < 0) throw new Error('Qikify configuration ending was not found.');
const entries = JSON.parse(source.slice(jsonStart, jsonEnd + tail.length));
let sourceMenu = entries.entry_205678?.data?.data?.megamenu;
if (!Array.isArray(sourceMenu)) throw new Error('Qikify menu entry 205678 was not found.');

function titleOf(node) {
  const raw = String(node?.setting?.title || '');
  const firstTag = raw.indexOf('<');
  const title = (firstTag >= 0 ? raw.slice(0, firstTag) : raw).trim();
  if (!title) throw new Error('Empty title after sanitization.');
  return title;
}

// Products that are no longer offered should not return during regeneration.
const excludedMenuTitles = new Set([
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

function removeExcludedItems(nodes) {
  return nodes
    .filter((node) => !excludedMenuTitles.has(titleOf(node)))
    .map((node) => ({ ...node, menus: removeExcludedItems(node.menus || []) }));
}

sourceMenu = removeExcludedItems(sourceMenu);

function urlOf(node) {
  const value = node?.setting?.url || {};
  let url = value.link || '';
  if (!url && value.product?.handle) url = `/products/${value.product.handle}`;
  if (!url && value.collection?.handle) url = `/collections/${value.collection.handle}`;
  if (!url && value.page?.handle) url = `/pages/${value.page.handle}`;
  if (!url && value.blog?.handle) url = `/blogs/${value.blog.handle}`;
  if (/^https?:\/\/(www\.)?citylocs\.com\//i.test(url)) {
    const parsed = new URL(url);
    url = parsed.pathname + parsed.search + parsed.hash;
  }
  if (!url) return '#';
  if (!(url.startsWith('/') || url === '#')) throw new Error(`Blocked external URL: ${url}`);
  return url;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function link(node, className) {
  return `<a class="${className}" href="${escapeHtml(urlOf(node))}">${escapeHtml(titleOf(node))}</a>`;
}

function sourceImage(node) {
  return node?.setting?.image ||
    node?.setting?.product?.image?.url ||
    node?.setting?.collection?.image?.src ||
    node?.setting?.collection?.image?.url ||
    '';
}

function imageAssetName(node) {
  const image = sourceImage(node);
  if (!image) return '';
  const match = new URL(image).pathname.match(/\.(jpe?g|png|webp|gif)$/i);
  const extension = (match?.[1] || 'jpg').toLowerCase();
  return `cl-menu-${String(node.id || 'item').replace(/[^a-z0-9-]/gi, '-')}.${extension}`;
}

function imageMarkup(node) {
  const asset = imageAssetName(node);
  if (!asset) return '<span class="cl-native-mega__thumb cl-native-mega__thumb--empty" aria-hidden="true"></span>';
  return `<span class="cl-native-mega__thumb"><img src="{{ '${asset}' | asset_url }}" alt="" width="56" height="56" loading="eager"></span>`;
}

function renderDesktopFlyoutItem(node) {
  const children = node.menus || [];
  return `
                <li class="cl-native-mega__flyout-item${children.length ? ' cl-native-mega__flyout-item--parent' : ''}">
                  <a class="cl-native-mega__flyout-link" href="${escapeHtml(urlOf(node))}">
                    ${imageMarkup(node)}
                    <span class="cl-native-mega__flyout-title">${escapeHtml(titleOf(node))}</span>
                    ${children.length ? '<span class="cl-perso-caret cl-perso-caret--right" aria-hidden="true"></span>' : ''}
                  </a>
                  ${children.length ? `<div class="cl-native-mega__flyout cl-native-mega__flyout--level-2">
                    <ul class="cl-native-mega__flyout-list" role="list">${children.map(renderDesktopFlyoutItem).join('')}
                    </ul>
                  </div>` : ''}
                </li>`;
}

function renderDesktopTop(node) {
  const children = node.menus || [];
  if (!children.length) {
    return `
      <li class="cl-native-mega__top-item cl-native-mega__top-item--link">
        ${link(node, 'cl-native-mega__top-link')}
      </li>`;
  }
  return `
      <li class="cl-native-mega__top-item cl-native-mega__top-item--parent">
        <details class="cl-native-mega__details">
          <summary class="cl-native-mega__summary">
            <span>${escapeHtml(titleOf(node))}</span>
            <span class="cl-perso-caret cl-perso-caret--down" aria-hidden="true"></span>
          </summary>
          <div class="cl-native-mega__flyout cl-native-mega__flyout--level-1">
            <ul class="cl-native-mega__flyout-list" role="list">${children.map(renderDesktopFlyoutItem).join('')}
            </ul>
          </div>
        </details>
      </li>`;
}

function renderMobileChild(node) {
  const children = node.menus || [];
  if (!children.length) {
    return `<li><a class="cl-native-mega__mobile-link" href="${escapeHtml(urlOf(node))}">${imageMarkup(node)}<span>${escapeHtml(titleOf(node))}</span></a></li>`;
  }
  return `<li>
              <details class="cl-native-mega__mobile-details">
                <summary class="cl-native-mega__mobile-summary">${imageMarkup(node)}<span>${escapeHtml(titleOf(node))}</span><span class="cl-perso-caret cl-perso-caret--down" aria-hidden="true"></span></summary>
                <ul class="cl-native-mega__mobile-children" role="list">${children.map(renderMobileChild).join('')}</ul>
              </details>
            </li>`;
}

function renderMobileTop(node) {
  const children = node.menus || [];
  if (!children.length) return `<li>${link(node, 'cl-native-mega__top-link')}</li>`;
  return `<li>
        <details class="cl-native-mega__details">
          <summary class="cl-native-mega__summary"><span>${escapeHtml(titleOf(node))}</span><span class="cl-perso-caret cl-perso-caret--down" aria-hidden="true"></span></summary>
          <ul class="cl-native-mega__mobile-list" role="list">${children.map(renderMobileChild).join('')}</ul>
        </details>
      </li>`;
}

const output = `{% comment %}
  Sanitized native mega-menu fallback generated from the former Qikify hierarchy.
  Source record: Qikify entry_205678. Titles are stripped of all HTML and every
  URL is restricted to a CityLocs-relative path. This snippet executes no remote code.

  @param mode {String} "desktop" or "mobile"
{% endcomment %}

{% unless mode == 'mobile' %}
  {{ 'cl-native-mega-menu.css' | asset_url | stylesheet_tag }}
  <script src="{{ 'cl-native-mega-menu.js' | asset_url }}" defer="defer"></script>
{% endunless %}

<nav
  class="cl-native-mega cl-native-mega--{{ mode | default: 'desktop' }}"
  aria-label="{% if mode == 'mobile' %}Mobile navigation{% else %}Main navigation{% endif %}"
  data-cl-native-mega
>
  {% if mode == 'mobile' %}
    <ul class="cl-native-mega__top" role="list">${sourceMenu.map(renderMobileTop).join('')}</ul>
  {% else %}
    <ul class="cl-native-mega__top" role="list">${sourceMenu.map(renderDesktopTop).join('')}</ul>
  {% endif %}
</nav>
`;

const cleanedOutput = output.replace(/[ \t]+$/gm, '');
await writeFile(resolve(outputPath), cleanedOutput, 'utf8');
console.log(`Generated ${outputPath} with ${sourceMenu.length} top-level items.`);
