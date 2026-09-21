/*
 * cl-free-gift-buy2.js — reusable "Buy X items, get 1 free gift" cart manager.
 *
 * Storefront half of the promo. The ZEROING (making the hat $0) is done by a
 * the citylocs-functions product-discount Function;
 * this script only AUTO-ADDS / AUTO-REMOVES the gift so the customer never has
 * to find it, and never gets charged for it:
 *   - paid units (everything except promo gift lines) >= X → add 1 gift
 *   - paid units < X                                      → remove the gift
 *   - gift present but NOT actually $0 (discount not applied) → remove it
 *     (fail-safe: never let a customer pay for the "free" hat)
 *   - gift quantity is clamped to 1 (extra units would be full price)
 *
 * Cart changes are detected by wrapping fetch/XHR for /cart/(add|change|update
 * |clear); our own gift mutations use the ORIGINAL fetch so they don't re-fire
 * the hook. After a gift mutation we dispatch `cart:refresh` (the theme's AMP/
 * iCart drawer listens for it, same as cl-hypro-bundle.js / cl-bundle-cart).
 */
(function () {
  if (window.CLFreeGiftBuy2) return;
  window.CLFreeGiftBuy2 = true;

  var origFetch = window.fetch.bind(window);

  var CONFIG = {
    // Merchant-selected gift variant supplied by the app-owned registry bridge.
    giftVariantId: String(window.CL_FREE_GIFT_VARIANT_ID || '') || null,
    threshold: parseInt(window.CL_FREE_GIFT_THRESHOLD, 10) > 0 ? parseInt(window.CL_FREE_GIFT_THRESHOLD, 10) : 2, // paid units required to earn the gift
    prop: '_free_gift', // line-item property marking our gift line
    propVal: window.CL_FREE_GIFT_MARKER || 'buy2-hat',
    label: window.CL_FREE_GIFT_LABEL || 'Free gift', // reward label (from the app config)
    startsOn: window.CL_FREE_GIFT_STARTS_ON || null, // inclusive first active date "YYYY-MM-DD"
    endsOn: window.CL_FREE_GIFT_ENDS_ON || null, // inclusive last active date "YYYY-MM-DD" (promo timezone), or null = no end
    timezone: window.CL_FREE_GIFT_TZ || 'America/Los_Angeles'
  };

  // The promo is active THROUGH 11:59:59 PM on endsOn in the promo timezone. We
  // compare the current date in that timezone (as YYYY-MM-DD) against endsOn:
  // still that date or earlier = active; rolled past it = expired. String compare
  // of ISO dates is correct and avoids offset math. Server Function is authority.
  function promoDateState() {
    if (!CONFIG.startsOn && !CONFIG.endsOn) return 'active';
    try {
      var today = new Intl.DateTimeFormat('en-CA', {
        timeZone: CONFIG.timezone, year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date());
      if (CONFIG.startsOn && today < String(CONFIG.startsOn)) return 'scheduled';
      if (CONFIG.endsOn && today > String(CONFIG.endsOn)) return 'expired';
      return 'active';
    } catch (e) { return 'active'; } // the Function remains the authority
  }

  var busy = false; // true while WE mutate the cart (suppress re-entrancy)
  var blockedUntilChange = false; // set if the gift came back not-$0; cleared on the next real cart change
  var scheduled = false;

  // A line is OUR gift ONLY if it carries this promotion's _free_gift marker. The
  // configured variant is an ADDITIONAL authorization check — never sufficient
  // alone, because a customer may legitimately buy that same variant as a paid
  // item (which must count toward the threshold, not be treated as the gift).
  function isGiftLine(it) {
    var marked = it.properties && it.properties[CONFIG.prop] === CONFIG.propVal;
    if (!marked) return false;
    return !CONFIG.giftVariantId || String(it.variant_id) === CONFIG.giftVariantId;
  }
  function isMarkedPromoGift(it) {
    return !!(it.properties && it.properties[CONFIG.prop]);
  }
  function paidUnits(cart) {
    return (cart.items || []).reduce(function (n, it) { return isMarkedPromoGift(it) ? n : n + it.quantity; }, 0);
  }
  function findGift(cart) {
    var items = cart.items || [];
    for (var i = 0; i < items.length; i++) { if (isGiftLine(items[i])) return items[i]; }
    return null;
  }
  function getCart() { return origFetch('/cart.js', { credentials: 'same-origin' }).then(function (r) { return r.json(); }); }
  function addGift() {
    var props = {}; props[CONFIG.prop] = CONFIG.propVal;
    return origFetch('/cart/add.js', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ id: CONFIG.giftVariantId, quantity: 1, properties: props }] })
    });
  }
  function setQty(key, qty) {
    return origFetch('/cart/change.js', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: key, quantity: qty })
    });
  }

  function done(changed) {
    busy = false;
    if (changed) document.dispatchEvent(new CustomEvent('cart:refresh'));
    emitState();
  }

  // Core decision. Fetch the cart, then add/remove/clamp the gift as needed.
  function evaluate() {
    if (busy || !CONFIG.giftVariantId) { emitState(); return; }
    getCart().then(function (cart) {
      var units = paidUnits(cart);
      var gift = findGift(cart);
      var staleGift = (cart.items || []).find(function (it) { return isMarkedPromoGift(it) && !isGiftLine(it); });
      giftIndex = -1;
      (cart.items || []).forEach(function (it, i) { if (isGiftLine(it)) giftIndex = i; });
      giftKey = gift ? gift.key : null;

      if (staleGift) {
        busy = true;
        setQty(staleGift.key, 0).then(function () { done(true); schedule(); });
        return;
      }

      if (promoDateState() !== 'active') {
        // Promo ended — never add, hide the nudge, and remove any lingering gift
        // line (the checkout Function also blocks it server-side).
        if (gift) {
          busy = true;
          setQty(gift.key, 0).then(function () { busy = false; document.dispatchEvent(new CustomEvent('cart:refresh')); lastState = null; scheduleDom(); });
          return;
        }
        lastState = null; scheduleDom();
        return;
      }

      if (units >= CONFIG.threshold) {
        if (!gift) {
          if (blockedUntilChange) { emitState(units, 0); return; }
          busy = true;
          addGift().then(function () { verifyFreeThenFinish(); });
          return;
        }
        if (gift.quantity !== 1) { busy = true; setQty(gift.key, 1).then(function () { verifyFreeThenFinish(); }); return; }
        // present + qty 1: make sure it's actually free
        if (gift.final_line_price > 0) { busy = true; blockedUntilChange = true; setQty(gift.key, 0).then(function () { done(true); }); return; }
        emitState(units, gift.quantity); // all good
      } else {
        if (gift) { busy = true; setQty(gift.key, 0).then(function () { done(true); }); return; }
        emitState(units, 0);
      }
    }).catch(function () { busy = false; });
  }

  // After adding / clamping the gift, re-fetch and confirm it came back at $0.
  // If not (native discount not applied), pull it back out and block re-adding
  // until the next real cart change — so we never charge for the "free" hat and
  // never thrash add/remove.
  function verifyFreeThenFinish() {
    getCart().then(function (cart) {
      var gift = findGift(cart);
      if (gift && gift.final_line_price > 0) {
        blockedUntilChange = true;
        setQty(gift.key, 0).then(function () { done(true); });
      } else {
        done(true);
      }
    }).catch(function () { done(true); });
  }

  // Progress state for a nudge ("Add 1 more item to get a free hat!"). Consumers
  // can listen for `cl:freegift:state`; we don't inject drawer markup here.
  function emitState(units, giftQty) {
    var remaining = Math.max(0, CONFIG.threshold - (units || 0));
    lastState = { paidUnits: units || 0, threshold: CONFIG.threshold, remaining: remaining, earned: remaining === 0, giftInCart: !!giftQty };
    document.dispatchEvent(new CustomEvent('cl:freegift:state', { detail: lastState }));
    scheduleDom();
  }

  // ----- Disable qty controls on the gift line (AMP drawer + cart page) -----
  // Prevents the customer bumping the gift qty and briefly seeing an extra unit
  // at full price. The JS clamp and the Function cap remain safety fallbacks.
  // Only our property-marked line is affected — a normal purchase of the same
  // variant keeps its controls (drawer matched by index, cart page by line key).
  //   - AMP drawer: `.amp-cart__cart-line` correlates by index with cart.items
  //     (same convention as cl-bundle-cart.liquid); `giftIndex` set in evaluate().
  //   - Cart page: `.cart-item[data-cartitem-key]` matched by the gift's line key.
  var giftIndex = -1, giftKey = null;
  var DRAWER_SELS = ['.amp-cart__line-quantity-selector-input',
    '.amp-cart__line-quantity-selector-less', '.amp-cart__line-quantity-selector-more'];
  var PAGE_SELS = ['.quantity-selector__input', '.quantity-selector__button'];
  function disableIn(el, sels) { sels.forEach(function (s) { var c = el.querySelector(s); if (c) { c.setAttribute('disabled', 'disabled'); c.setAttribute('tabindex', '-1'); } }); }
  function enableIn(el, sels) { sels.forEach(function (s) { var c = el.querySelector(s); if (c) { c.removeAttribute('disabled'); c.removeAttribute('tabindex'); } }); }
  function applyLock() {
    // AMP drawer (by index)
    document.querySelectorAll('.amp-cart__cart-line').forEach(function (line, i) {
      if (i === giftIndex && giftIndex >= 0) { line.classList.add('cl-buy2-gift-line'); disableIn(line, DRAWER_SELS); }
      else if (line.classList.contains('cl-buy2-gift-line')) { line.classList.remove('cl-buy2-gift-line'); enableIn(line, DRAWER_SELS); }
    });
    // Cart page (by line key)
    document.querySelectorAll('.cart-item[data-cartitem-key]').forEach(function (line) {
      var isGift = giftKey && line.getAttribute('data-cartitem-key') === giftKey;
      if (isGift) { line.classList.add('cl-buy2-gift-line'); disableIn(line, PAGE_SELS); }
      else if (line.classList.contains('cl-buy2-gift-line')) { line.classList.remove('cl-buy2-gift-line'); enableIn(line, PAGE_SELS); }
    });
  }
  // ----- Progress nudge ("Add 1 more item to get your free gift!") -----
  // Injected into the AMP drawer's `.amp-cart__rewards` banner area (same anchor
  // the pack-builder milestone banners use) and above the cart-page item list.
  // Stable id so it's updated in place, not duplicated; re-applied on re-render.
  var lastState = null;
  function nudgeHtml() {
    if (!lastState || !CONFIG.giftVariantId) return '';
    var label = (CONFIG.label || 'free gift');
    var labelLc = label.toLowerCase();
    if (lastState.paidUnits <= 0) return ''; // empty cart — don't nag
    if (lastState.earned) {
      return lastState.giftInCart
        ? '🎁 <strong>' + esc(label) + '</strong> unlocked — added to your cart!'
        : '';
    }
    var n = lastState.remaining;
    return 'Add <strong>' + n + '</strong> more item' + (n === 1 ? '' : 's') + ' to get your ' + esc(labelLc) + '!';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function renderNudge() {
    var html = nudgeHtml();
    // Drawer
    var rw = document.querySelector('.amp-cart__rewards');
    if (rw) {
      var n1 = rw.querySelector('#cl-freegift-nudge');
      if (!html) { if (n1) n1.remove(); }
      else { if (!n1) { n1 = document.createElement('div'); n1.id = 'cl-freegift-nudge'; n1.className = 'cl-freegift-nudge'; rw.insertBefore(n1, rw.firstChild); } if (n1.innerHTML !== html) n1.innerHTML = html; }
      rw.style.display = rw.textContent.trim() ? '' : 'none'; // mirror tidyRewards
    }
    // Cart page (above the item list)
    var list = document.querySelector('[data-cart-item-list]');
    if (list && list.parentNode) {
      var n2 = document.getElementById('cl-freegift-nudge-page');
      if (!html) { if (n2) n2.remove(); }
      else { if (!n2) { n2 = document.createElement('div'); n2.id = 'cl-freegift-nudge-page'; n2.className = 'cl-freegift-nudge cl-freegift-nudge--page'; list.parentNode.insertBefore(n2, list); } if (n2.innerHTML !== html) n2.innerHTML = html; }
    }
  }

  function applyDom() { applyLock(); renderNudge(); }
  // The drawer/cart re-render asynchronously after a cart change (replacing the
  // line nodes, dropping our attributes/nudge) — re-apply on a few delays and on DOM mutation.
  function scheduleDom() { [0, 150, 500].forEach(function (d) { setTimeout(applyDom, d); }); }
  (function () {
    var css = '.cl-buy2-gift-line .amp-cart__line-quantity-selector,' +
      '.cl-buy2-gift-line .quantity-selector{opacity:.5!important;pointer-events:none!important;cursor:not-allowed!important;}' +
      '.cl-freegift-nudge{background:#eef8ff;color:#0a4b6e;border:1px solid #bfe4fb;border-radius:8px;' +
      'padding:9px 12px;margin:0;font-size:13px;line-height:1.35;text-align:center;}' +
      '.cl-freegift-nudge--page{margin:0 0 14px;}' +
      // Hide AMP's empty rewards progress bar in the drawer (Diane 2026-09-17).
      '.amp-cart__rewards-progress-bar{display:none;}';
    var st = document.createElement('style'); st.textContent = css; (document.head || document.documentElement).appendChild(st);
    var t, lastLines = -1;
    new MutationObserver(function () {
      clearTimeout(t);
      t = setTimeout(function () {
        applyDom();
        // A change in the number of drawer lines means the cart changed via the
        // drawer (remove/add) — re-evaluate. Our fetch/XHR hook doesn't always
        // catch iCart's own request path, so this is the reliable drawer signal.
        var n = document.querySelectorAll('.amp-cart__cart-line').length;
        if (n !== lastLines) { lastLines = n; if (!busy) { blockedUntilChange = false; schedule(); } }
      }, 60);
    }).observe(document.documentElement, { childList: true, subtree: true });
  })();

  // Chain the AMP drawer's cart-update callback so any drawer-side change
  // (remove, quantity) re-runs evaluate. Preserves any existing handler.
  (function () {
    var prev = window.AMP_CART_UPDATED;
    window.AMP_CART_UPDATED = function (cart, cartTarget) {
      if (typeof prev === 'function') { try { prev(cart, cartTarget); } catch (e) {} }
      if (!busy) { blockedUntilChange = false; schedule(); }
    };
  })();

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(function () { scheduled = false; evaluate(); }, 250);
  }

  // Detect cart mutations made by the theme/customer (not by us).
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var p = origFetch(input, init);
    if (!busy && /\/cart\/(add|change|update|clear)(\.js)?(\?|$)/.test(url)) {
      p.then(function () { blockedUntilChange = false; schedule(); }).catch(function () {});
    }
    return p;
  };
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.addEventListener('load', function () {
      if (!busy && typeof url === 'string' && /\/cart\/(add|change|update|clear)(\.js)?(\?|$)/.test(url)) {
        blockedUntilChange = false; schedule();
      }
    });
    return origOpen.apply(this, arguments);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', evaluate);
  } else {
    evaluate();
  }
})();
