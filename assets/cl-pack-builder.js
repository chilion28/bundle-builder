/*
 * cl-pack-builder.js
 * ---------------------------------------------------------------------------
 * Pack-builder engine for the CityLocs collection builder, rewritten to drive
 * the NEW cl-pack-grid cards (.cl-grid-card / [data-cl-add] / inline
 * [data-cl-perso-input]) instead of the legacy gp-product cards.
 *
 * Background: the grid was migrated to cl-pack-grid.js (theme asset), but the
 * GemPages builder script that owned the summary/add/checkout still read
 * gp-product cards — so it found zero cards and nothing could be added. That
 * inline GemPages script keeps getting reverted on republish, so this engine
 * lives as a THEME ASSET (republish-proof) and takes authority: every builder
 * interaction is handled in the CAPTURE phase with stopImmediatePropagation so
 * the stale inline builder can never double-handle or wipe the summary.
 *
 * Reuses the original builder's summary/discount/gift/milestone/checkout logic;
 * only the card-reading + add-wiring is new.
 * ------------------------------------------------------------------------- */
(function () {
  'use strict';
  if (window.__clPackBuilderInit) return;

  function boot() {
    var grid = document.querySelector('[data-cl-pack-grid]');
    var summary = document.querySelector('.cl-golf-summary');
    if (!grid || !summary) return; // not a builder page
    window.__clPackBuilderInit = true;

    var selected = new Map();
    var unlockedGiftTierKeys = new Set();
    var clCheckoutInProgress = false;

    // ---- config (from window.CL_BUILDER_CONFIG, emitted by the section) ----
    function cfgVal(value, fallback) {
      if (value && typeof value === 'object' && 'value' in value) return value.value || fallback;
      return value || fallback;
    }
    function normalizeMilestones(value) {
      var raw = value;
      if (raw && typeof raw === 'object' && 'value' in raw) raw = raw.value;
      if (Array.isArray(raw)) return raw.map(Number).filter(function (q) { return q > 0; });
      if (typeof raw === 'string') {
        try {
          var parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed.map(Number).filter(function (q) { return q > 0; });
        } catch (e) {
          return raw.replace(/[\[\]]/g, '').split(',').map(function (i) { return Number(i.trim()); }).filter(function (q) { return q > 0; });
        }
      }
      return [3, 12, 24];
    }
    function capitalize(t) { return String(t || '').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }

    var C = window.CL_BUILDER_CONFIG || {};
    var builderConfig = {
      title: cfgVal(C.title, 'Build Your Pack'),
      itemSingular: cfgVal(C.itemSingular, 'item'),
      itemPlural: cfgVal(C.itemPlural, 'items'),
      addButtonText: cfgVal(C.addButtonText, 'Add Selected Items to Cart'),
      addToBundleText: 'Add to Pack',
      milestones: normalizeMilestones(C.milestones),
      milestoneStyle: cfgVal(C.milestoneStyle, 'dots'),
      giftTiers: Array.isArray(C.giftTiers)
        ? C.giftTiers.map(function (t) {
            return { minQty: Number(t.minQty) || 0, variants: (Array.isArray(t.variants) ? t.variants : []).map(function (v) { return Object.assign({}, v, { id: Number(v.id), price: Number(v.price) }); }) };
          }).filter(function (t) { return t.minQty > 0 && t.variants.length; }).sort(function (a, b) { return a.minQty - b.minQty; })
        : [],
      freeGiftLabel: cfgVal(C.freeGiftLabel, 'Free gift')
    };
    var packSizes = Array.from(new Set(builderConfig.milestones.map(Number).filter(function (q) { return q > 0; }))).sort(function (a, b) { return a - b; });
    var selectedPackSize = packSizes[packSizes.length - 1] || 3;
    var selectedMilestones = [0].concat(packSizes);
    var maxPackSize = Math.max.apply(null, packSizes.length ? packSizes : [selectedPackSize]);

    // ---- discount rules (per handle, from the CityLocs app) ----
    var discountRulesByHandle = new Map();
    var availabilityByVariantId = new Map();
    var defaultDiscountRule = { key: 'default', qtys: [1], amounts: [0], name: builderConfig.itemSingular };
    function isVariantAvailable(id) { var v = availabilityByVariantId.get(Number(id)); return v === undefined ? true : !!v; }

    function money(cents) { return '$ ' + (cents / 100).toFixed(2); }
    function normalizeImage(src) { if (!src) return ''; return src.indexOf('//') === 0 ? 'https:' + src : src; }
    function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

    // ---- personalization helpers ----
    function personalizationHash(p) { if (!p) return ''; var keys = Object.keys(p).filter(function (k) { return p[k] !== '' && p[k] != null; }).sort(); return keys.map(function (k) { return k + '=' + p[k]; }).join('|'); }
    function makeItemKey(vid, p) { var h = personalizationHash(p); return h ? vid + '::' + h : String(vid); }
    function readPersonalization(card) {
      var out = {};
      card.querySelectorAll('[data-cl-perso-input]').forEach(function (i) {
        var v = (i.value || '').trim();
        if (v) out[i.getAttribute('data-cl-perso-input')] = v;
      });
      return out;
    }
    function isPersonalized(card) { return card.hasAttribute('data-cl-personalized'); }
    function persoValid(card) {
      if (card.__clPerso && typeof card.__clPerso.valid === 'boolean') return card.__clPerso.valid;
      // fallback: every listed field non-empty except "* Two" optional lines
      var labels = [];
      try { labels = JSON.parse(card.getAttribute('data-cl-perso-fields') || '[]'); } catch (e) {}
      var vals = readPersonalization(card);
      return labels.every(function (l) { return /Two$/.test(l) || (vals[l] || '').length > 0; });
    }

    // ---- card reading (NEW grid) ----
    function getCurrentVariant(card) {
      var vid = Number(card.getAttribute('data-cl-variant-id'));
      var list = [];
      try { list = JSON.parse(card.querySelector('[data-cl-variants]').textContent); } catch (e) {}
      return list.find(function (v) { return Number(v.id) === vid; }) || null;
    }
    function getCardData(card) {
      var v = getCurrentVariant(card);
      var vid = v ? Number(v.id) : Number(card.getAttribute('data-cl-variant-id'));
      var price = v ? Number(v.price) : Number(card.getAttribute('data-cl-price')) || 0;
      var handle = card.getAttribute('data-cl-handle') || '';
      var title = card.getAttribute('data-cl-title') || capitalize(builderConfig.itemSingular);
      var image = normalizeImage((v && v.image) || card.getAttribute('data-cl-image') || (card.querySelector('[data-cl-card-image]') || {}).src || '');
      // variant label: the colour (last option) tends to be the meaningful swatch
      var variant = v ? v.title : (card.getAttribute('data-cl-variant-title') || '');
      var rule = discountRulesByHandle.get(handle) || defaultDiscountRule;
      return {
        key: String(vid), variantId: vid, title: title, variant: variant, price: price, image: image,
        handle: handle, discountKey: rule.key, discountRule: rule,
        available: v ? v.available !== false : isVariantAvailable(vid),
        personalized: isPersonalized(card)
      };
    }
    function getProductHandles() {
      var set = new Set();
      document.querySelectorAll('.cl-grid-card').forEach(function (c) { var h = c.getAttribute('data-cl-handle'); if (h) set.add(h); });
      return Array.from(set);
    }
    function refreshItemDiscountRule(item) {
      var rule = discountRulesByHandle.get(item.handle) || defaultDiscountRule;
      return Object.assign({}, item, { discountKey: rule.key, discountRule: rule });
    }

    function getTotalSelectedQty() { var s = 0; selected.forEach(function (i) { s += i.qty || 0; }); return s; }
    function isPackFull() { return getTotalSelectedQty() >= maxPackSize; }

    // ---- progress / discount / gift text (from original) ----
    function getProgressMessage(totalQty) {
      var m = packSizes; if (!m.length) return '';
      if (m.length === 1) {
        var target = m[0];
        var gt = builderConfig.giftTiers.find(function (t) { return t.minQty === target; }) || builderConfig.giftTiers[0];
        var gn = gt ? gt.variants.map(function (v) { return v.title; }).join(' & ') : '';
        if (totalQty >= target) return gn ? '🎉 Reward unlocked — your free ' + gn + ' is included!' : '🎉 Reward unlocked — best price applied!';
        var rem = target - totalQty; var w = rem === 1 ? builderConfig.itemSingular : builderConfig.itemPlural;
        return gn ? "You're " + rem + ' ' + w + ' away!' : 'Add ' + rem + ' more ' + w + ' to unlock your discount.';
      }
      if (totalQty === 0) return 'Add ' + m[0] + ' ' + builderConfig.itemPlural + ' to unlock your first reward.';
      var next = m.find(function (x) { return totalQty < x; });
      if (!next) return "🎉 You've reached the top reward — best discount unlocked!";
      var r = next - totalQty; var word = r === 1 ? builderConfig.itemSingular : builderConfig.itemPlural;
      return 'Add ' + r + ' more ' + word + ' to unlock the next reward.';
    }
    function getNextGiftTier(q) { return builderConfig.giftTiers.find(function (t) { return q < t.minQty; }) || null; }
    function getNextMilestone(q) { return packSizes.find(function (m) { return q < m; }) || packSizes[packSizes.length - 1] || 0; }

    function getRepresentativeBasePrice() {
      var counts = {}, best = 0;
      document.querySelectorAll('.cl-grid-card').forEach(function (c) { var p = getCardData(c).price; if (p > 0) { counts[p] = (counts[p] || 0) + 1; if (counts[p] > (counts[best] || 0)) best = p; } });
      return best;
    }
    function getRepresentativeDiscountRule() { var it = discountRulesByHandle.values().next(); return it.value || defaultDiscountRule; }
    function getDiscountIndexForRule(q, rule) { var idx = 0, qtys = (rule && rule.qtys) || [1]; for (var i = 0; i < qtys.length; i++) if (q >= qtys[i]) idx = i; return idx; }
    function perItemPriceAtQty(q) {
      var rule = getRepresentativeDiscountRule(), base = getRepresentativeBasePrice(), idx = getDiscountIndexForRule(q, rule);
      var d = q > 1 ? Number(rule.amounts[idx] || 0) : 0;
      return { price: Math.max(0, base - Math.round(d * 100)), discounted: d > 0 };
    }
    function getDiscountDataByGroup(items) {
      var groups = new Map();
      items.forEach(function (item) { var rule = item.discountRule || defaultDiscountRule, key = item.discountKey || rule.key || 'default'; if (!groups.has(key)) groups.set(key, { key: key, rule: rule, qty: 0, discountPerItem: 0 }); groups.get(key).qty += item.qty; });
      groups.forEach(function (g) { var idx = getDiscountIndexForRule(g.qty, g.rule); g.discountPerItem = g.qty > 1 ? Number(g.rule.amounts[idx] || 0) : 0; });
      return groups;
    }
    function groupSummaryItems(items) {
      var groups = new Map();
      items.forEach(function (item) { if (!groups.has(item.title)) groups.set(item.title, { title: item.title, qty: 0, items: [] }); var g = groups.get(item.title); g.qty += item.qty; g.items.push(item); });
      return Array.from(groups.values());
    }

    // ---- milestone/progress rendering ----
    var milestoneLabels = document.querySelector('[data-cl-milestone-labels]');
    var milestoneDots = document.querySelector('[data-cl-milestone-dots]');
    function renderMilestoneSlots() {
      var bar = document.querySelector('.cl-golf-milestones'); if (bar) bar.classList.add('cl-style-slots');
      var total = selectedPackSize;
      if (milestoneLabels) milestoneLabels.innerHTML = '<span class="cl-slot-label" data-cl-slot-label><strong>0</strong> of ' + total + ' ' + capitalize(builderConfig.itemPlural) + '</span>';
      if (milestoneDots) { var h = ''; for (var i = 0; i < total; i++) h += '<span class="cl-slot" data-cl-slot="' + (i + 1) + '"></span>'; milestoneDots.innerHTML = h; }
    }
    function renderProgressDots() {
      if (builderConfig.milestoneStyle === 'slots') return renderMilestoneSlots();
      selectedMilestones = [0].concat(packSizes);
      if (milestoneLabels) milestoneLabels.innerHTML = selectedMilestones.map(function (q) { return '<span>' + q + '</span>'; }).join('');
      if (milestoneDots) milestoneDots.innerHTML = selectedMilestones.map(function (q) { return '<span class="cl-golf-milestone-dot ' + (q === selectedPackSize ? 'is-target' : '') + '" data-cl-milestone-dot data-qty="' + q + '">' + q + '</span>'; }).join('');
    }
    function updateMilestoneSlots(totalQty) {
      document.querySelectorAll('[data-cl-slot]').forEach(function (s) { s.classList.toggle('is-filled', totalQty >= Number(s.dataset.clSlot)); });
      var label = document.querySelector('[data-cl-slot-label]'); if (label) { var shown = Math.min(totalQty, selectedPackSize); label.innerHTML = '<strong>' + shown + '</strong> of ' + selectedPackSize + ' ' + capitalize(builderConfig.itemPlural); }
      var msg = document.querySelector('[data-cl-current-discount]'); if (msg) msg.textContent = getProgressMessage(totalQty);
    }
    function updateMilestones(totalQty) {
      if (builderConfig.milestoneStyle === 'slots') return updateMilestoneSlots(totalQty);
      var fill = document.querySelector('[data-cl-progress-fill]'); var msg = document.querySelector('[data-cl-current-discount]');
      if (fill) {
        var pm = selectedMilestones, maxQ = pm[pm.length - 1], pct = 0;
        if (totalQty >= maxQ) pct = 100; else for (var i = 0; i < pm.length - 1; i++) { var st = pm[i], en = pm[i + 1]; if (totalQty >= st && totalQty <= en) { var seg = 100 / (pm.length - 1); pct = i * seg + ((totalQty - st) / (en - st)) * seg; break; } }
        fill.style.width = pct + '%';
      }
      var next = selectedMilestones.find(function (m) { return m > 0 && totalQty < m; });
      document.querySelectorAll('[data-cl-milestone-dot]').forEach(function (dot) { var q = Number(dot.dataset.qty); dot.classList.toggle('is-complete', q > 0 && totalQty >= q); dot.classList.toggle('is-target', q === next); });
      if (msg) msg.textContent = getProgressMessage(totalQty);
    }
    function renderRewardCard(totalQty) {
      var focus = getNextMilestone(totalQty);
      var titleEl = document.querySelector('[data-cl-pack-title]'); if (titleEl) titleEl.textContent = focus ? focus + '-' + capitalize(builderConfig.itemSingular) + ' Pack' : builderConfig.title;
      var pill = document.querySelector('[data-cl-reward-pill]');
      if (pill) { var pp = perItemPriceAtQty(focus); if (focus > 0 && totalQty >= focus) { pill.textContent = money(pp.price) + ' / ' + builderConfig.itemSingular + ' ✓'; pill.classList.add('is-unlocked'); } else { pill.textContent = 'Unlock ' + money(pp.price) + '/' + builderConfig.itemSingular + ' when you buy ' + focus; pill.classList.remove('is-unlocked'); } }
      var giftEl = document.querySelector('[data-cl-reward-gift]');
      if (giftEl) { var gt = builderConfig.giftTiers.find(function (t) { return t.minQty === focus; }) || getNextGiftTier(totalQty); if (gt) { giftEl.textContent = 'Free gift: ' + gt.variants.map(function (v) { return v.title; }).join(' & '); giftEl.style.display = ''; } else giftEl.style.display = 'none'; }
      var giftRow = document.querySelector('[data-cl-gift-row]'); if (giftRow) giftRow.hidden = !builderConfig.giftTiers.some(function (t) { return totalQty >= t.minQty; });
    }
    function renderGiftProgressBanner(totalQty) {
      var el = document.querySelector('[data-cl-gift-progress]');
      if (packSizes.length <= 1) { if (el) el.remove(); return; }
      var tier = getNextGiftTier(totalQty);
      if (!tier) { if (el) el.remove(); return; }
      if (!el) { el = document.createElement('div'); el.setAttribute('data-cl-gift-progress', ''); el.className = 'cl-gift-progress-banner'; var a = document.querySelector('.cl-golf-milestones'); if (a) a.insertAdjacentElement('afterend', el); }
      var rem = tier.minQty - totalQty, w = rem === 1 ? builderConfig.itemSingular : builderConfig.itemPlural;
      el.textContent = "You're " + rem + ' ' + w + ' away from your free ' + tier.variants.map(function (v) { return v.title; }).join(' & ') + '!';
    }
    function renderMobileRewardBar(totalQty) {
      var t = document.querySelector('[data-cl-mobile-reward-text]'), f = document.querySelector('[data-cl-mobile-reward-fill]');
      if (!t && !f) return; var cap = maxPackSize;
      if (f) f.style.width = (cap ? Math.min(100, (totalQty / cap) * 100) : 0) + '%';
      if (!t) return;
      if (totalQty === 0) { var first = packSizes[0] || 1; t.textContent = 'Add ' + first + ' ' + builderConfig.itemPlural + ' → ' + money(perItemPriceAtQty(first).price) + '/' + builderConfig.itemSingular; return; }
      if (!packSizes.some(function (m) { return totalQty < m; })) { t.textContent = '🎉 Best price unlocked — ' + money(perItemPriceAtQty(cap).price) + '/' + builderConfig.itemSingular; return; }
      var focus = getNextMilestone(totalQty), rem = focus - totalQty, w = rem === 1 ? builderConfig.itemSingular : builderConfig.itemPlural;
      var gs = builderConfig.giftTiers.find(function (x) { return x.minQty === focus; }) ? ' + free gift' : '';
      t.textContent = rem + ' more ' + w + ' → ' + money(perItemPriceAtQty(focus).price) + '/' + builderConfig.itemSingular + gs;
    }
    function updateNavCartBadge(count) { var b = document.querySelector('[data-header-cart-count], .site-header-cart--count'); if (!b) return; b.setAttribute('data-header-cart-count', count); b.classList.toggle('visible', count > 0); }
    function updatePackFullUI(totalQty) { document.documentElement.classList.toggle('cl-pack-is-full', totalQty >= maxPackSize); }

    // ---- summary render ----
    function renderSummary() {
      var list = document.querySelector('.cl-golf-summary-list');
      var empty = document.querySelector('.cl-golf-summary-empty');
      var totalQtyEl = document.querySelector('[data-cl-total-qty]');
      var subtotalEl = document.querySelector('[data-cl-subtotal]');
      var discountEl = document.querySelector('[data-cl-discount]');
      var estEl = document.querySelector('[data-cl-estimated-total]');
      var checkoutBtn = document.querySelector('.cl-golf-checkout');
      if (!list || !totalQtyEl || !subtotalEl || !checkoutBtn) return;

      var items = Array.from(selected.values()).filter(function (i) { return i.qty > 0; });
      var totalQty = items.reduce(function (s, i) { return s + i.qty; }, 0);
      var subtotal = items.reduce(function (s, i) { return s + i.qty * i.price; }, 0);

      syncCards();
      updatePackFullUI(totalQty);
      updateNavCartBadge(totalQty);
      updateMilestones(totalQty);
      renderGiftProgressBanner(totalQty);
      renderRewardCard(totalQty);
      renderMobileRewardBar(totalQty);

      var groups = getDiscountDataByGroup(items);
      var totalDiscount = items.reduce(function (s, i) { var g = groups.get(i.discountKey); return s + Math.round((g && g.discountPerItem || 0) * i.qty * 100); }, 0);
      var estTotal = Math.max(0, subtotal - totalDiscount);

      if (empty) empty.style.display = items.length ? 'none' : 'block';
      totalQtyEl.textContent = totalQty;
      subtotalEl.textContent = money(subtotal);
      if (discountEl) discountEl.textContent = totalDiscount > 0 ? '- ' + money(totalDiscount) : '$ 0.00';
      var saveRow = document.querySelector('[data-cl-save-row]'); if (saveRow) saveRow.classList.toggle('has-savings', totalDiscount > 0);
      if (estEl) estEl.textContent = money(estTotal);
      var mc = document.querySelector('[data-cl-mobile-pack-count]'); if (mc) mc.textContent = totalQty;

      checkoutBtn.disabled = totalQty < 1;
      checkoutBtn.textContent = totalQty < 1 ? 'Add ' + builderConfig.itemPlural + ' to get started' : 'Go to Checkout (' + money(estTotal) + ')';

      if (!items.length) { list.innerHTML = ''; renderGifts(list, 0); return; }

      var summaryGroups = groupSummaryItems(items);
      list.innerHTML = summaryGroups.map(function (group) {
        var first = group.items[0];
        var gd = groups.get(first.discountKey);
        var dpi = (gd && gd.discountPerItem) || 0;
        var dprice = Math.max(0, first.price - Math.round(dpi * 100));
        var priceHtml = dpi > 0
          ? '<div class="cl-golf-summary-group-price"><s>' + money(first.price) + '</s> <strong>' + money(dprice) + '</strong> <span>each</span> <span class="cl-golf-summary-save-badge">Save $' + dpi.toFixed(2) + '</span></div>'
          : '<div class="cl-golf-summary-group-price"><strong>' + money(first.price) + '</strong> <span>each</span></div>';
        return '<div class="cl-golf-summary-group"><div class="cl-golf-summary-group-head"><span>' + escapeHtml(group.title) + '</span><span class="cl-golf-summary-group-count">x' + group.qty + '</span></div>' + priceHtml +
          group.items.map(function (item) {
            var pk = escapeHtml(item.key);
            function qtyBoxHtml(extra) {
              return '<div class="cl-golf-summary-qty' + (extra ? ' ' + extra : '') + '"><button type="button" data-summary-minus="' + pk + '">-</button><input type="number" min="0" max="' + maxPackSize + '" value="' + item.qty + '" data-summary-qty-input="' + pk + '"><button type="button" data-summary-plus="' + pk + '">+</button></div>';
            }
            if (item.personalization && Object.keys(item.personalization).length) {
              var lines = Object.keys(item.personalization).map(function (k) { return '<div class="cl-perso-line"><span>' + escapeHtml(k) + '</span><strong>' + escapeHtml(item.personalization[k]) + '</strong></div>'; }).join('');
              return '<div class="cl-golf-summary-variant-row cl-is-personalized"><img src="' + item.image + '" alt=""><div class="cl-golf-summary-variant">' + (item.variant ? '<div>' + escapeHtml(item.variant) + '</div>' : '') + '<div class="cl-perso-lines">' + lines + '</div><div class="cl-perso-actions"><button type="button" data-cl-remove-key="' + pk + '">Remove</button></div></div>' + qtyBoxHtml('cl-perso-qty') + '</div>';
            }
            return '<div class="cl-golf-summary-variant-row"><img src="' + item.image + '" alt=""><div class="cl-golf-summary-variant">' + (item.variant || '') + '</div>' + qtyBoxHtml('') + '</div>';
          }).join('') + '</div>';
      }).join('');
      renderGifts(list, totalQty);
    }

    function renderGifts(list, totalQty) {
      var html = builderConfig.giftTiers.flatMap(function (tier) {
        var unlocked = totalQty >= tier.minQty; var justUnlocked = unlocked && !unlockedGiftTierKeys.has(tier.minQty);
        if (unlocked) unlockedGiftTierKeys.add(tier.minQty); else unlockedGiftTierKeys.delete(tier.minQty);
        return tier.variants.map(function (gift) {
          if (unlocked) return '<div class="cl-free-gift-preview ' + (justUnlocked ? 'cl-gift-unlock-pulse' : '') + '"><img src="' + normalizeImage(gift.image) + '" alt=""><div class="cl-free-gift-wrap"><div class="cl-free-gift-title">' + escapeHtml(gift.title) + '</div><div class="cl-free-gift-label">' + escapeHtml(builderConfig.freeGiftLabel || 'Free gift included') + '</div><div class="cl-golf-summary-price"><s>' + money(gift.price) + '</s> <strong>$ 0.00</strong></div></div><div class="cl-free-gift-badge">FREE</div></div>';
          var rem = tier.minQty - totalQty; var w = rem === 1 ? builderConfig.itemSingular : builderConfig.itemPlural;
          var lockSvg = '<svg height="20" width="20" viewBox="0 0 256 256" fill="currentColor"><path fill="currentColor" d="M208,76H180V56A52,52,0,0,0,76,56V76H48A20,20,0,0,0,28,96V208a20,20,0,0,0,20,20H208a20,20,0,0,0,20-20V96A20,20,0,0,0,208,76ZM100,56a28,28,0,0,1,56,0V76H100ZM204,204H52V100H204Zm-76-92a32,32,0,0,0-12,61.66V180a12,12,0,0,0,24,0v-6.34A32,32,0,0,0,128,112Zm0,24a8,8,0,1,1-8,8A8,8,0,0,1,128,136Z"></path></svg>';
          return '<div class="cl-free-gift-preview is-locked"><img src="' + normalizeImage(gift.image) + '" alt=""><div class="cl-free-gift-wrap"><div class="cl-free-gift-title">' + escapeHtml(gift.title) + '</div><div class="cl-free-gift-label">Add ' + rem + ' more ' + w + ' to unlock</div><div class="cl-golf-summary-price"><strong>' + money(gift.price) + '</strong></div></div><div class="cl-free-gift-lock-badge">' + lockSvg + '</div></div>';
        });
      }).join('');
      if (html) list.insertAdjacentHTML('afterbegin', html);
    }

    function updateSelectedItem(key, newQty) {
      var item = selected.get(key); if (!item) return;
      if (newQty <= 0) selected.delete(key); else selected.set(key, refreshItemDiscountRule(Object.assign({}, item, { qty: newQty })));
      renderSummary();
    }

    // ---- card UI (added/in-pack states on the grid) ----
    function syncCards() {
      document.querySelectorAll('.cl-grid-card').forEach(function (card) {
        var btn = card.querySelector('[data-cl-add]'); if (!btn) return;
        var data = getCardData(card);
        var productTotal = 0; selected.forEach(function (i) { if (i.handle === data.handle) productTotal += i.qty || 0; });
        var activeQty = (selected.get(data.key) || {}).qty || 0;
        var full = isPackFull();
        card.classList.toggle('cl-in-pack', productTotal > 0);
        if (data.personalized) {
          btn.classList.remove('is-added');
          btn.classList.toggle('is-pack-full', full && productTotal === 0);
          btn.disabled = full && productTotal === 0;
          btn.textContent = full && productTotal === 0 ? 'Your pack is full' : (productTotal > 0 ? 'Add Another (' + productTotal + ')' : 'Personalize & Add');
        } else if (activeQty > 0) {
          btn.disabled = true; btn.classList.add('is-added'); btn.classList.remove('is-pack-full'); btn.textContent = '✓ Added';
        } else if (!data.available) {
          btn.disabled = true; btn.classList.remove('is-added'); btn.classList.add('is-pack-full'); btn.textContent = 'Sold out';
        } else if (full) {
          btn.disabled = true; btn.classList.remove('is-added'); btn.classList.add('is-pack-full'); btn.textContent = 'Your pack is full';
        } else {
          btn.disabled = false; btn.classList.remove('is-added', 'is-pack-full'); btn.textContent = builderConfig.addToBundleText;
        }
      });
    }

    function addFromCard(card) {
      var data = getCardData(card);
      if (data.personalized) {
        if (!persoValid(card)) { if (card.__clPerso && card.__clPerso.promptMissing) card.__clPerso.promptMissing(); return; }
        if (isPackFull()) return;
        var perso = readPersonalization(card);
        var key = makeItemKey(data.variantId, perso);
        var existing = selected.get(key);
        selected.set(key, refreshItemDiscountRule(Object.assign({}, data, { key: key, qty: existing ? existing.qty + 1 : 1, personalization: perso })));
        renderSummary();
        return;
      }
      // non-personalized toggle
      var cur = (selected.get(data.key) || {}).qty || 0;
      if (cur > 0) { selected.delete(data.key); renderSummary(); return; }
      if (!data.available || isPackFull()) return;
      selected.set(data.key, refreshItemDiscountRule(Object.assign({}, data, { qty: 1 })));
      renderSummary();
    }

    // ---- cart integration (from original) ----
    function getCurrentCollectionHandle() { return (window.location.pathname.split('/collections/')[1] || '').split('/')[0].split('?')[0] || ''; }
    function clearExistingBundleFromCart(handle) {
      if (!handle) return Promise.resolve();
      return fetch('/cart.js').then(function (r) { return r.json(); }).then(function (cart) {
        var updates = {}; cart.items.forEach(function (it) { if ((it.properties || {})._bundle_collection === handle) updates[it.key] = 0; });
        if (!Object.keys(updates).length) return; return fetch('/cart/update.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates: updates }) });
      });
    }
    function restoreBundleFromCart() {
      var handle = getCurrentCollectionHandle(); if (!handle) return Promise.resolve();
      return fetch('/cart.js').then(function (r) { return r.json(); }).then(function (cart) {
        var bundleItems = cart.items.filter(function (it) { return it.properties && it.properties._bundle_collection === handle && it.properties._bundle_item === 'true'; });
        if (!bundleItems.length) return;
        selected.clear();
        bundleItems.forEach(function (ci) {
          var perso = {}; Object.keys(ci.properties || {}).forEach(function (k) { if (k.charAt(0) === '_' || k === 'Pack') return; perso[k] = ci.properties[k]; });
          var key = makeItemKey(ci.variant_id, perso);
          selected.set(key, { key: key, variantId: Number(ci.variant_id), title: ci.product_title, variant: ci.variant_title || '', price: ci.original_price, image: normalizeImage(ci.image || (ci.featured_image || {}).url || ''), qty: ci.quantity, handle: ci.handle, discountKey: 'default', discountRule: defaultDiscountRule, personalization: Object.keys(perso).length ? perso : undefined });
        });
        renderSummary();
      });
    }
    function addSelectedToCart() {
      var bundleId = 'cl-pack-' + Date.now(); var bundleName = builderConfig.title; var bundleCollection = getCurrentCollectionHandle();
      var chosen = Array.from(selected.values()).filter(function (i) { return i.qty > 0 && i.variantId; });
      var unavailable = chosen.filter(function (i) { return !isVariantAvailable(i.variantId); });
      if (unavailable.length) { unavailable.forEach(function (i) { selected.delete(i.key); }); renderSummary(); return; }
      if (!chosen.length) return;
      var totalQty = chosen.reduce(function (s, i) { return s + i.qty; }, 0);
      var props = function (extra) { return Object.assign({ _builder: bundleName, _bundle_id: bundleId, _bundle_name: bundleName, _bundle_size: String(totalQty), _bundle_max: String(maxPackSize), _bundle_collection: bundleCollection, Pack: bundleName }, extra); };
      var selectedItems = chosen.map(function (item) { return { id: Number(item.variantId), quantity: item.qty, properties: Object.assign({}, item.personalization || {}, props({ _bundle_item: 'true' })) }; });
      var giftItems = builderConfig.giftTiers.filter(function (t) { return totalQty >= t.minQty; }).flatMap(function (t) { return t.variants.map(function (g) { return { id: Number(g.id), quantity: 1, properties: props({ _bundle_free_gift: 'true', _bundle_free_gift_min: String(t.minQty), _bundle_free_gift_label: builderConfig.freeGiftLabel }) }; }); });
      var items = selectedItems.concat(giftItems);
      var btn = document.querySelector('.cl-golf-checkout'); btn.disabled = true; btn.textContent = 'Preparing checkout...';
      clCheckoutInProgress = true; window.clCheckoutInProgress = true;
      clearExistingBundleFromCart(bundleCollection).then(function () {
        return fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: items }) });
      }).then(function (res) {
        if (!res.ok) { return res.json().catch(function () { return {}; }).then(function (d) { clCheckoutInProgress = false; window.clCheckoutInProgress = false; btn.disabled = false; btn.textContent = builderConfig.addButtonText; }); }
        btn.textContent = 'Going to checkout...'; window.location.href = '/checkout';
      }).catch(function () { clCheckoutInProgress = false; window.clCheckoutInProgress = false; btn.textContent = 'Something went wrong'; btn.disabled = false; });
    }

    function loadDiscounts() {
      var handles = getProductHandles(); if (!handles.length) { renderSummary(); return; }
      Promise.all(handles.map(function (handle) {
        return fetch('/products/' + handle + '.js').then(function (r) { return r.json(); }).then(function (product) {
          (product.variants || []).forEach(function (v) { availabilityByVariantId.set(Number(v.id), v.available !== false); });
          var tags = Array.isArray(product.tags) ? product.tags : []; if (!tags.length) return;
          return fetch('/apps/citylocs/discount-info?tags=' + encodeURIComponent(JSON.stringify(tags))).then(function (r) { return r.json(); }).then(function (data) {
            if (data.discountBreak && data.discountAmount) {
              discountRulesByHandle.set(handle, { key: data.tag || tags.join('|') || handle, tag: data.tag || '', qtys: [1].concat(data.discountBreak.map(Number)), amounts: [0].concat(data.discountAmount.map(Number)), name: data.discountMessage || builderConfig.itemSingular });
            }
          });
        }).catch(function () {});
      })).then(function () {
        var changed = false;
        selected.forEach(function (item, key) { var r = refreshItemDiscountRule(item); if (r.discountKey !== item.discountKey) { selected.set(key, r); changed = true; } });
        renderSummary();
      });
    }

    // ---- wire up: capture-phase so the stale inline builder can't interfere ----
    document.addEventListener('click', function (e) {
      var addBtn = e.target.closest && e.target.closest('[data-cl-add]');
      if (addBtn) { var card = addBtn.closest('.cl-grid-card'); if (card) { e.preventDefault(); e.stopImmediatePropagation(); addFromCard(card); } return; }

      var plus = e.target.closest && e.target.closest('[data-summary-plus]');
      if (plus && plus.closest('.cl-golf-summary')) { e.preventDefault(); e.stopImmediatePropagation(); if (isPackFull()) return; var it = selected.get(plus.getAttribute('data-summary-plus')); if (it) updateSelectedItem(it.key, it.qty + 1); return; }
      var minus = e.target.closest && e.target.closest('[data-summary-minus]');
      if (minus && minus.closest('.cl-golf-summary')) { e.preventDefault(); e.stopImmediatePropagation(); var im = selected.get(minus.getAttribute('data-summary-minus')); if (im) updateSelectedItem(im.key, im.qty - 1); return; }
      var rm = e.target.closest && e.target.closest('[data-cl-remove-key]');
      if (rm) { e.preventDefault(); e.stopImmediatePropagation(); selected.delete(rm.getAttribute('data-cl-remove-key')); renderSummary(); return; }
      var clear = e.target.closest && e.target.closest('[data-cl-clear-pack]');
      if (clear) { e.preventDefault(); e.stopImmediatePropagation(); selected.clear(); renderSummary(); clearExistingBundleFromCart(getCurrentCollectionHandle()); return; }
      var checkout = e.target.closest && e.target.closest('.cl-golf-checkout');
      if (checkout) { e.preventDefault(); e.stopImmediatePropagation(); addSelectedToCart(); return; }
    }, true);

    document.addEventListener('change', function (e) {
      var qtyInput = e.target.closest && e.target.closest('[data-summary-qty-input]');
      if (!qtyInput || !qtyInput.closest('.cl-golf-summary')) return;
      e.stopImmediatePropagation();
      var key = qtyInput.getAttribute('data-summary-qty-input'); var it = selected.get(key); if (!it) return;
      var without = getTotalSelectedQty() - it.qty; var req = Math.max(0, Number(qtyInput.value) || 0);
      updateSelectedItem(key, Math.min(req, maxPackSize - without));
    }, true);

    // Re-sync card "Added" states when a swatch changes (cl-pack-grid dispatches this).
    document.addEventListener('cl:variant-change', syncCards);
    document.addEventListener('cl:perso-change', syncCards);

    // ---- init ----
    if (document.querySelector('.cl-golf-summary h3') && builderConfig.title) { var h = document.querySelector('.cl-golf-summary h3'); if (h && !h.textContent.trim()) h.textContent = builderConfig.title; }
    renderProgressDots();
    renderSummary();
    restoreBundleFromCart().then(loadDiscounts);
    // Beat the stale inline builder's async render, then own the summary.
    setTimeout(renderSummary, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
