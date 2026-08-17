/* =====================================================================
   cl-bundle-builder.js  —  CityLocs Pack Builder engine (SHARED ASSET)
   Single source of truth for the Create-Your-Pack bundle builder:
   product-grid wiring, sidebar summary, milestone/reward tracker, cart.

   Consumed by a slim per-page wrapper that:
     (a) emits window.CL_BUILDER_CONFIG from collection.metafields.custom.*
     (b) drops a mount point:  <div data-cl-pack-summary></div>
     (c) loads this file + cl-bundle-builder.css via asset_url.

   renderSummaryShell() (below) injects the summary panel skeleton into the
   mount so the panel HTML lives in ONE place and can never drift again.
   Source of truth for the engine body: golf section gp-section-623576563790643742
   (lines 1906-4040 at extraction time). Do not fork inline again.
   ===================================================================== */
document.addEventListener('DOMContentLoaded', () => {

  /* --- renderSummaryShell: inject the summary panel skeleton once --- */
  (function renderSummaryShell() {
    var mount = document.querySelector('[data-cl-pack-summary]');
    if (!mount || mount.getAttribute('data-cl-shell-rendered')) return;
    mount.innerHTML = `    <div class="cl-golf-summary">

  <button type="button" class="cl-mobile-summary-close" data-cl-mobile-summary-close>
    Keep Shopping
  </button>

  <div class="cl-golf-summary-head">
    <h3 data-cl-pack-title>Build Your Pack</h3>
    <button type="button" class="cl-clear-pack" data-cl-clear-pack>Clear</button>
  </div>

  <div class="cl-golf-reward-card">
    <div class="cl-golf-reward-top">
      <span class="cl-golf-reward-label">Pack Reward</span>
      <span class="cl-golf-reward-pill" data-cl-reward-pill></span>
    </div>

    <div class="cl-golf-milestones">
      <div class="cl-golf-milestone-line">
        <div class="cl-golf-progress-track">
          <span class="cl-golf-progress-fill" data-cl-progress-fill></span>
        </div>
        <div class="cl-golf-milestone-dots" data-cl-milestone-dots></div>
      </div>
      <div class="cl-golf-milestone-labels" data-cl-milestone-labels></div>
    </div>

    <div class="cl-golf-current-discount" data-cl-current-discount>
      Add items to unlock savings.
    </div>
    <div class="cl-golf-reward-gift" data-cl-reward-gift></div>
  </div>

  <div class="cl-golf-summary-empty" data-cl-empty-message>
    No items added yet.
  </div>

  <div class="cl-golf-summary-list"></div>

  <div class="cl-golf-summary-footer">
    <div class="cl-golf-summary-row">
      <span data-cl-total-label>Total Items</span>
      <strong data-cl-total-qty>0</strong>
    </div>

    <div class="cl-golf-summary-row">
      <span>Subtotal</span>
      <strong data-cl-subtotal>$ 0.00</strong>
    </div>

    <div class="cl-golf-summary-row cl-golf-summary-save" data-cl-save-row>
      <span>You Save</span>
      <strong data-cl-discount>$ 0.00</strong>
    </div>

    <div class="cl-golf-summary-row cl-golf-summary-giftrow" data-cl-gift-row hidden>
      <span>Free gift</span>
      <strong>Included</strong>
    </div>

    <div class="cl-golf-summary-row cl-golf-summary-total">
      <strong>Estimated Total</strong>
      <strong data-cl-estimated-total>$ 0.00</strong>
    </div>

    <button type="button" class="cl-golf-checkout" disabled>
      Add Selected Items to Cart
    </button>

    <div class="cl-golf-summary-microcopy"></div>
  </div>
</div>

<!--MOBILE-->
<div class="cl-mobile-pack-bar" data-cl-mobile-pack-bar>
  <button type="button" class="cl-mobile-pack-toggle" data-cl-mobile-pack-toggle>
    <span class="cl-mobile-reward">
      <span class="cl-mobile-reward-text" data-cl-mobile-reward-text>Add items to unlock savings</span>
      <span class="cl-mobile-reward-track">
        <span class="cl-mobile-reward-fill" data-cl-mobile-reward-fill></span>
      </span>
    </span>
    <span class="cl-mobile-pack-cta">
      <span data-cl-mobile-pack-title>Review Pack</span>
      <strong data-cl-mobile-pack-count>0</strong>
    </span>
  </button>
</div>



<!--MODAL-->


<div class="cl-product-modal" data-cl-product-modal>
  <div class="cl-product-modal-backdrop" data-cl-modal-close></div>

  <div class="cl-product-modal-box">
    <button type="button" class="cl-product-modal-close" data-cl-modal-close>
      ×
    </button>

    <div class="cl-product-modal-grid">
      <div>
        <img class="cl-product-modal-image"
         data-cl-modal-image
         src=""
         alt="">
        <div class="cl-product-modal-thumbs" data-cl-modal-thumbs></div>
      </div>

      <div>
        <h3 data-cl-modal-title></h3>
        <div class="cl-product-modal-price" data-cl-modal-price></div>
        <div class="cl-product-modal-variant" data-cl-modal-variant></div>
        <div class="cl-product-modal-description" data-cl-modal-description></div>
        
        <div class="cl-product-modal-actions">
          <button type="button" class="cl-product-modal-add" data-cl-modal-add>
          Add to Bundle
        </button>
        
          <div class="cl-product-modal-qty" data-cl-modal-qty>
            <button type="button" data-cl-modal-minus>-</button>
            <span data-cl-modal-count>0</span>
            <button type="button" data-cl-modal-plus>+</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
    mount.setAttribute('data-cl-shell-rendered', '1');
  })();

    const selected = new Map();
    const unlockedGiftTierKeys = new Set();
    const cardControls = new Map();
    const cardSyncers = [];


    let activeModalCard = null;
    let clCheckoutInProgress = false;

    function normalizeConfigValue(value, fallback) {
    if (value && typeof value === 'object' && 'value' in value) return value.value || fallback;
    return value || fallback;
  }



    function normalizeMilestones(value) {
  const fallback = [3, 12, 24];

  let raw = value;

  if (raw && typeof raw === 'object' && 'value' in raw) {
    raw = raw.value;
  }

  if (Array.isArray(raw)) {
    return raw.map(Number).filter(qty => qty > 0);
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed)) {
        return parsed.map(Number).filter(qty => qty > 0);
      }
    } catch (e) {
      return raw
        .replace(/[\[\]]/g, '')
        .split(',')
        .map(item => Number(item.trim()))
        .filter(qty => qty > 0);
    }
  }

  return fallback;
}

    function capitalize(text) {
  return String(text || '').replace(/\b\w/g, char => char.toUpperCase());
}

    const builderConfig = {
    title: normalizeConfigValue(window.CL_BUILDER_CONFIG?.title, 'Build Your Pack'),
    itemSingular: normalizeConfigValue(window.CL_BUILDER_CONFIG?.itemSingular, 'item'),
    itemPlural: normalizeConfigValue(window.CL_BUILDER_CONFIG?.itemPlural, 'items'),
    addButtonText: normalizeConfigValue(window.CL_BUILDER_CONFIG?.addButtonText, 'Add Selected Items to Cart'),
    addToBundleText: 'Add to Bundle',
    milestones: normalizeMilestones(window.CL_BUILDER_CONFIG?.milestones),
    milestoneStyle: normalizeConfigValue(window.CL_BUILDER_CONFIG?.milestoneStyle, 'dots'),
    giftTiers: Array.isArray(window.CL_BUILDER_CONFIG?.giftTiers)
  ? window.CL_BUILDER_CONFIG.giftTiers
      .map(tier => ({
        minQty: Number(tier.minQty) || 0,
        variants: (Array.isArray(tier.variants) ? tier.variants : [])
          .map(v => ({ ...v, id: Number(v.id), price: Number(v.price) }))
      }))
      .filter(tier => tier.minQty > 0 && tier.variants.length)
      .sort((a, b) => a.minQty - b.minQty)
  : [],
    freeGiftVariants: Array.isArray(window.CL_BUILDER_CONFIG?.freeGiftVariants)
  ? window.CL_BUILDER_CONFIG.freeGiftVariants.map(Number).filter(Boolean)
  : [],
  freeGiftProducts: Array.isArray(window.CL_BUILDER_CONFIG?.freeGiftProducts)
  ? window.CL_BUILDER_CONFIG.freeGiftProducts
  : [],
    freeGiftPackSize: Number(normalizeConfigValue(window.CL_BUILDER_CONFIG?.freeGiftPackSize, 0)) || 0,
    freeGiftDiscountCode: normalizeConfigValue(window.CL_BUILDER_CONFIG?.freeGiftDiscountCode, ''),
    freeGiftLabel: normalizeConfigValue(window.CL_BUILDER_CONFIG?.freeGiftLabel, 'Free gift')
      };



    const packSizes = [...new Set(
      builderConfig.milestones.map(Number).filter(qty => qty > 0)
    )].sort((a, b) => a - b);

    // Pack is now the full milestone range; rewards unlock at each milestone.
    let selectedPackSize = packSizes[packSizes.length - 1] || 3;
    let lastSyncedQty = 0;

    let selectedMilestones = [0, ...packSizes];

    const maxPackSize = Math.max(...packSizes);

    function packLabel(size) {
  return `${size}-${capitalize(builderConfig.itemSingular)} Pack`;
}

    function getTotalSelectedQty() {
  return Array.from(selected.values())
    .reduce((sum, item) => sum + (item.qty || 0), 0);
}

    function isPackFull() {
  return getTotalSelectedQty() >= maxPackSize;
}

        function updatePackFullUI(totalQty) {
  const full = totalQty >= maxPackSize;
  document.documentElement.classList.toggle('cl-pack-is-full', full);

  // Card buttons are owned by each card's updateCardUI, so an "✓ Added" card
  // keeps that state (and stays removable) even when the pack is full.
  document.querySelectorAll('[data-summary-plus], [data-cl-modal-plus]').forEach(btn => {
    btn.disabled = full;
  });
}



  const summaryTitle = document.querySelector('.cl-golf-summary h3');
  const checkoutBtn = document.querySelector('.cl-golf-checkout');
  const milestoneLabels = document.querySelector('[data-cl-milestone-labels]');
  const milestoneDots = document.querySelector('[data-cl-milestone-dots]');
  const currentDiscountText = document.querySelector('[data-cl-current-discount]');
  const totalLabel = document.querySelector('[data-cl-total-label]');
  const emptyMessage = document.querySelector('[data-cl-empty-message]');

  const packSizeOptions = document.querySelector('[data-cl-pack-size-options]');

        function renderPackSizeButtons() {
  if (!packSizeOptions) return;
  // Pack size is no longer chosen by the customer — milestones unlock rewards instead.
  packSizeOptions.innerHTML = '';
  packSizeOptions.style.display = 'none';
  document.querySelector('.cl-selected-pack-note')?.remove();
}

        function renderMilestoneSlots() {
  document.querySelector('.cl-golf-milestones')?.classList.add('cl-style-slots');

  const total = selectedPackSize;

  if (milestoneLabels) {
    milestoneLabels.innerHTML =
      `<span class="cl-slot-label" data-cl-slot-label><strong>0</strong> of ${total} ${capitalize(builderConfig.itemPlural)}</span>`;
  }

  if (milestoneDots) {
    milestoneDots.innerHTML = Array.from({ length: total }, (_, i) =>
      `<span class="cl-slot" data-cl-slot="${i + 1}"></span>`
    ).join('');
  }
}

    function updateMilestoneSlots(totalQty) {
  const message = document.querySelector('[data-cl-current-discount]');

  document.querySelectorAll('[data-cl-slot]').forEach(slot => {
    slot.classList.toggle('is-filled', totalQty >= Number(slot.dataset.clSlot));
  });

  const label = document.querySelector('[data-cl-slot-label]');
  if (label) {
    const shown = Math.min(totalQty, selectedPackSize);
    label.innerHTML = `<strong>${shown}</strong> of ${selectedPackSize} ${capitalize(builderConfig.itemPlural)}`;
  }

    // Stray progress line retired — the labeled reward tracks + CTA box now
    // carry this messaging.
    message.style.display = 'none';
}


    function renderProgressDots() {
    if (builderConfig.milestoneStyle === 'slots') return renderMilestoneSlots();
  selectedMilestones = [0, ...packSizes];

  if (milestoneLabels) {
    milestoneLabels.innerHTML = selectedMilestones
      .map(qty => `<span>${qty}</span>`)
      .join('');
  }

  if (milestoneDots) {
    milestoneDots.innerHTML = selectedMilestones
      .map(qty => `
        <span
          class="cl-golf-milestone-dot ${qty === selectedPackSize ? 'is-target' : ''}"
          data-cl-milestone-dot
          data-qty="${qty}">
          ${qty}
        </span>
      `)
      .join('');
  }
}

    function setPackSize() { /* pack size is fixed to the full milestone range */ }

    function syncPackSizeToQty(totalQty) { lastSyncedQty = totalQty; }

    renderPackSizeButtons();
    renderProgressDots();

  if (summaryTitle) summaryTitle.textContent = builderConfig.title;
  if (checkoutBtn) checkoutBtn.textContent = builderConfig.addButtonText;
  if (totalLabel) totalLabel.textContent = `Total ${capitalize(builderConfig.itemPlural)}`;
  if (emptyMessage) emptyMessage.textContent = `No ${builderConfig.itemPlural} added yet.`;



    if (currentDiscountText) {
  currentDiscountText.textContent =
    `Add ${packSizes[0] || 1} ${builderConfig.itemPlural} to unlock your first reward.`;
}

    let discountQtys = [1];
    let discountAmounts = [0];
    let discountName = builderConfig.itemSingular;

    const discountRulesByHandle = new Map();
    
        const availabilityByVariantId = new Map();
    function isVariantAvailable(variantId) {
      const v = availabilityByVariantId.get(Number(variantId));
      return v === undefined ? true : !!v;
    }

    const defaultDiscountRule = {
      key: 'default',
      qtys: [1],
      amounts: [0],
      name: builderConfig.itemSingular
   };

    function money(cents) {
    return `$ ${(cents / 100).toFixed(2)}`;
  }

    function normalizeImage(src) {
    if (!src) return '';
    return src.startsWith('//') ? `https:${src}` : src;
  }

    function getProductHandlesFromCards() {
    const handles = new Set();

    document.querySelectorAll('gp-product').forEach(card => {
      try {
        const raw = card.getAttribute('gp-data') || card.getAttribute('gp-context');
        if (!raw) return;

        const data = JSON.parse(raw);

        if (data.productHandle) handles.add(data.productHandle);

        if (data.productUrl) {
          const match = data.productUrl.match(/\/products\/([^/?#]+)/);
          if (match && match[1]) handles.add(match[1]);
        }
      } catch (e) {}
    });

    return Array.from(handles);
  }

    async function getPageProductTags() {
    const tags = new Set();
    const handles = getProductHandlesFromCards();

    for (const handle of handles) {
      try {
        const res = await fetch(`/products/${handle}.js`);
        const product = await res.json();

        if (Array.isArray(product.tags)) {
          product.tags.forEach(tag => tags.add(tag));
        }
      } catch (error) {
        console.warn(`Could not fetch product tags for ${handle}`, error);
      }
    }

    return Array.from(tags);
  }


    async function loadCityLocsDiscount() {
  const handles = getProductHandlesFromCards();
  if (!handles.length) { renderSummary(); return; }

  await Promise.all(handles.map(async (handle) => {
    try {
            const product = await fetch(`/products/${handle}.js`).then(r => r.json());
      (product.variants || []).forEach(v => availabilityByVariantId.set(Number(v.id), v.available !== false));
      cardSyncers.forEach(refresh => refresh());
      const productTags = Array.isArray(product.tags) ? product.tags : [];
      if (!productTags.length) return;

      const data = await fetch(
        `/apps/citylocs/discount-info?tags=${encodeURIComponent(JSON.stringify(productTags))}`
      ).then(r => r.json());

      if (data.discountBreak && data.discountAmount) {
        const rule = {
          key: data.tag || productTags.join('|') || handle,
          tag: data.tag || '',
          qtys: [1, ...data.discountBreak.map(Number)],
          amounts: [0, ...data.discountAmount.map(Number)],
          name: data.discountMessage || builderConfig.itemSingular
        };
        discountRulesByHandle.set(handle, rule);
        if (discountQtys.length === 1) {
          discountQtys = rule.qtys;
          discountAmounts = rule.amounts;
          discountName = rule.name;
        }
      }
    } catch (error) {
      console.warn(`Could not load discount rule for ${handle}`, error);
    }
  }));

  renderSummary();
}


    function getDiscountIndex(totalQty) {
    let idx = 0;

    for (let i = 0; i < discountQtys.length; i++) {
      if (totalQty >= discountQtys[i]) idx = i;
    }

    return idx;
  }

    function getDiscountMessage(totalQty) {
  return getProgressMessage(totalQty);
}

    function getProductHandleFromCard(card) {
  try {
    const raw = card.getAttribute('gp-data') || card.getAttribute('gp-context');
    if (!raw) return '';

    const data = JSON.parse(raw);

    if (data.productHandle) return data.productHandle;
    if (data.product?.handle) return data.product.handle;

    if (data.productUrl) {
      const match = data.productUrl.match(/\/products\/([^/?#]+)/);
      if (match && match[1]) return match[1];
    }

    return '';
  } catch (e) {
    return '';
  }
}

    // ---- Inventory guard ----
    // Use product.js availability as the single source of truth. GemPages can
    // leave stale inventory_quantity data in the card after a swatch change,
    // while product.js reflects Shopify's sell policy for each variant.
    function getCardStock(card) {
      const form = card && card.querySelector('form[action="/cart/add"]');
      const variantId = form && form.querySelector('input[name="id"]')?.value;
      return isVariantAvailable(variantId) ? Infinity : 0;
    }

    // Stock cap carried on a selected item (Infinity when untracked).
    function stockOf(item) {
      const s = item && item.stock;
      return (typeof s === 'number' && isFinite(s)) ? s : Infinity;
    }

    // Inline "Only N left" note above the add button, so a low cap is visible
    // BEFORE the customer hits it (only for tracked, low, in-stock variants).
    function renderStockHint(addBtn, stock, activeQty) {
      if (!addBtn) return;
      const LOW_STOCK_AT = 10;
      const show = isFinite(stock) && stock > 0 && stock <= LOW_STOCK_AT;
      let hint = addBtn.parentNode
        ? addBtn.parentNode.querySelector('[data-cl-stock-hint]')
        : null;

      if (!show) { if (hint) hint.remove(); return; }

      if (!hint) {
        hint = document.createElement('div');
        hint.setAttribute('data-cl-stock-hint', '');
        hint.className = 'cl-stock-hint';
        addBtn.insertAdjacentElement('beforebegin', hint);
      }

      hint.textContent = `Only ${stock} left in stock!`;
      hint.classList.toggle('is-maxed', activeQty >= stock);
    }

    function getCardData(card) {
    const form = card.querySelector('form[action="/cart/add"]');
    const variantInput = form?.querySelector('input[name="id"]');
    const title = card.querySelector('h2')?.textContent?.trim() || capitalize(builderConfig.itemSingular);
    const priceText = card.querySelector('.gp-price')?.textContent?.replace(/[^0-9.]/g, '') || '0';
    const price = Math.round(parseFloat(priceText) * 100) || 0;

    const image = normalizeImage(
      card.querySelector('.featured-image-only')?.getAttribute('src') ||
      card.querySelector('.featured-image-only')?.getAttribute('base-src') ||
      card.querySelector('.featured-image-only')?.getAttribute('data-src') ||
      ''
    );

    const variant = card.querySelector('.variant-display span')?.textContent?.trim() || '';
    const variantId = variantInput?.value;

    const handle = getProductHandleFromCard(card);
    const discountRule = discountRulesByHandle.get(handle) || defaultDiscountRule;

    return {
      key: variantId || form?.id,
      variantId: Number(variantId),
      title,
      variant,
      price,
      image,
      handle,
      discountKey: discountRule.key,
      discountRule,
      stock: getCardStock(card)
    };
  }

    function updateMilestones(totalQty) {
    if (builderConfig.milestoneStyle === 'slots') return updateMilestoneSlots(totalQty);
  const fill = document.querySelector('[data-cl-progress-fill]');
  const message = document.querySelector('[data-cl-current-discount]');

  if (!fill || !message) return;

  const progressMilestones = selectedMilestones;
  const maxQty = progressMilestones[progressMilestones.length - 1];

  let progressPercent = 0;

  if (totalQty >= maxQty) {
    progressPercent = 100;
  } else {
    for (let i = 0; i < progressMilestones.length - 1; i++) {
      const start = progressMilestones[i];
      const end = progressMilestones[i + 1];

      if (totalQty >= start && totalQty <= end) {
        const segmentPercent = 100 / (progressMilestones.length - 1);
        const segmentProgress = (totalQty - start) / (end - start);

        progressPercent = (i * segmentPercent) + (segmentProgress * segmentPercent);
        break;
      }
    }
  }

  fill.style.width = `${progressPercent}%`;

  const nextMilestone = selectedMilestones.find(m => m > 0 && totalQty < m);

  document.querySelectorAll('[data-cl-milestone-dot]').forEach(dot => {
    const qty = Number(dot.dataset.qty);
    dot.classList.toggle('is-complete', qty > 0 && totalQty >= qty);
    dot.classList.toggle('is-target', qty === nextMilestone);
    dot.textContent = qty;
  });

    // Stray progress line retired — the labeled reward tracks + CTA box now
    // carry this messaging.
    message.style.display = 'none';
}

    function groupSummaryItems(items) {
      const groups = new Map();

      items.forEach(item => {
        const groupKey = item.title;

        if (!groups.has(groupKey)) {
          groups.set(groupKey, {
            title: item.title,
            qty: 0,
            items: []
          });
        }

        const group = groups.get(groupKey);
        group.qty += item.qty;
        group.items.push(item);
      });

      return Array.from(groups.values());
    }

    function getDiscountIndexForRule(totalQty, rule) {
  let idx = 0;
  const qtys = rule?.qtys || [1];

  for (let i = 0; i < qtys.length; i++) {
    if (totalQty >= qtys[i]) idx = i;
  }

  return idx;
}

    function getDiscountDataByGroup(items) {
  const groups = new Map();

  items.forEach(item => {
    const rule = item.discountRule || defaultDiscountRule;
    const key = item.discountKey || rule.key || 'default';

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        rule,
        qty: 0,
        discountPerItem: 0
      });
    }

    groups.get(key).qty += item.qty;
  });

  groups.forEach(group => {
    const idx = getDiscountIndexForRule(group.qty, group.rule);
    group.discountPerItem =
      group.qty > 1 ? Number(group.rule.amounts[idx] || 0) : 0;
  });

  return groups;
}

       function renderDiscountBreakdown(discountGroups) {
  const rows = [];

  discountGroups.forEach(group => {
    const discountPerItem = group.discountPerItem || 0;
    const savings = Math.round(discountPerItem * group.qty * 100);
    if (savings <= 0) return;
    rows.push({
      name: group.rule?.name || builderConfig.itemPlural,
      qty: group.qty,
      savings
    });
  });

  // Itemise only when there are MULTIPLE discount groups (e.g. hats + towels).
  // For a single group it just repeats the "You Save" total below — hide it.
  if (rows.length < 2) return '';

  const totalSavings = rows.reduce((sum, row) => sum + row.savings, 0);

  return `
    <div class="cl-discount-breakdown">
      <div class="cl-discount-breakdown-title">Bundle Discounts</div>
      ${rows.map(row => `
        <div class="cl-discount-breakdown-row">
          <span>${row.name}s (${row.qty})</span>
          <strong>${money(row.savings)}</strong>
        </div>
      `).join('')}
      <div class="cl-discount-breakdown-row cl-discount-breakdown-total">
        <span>Total Savings</span>
        <strong>${money(totalSavings)}</strong>
      </div>
    </div>
  `;
}

    function showPackNotice(message) {
  let notice = document.querySelector('[data-cl-pack-notice]');

  if (!notice) {
    notice = document.createElement('div');
    notice.setAttribute('data-cl-pack-notice', '');
    notice.className = 'cl-pack-notice';

    const target =
      document.querySelector('.cl-golf-message') ||
      document.querySelector('.cl-golf-milestones');

    if (target) target.insertAdjacentElement('afterend', notice);
  }

  notice.textContent = message;
  notice.classList.add('is-visible');

  clearTimeout(window.clPackNoticeTimer);

  window.clPackNoticeTimer = setTimeout(() => {
    notice.remove();
  }, 4000);
}

function getGiftForPack() {
  // A gift tier that unlocks exactly at the current pack size.
  return builderConfig.giftTiers.find(t => t.minQty === selectedPackSize) || null;
}

function getProgressMessage(totalQty) {
  const milestones = packSizes;
  if (!milestones.length) return '';

  // Single pack size → only one reward, so speak to the gift/discount directly.
  if (milestones.length === 1) {
    const target = milestones[0];
    const giftTier = builderConfig.giftTiers.find(t => t.minQty === target) || builderConfig.giftTiers[0];
    const giftName = giftTier ? giftTier.variants.map(v => v.title).join(' & ') : '';

    if (totalQty >= target) {
      return giftName
        ? `🎉 Reward unlocked — your free ${giftName} is included!`
        : `🎉 Reward unlocked — best price applied!`;
    }

    const remaining = target - totalQty;
    const itemWord = remaining === 1 ? builderConfig.itemSingular : builderConfig.itemPlural;
    return giftName
    //   ? `You're ${remaining} ${itemWord} away. from your free ${giftName}!`
      ? `You're ${remaining} ${itemWord} away!`
      : `Add ${remaining} more ${itemWord} to unlock your discount.`;
  }

  // Multiple milestones → progress toward the next one.
  if (totalQty === 0) {
    return `Add ${milestones[0]} ${builderConfig.itemPlural} to unlock your first reward.`;
  }

  const next = milestones.find(m => totalQty < m);
  if (!next) {
    return `🎉 You've reached the top reward — best discount unlocked!`;
  }

  const remaining = next - totalQty;
  const itemWord = remaining === 1 ? builderConfig.itemSingular : builderConfig.itemPlural;
  return `Add ${remaining} more ${itemWord} to unlock the next reward.`;
}


function getNextGiftTier(totalQty) {
  return builderConfig.giftTiers.find(tier => totalQty < tier.minQty) || null;
}

function getGiftProgressMessage(totalQty) {
  const tier = getNextGiftTier(totalQty);
  if (!tier) return '';

  const remaining = tier.minQty - totalQty;
  const itemWord = remaining === 1 ? builderConfig.itemSingular : builderConfig.itemPlural;
  const giftNames = tier.variants.map(v => v.title).join(' & ');

  return `You're ${remaining} ${itemWord} away from your free ${giftNames}!`;
    
}

function renderGiftProgressBanner(totalQty) {
  let el = document.querySelector('[data-cl-gift-progress]');

  // Single pack size: the gift is already folded into the main progress line.
  if (packSizes.length <= 1) { el?.remove(); return; }

  const tier = getNextGiftTier(totalQty);

  if (!tier) {
    el?.remove();
    return;
  }

  if (!el) {
    el = document.createElement('div');
    el.setAttribute('data-cl-gift-progress', '');
    el.className = 'cl-gift-progress-banner';
    const anchor = document.querySelector('.cl-golf-milestones');
    if (anchor) anchor.insertAdjacentElement('afterend', el);
  }
  el.textContent = getGiftProgressMessage(totalQty);
}

    function updateNavCartBadge(count) {
  const badge = document.querySelector('[data-header-cart-count], .site-header-cart--count');
  if (!badge) return;
  badge.setAttribute('data-header-cart-count', count);
  badge.classList.toggle('visible', count > 0);
}


    function getRepresentativeBasePrice() {
  const counts = {};
  let best = 0;
  document.querySelectorAll('gp-product').forEach(card => {
    const p = getCardData(card).price;
    if (p > 0) {
      counts[p] = (counts[p] || 0) + 1;
      if (counts[p] > (counts[best] || 0)) best = p;   // most common shelf price
    }
  });
  return best;
}

    function getRepresentativeDiscountRule() {
  return discountRulesByHandle.values().next().value || defaultDiscountRule;
}

    function perItemPriceAtQty(qty) {
  const rule = getRepresentativeDiscountRule();
  const basePrice = getRepresentativeBasePrice();
  const idx = getDiscountIndexForRule(qty, rule);
  const perItemDiscount = qty > 1 ? Number(rule.amounts[idx] || 0) : 0;
  return {
    price: Math.max(0, basePrice - Math.round(perItemDiscount * 100)),
    discounted: perItemDiscount > 0
  };
}

    function renderMilestoneValueStrip() {
  const bar = document.querySelector('.cl-golf-milestones');
  if (!bar || !packSizes.length) return;

  let strip = document.querySelector('[data-cl-value-strip]');
  if (!strip) {
    strip = document.createElement('div');
    strip.setAttribute('data-cl-value-strip', '');
    strip.className = 'cl-value-strip';
    bar.insertAdjacentElement('afterend', strip);
  }
  strip.style.gridTemplateColumns = `repeat(${packSizes.length}, 1fr)`;

  strip.innerHTML = packSizes.map(m => {
    const { price, discounted } = perItemPriceAtQty(m);
    const gift = builderConfig.giftTiers.find(t => t.minQty === m);
    const giftHtml = gift ? `<span class="cl-value-strip-gift">+ Free gift</span>` : '';
    return `
      <div class="cl-value-strip-tier">
        <div class="cl-value-strip-qty">${m} ${capitalize(builderConfig.itemPlural)}</div>
        <div class="cl-value-strip-price ${discounted ? '' : 'is-base'}">${money(price)} ea</div>
        ${giftHtml}
      </div>
    `;
  }).join('');
}

    function renderValueHeadline() {
  const h3 = document.querySelector('.cl-golf-summary h3');
  if (!h3) return;

  let el = document.querySelector('[data-cl-value-headline]');
  if (!el) {
    el = document.createElement('div');
    el.setAttribute('data-cl-value-headline', '');
    el.className = 'cl-value-headline';
    h3.insertAdjacentElement('afterend', el);
  }

  const rule = getRepresentativeDiscountRule();
  const maxDiscount = Math.max(0, ...(rule.amounts || [0]).map(Number));
  const topGift = builderConfig.giftTiers[builderConfig.giftTiers.length - 1];

  const parts = [];
  if (maxDiscount > 0) parts.push(`save up to $${maxDiscount.toFixed(2)}/${builderConfig.itemSingular}`);
  if (topGift) parts.push(`a free gift at ${topGift.minQty}`);

  if (!parts.length) { el.remove(); return; }
  el.textContent = `The more you stack, the more you save — ${parts.join(' + ')}.`;
}

    function getNextMilestone(totalQty) {
  return packSizes.find(m => totalQty < m) || packSizes[packSizes.length - 1] || 0;
}

    function renderMobileRewardBar(totalQty) {
  const textEl = document.querySelector('[data-cl-mobile-reward-text]');
  const fillEl = document.querySelector('[data-cl-mobile-reward-fill]');
  if (!textEl && !fillEl) return;

  const cap = maxPackSize;
  if (fillEl) fillEl.style.width = (cap ? Math.min(100, (totalQty / cap) * 100) : 0) + '%';
  if (!textEl) return;

  // Lead with the per-hat price (applies to every hat); append the gift when close.
  if (totalQty === 0) {
    const first = packSizes[0] || 1;
    const { price } = perItemPriceAtQty(first);
    textEl.textContent = `Add ${first} ${builderConfig.itemPlural} → ${money(price)}/${builderConfig.itemSingular}`;
    return;
  }

  const reachedTop = !packSizes.some(m => totalQty < m);
  if (reachedTop) {
    const { price } = perItemPriceAtQty(cap);
    textEl.textContent = `🎉 Best price unlocked — ${money(price)}/${builderConfig.itemSingular}`;
    return;
  }

  const focus = getNextMilestone(totalQty);
  const remaining = focus - totalQty;
  const itemWord = remaining === 1 ? builderConfig.itemSingular : builderConfig.itemPlural;
  const { price } = perItemPriceAtQty(focus);
  const giftSuffix = builderConfig.giftTiers.find(t => t.minQty === focus) ? ' + free gift' : '';
  textEl.textContent = `${remaining} more ${itemWord} → ${money(price)}/${builderConfig.itemSingular}${giftSuffix}`;
}

    function renderRewardCard(totalQty) {
  const focus = getNextMilestone(totalQty);

  // Dynamic "N-Item Pack" title.
  const titleEl = document.querySelector('[data-cl-pack-title]');
  if (titleEl) {
    titleEl.textContent = focus
      ? `${focus}-${capitalize(builderConfig.itemSingular)} Pack`
      : builderConfig.title;
  }

  // Per-item price pill for the focused milestone.
    // Per-item price pill — make it a clear "goal", not the current price.
  const pill = document.querySelector('[data-cl-reward-pill]');
  if (pill) {
    const { price } = perItemPriceAtQty(focus);
    const reached = focus > 0 && totalQty >= focus;
    if (reached) {
      pill.textContent = `${money(price)} / ${builderConfig.itemSingular} ✓`;
      pill.classList.add('is-unlocked');
    } else {
      pill.textContent = `Unlock ${money(price)}/${builderConfig.itemSingular} when you buy ${focus}`;
      pill.classList.remove('is-unlocked');
    }
  }

  // Gift subline retired — the gift now lives in the labeled reward tracks below
  // (see renderRewardTracks), so we hide the old inline "Free gift:" line.
  const giftEl = document.querySelector('[data-cl-reward-gift]');
  if (giftEl) giftEl.style.display = 'none';

  // Footer "Free gift: Included" row.
  const giftRow = document.querySelector('[data-cl-gift-row]');
  if (giftRow) {
    giftRow.hidden = !builderConfig.giftTiers.some(t => totalQty >= t.minQty);
  }
}

    // Two clearly-labeled reward tracks (discount + gift), each self-explanatory
    // with its own count/reward so shoppers never see two conflicting "N more"
    // numbers stacked together. Replaces the old banner + bold line + subline.
    function rewardTrackRow(label, count, reward) {
      return `
        <div class="cl-reward-track">
          <span class="cl-reward-track-label">${label}:</span>
          <span class="cl-reward-track-count">${count}</span>
          <span class="cl-reward-track-arrow">&rarr;</span>
          <span class="cl-reward-track-reward">${reward}</span>
        </div>`;
    }

    function rewardTrackDone(text) {
      return `
        <div class="cl-reward-track is-done">
          <span class="cl-reward-track-label">${text} &#10003;</span>
        </div>`;
    }

    function renderRewardTracks(totalQty) {
      const anchor = document.querySelector('.cl-golf-milestones');
      if (!anchor) return;

      let box = document.querySelector('[data-cl-reward-tracks]');
      if (!box) {
        box = document.createElement('div');
        box.setAttribute('data-cl-reward-tracks', '');
        box.className = 'cl-reward-tracks';
        anchor.insertAdjacentElement('afterend', box);
      }

      // For a SINGLE-milestone builder the two tracks are redundant (both show
      // the same "N more" count) and read as clutter — so we hide them and let
      // the callout carry a combined discount + gift message. Multi-tier
      // builders (e.g. pins) keep the two labeled tracks.
      const multiTier = packSizes.length > 1;
      const rows = [];

      if (multiTier) {
        // Discount track — progress toward the next price milestone.
        const nextD = packSizes.find(m => totalQty < m);
        if (nextD) {
          const remaining = nextD - totalQty;
          const itemWord = remaining === 1 ? builderConfig.itemSingular : builderConfig.itemPlural;
          const { price, discounted } = perItemPriceAtQty(nextD);
          rows.push(rewardTrackRow(
            'Next discount',
            `${remaining} more ${itemWord}`,
            discounted ? `${money(price)}/${builderConfig.itemSingular}` : 'best price'
          ));
        } else {
          rows.push(rewardTrackDone('Best price unlocked'));
        }

        // Gift track — progress toward the next free gift.
        const gTier = getNextGiftTier(totalQty);
        if (gTier) {
          const remaining = gTier.minQty - totalQty;
          const itemWord = remaining === 1 ? builderConfig.itemSingular : builderConfig.itemPlural;
          const giftName = gTier.variants.map(v => v.title).join(' & ');
          rows.push(rewardTrackRow(
            'Free gift',
            `${remaining} more ${itemWord}`,
            giftName
          ));
        } else if (builderConfig.giftTiers.length) {
          const top = builderConfig.giftTiers[builderConfig.giftTiers.length - 1];
          const giftName = top.variants.map(v => v.title).join(' & ');
          rows.push(rewardTrackDone(`Free ${giftName} unlocked`));
        }
      }

      // Primary callout. Also mentions the free gift when a gift unlocks by the
      // next discount milestone (always the case on a single-milestone builder).
      let ctaMsg = '';
      const nextDiscount = packSizes.find(m => totalQty < m);
      if (nextDiscount) {
        const r = nextDiscount - totalQty;
        const w = r === 1 ? builderConfig.itemSingular : builderConfig.itemPlural;
        const giftByThen = builderConfig.giftTiers.some(t => t.minQty > totalQty && t.minQty <= nextDiscount);
        ctaMsg = giftByThen
          ? `Add ${r} more ${w} to unlock your discount and get your free gift`
          : `Add ${r} more ${w} to unlock the next discount`;
      } else {
        const g = getNextGiftTier(totalQty);
        if (g) {
          const r = g.minQty - totalQty;
          const w = r === 1 ? builderConfig.itemSingular : builderConfig.itemPlural;
          const nm = g.variants.map(v => v.title).join(' & ');
          ctaMsg = `Add ${r} more ${w} to unlock your free ${nm}`;
        } else {
          ctaMsg = `🎉 You've unlocked every reward!`;
        }
      }

      const gridHtml = rows.length ? `<div class="cl-reward-tracks-grid">${rows.join('')}</div>` : '';
      const ctaHtml = ctaMsg ? `<div class="cl-reward-cta">${ctaMsg}</div>` : '';

      box.innerHTML = gridHtml + ctaHtml;
      box.style.display = (rows.length || ctaMsg) ? '' : 'none';
    }

    function renderSummary() {
    const list = document.querySelector('.cl-golf-summary-list');
    const empty = document.querySelector('.cl-golf-summary-empty');
    const totalQtyEl = document.querySelector('[data-cl-total-qty]');
    const subtotalEl = document.querySelector('[data-cl-subtotal]');
    const discountEl = document.querySelector('[data-cl-discount]');
    const estimatedTotalEl = document.querySelector('[data-cl-estimated-total]');
    const discountMessageEl = document.querySelector('[data-cl-discount-message]');
    const checkoutBtn = document.querySelector('.cl-golf-checkout');

    if (!list || !empty || !totalQtyEl || !subtotalEl || !checkoutBtn) return;

    const items = Array.from(selected.values()).filter(item => item.qty > 0);
    const totalQty = items.reduce((sum, item) => sum + item.qty, 0);

    // Always clear the old breakdown first; it lives outside the list and outside
// the empty-cart early return, so it otherwise goes stale on Clear Selection.
document.querySelector('.cl-discount-breakdown')?.remove();

    cardSyncers.forEach(refresh => refresh());

    updatePackFullUI(totalQty);
    syncPackSizeToQty(totalQty);
    updateNavCartBadge(totalQty);

    const subtotal = items.reduce((sum, item) => sum + item.qty * item.price, 0);

    const idx = getDiscountIndex(totalQty);

    updateMilestones(totalQty);
    renderRewardTracks(totalQty);
    renderRewardCard(totalQty);
    renderMobileRewardBar(totalQty);

    const discountGroups = getDiscountDataByGroup(items);

    const totalDiscount = items.reduce((sum, item) => {
      const group = discountGroups.get(item.discountKey);
      const discountPerItem = group?.discountPerItem || 0;

      return sum + Math.round(discountPerItem * item.qty * 100);
    }, 0);

    const estimatedTotal = Math.max(0, subtotal - totalDiscount);

    empty.style.display = items.length ? 'none' : 'block';
    totalQtyEl.textContent = totalQty;
    subtotalEl.textContent = money(subtotal);

    if (discountEl) discountEl.textContent = totalDiscount > 0 ? `- ${money(totalDiscount)}` : '$ 0.00';
    document.querySelector('[data-cl-save-row]')?.classList.toggle('has-savings', totalDiscount > 0);
    if (estimatedTotalEl) estimatedTotalEl.textContent = money(estimatedTotal);
    // Old bold "Add N more to unlock the next discount" line retired — the
    // labeled reward tracks (renderRewardTracks) now carry this.
    if (discountMessageEl) discountMessageEl.style.display = 'none';

    checkoutBtn.disabled = totalQty < 1;
    checkoutBtn.textContent = totalQty < 1
      ? `Add ${builderConfig.itemPlural} to get started`
      : `Go to Checkout (${money(estimatedTotal)})`;

    const mobileCount = document.querySelector('[data-cl-mobile-pack-count]');
    const mobileTitle = document.querySelector('[data-cl-mobile-pack-title]');

    if (mobileCount) mobileCount.textContent = totalQty;

    if (mobileTitle) {
      mobileTitle.textContent = totalQty > 0
        ? 'Review Pack or Keep Adding'
        : `Choose ${builderConfig.itemPlural}`;
    }

    // NOTE: no early return when empty — we fall through so the LOCKED gift
    // cards still render (empty groups → empty list, then gift cards are
    // inserted below). Emphasizes the free gift before any items are added.



    const footer = document.querySelector('.cl-golf-summary-footer');
const existingBreakdown = document.querySelector('.cl-discount-breakdown');

if (existingBreakdown) existingBreakdown.remove();

if (footer && totalDiscount > 0) {
  footer.insertAdjacentHTML(
    'beforebegin',
    renderDiscountBreakdown(discountGroups)
  );
}


    const groups = groupSummaryItems(items);

list.innerHTML = groups.map(group => {
  const firstItem = group.items[0];
  const groupDiscountData = discountGroups.get(group.items[0].discountKey);
  const discountPerItem = groupDiscountData?.discountPerItem || 0;

  const discountedPrice = Math.max(
    0,
    firstItem.price - Math.round(discountPerItem * 100)
  );

  const priceHtml = discountPerItem > 0
    ? `
      <div class="cl-golf-summary-group-price">
        <s>${money(firstItem.price)}</s>
        <strong>${money(discountedPrice)}</strong>
        <span>each</span>
        <span class="cl-golf-summary-save-badge">
          Save $${discountPerItem.toFixed(2)}
        </span>
      </div>
    `
    : `
      <div class="cl-golf-summary-group-price">
        <strong>${money(firstItem.price)}</strong>
        <span>each</span>
      </div>
    `;

  return `
    <div class="cl-golf-summary-group">
      <div class="cl-golf-summary-group-head">
        <span>${group.title}</span>
        <span class="cl-golf-summary-group-count">x${group.qty}</span>
      </div>

      ${priceHtml}

      ${group.items.map(item => `
        <div class="cl-golf-summary-variant-row">
          <img src="${item.image}" alt="">

          <div class="cl-golf-summary-variant">
            ${item.variant || ''}
          </div>

          <div class="cl-golf-summary-qty">
            <button type="button" data-summary-minus="${item.key}">-</button>
            <input
              type="number"
              min="0"
              max="${maxPackSize}"
              value="${item.qty}"
              data-summary-qty-input="${item.key}">
            <button type="button" data-summary-plus="${item.key}">+</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}).join('');

const giftCardsHtml = builderConfig.giftTiers.flatMap(tier => {
  const isUnlocked = totalQty >= tier.minQty;
  const tierKey = tier.minQty;
  const justUnlocked = isUnlocked && !unlockedGiftTierKeys.has(tierKey);

  if (isUnlocked) {
    unlockedGiftTierKeys.add(tierKey);
  } else {
    unlockedGiftTierKeys.delete(tierKey);
  }

  return tier.variants.map(gift => {
    if (isUnlocked) {
      return `
        <div class="cl-free-gift-preview ${justUnlocked ? 'cl-gift-unlock-pulse' : ''}">
          <img src="${normalizeImage(gift.image)}" alt="">
          <div class="cl-free-gift-wrap">
            <div class="cl-free-gift-title">${gift.title}</div>
            <div class="cl-free-gift-label">${builderConfig.freeGiftLabel || 'Free gift included'}</div>
            <div class="cl-golf-summary-price">
              <s>${money(gift.price)}</s>
              <strong>$ 0.00</strong>
            </div>
          </div>
          <div class="cl-free-gift-badge">FREE</div>
        </div>
      `;
    }

    const remaining = tier.minQty - totalQty;
    const itemWord = remaining === 1 ? builderConfig.itemSingular : builderConfig.itemPlural;

    return `
      <div class="cl-free-gift-preview is-locked">
        <img src="${normalizeImage(gift.image)}" alt="">
        <div class="cl-free-gift-wrap">
          <div class="cl-free-gift-title">${gift.title}</div>
          <div class="cl-free-gift-label">Add ${remaining} more ${itemWord} to unlock</div>
          <div class="cl-golf-summary-price">
            <strong>${money(gift.price)}</strong>
          </div>
        </div>
        <div class="cl-free-gift-lock-badge">
          <svg height="20" width="20" viewBox="0 0 256 256" fill="currentColor">
            <path fill="currentColor" d="M208,76H180V56A52,52,0,0,0,76,56V76H48A20,20,0,0,0,28,96V208a20,20,0,0,0,20,20H208a20,20,0,0,0,20-20V96A20,20,0,0,0,208,76ZM100,56a28,28,0,0,1,56,0V76H100ZM204,204H52V100H204Zm-76-92a32,32,0,0,0-12,61.66V180a12,12,0,0,0,24,0v-6.34A32,32,0,0,0,128,112Zm0,24a8,8,0,1,1-8,8A8,8,0,0,1,128,136Z"></path>
          </svg>
        </div>
      </div>
    `;
  });
}).join('');

if (giftCardsHtml) {
  list.insertAdjacentHTML('afterbegin', giftCardsHtml);
}

  }

    function refreshItemDiscountRule(item) {
  const rule = discountRulesByHandle.get(item.handle) || defaultDiscountRule;

  return {
    ...item,
    discountKey: rule.key,
    discountRule: rule
  };
}

    function updateSelectedItem(key, newQty) {
    const item = selected.get(key);
    if (!item) return;

    // Clamp to available stock (summary +/- and any other caller), with a
    // specific message instead of a generic checkout failure.
    const stock = stockOf(item);
    if (newQty > stock) {
      newQty = stock;
      showPackNotice(
        stock === 0
          ? `${item.title} is sold out.`
          : `Only ${stock} left in stock!`
      );
    }

    if (newQty <= 0) {
      selected.delete(key);
    } else {
      selected.set(key, refreshItemDiscountRule({ ...item, qty: newQty }));
    }

    const cardControl = cardControls.get(key);
    if (cardControl) cardControl.setQty(newQty);

    renderSummary();
  }

    function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return div.textContent || div.innerText || '';
}




    function getActiveModalQty() {
  if (!activeModalCard) return 0;

  const data = getCardData(activeModalCard);
  const item = selected.get(data.key);

  return item ? item.qty : 0;
}

    function setActiveModalQty(newQty) {
  if (!activeModalCard) return;

  const data = getCardData(activeModalCard);
  const qty = Math.max(0, newQty);

  if (qty > 0) {
    selected.set(data.key, refreshItemDiscountRule({ ...data, qty }));

    const cardControl = cardControls.get(data.key);
    if (cardControl) cardControl.setQty(qty);
  } else {
    selected.delete(data.key);

    const cardControl = cardControls.get(data.key);
    if (cardControl) cardControl.setQty(0);
  }

  renderSummary();
  syncModalControls();
}

    function syncModalControls() {
  const modal = document.querySelector('[data-cl-product-modal]');
  if (!modal) return;

  const addBtn = modal.querySelector('[data-cl-modal-add]');
  const qtyBox = modal.querySelector('[data-cl-modal-qty]');
  const countEl = modal.querySelector('[data-cl-modal-count]');

  const qty = getActiveModalQty();

  if (countEl) countEl.textContent = qty;

  if (qty > 0) {
    addBtn.style.display = 'none';
    qtyBox.classList.add('is-active');
  } else {
    addBtn.style.display = 'block';
    qtyBox.classList.remove('is-active');
  }
}

    function getProductDataFromCard(card) {
  try {
    const raw =
      card.getAttribute('gp-data') ||
      card.getAttribute('gp-context');

    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

    function getModalImages(card, fallbackImage) {
      const gpData = getProductDataFromCard(card);

      const variantImages = [];

      const productVariants =
        gpData?.product?.variants ||
        gpData?.productVariants ||
        gpData?.variants ||
        [];

      productVariants.forEach(variant => {
        const src =
          variant?.featured_image?.src ||
          variant?.featured_media?.preview_image?.src ||
          variant?.image ||
          variant?.image?.src ||
          '';

        if (src) variantImages.push(normalizeImage(src));
      });

      const productImages =
        gpData?.product?.images ||
        gpData?.images ||
        [];

      const galleryImages = productImages.map(img => {
        if (typeof img === 'string') return normalizeImage(img);
        return normalizeImage(img?.src || img?.url || '');
      });

      return [...new Set([
        ...variantImages,
        ...galleryImages,
        fallbackImage
      ].filter(Boolean))];
    }

    async function openProductModal(card) {
  const data = getCardData(card);
  activeModalCard = card;
  
  const modal = document.querySelector('[data-cl-product-modal]');

  if (!modal) return;

  // Lift the modal out of the GemPages section so its z-index is judged at the
  // page root — otherwise the section's own stacking context paints the card
  // badges on top of it. Only needs to happen once.
  if (modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }

  const titleEl = modal.querySelector('[data-cl-modal-title]');
  const imageEl = modal.querySelector('[data-cl-modal-image]');
  const priceEl = modal.querySelector('[data-cl-modal-price]');
  const variantEl = modal.querySelector('[data-cl-modal-variant]');
  const descEl = modal.querySelector('[data-cl-modal-description]');
  const thumbsEl = modal.querySelector('[data-cl-modal-thumbs]');

  titleEl.textContent = data.title;
  imageEl.src = data.image;
  imageEl.alt = data.title;



if (thumbsEl) {
  thumbsEl.innerHTML = '';
}


  priceEl.textContent = money(data.price);
  variantEl.textContent = data.variant ? `Color: ${data.variant}` : '';
  descEl.textContent = 'Loading product details...';

  syncModalControls();

  modal.classList.add('is-open');
  document.body.style.overflow = 'hidden';

  try {
    const raw =
      card.getAttribute('gp-data') ||
      card.getAttribute('gp-context');

    let handle = '';

    if (raw) {
      const gpData = JSON.parse(raw);

      handle =
        gpData.productHandle ||
        gpData.product?.handle ||
        '';

      if (!handle && gpData.productUrl) {
        const match = gpData.productUrl.match(/\/products\/([^/?#]+)/);
        if (match && match[1]) handle = match[1];
      }
    }

    if (!handle) {
      descEl.textContent = '';
      return;
    }


    const res = await fetch(`/products/${handle}.js`);
const product = await res.json();

const galleryImages = (product.images || []).map(normalizeImage);

if (galleryImages.length) {

  let activeImage =
    galleryImages.find(img =>
      img.includes(
        (data.variant || '')
          .toLowerCase()
          .replace(/\s+/g, '')
      )
    ) || data.image;

  imageEl.src = activeImage;

  if (thumbsEl) {

    thumbsEl.innerHTML = galleryImages.map(src => `
      <button
        type="button"
        class="cl-product-modal-thumb ${src === activeImage ? 'is-active' : ''}"
        data-cl-modal-thumb="${src}">
        <img src="${src}" alt="">
      </button>
    `).join('');

  }
}

// descEl.textContent = stripHtml(product.description || '');
descEl.innerHTML = product.description || '';

  } catch (error) {
    console.warn('Product modal error:', error);
    descEl.textContent = '';
  }
}

    function closeProductModal() {
  const modal = document.querySelector('[data-cl-product-modal]');
  if (!modal) return;

  modal.classList.remove('is-open');
  document.body.style.overflow = '';
}

    document.addEventListener('click', (event) => {
      const summary = document.querySelector('.cl-golf-summary');

      if (
        summary?.classList.contains('is-mobile-open') &&
        window.innerWidth <= 767 &&
        event.clientY <= 60 &&
        event.clientX >= window.innerWidth - 160
      ) {
        event.preventDefault();
        summary.classList.remove('is-mobile-open');
        return;
      }
    });

    document.addEventListener('click', (event) => {
      const swatchClick = event.target.closest(
        'gp-product-variants, .variant-option-group, .option-item, .option-value-wrapper'
      );



      if (swatchClick) return;

      const productImage = event.target.closest(
        'gp-product .gp-featured-image-wrapper img.featured-image-only'
      );

      if (!productImage) return;

      const card = productImage.closest('gp-product');
      if (!card) return;



      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      openProductModal(card);
      return false;
    }, true);

    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-cl-modal-close]')) {
        event.preventDefault();
        closeProductModal();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeProductModal();
      }
    });

    document.addEventListener('click', function(e) {

      const thumb = e.target.closest('[data-cl-modal-thumb]');

      if (!thumb) return;

      const newImage = thumb.dataset.clModalThumb;

      const mainImage = document.querySelector('[data-cl-modal-image]');

      if (!mainImage) return;

      mainImage.src = normalizeImage(newImage);

      document
        .querySelectorAll('.cl-product-modal-thumb')
        .forEach(el => el.classList.remove('is-active'));

      thumb.classList.add('is-active');

    });


        function updateSwatchBadges(card, productTitle) {
  card.querySelectorAll('.option-item').forEach(label => {
    const input = label.querySelector('input[type="radio"]');
    const variantTitle = input ? input.value : '';

    let qty = 0;
    selected.forEach(item => {
      if (item.title === productTitle && (item.variant || '') === variantTitle) {
        qty += item.qty || 0;
      }
    });

    let badge = label.querySelector('.cl-swatch-badge');
    if (qty > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'cl-swatch-badge';
        label.appendChild(badge);
      }
      badge.textContent = qty;
    } else if (badge) {
      badge.remove();
    }
  });
}



        function initCards() {
  document.querySelectorAll('gp-product').forEach((card) => {
    if (card.querySelector('.cl-golf-builder-controls')) return;

    const form = card.querySelector('form[action="/cart/add"]');
    const atc = card.querySelector('.gp-product-button');
    if (!form || !atc) return;

    const cardHandle = getCardData(card).handle;

    const controls = document.createElement('div');
    controls.className = 'cl-golf-builder-controls';
    controls.innerHTML = `
      <button type="button" class="cl-add-to-bundle">${builderConfig.addToBundleText}</button>
    `;

    const addBtn = controls.querySelector('.cl-add-to-bundle');

    // Combined quantity across every variant of this product.
    function getProductTotal() {
      let total = 0;
      selected.forEach(item => {
        if (item.handle && item.handle === cardHandle) total += item.qty || 0;
      });
      return total;
    }

    // Quantity of the variant the swatch is currently on.
    function getActiveQty() {
      const item = selected.get(getCardData(card).key);
      return item ? item.qty : 0;
    }

    function updateCardUI() {
      const activeQty = getActiveQty();
      const full = isPackFull();
      const stock = getCardStock(card);

      // Sold out beats every other state — nothing can be added.
      if (stock <= 0) {
        addBtn.disabled = true;
        addBtn.classList.remove('is-added', 'is-pack-full');
        addBtn.classList.add('is-sold-out');
        addBtn.textContent = 'Sold out';
        card.classList.add('cl-card-soldout');
        updateSwatchBadges(card, getCardData(card).title);
        return;
      }
      card.classList.remove('cl-card-soldout');
      addBtn.classList.remove('is-sold-out');

      // Button reflects the CURRENTLY SHOWN colour (toggle).
      if (activeQty > 0) {
        addBtn.disabled = true;
        addBtn.classList.add('is-added');
        addBtn.classList.remove('is-pack-full', 'is-sold-out');
        addBtn.textContent = '✓ Added';
      } else if (full) {
        addBtn.disabled = true;
        addBtn.classList.remove('is-added');
        addBtn.classList.add('is-pack-full');
        addBtn.textContent = 'Your pack is full';
      } else {
        addBtn.disabled = false;
        addBtn.classList.remove('is-added', 'is-pack-full');
        addBtn.textContent = builderConfig.addToBundleText;
      }

      // Product-level highlight: ring + ✓ on the card.
      const inPack = getProductTotal() > 0;
      card.classList.toggle('cl-in-pack', inPack);

      const badgeHost = card.querySelector('.gkBonhMcMd') || card;
      let check = badgeHost.querySelector('.cl-pack-check');
      if (inPack && !check) {
        check = document.createElement('span');
        check.className = 'cl-pack-check';
        check.textContent = '✓';
        badgeHost.appendChild(check);
      } else if (!inPack && check) {
        check.remove();
      }

      // Per-swatch count badges.
      updateSwatchBadges(card, getCardData(card).title);
    }

    // Writes go to the active variant only.
    function setActiveQty(newQty) {
      const data = getCardData(card);
      const stock = stockOf(data);
      let finalQty = Math.max(0, newQty);

      // Never let the pack hold more than we can actually ship — explain why
      // here rather than letting checkout fail with a generic error.
      if (finalQty > stock) {
        finalQty = stock;
        showPackNotice(
          stock === 0
            ? `${data.title} is sold out.`
            : `Only ${stock} left in stock!`
        );
      }

      if (finalQty > 0) {
        selected.set(data.key, refreshItemDiscountRule({ ...data, qty: finalQty }));
        cardControls.set(data.key, { setQty() { updateCardUI(); } });
      } else {
        selected.delete(data.key);
      }

      renderSummary();
    }

    // Toggle: add the shown colour, or remove it if it's already in the pack.
    addBtn.addEventListener('click', () => {
      if (getActiveQty() > 0) {
        setActiveQty(0);
      } else if (getCardStock(card) <= 0) {
        return; // sold out — not addable
      } else if (!isPackFull()) {
        setActiveQty(1);
      }
    });

    // Switching swatches just refreshes the display for the new colour.
    card.addEventListener('change', () => {
      setTimeout(updateCardUI, 100);
    });

    card.addEventListener('click', (event) => {
      if (event.target.closest('.option-item, .option-value-wrapper, input[type="radio"]')) {
        setTimeout(updateCardUI, 150);
      }
    });

    atc.insertAdjacentElement('beforebegin', controls);
    cardSyncers.push(updateCardUI);
    updateCardUI();
  });
}

    function getCurrentCollectionHandle() {
  return window.location.pathname
    .split('/collections/')[1]
    ?.split('/')[0]
    ?.split('?')[0] || '';
}


function getCurrentCollectionHandle() {
  return window.location.pathname
    .split('/collections/')[1]
    ?.split('/')[0]
    ?.split('?')[0] || '';
}

try {
  var clPackMap = JSON.parse(localStorage.getItem('cl_bundle_collections') || '{}');
  clPackMap[builderConfig.title] = getCurrentCollectionHandle();
  localStorage.setItem('cl_bundle_collections', JSON.stringify(clPackMap));
} catch (e) {}


    async function clearExistingBundleFromCart(collectionHandle) {
  if (!collectionHandle) return;

  const cart = await fetch('/cart.js').then(res => res.json());

  const updates = {};
  cart.items.forEach(item => {
    const props = item.properties || {};
    // Only clear THIS collection's pack (its paid items + its gifts).
    // Other categories' packs and loose items are left alone, so one cart
    // can hold hats + towels + markers simultaneously.
    if (props._bundle_collection === collectionHandle) {
      updates[item.key] = 0;
    }
  });

  if (!Object.keys(updates).length) return;

  await fetch('/cart/update.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates })
  });
}

    async function restoreBundleFromCart() {
  const collectionHandle = getCurrentCollectionHandle();
  if (!collectionHandle) return;

  const cart = await fetch('/cart.js').then(res => res.json());

  const bundleItems = cart.items.filter(item =>
    item.properties &&
    item.properties._bundle_collection === collectionHandle &&
    item.properties._bundle_item === 'true'
  );

  if (!bundleItems.length) return;

  selected.clear();

  bundleItems.forEach(cartItem => {
    const key = String(cartItem.variant_id);

    selected.set(key, {
      key,
      variantId: Number(cartItem.variant_id),
      title: cartItem.product_title,
      variant: cartItem.variant_title || '',
      price: cartItem.original_price,
      image: normalizeImage(cartItem.image || cartItem.featured_image?.url || ''),
      qty: cartItem.quantity,
      handle: cartItem.handle,
      discountKey: 'default',
      discountRule: defaultDiscountRule
    });
  });

  selectedPackSize = packSizes[packSizes.length - 1] || selectedPackSize;

  renderPackSizeButtons();
  renderProgressDots();
  renderSummary();
}

    async function syncBuilderFromCart() {
  const collectionHandle = getCurrentCollectionHandle();
  if (!collectionHandle) return;

  const cart = await fetch('/cart.js').then(res => res.json());

  const bundleItems = cart.items.filter(item =>
    item.properties &&
    item.properties._bundle_collection === collectionHandle &&
    item.properties._bundle_item === 'true'
  );

  selected.clear();

  bundleItems.forEach(cartItem => {
    const key = String(cartItem.variant_id);
    const rule = discountRulesByHandle.get(cartItem.handle) || defaultDiscountRule;

    selected.set(key, {
      key,
      variantId: Number(cartItem.variant_id),
      title: cartItem.product_title,
      variant: cartItem.variant_title || '',
      price: cartItem.original_price,
      image: normalizeImage(cartItem.image || cartItem.featured_image?.url || ''),
      qty: cartItem.quantity,
      handle: cartItem.handle,
      discountKey: rule.key,
      discountRule: rule
    });
  });

  selectedPackSize = packSizes[packSizes.length - 1] || selectedPackSize;

  cardControls.forEach(control => control.setQty(0));

  selected.forEach(item => {
    const control = cardControls.get(item.key);
    if (control) control.setQty(item.qty);
  });

  renderPackSizeButtons();
  renderProgressDots();
  renderSummary();
}

        async function addSelectedToCart() {
  const bundleId = `cl-pack-${Date.now()}`;
  const bundleName = builderConfig.title;
  const bundleCollection = getCurrentCollectionHandle();

    let chosen = Array.from(selected.values())
    .filter(item => item.qty > 0 && item.variantId);

  const unavailable = chosen.filter(item => !isVariantAvailable(item.variantId));
  if (unavailable.length) {
    unavailable.forEach(item => selected.delete(item.key));
    chosen = chosen.filter(item => isVariantAvailable(item.variantId));
    renderSummary();
    const names = unavailable.map(i => i.title).filter(Boolean);
    showPackNotice(
      `${names.join(', ') || 'An item'} ${names.length > 1 ? 'are' : 'is'} sold out and ` +
      `${names.length > 1 ? 'were' : 'was'} removed from your pack.`
    );
    return;
  }

  if (!chosen.length) return;

  // Any quantity is now a valid pack — declare the pack size as the actual
  // quantity built, so the cart-validation function passes at checkout.
  const totalQty = chosen.reduce((sum, item) => sum + item.qty, 0);
  const bundleSize = totalQty;

  const selectedItems = chosen.map(item => ({
    id: Number(item.variantId),
    quantity: item.qty,
    properties: {
      _builder: builderConfig.title,
      _bundle_id: bundleId,
      _bundle_name: bundleName,
      _bundle_size: String(bundleSize),
      _bundle_max: String(maxPackSize),
      _bundle_collection: bundleCollection,
      _bundle_item: 'true',
      Pack: bundleName
    }
  }));

  const freeGiftItems = builderConfig.giftTiers
    .filter(tier => totalQty >= tier.minQty)
    .flatMap(tier => tier.variants.map(gift => ({
      id: Number(gift.id),
      quantity: 1,
      properties: {
      _builder: builderConfig.title,
      _bundle_id: bundleId,
      _bundle_name: bundleName,
      _bundle_size: String(bundleSize),
      _bundle_max: String(maxPackSize),
      _bundle_collection: bundleCollection,
      _bundle_free_gift: 'true',
      _bundle_free_gift_min: String(tier.minQty),
      _bundle_free_gift_label: builderConfig.freeGiftLabel,
      Pack: bundleName
    }
    })));

  const items = [...selectedItems, ...freeGiftItems];

  const btn = document.querySelector('.cl-golf-checkout');
  btn.disabled = true;
  btn.textContent = 'Preparing checkout...';

  try {
    window.clCheckoutInProgress = true;

    await clearExistingBundleFromCart(bundleCollection);

    const res = await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });

    // Never redirect to an empty/blocked checkout. If the add was rejected
    // (e.g. by the cart-validation function), surface it instead of bouncing
    // the customer to the homepage.
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.clCheckoutInProgress = false;
      btn.disabled = false;
      btn.textContent = builderConfig.addButtonText;
      if (data && data.message && window.showBundleCartNotice) {
        window.showBundleCartNotice(data.message);
      } else {
        showPackNotice((data && data.message) || 'Something went wrong adding your pack. Please try again.');
      }
      return;
    }

    btn.textContent = 'Going to checkout...';
    window.location.href = '/checkout';

  } catch (error) {
    window.clCheckoutInProgress = false;
    console.error(error);
    btn.textContent = 'Something went wrong';
    btn.disabled = false;
  }
}

    initCards();

    // Show the restored pack immediately — it only needs cart data, not discount rules.
    restoreBundleFromCart().then(() => {
      cardSyncers.forEach(sync => sync());
    });

    // Load discount rules in the background, then re-apply them to the restored items.
        loadCityLocsDiscount().then(() => {
      let changed = false;
      selected.forEach((item, key) => {
        const refreshed = refreshItemDiscountRule(item);
        if (refreshed.discountKey !== item.discountKey) {
          selected.set(key, refreshed);
          changed = true;
        }
      });
      if (changed) renderSummary();

      // Discount + price data is now available — surface the value prop on first load.
      //renderMilestoneValueStrip();
      //renderValueHeadline();
    });


    document.addEventListener('click', (event) => {

      const packBtn = event.target.closest('[data-cl-pack-size]');

if (packBtn) {
  event.preventDefault();
  setPackSize(packBtn.getAttribute('data-cl-pack-size'));
  return;
}

    const milestoneDot = event.target.closest('[data-cl-milestone-dot]');

if (milestoneDot) {
  event.preventDefault();
  setPackSize(milestoneDot.dataset.qty);
  return;
}


     const mobileToggle = event.target.closest('[data-cl-mobile-pack-toggle]');

  if (mobileToggle) {
    event.preventDefault();

    document
      .querySelector('.cl-golf-summary')
      ?.classList.add('is-mobile-open');

    return;
  }

  if (event.target.closest('[data-cl-mobile-summary-close]')) {
      event.preventDefault();

      document
        .querySelector('.cl-golf-summary')
        ?.classList.remove('is-mobile-open');

      return;
    }



       if (event.target.closest('[data-cl-clear-pack]')) {
  event.preventDefault();

  // Reset builder state.
  selected.clear();
  cardControls.forEach(control => control.setQty(0));

  // Snap the pack size back to the full milestone range and re-render the picker.
  selectedPackSize = packSizes[packSizes.length - 1] || selectedPackSize;
  lastSyncedQty = 0;
  renderPackSizeButtons();
  renderProgressDots();

  renderSummary();
  syncModalControls();

  // Remove ONLY this collection's lines — leave other packs and loose items.
  clearExistingBundleFromCart(getCurrentCollectionHandle()).then(() => {
    document.dispatchEvent(new CustomEvent('cart:refresh'));
    document.dispatchEvent(new CustomEvent('cart:updated'));
  });

  return;
}

    const plus = event.target.closest('[data-summary-plus]');
    const minus = event.target.closest('[data-summary-minus]');
    const thumb = event.target.closest('[data-cl-modal-thumb]');

    if (thumb) {
      event.preventDefault();

      const modal = document.querySelector('[data-cl-product-modal]');
      const imageEl = modal?.querySelector('[data-cl-modal-image]');
      const src = thumb.getAttribute('data-cl-modal-thumb');

      if (imageEl && src) imageEl.src = src;

      modal?.querySelectorAll('[data-cl-modal-thumb]').forEach(btn => {
        btn.classList.toggle('is-active', btn === thumb);
      });

      return;
    }

    if (plus) {
  if (isPackFull()) return;

  const key = plus.getAttribute('data-summary-plus');
  const item = selected.get(key);
  if (item) updateSelectedItem(key, item.qty + 1);

  return;
}

    if (minus) {
      const key = minus.getAttribute('data-summary-minus');
      const item = selected.get(key);
      if (item) updateSelectedItem(key, item.qty - 1);
    }

    const modalAddBtn = event.target.closest('[data-cl-modal-add]');

    if (modalAddBtn) {
      event.preventDefault();
      if (isPackFull()) return;
      setActiveModalQty(1);

      const originalText = modalAddBtn.textContent;
      modalAddBtn.textContent = '✓ Added to Bundle';

      setTimeout(() => {
        modalAddBtn.textContent = originalText;
      }, 1000);

      return;
    }

    if (event.target.closest('[data-cl-modal-plus]')) {
  if (isPackFull()) return;

  setActiveModalQty(getActiveModalQty() + 1);
  return;
}

    if (event.target.closest('[data-cl-modal-minus]')) {
      setActiveModalQty(getActiveModalQty() - 1);
    }

    if (event.target.closest('.cl-golf-checkout')) {
      addSelectedToCart();
    }
  });

    document.addEventListener('change', (event) => {
  const qtyInput = event.target.closest('[data-summary-qty-input]');
  if (!qtyInput) return;

  const key = qtyInput.getAttribute('data-summary-qty-input');
  const item = selected.get(key);

  if (!item) return;

  const currentTotalWithoutItem = getTotalSelectedQty() - item.qty;
  const requestedQty = Math.max(0, Number(qtyInput.value) || 0);
  const allowedQty = Math.min(
    requestedQty,
    maxPackSize - currentTotalWithoutItem
  );

  updateSelectedItem(key, allowedQty);
});







    document.addEventListener('click', (event) => {
  const cartLink = event.target.closest(
    'a[href="/cart"], a[href*="/cart"], [data-amp-cart-trigger], .amp-cart-trigger, .cart-icon, .header__icon--cart'
  );
  if (!cartLink) return;

  const summary = document.querySelector('.cl-golf-summary');
  if (!summary) return;  // not on the builder page — let the cart behave normally

  event.preventDefault();
  event.stopPropagation();

  if (window.innerWidth <= 767) {
    // Mobile: open the slide-up summary panel (same as the bottom bar does).
    summary.classList.add('is-mobile-open');
  } else {
    // Desktop: scroll to the sticky summary and pulse it.
    summary.scrollIntoView({ behavior: 'smooth', block: 'center' });
    summary.classList.add('cl-summary-pulse');
    setTimeout(() => summary.classList.remove('cl-summary-pulse'), 1200);
  }
}, true);



});

