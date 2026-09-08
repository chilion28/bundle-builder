/* CityLocs unified pack-builder engine — Hypro pilot, schema v1. */
(function () {
  'use strict';

  var CONFIG_SELECTOR = '[data-cl-pack-config]';

  function money(cents) {
    return '$' + (Number(cents || 0) / 100).toFixed(2);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function uid(key) {
    if (window.crypto && window.crypto.randomUUID) return key + '-' + window.crypto.randomUUID();
    return key + '-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  }

  function parseConfig(node) {
    try { return JSON.parse(node.textContent || '{}'); }
    catch (error) {
      console.error('CL pack builder configuration is invalid.', error);
      return null;
    }
  }

  function dispatch(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail: detail }));
  }

  function init(configNode) {
    if (configNode.dataset.clPackReady === 'true') return;
    var config = parseConfig(configNode);
    if (!config || !config.builder || !config.builder.key) return;
    if (!window.CLPackPerso || !window.CLPackPerso.create) {
      console.error('CL pack personalization adapter is unavailable.');
      return;
    }

    configNode.dataset.clPackReady = 'true';
    var builder = config.builder;
    var selectionConfig = config.selection || {};
    var pricing = config.pricing || {};
    var pricingTiers = Array.isArray(pricing.tiers) ? pricing.tiers.slice() : [];
    var rewards = Array.isArray(config.rewards) ? config.rewards.filter(function (reward) {
      return reward && reward.type === 'free_product' && reward.variantId;
    }) : [];
    var editingConfig = config.editing || {};
    var cartConfig = config.cart || {};
    var propNames = cartConfig.properties || {};
    var target = Number(selectionConfig.target) || 1;
    var maximum = Number(selectionConfig.maximum) || target;
    var minimumCheckout = Number(selectionConfig.minimumCheckout) || 1;
    var itemSingular = builder.itemLabel || 'item';
    var itemPlural = builder.itemLabelPlural || itemSingular + 's';
    var checkoutLabel = builder.addButtonText || 'Go to Checkout';
    var componentSelector = '[data-cl-pack-for="' + CSS.escape(builder.key) + '"]';
    var components = Array.from(document.querySelectorAll(componentSelector));
    var cards = [];
    var selected = new Map();
    var bundleId = uid(builder.key);
    var userHasInteracted = false;
    var restoring = false;
    var editingSelectionId = '';
    var editorSourceCard = null;
    var editorSelectionId = '';
    var preview = null;
    if ((config.preview || {}).mode === 'image_overlay' && window.CLPackPreview && window.CLPackPreview.create) {
      preview = window.CLPackPreview.create(config.preview);
    }
    var perso = window.CLPackPerso.create(Object.assign({}, config.personalization || {}, { preview: preview }));

    function all(selector) {
      var found = [];
      components.forEach(function (component) {
        if (component.matches(selector)) found.push(component);
        component.querySelectorAll(selector).forEach(function (node) { found.push(node); });
      });
      return found;
    }

    function one(selector) { return all(selector)[0] || null; }

    cards = all('[data-cl-pack-card]');
    var summary = one('[data-cl-pack-summary]');
    var checkout = one('[data-cl-pack-checkout]');
    var overlay = one('[data-cl-pack-overlay]');
    var errorEl = one('[data-cl-pack-error]');
    var editor = one('[data-cl-pack-editor]');
    var editorTitle = one('[data-cl-pack-editor-title]');
    var editorSave = one('[data-cl-pack-editor-save]');
    if (!cards.length || !summary || !checkout) {
      console.warn('CL pack builder is missing its grid or summary mount.', builder.key);
      return;
    }

    function variantControl(card) { return card.querySelector('[data-cl-pack-variant]'); }
    function selectedOption(control) {
      return control && control.tagName === 'SELECT' ? control.options[control.selectedIndex] : control;
    }
    function variantId(card) {
      var control = variantControl(card);
      return String((control && (control.value || control.dataset.variantId)) || '');
    }
    function totalQuantity() {
      var total = 0;
      selected.forEach(function (item) { total += item.quantity; });
      return total;
    }
    function showError(message) {
      if (!errorEl) return;
      errorEl.textContent = message || '';
      errorEl.hidden = !message;
      if (message) errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    function state() {
      return {
        builderKey: builder.key,
        bundleId: bundleId,
        items: Array.from(selected.values()).map(function (item) { return Object.assign({}, item); }),
        totalQuantity: totalQuantity()
      };
    }
    function publishChanged(reason) {
      dispatch('cl:pack:changed', { builderKey: builder.key, bundleId: bundleId, state: state(), reason: reason });
    }

    function cardDataFromRead(card, read) {
      var control = variantControl(card);
      var option = selectedOption(control);
      var image = card.querySelector('[data-cl-pack-image], .cl-hypro-card__image');
      var id = variantId(card);
      return {
        selectionId: perso.selectionKey(id, read.values),
        variantId: id,
        productHandle: card.dataset.clHandle || '',
        productType: card.dataset.clProductType || '',
        title: card.dataset.clTitle || '',
        variantTitle: option && option.textContent ? option.textContent.trim().replace(/ — Sold out$/, '') : '',
        image: (option && option.dataset.image) || (image && image.src) || '',
        unitPrice: Number(option && option.dataset.price) || 0,
        properties: read.values,
        valid: read.valid,
        card: card
      };
    }

    function cardData(card) { return cardDataFromRead(card, perso.read(card)); }

    function quantitiesForCard(card) {
      var id = variantId(card);
      var quantity = 0;
      selected.forEach(function (item) { if (item.variantId === id) quantity += item.quantity; });
      return quantity;
    }

    function syncCard(card) {
      var data = cardData(card);
      var current = selected.get(data.selectionId);
      var aggregate = quantitiesForCard(card);
      var total = totalQuantity();
      var add = card.querySelector('[data-cl-pack-add]');
      var badge = card.querySelector('[data-cl-pack-card-badge]');
      var isEditing = !!card.getAttribute('data-cl-editing');
      var modalEditing = editingConfig.presentation === 'modal';
      card.classList.toggle('is-selected', aggregate > 0);
      if (badge) {
        badge.textContent = 'x' + aggregate;
        badge.setAttribute('aria-label', aggregate + ' selected');
      }
      if (add) {
        add.textContent = modalEditing ? (total >= maximum ? 'Your pack is full' : 'Personalize & Add') : (isEditing ? 'Update' : (current ? '✓ Added' : (total >= maximum ? 'Your pack is full' : 'Add to Bundle')));
        add.classList.toggle('is-added', modalEditing ? aggregate > 0 : !!current);
        add.classList.toggle('is-editing', isEditing);
        add.disabled = modalEditing ? total >= maximum : (isEditing ? false : (!!current || total >= maximum));
      }
    }

    function estimate() {
      var total = totalQuantity();
      var subtotal = 0;
      selected.forEach(function (item) { subtotal += item.unitPrice * item.quantity; });
      var tier = null;
      if (pricing.mode === 'tiered') {
        pricingTiers.forEach(function (candidate) {
          if (total >= Number(candidate.minimum) && (!tier || Number(candidate.minimum) > Number(tier.minimum))) tier = candidate;
        });
      }
      var unlocked = pricing.mode === 'fixed_total' ? total === target : !!tier;
      var estimated = subtotal;
      if (pricing.mode === 'fixed_total' && unlocked) estimated = Number(pricing.fixedTotal || subtotal);
      else if (tier) estimated = Math.max(0, Number(tier.unitPrice || 0) * total);
      return { total: total, subtotal: subtotal, unlocked: unlocked, estimated: estimated, savings: Math.max(0, subtotal - estimated), tier: tier };
    }

    function loadTierPricing() {
      if (pricing.mode !== 'tiered' || pricingTiers.length || !pricing.tagPricingEndpoint || !cards.length) return Promise.resolve();
      var handle = cards[0].dataset.clHandle;
      if (!handle) return Promise.resolve();
      return fetch('/products/' + encodeURIComponent(handle) + '.js').then(function (response) {
        if (!response.ok) throw new Error('Product pricing tags could not be read.');
        return response.json();
      }).then(function (product) {
        var tags = Array.isArray(product.tags) ? product.tags : [];
        return fetch(pricing.tagPricingEndpoint + '?tags=' + encodeURIComponent(JSON.stringify(tags)));
      }).then(function (response) {
        if (!response.ok) throw new Error('Bundle pricing could not be read.');
        return response.json();
      }).then(function (data) {
        var breaks = Array.isArray(data.discountBreak) ? data.discountBreak : [];
        var amounts = Array.isArray(data.discountAmount) ? data.discountAmount : [];
        var basePrice = Number(selectedOption(variantControl(cards[0])).dataset.price) || 0;
        pricingTiers = breaks.map(function (minimum, index) {
          return { minimum: Number(minimum), unitPrice: Math.max(0, basePrice - Math.round(Number(amounts[index] || 0) * 100)) };
        }).filter(function (tier) { return tier.minimum > 0; });
        render();
      }).catch(function (error) { console.warn(error.message); });
    }

    function rewardIsUnlocked(reward, total) {
      return total >= (Number(reward.minimum) || target);
    }

    function renderReward(reward, total) {
      var minimum = Number(reward.minimum) || target;
      var unlocked = rewardIsUnlocked(reward, total);
      var remaining = Math.max(0, minimum - total);
      var title = reward.title || reward.label || 'Free gift';
      var detail = unlocked ? (reward.label || 'Free gift included') :
        'Add ' + remaining + ' more ' + (remaining === 1 ? itemSingular : itemPlural) + ' to unlock';
      return '<div class="cl-hypro-summary-gift' + (unlocked ? ' is-unlocked' : ' is-locked') + '" data-cl-pack-reward="' + escapeHtml(reward.key || reward.variantId) + '">' +
        (reward.image ? '<img src="' + escapeHtml(reward.image) + '" alt="" width="64" height="64">' : '') +
        '<div class="cl-hypro-summary-gift__body"><strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(detail) + '</span>' +
        '<span class="cl-hypro-summary-gift__price">' + (unlocked ? '<s>' + money(reward.price) + '</s> <strong>$0.00</strong>' : money(reward.price)) + '</span></div>' +
        '<span class="cl-hypro-summary-gift__badge">' + (unlocked ? 'FREE' : '<svg height="20" width="20" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path fill="currentColor" d="M208,76H180V56A52,52,0,0,0,76,56V76H48A20,20,0,0,0,28,96V208a20,20,0,0,0,20,20H208a20,20,0,0,0,20-20V96A20,20,0,0,0,208,76ZM100,56a28,28,0,0,1,56,0V76H100ZM204,204H52V100H204Zm-76-92a32,32,0,0,0-12,61.66V180a12,12,0,0,0,24,0v-6.34A32,32,0,0,0,128,112Zm0,24a8,8,0,1,1-8,8A8,8,0,0,1,128,136Z"></path></svg>') + '</span></div>';
    }

    function fixedTotalUnitAllocations(totals) {
      var allocations = new Map();
      if (!totals.unlocked || totals.subtotal <= 0 || Number(pricing.displayUnitPrice)) return allocations;
      var units = [];
      Array.from(selected.values()).forEach(function (item, itemIndex) {
        for (var quantityIndex = 0; quantityIndex < item.quantity; quantityIndex += 1) {
          var raw = totals.estimated * item.unitPrice / totals.subtotal;
          units.push({ selectionId: item.selectionId, itemIndex: itemIndex, quantityIndex: quantityIndex, cents: Math.floor(raw), remainder: raw - Math.floor(raw) });
        }
      });
      var assigned = units.reduce(function (sum, unit) { return sum + unit.cents; }, 0);
      units.slice().sort(function (a, b) {
        return b.remainder - a.remainder || a.itemIndex - b.itemIndex || a.quantityIndex - b.quantityIndex;
      }).slice(0, Math.max(0, totals.estimated - assigned)).forEach(function (unit) { unit.cents += 1; });
      units.forEach(function (unit) {
        var values = allocations.get(unit.selectionId) || [];
        values.push(unit.cents);
        allocations.set(unit.selectionId, values);
      });
      return allocations;
    }

    function renderSummaryItem(item, totals, fixedAllocations) {
      var configuredUnit = Number(pricing.displayUnitPrice) || 0;
      var allocatedUnits = fixedAllocations.get(item.selectionId) || [];
      var unit = totals.unlocked ? (configuredUnit || (totals.tier && Number(totals.tier.unitPrice)) || allocatedUnits[0] || item.unitPrice) : item.unitPrice;
      var savings = Math.max(0, item.unitPrice - unit);
      var propertyHtml = Object.keys(item.properties || {}).map(function (key) {
        return '<span class="cl-hypro-summary-item__personalization"><span>' + escapeHtml(key) + '</span><strong>' + escapeHtml(item.properties[key]) + '</strong></span>';
      }).join('');
      var priceHtml = totals.unlocked
        ? (configuredUnit
          ? '<span class="cl-hypro-summary-item__prices"><s>' + money(item.unitPrice) + '</s> <strong>' + money(unit) + '</strong> each <em>Save ' + money(savings) + '</em></span>'
          : '<span class="cl-hypro-summary-item__prices"><s>' + money(item.unitPrice) + '</s> <strong>' +
            (allocatedUnits.length && Math.min.apply(null, allocatedUnits) !== Math.max.apply(null, allocatedUnits)
              ? money(Math.min.apply(null, allocatedUnits)) + '–' + money(Math.max.apply(null, allocatedUnits))
              : money(unit)) + '</strong> each <em>Save ' + money(savings) + '</em></span>')
        : '<span>' + money(item.unitPrice) + ' each</span>';
      var actionHtml = editingConfig.enabled === true ? '<span class="cl-hypro-summary-item__actions">' +
        (editingConfig.showEdit === false ? '' : '<button type="button" data-cl-pack-edit="' + escapeHtml(item.selectionId) + '">Edit</button>') +
        (editingConfig.showRemove === false ? '' : '<button type="button" data-cl-pack-remove="' + escapeHtml(item.selectionId) + '">Remove</button>') +
        '</span>' : '';
      return '<div class="cl-hypro-summary-item" data-cl-pack-summary-item="' + escapeHtml(item.selectionId) + '">' +
        '<img src="' + escapeHtml(item.image) + '" alt="" width="64" height="64">' +
        '<div><strong>' + escapeHtml(item.title) + '</strong>' +
        (item.variantTitle && item.variantTitle !== 'Default Title' ? '<span>' + escapeHtml(item.variantTitle) + '</span>' : '') +
        priceHtml + propertyHtml + actionHtml + '</div>' +
        '<div class="cl-hypro-summary-item__right"><strong class="cl-hypro-summary-item__count">x' + item.quantity + '</strong>' +
        '<div class="cl-hypro-summary-item__quantity"><button type="button" data-cl-pack-summary-minus="' + escapeHtml(item.selectionId) + '" aria-label="Remove one">−</button><span>' + item.quantity + '</span><button type="button" data-cl-pack-summary-plus="' + escapeHtml(item.selectionId) + '" aria-label="Add one">+</button></div></div></div>';
    }

    function render() {
      var totals = estimate();
      cards.forEach(syncCard);
      all('[data-cl-pack-total], [data-cl-pack-total-copy], [data-cl-pack-mobile-count]').forEach(function (node) { node.textContent = totals.total; });
      all('[data-cl-pack-slot]').forEach(function (slot, index) {
        var minimum = Number(slot.getAttribute('data-cl-pack-minimum')) || (index + 1);
        slot.classList.toggle('is-filled', totals.total >= minimum);
      });
      var subtotalEl = one('[data-cl-pack-subtotal]');
      var savingsEl = one('[data-cl-pack-savings]');
      var estimatedEl = one('[data-cl-pack-estimated]');
      var messageEl = one('[data-cl-pack-message]');
      var rewardEl = one('[data-cl-pack-reward-pill]');
      var giftTotalEl = one('[data-cl-pack-gift-total]');
      var itemsEl = one('[data-cl-pack-summary-items]');
      if (subtotalEl) subtotalEl.textContent = money(totals.subtotal);
      if (savingsEl) savingsEl.textContent = totals.savings ? '- ' + money(totals.savings) : '$0.00';
      if (estimatedEl) estimatedEl.textContent = money(totals.estimated);
      var displayUnit = Number(pricing.displayUnitPrice) || 0;
      if (rewardEl) rewardEl.textContent = totals.unlocked
        ? ((pricing.rewardLabel || (totals.tier ? money(totals.tier.unitPrice) + '/' + itemSingular : money(totals.estimated))) + ' ✓')
        : (pricing.rewardLabel || ('Unlock ' + money(displayUnit) + '/' + itemSingular + ' when you buy ' + target));
      if (messageEl) {
        var remaining = Math.max(0, target - totals.total);
        var unlockedGift = rewards.some(function (reward) { return rewardIsUnlocked(reward, totals.total); });
        messageEl.textContent = totals.unlocked ? '🎉 You\'ve unlocked ' + (totals.tier ? money(totals.tier.unitPrice) + '/' + itemSingular + ' pricing' : 'your ' + money(totals.estimated) + ' bundle') + (unlockedGift ? ' and a free gift!' : '!') :
          'Add ' + remaining + ' more ' + (remaining === 1 ? itemSingular : itemPlural) + ' to unlock your discount.';
      }
      var rewardHtml = rewards.map(function (reward) { return renderReward(reward, totals.total); }).join('');
      var fixedAllocations = fixedTotalUnitAllocations(totals);
      var selectedHtml = selected.size ? Array.from(selected.values()).map(function (item) {
        return renderSummaryItem(item, totals, fixedAllocations);
      }).join('') : '<p class="cl-hypro-summary__empty">No ' + escapeHtml(itemPlural) + ' added yet.</p>';
      if (itemsEl) itemsEl.innerHTML = rewardHtml + selectedHtml;
      if (giftTotalEl) giftTotalEl.hidden = !rewards.some(function (reward) { return rewardIsUnlocked(reward, totals.total); });
      checkout.disabled = totals.total < minimumCheckout;
      checkout.textContent = totals.total < minimumCheckout ? 'Add ' + itemPlural + ' to get started' : checkoutLabel + ' (' + money(totals.estimated) + ')';
    }

    function closeEditor() {
      if (!editor) return;
      editor.hidden = true;
      editor.setAttribute('aria-hidden', 'true');
      editor.removeAttribute('data-cl-editing');
      document.documentElement.classList.remove('cl-pack-editor-open');
      editorSourceCard = null;
      editorSelectionId = '';
    }

    function openEditor(card, initialValues, selectionId) {
      if (!editor || !card) return;
      editorSourceCard = card;
      editorSelectionId = selectionId || '';
      editor.setAttribute('data-cl-handle', card.dataset.clHandle || '');
      editor.setAttribute('data-cl-product-type', card.dataset.clProductType || '');
      if (selectionId) editor.setAttribute('data-cl-editing', selectionId);
      else editor.removeAttribute('data-cl-editing');
      if (editorTitle) editorTitle.textContent = (selectionId ? 'Edit ' : 'Personalize ') + (card.dataset.clTitle || itemSingular);
      if (editorSave) editorSave.textContent = selectionId ? 'Save Changes' : 'Add to Pack';
      editor.hidden = false;
      editor.setAttribute('aria-hidden', 'false');
      document.documentElement.classList.add('cl-pack-editor-open');
      perso.createDraft(editor, {
        handle: card.dataset.clHandle || '',
        productType: card.dataset.clProductType || '',
        variantId: variantId(card)
      }, initialValues || {});
      var input = editor.querySelector('[data-cl-perso-input]');
      if (input) window.setTimeout(function () { input.focus(); }, 50);
    }

    function saveEditor() {
      if (!editor || !editorSourceCard) return;
      var read = perso.read(editor);
      if (!read.valid) {
        if (editor.__clPerso) editor.__clPerso.promptMissing();
        dispatch('cl:pack:validation-error', { builderKey: builder.key, bundleId: bundleId, code: 'invalid_personalization', message: 'Personalization needs attention.' });
        return;
      }
      var data = cardDataFromRead(editorSourceCard, read);
      delete data.valid;
      if (editorSelectionId) {
        var oldItem = selected.get(editorSelectionId);
        if (!oldItem) { closeEditor(); return; }
        var existing = data.selectionId === editorSelectionId ? null : selected.get(data.selectionId);
        var mergedQuantity = oldItem.quantity + (existing ? existing.quantity : 0);
        if (totalQuantity() - oldItem.quantity - (existing ? existing.quantity : 0) + mergedQuantity > maximum) return;
        selected.delete(editorSelectionId);
        selected.set(data.selectionId, Object.assign({}, oldItem, data, { quantity: mergedQuantity }));
        closeEditor();
        render();
        publishChanged('edit');
        return;
      }
      if (totalQuantity() >= maximum) return;
      var current = selected.get(data.selectionId);
      if (current) selected.set(data.selectionId, Object.assign({}, current, { quantity: current.quantity + 1 }));
      else selected.set(data.selectionId, Object.assign(data, { quantity: 1 }));
      closeEditor();
      showError('');
      render();
      publishChanged('add');
    }

    function addFromCard(card) {
      userHasInteracted = true;
      if (editingConfig.presentation === 'modal' && perso.mode === 'per_item') {
        if (totalQuantity() < maximum) openEditor(card, {}, '');
        return;
      }
      if (card.getAttribute('data-cl-editing')) { saveEdit(card); return; }
      var data = cardData(card);
      if (!data.variantId) return;
      if (!data.valid) {
        // Personalization errors belong beside the affected field. The adapter
        // opens its accordion, focuses the input, and renders the inline notice.
        // Clear any stale page-level error so the same problem is not repeated.
        showError('');
        if (card.__clPerso) card.__clPerso.promptMissing();
        dispatch('cl:pack:validation-error', { builderKey: builder.key, bundleId: bundleId, code: 'missing_personalization', message: 'Required personalization is missing.' });
        return;
      }
      if (totalQuantity() >= maximum) return;
      var existing = selected.get(data.selectionId);
      if (existing) return;
      delete data.valid;
      selected.set(data.selectionId, Object.assign(data, { quantity: 1 }));
      showError('');
      render();
      publishChanged('add');
    }

    function endEdit() {
      cards.forEach(function (card) { card.removeAttribute('data-cl-editing'); });
      editingSelectionId = '';
      closeEditor();
    }

    function beginEdit(selectionId) {
      var item = selected.get(selectionId);
      if (!item || editingConfig.enabled !== true || editingConfig.presentation === 'none') return;
      endEdit();
      var card = cardForVariant(item.variantId);
      if (!card) return;
      if (editingConfig.presentation === 'modal') {
        editingSelectionId = selectionId;
        openEditor(card, item.properties || {}, selectionId);
        return;
      }
      editingSelectionId = selectionId;
      card.setAttribute('data-cl-editing', selectionId);
      if (perso.createDraft) {
        perso.createDraft(card, {
          handle: item.productHandle,
          productType: item.productType,
          variantId: item.variantId
        }, item.properties || {});
      } else {
        hydrateCard(card, item.properties || {});
      }
      var toggle = card.querySelector('[data-cl-perso-toggle]');
      if (toggle && toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
      render();
      if (window.innerWidth <= 989) closeSummary();
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var input = card.querySelector('[data-cl-perso-input]');
      if (input) window.setTimeout(function () { input.focus(); }, 250);
    }

    function saveEdit(card) {
      var oldId = card.getAttribute('data-cl-editing') || editingSelectionId;
      var oldItem = selected.get(oldId);
      if (!oldItem) { endEdit(); render(); return; }
      var data = cardData(card);
      if (!data.valid) {
        showError('');
        if (card.__clPerso) card.__clPerso.promptMissing();
        dispatch('cl:pack:validation-error', { builderKey: builder.key, bundleId: bundleId, code: 'missing_personalization', message: 'Required personalization is missing.' });
        return;
      }
      var existing = data.selectionId === oldId ? null : selected.get(data.selectionId);
      selected.delete(oldId);
      delete data.valid;
      selected.set(data.selectionId, Object.assign({}, oldItem, data, {
        quantity: oldItem.quantity + (existing ? existing.quantity : 0)
      }));
      endEdit();
      showError('');
      render();
      publishChanged('edit');
    }

    function removeSelection(selectionId) {
      var item = selected.get(selectionId);
      if (!item) return;
      selected.delete(selectionId);
      if (editingSelectionId === selectionId) endEdit();
      var card = cardForVariant(item.variantId);
      if (card && quantitiesForCard(card) === 0 && card.__clPerso) card.__clPerso.reset();
      render();
      publishChanged('remove');
    }

    function changeSelectionQuantity(selectionId, delta) {
      userHasInteracted = true;
      var item = selected.get(selectionId);
      if (!item) return;
      var next = item.quantity + delta;
      if (next < 1) selected.delete(selectionId);
      else if (delta < 0 || totalQuantity() < maximum) selected.set(selectionId, Object.assign({}, item, { quantity: next }));
      render();
      publishChanged(delta > 0 ? 'increment' : 'decrement');
    }

    function openSummary() {
      summary.classList.add('is-open');
      if (overlay) overlay.hidden = false;
      document.documentElement.classList.add('cl-hypro-summary-open');
    }
    function closeSummary() {
      summary.classList.remove('is-open');
      if (overlay) overlay.hidden = true;
      document.documentElement.classList.remove('cl-hypro-summary-open');
    }

    function matchesBuilder(properties) {
      properties = properties || {};
      if (properties[propNames.builder || '_builder'] === builder.key) return true;
      return properties[propNames.bundleCollection || '_bundle_collection'] === (config.source || {}).collectionHandle;
    }

    async function readCart() {
      var response = await fetch('/cart.js', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('The cart could not be read.');
      return response.json();
    }

    async function removeCurrentBundle() {
      var cart = await readCart();
      var updates = {};
      (cart.items || []).forEach(function (line) {
        var props = line.properties || {};
        var lineBundleId = props[propNames.bundleId || '_bundle_id'];
        var match = lineBundleId ? lineBundleId === bundleId : matchesBuilder(props);
        if (match) updates[line.key] = 0;
      });
      if (!Object.keys(updates).length) return cart;
      var response = await fetch('/cart/update.js', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ updates: updates })
      });
      if (!response.ok) throw new Error('The existing bundle could not be updated.');
      return response.json();
    }

    function cardForVariant(id) {
      id = String(id);
      for (var i = 0; i < cards.length; i += 1) {
        var control = variantControl(cards[i]);
        if (!control) continue;
        if (control.tagName === 'SELECT') {
          var found = Array.prototype.some.call(control.options, function (option) { return String(option.value) === id; });
          if (!found) continue;
          control.value = id;
        } else if (variantId(cards[i]) !== id) continue;
        return cards[i];
      }
      return null;
    }

    function hydrateCard(card, properties) {
      Object.keys(properties || {}).forEach(function (key) {
        if (key.charAt(0) === '_' || key === (propNames.pack || 'Pack')) return;
        var input = card.querySelector('[data-cl-perso-input="' + CSS.escape(key) + '"]');
        if (!input) return;
        input.value = String(properties[key] || '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }

    function publicPersonalization(properties) {
      var values = {};
      Object.keys(properties || {}).forEach(function (key) {
        if (key.charAt(0) === '_' || key === (propNames.pack || 'Pack')) return;
        values[key] = properties[key];
      });
      return values;
    }

    async function restoreFromCart() {
      if (cartConfig.restoreOnLoad === false) return;
      try {
        restoring = true;
        var cart = await readCart();
        if (userHasInteracted) return;
        var candidate = (cart.items || []).filter(function (line) {
          return matchesBuilder(line.properties) && (line.properties || {})[propNames.bundleItem || '_bundle_item'] === 'true';
        });
        if (!candidate.length) return;
        var restoredId = (candidate[0].properties || {})[propNames.bundleId || '_bundle_id'];
        if (restoredId) {
          bundleId = restoredId;
          candidate = candidate.filter(function (line) { return (line.properties || {})[propNames.bundleId || '_bundle_id'] === restoredId; });
        }
        selected.clear();
        var restoredTotal = 0;
        candidate.forEach(function (line) {
          if (restoredTotal >= maximum) return;
          var id = String(line.variant_id || line.id);
          var card = cardForVariant(id);
          if (!card) return;
          var data;
          if (editingConfig.presentation === 'modal' && perso.mode === 'per_item') {
            var values = publicPersonalization(line.properties || {});
            data = cardDataFromRead(card, { values: values, valid: true });
          } else {
            hydrateCard(card, line.properties || {});
            data = cardData(card);
          }
          var quantity = Math.min(Number(line.quantity) || 0, maximum - restoredTotal);
          if (quantity < 1 || !data.valid) return;
          delete data.valid;
          selected.set(data.selectionId, Object.assign(data, { quantity: quantity }));
          restoredTotal += quantity;
        });
        render();
      } catch (error) {
        console.warn('The existing pack could not be restored.', error);
      } finally {
        restoring = false;
      }
    }

    cards.forEach(function (card) {
      if (editingConfig.presentation === 'modal' && perso.mode === 'per_item') return;
      perso.attach(card, {
        handle: card.dataset.clHandle || '',
        productType: card.dataset.clProductType || '',
        variantId: variantId(card)
      });
    });

    var catalog = null;
    if ((config.catalogTools || {}).enabled === true && window.CLPackCatalog && window.CLPackCatalog.create) {
      catalog = window.CLPackCatalog.create(config.catalogTools, document);
    }

    components.forEach(function (component) {
      component.addEventListener('click', function (event) {
        if (event.target.closest('[data-cl-pack-editor-save]')) { event.preventDefault(); saveEditor(); return; }
        if (event.target.closest('[data-cl-pack-editor-close]')) { event.preventDefault(); endEdit(); render(); return; }
        var card = event.target.closest('[data-cl-pack-card]');
        if (event.target.closest('[data-cl-pack-add]') && card) {
          event.preventDefault(); event.stopPropagation(); addFromCard(card); return;
        }
        if (event.target.closest('[data-cl-pack-open]')) { openSummary(); return; }
        if (event.target.closest('[data-cl-pack-close]') || event.target.closest('[data-cl-pack-overlay]')) { closeSummary(); return; }
        var minus = event.target.closest('[data-cl-pack-summary-minus]');
        var plus = event.target.closest('[data-cl-pack-summary-plus]');
        if (minus || plus) { changeSelectionQuantity((minus || plus).getAttribute(minus ? 'data-cl-pack-summary-minus' : 'data-cl-pack-summary-plus'), plus ? 1 : -1); return; }
        var edit = event.target.closest('[data-cl-pack-edit]');
        if (edit) { event.preventDefault(); beginEdit(edit.getAttribute('data-cl-pack-edit')); return; }
        var remove = event.target.closest('[data-cl-pack-remove]');
        if (remove) { event.preventDefault(); removeSelection(remove.getAttribute('data-cl-pack-remove')); return; }
        if (event.target.closest('[data-cl-pack-clear]')) {
          userHasInteracted = true;
          endEdit();
          selected.clear();
          cards.forEach(function (itemCard) { if (itemCard.__clPerso) itemCard.__clPerso.reset(); });
          render(); showError('');
          removeCurrentBundle().then(function (cart) {
            dispatch('cl:pack:cart-synced', { builderKey: builder.key, bundleId: bundleId, cart: cart, state: state() });
            document.dispatchEvent(new CustomEvent('cart:refresh'));
            document.dispatchEvent(new CustomEvent('cart:updated'));
          }).catch(function (error) { showError(error.message); });
          publishChanged('clear');
        }
      }, true);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && editor && !editor.hidden) { endEdit(); render(); }
    });

    cards.forEach(function (card) {
      card.addEventListener('cl:perso-change', function () { if (!restoring) { syncCard(card); publishChanged('personalization'); } });
      var control = variantControl(card);
      if (control) control.addEventListener('change', function () {
        var option = selectedOption(control);
        var image = card.querySelector('[data-cl-pack-image], .cl-hypro-card__image');
        if (image && option && option.dataset.image) image.src = option.dataset.image;
        syncCard(card);
      });
    });

    window.addEventListener('click', function (event) {
      if ((config.ui || {}).headerCartAction !== 'scroll_to_summary') return;
      var link = event.target.closest('a[href="/cart"], a[href*="/cart"], [data-amp-cart-trigger], .amp-cart-trigger, .cart-icon, .header__icon--cart');
      if (!link || !document.documentElement.contains(summary)) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      if (window.innerWidth <= 989) openSummary();
      else summary.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, true);

    checkout.addEventListener('click', async function () {
      var totals = estimate();
      if (totals.total < minimumCheckout) { showError('Please select at least ' + minimumCheckout + ' ' + itemSingular + '.'); return; }
      var items = Array.from(selected.values()).map(function (item) {
        var properties = Object.assign({}, item.properties);
        properties[propNames.pack || 'Pack'] = builder.title;
        properties[propNames.builder || '_builder'] = builder.key;
        properties[propNames.bundleName || '_bundle_name'] = builder.title;
        properties[propNames.bundleId || '_bundle_id'] = bundleId;
        properties[propNames.bundleCollection || '_bundle_collection'] = (config.source || {}).collectionHandle || '';
        properties[propNames.bundleItem || '_bundle_item'] = 'true';
        // The deployed checkout validator treats this as the size actually
        // submitted, not the promotion target. Keep partial packs valid while
        // the pricing backend independently unlocks the target discount.
        properties[propNames.bundleSize || '_bundle_size'] = String(totals.total);
        properties[propNames.bundleMax || '_bundle_max'] = String(maximum);
        properties[propNames.bundleBuilderUrl || '_bundle_builder_url'] = builder.builderUrl || window.location.pathname;
        return { id: Number(item.variantId), quantity: item.quantity, properties: properties };
      });
      rewards.filter(function (reward) {
        return reward.autoAdd !== false && rewardIsUnlocked(reward, totals.total);
      }).forEach(function (reward) {
        var properties = {};
        properties[propNames.pack || 'Pack'] = builder.title;
        properties[propNames.builder || '_builder'] = builder.key;
        properties[propNames.bundleName || '_bundle_name'] = builder.title;
        properties[propNames.bundleId || '_bundle_id'] = bundleId;
        properties[propNames.bundleCollection || '_bundle_collection'] = (config.source || {}).collectionHandle || '';
        properties[propNames.bundleSize || '_bundle_size'] = String(totals.total);
        properties[propNames.bundleMax || '_bundle_max'] = String(maximum);
        properties[propNames.bundleBuilderUrl || '_bundle_builder_url'] = builder.builderUrl || window.location.pathname;
        properties[propNames.freeGift || '_bundle_free_gift'] = 'true';
        properties[propNames.freeGiftMin || '_bundle_free_gift_min'] = String(Number(reward.minimum) || target);
        properties[propNames.freeGiftLabel || '_bundle_free_gift_label'] = reward.label || 'Free gift included';
        items.push({ id: Number(reward.variantId), quantity: Number(reward.quantity) || 1, properties: properties });
      });
      checkout.disabled = true;
      checkout.textContent = 'Adding your bundle...';
      try {
        window.clCheckoutInProgress = true;
        await removeCurrentBundle();
        var response = await fetch('/cart/add.js', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ items: items })
        });
        if (!response.ok) {
          var body = await response.json().catch(function () { return {}; });
          throw new Error(body.description || body.message || 'The bundle could not be added.');
        }
        var cart = await readCart();
        dispatch('cl:pack:cart-synced', { builderKey: builder.key, bundleId: bundleId, cart: cart, state: state() });
        window.location.assign((config.checkout || {}).destination || '/checkout');
      } catch (error) {
        window.clCheckoutInProgress = false;
        showError(error.message || 'The bundle could not be added. Please try again.');
        render();
      }
    });

    render();
    loadTierPricing();
    restoreFromCart().then(function () {
      dispatch('cl:pack:ready', { builderKey: builder.key, bundleId: bundleId, state: state() });
    });
  }

  function boot() { document.querySelectorAll(CONFIG_SELECTOR).forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  document.addEventListener('shopify:section:load', boot);
}());
