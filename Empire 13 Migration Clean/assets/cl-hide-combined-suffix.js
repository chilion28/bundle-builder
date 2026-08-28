/*
 * cl-hide-combined-suffix.js
 * Cosmetic front-end cleanup for Combined Listing CHILD products, whose real
 * titles carry a "(Combined)" / "(Combined Listing Pilot)" suffix
 * (e.g. "Washington Blackout Plate Hat (Combined)"). This strips that trailing
 * parenthetical wherever the theme renders it — the product H1, the cart
 * drawer, search results, etc. — WITHOUT editing the products themselves.
 *
 * Scope guard: it only removes a parenthetical that contains the word
 * "Combined", so an unrelated product with intentional "(...)" text is never
 * touched. It edits text nodes only (never element structure), so it is safe to
 * run broadly. NOTE: this cannot reach the Shopify checkout page or order
 * emails — those are not theme-controlled.
 */
(function () {
  if (window.CLHideCombinedSuffix) return;
  window.CLHideCombinedSuffix = true;

  // " (Combined)" or " (Combined Listing Pilot)" — the leading space(s) go too.
  var PATTERN = /\s*\((?:combined)[^)]*\)/gi;

  function cleanTextNode(node) {
    var value = node.nodeValue;
    if (!value || value.indexOf('(') === -1) return;
    if (!/\(combined/i.test(value)) return;
    var cleaned = value.replace(PATTERN, '');
    if (cleaned !== value) node.nodeValue = cleaned;
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { cleanTextNode(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    // Skip script/style subtrees.
    if (root.nodeType === 1) {
      var tag = root.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') return;
    }
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = tw.nextNode())) cleanTextNode(n);
  }

  function run() { walk(document.body); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  // Re-clean content injected later (hot-reload title swaps, cart drawer, etc.).
  var scheduled = false;
  var pending = [];
  function flush() {
    scheduled = false;
    var nodes = pending;
    pending = [];
    for (var i = 0; i < nodes.length; i++) walk(nodes[i]);
  }
  new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.type === 'characterData') { cleanTextNode(m.target); continue; }
      for (var j = 0; j < m.addedNodes.length; j++) pending.push(m.addedNodes[j]);
    }
    if (pending.length && !scheduled) {
      scheduled = true;
      // setTimeout (not requestAnimationFrame) so the flush still fires when the
      // tab is backgrounded/hidden.
      setTimeout(flush, 0);
    }
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });
})();
