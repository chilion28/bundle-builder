/*
 * cl-free-gift-buy2.js — "Buy any 2 items, get 1 free hat" auto-gift manager.
 *
 * Storefront half of the promo. The ZEROING (making the hat $0) is done by a
 * native Shopify "Buy X Get Y" automatic discount (buy 2 → 1 hat at 100% off);
 * this script only AUTO-ADDS / AUTO-REMOVES the gift so the customer never has
 * to find it, and never gets charged for it:
 *   - paid units (everything except the gift) >= 2  → add 1 gift hat
 *   - paid units < 2                                → remove the gift
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
    // The stock-clearance hat variant. Set via window.CL_FREE_GIFT_VARIANT_ID
    // (e.g. a theme setting or inline <script>) so it's a one-line swap when the
    // real hat product is created. PLACEHOLDER 0 = promo inert until set.
    giftVariantId: String(window.CL_FREE_GIFT_VARIANT_ID || '') || null,
    threshold: 2, // paid units required to earn the gift
    prop: '_free_gift', // line-item property marking our gift line
    propVal: 'buy2-hat'
  };

  var busy = false; // true while WE mutate the cart (suppress re-entrancy)
  var blockedUntilChange = false; // set if the gift came back not-$0; cleared on the next real cart change
  var scheduled = false;

  function isGiftLine(it) {
    return (CONFIG.giftVariantId && String(it.variant_id) === CONFIG.giftVariantId) ||
      (it.properties && it.properties[CONFIG.prop] === CONFIG.propVal);
  }
  function paidUnits(cart) {
    return (cart.items || []).reduce(function (n, it) { return isGiftLine(it) ? n : n + it.quantity; }, 0);
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
    document.dispatchEvent(new CustomEvent('cl:freegift:state', {
      detail: { paidUnits: units || 0, threshold: CONFIG.threshold, remaining: remaining, earned: remaining === 0, giftInCart: !!giftQty }
    }));
  }

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
