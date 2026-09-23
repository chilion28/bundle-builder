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

  function normalizedList(values) {
    return Array.isArray(values) ? values.map(function (value) {
      return String(value == null ? '' : value).trim().toLowerCase();
    }).filter(Boolean) : [];
  }

  function sentenceList(values) {
    if (values.length < 2) return values[0] || '';
    if (values.length === 2) return values[0] + ' and ' + values[1];
    return values.slice(0, -1).join(', ') + ', and ' + values[values.length - 1];
  }

  function replaceStyledText(element, value) {
    if (!element) return;
    var walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    var textNodes = [];
    var node;

    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.trim()) textNodes.push(node);
    }

    if (!textNodes.length) {
      element.textContent = value;
      return;
    }

    textNodes[0].nodeValue = value;
    textNodes.slice(1).forEach(function (textNode) {
      textNode.nodeValue = '';
    });
  }

  function syncMixedTemplateContent(target, slots, pricing, itemPlural) {
    var fixedTotal = Number(pricing && pricing.fixedTotal);
    var price = fixedTotal > 0 ? money(fixedTotal) : '';
    var requirements = slots.map(function (slot) {
      return slot.quantity + ' ' + (slot.label || slot.id);
    });
    var packSize = document.querySelector('.cl-mixed-pack-size');
    var heroOffer = document.querySelector('.cl-mixed-hero-offer');
    var instructionsTitle = document.querySelector('.cl-mixed-instructions-title');
    var instructionsPrice = document.querySelector('.cl-mixed-instructions-price');

    replaceStyledText(packSize, target + '-PACK');
    if (heroOffer) {
      replaceStyledText(heroOffer, slots.length
        ? 'Choose ' + target + ' ' + itemPlural + '—1 from each category' + (price ? '—for just ' + price : '')
        : 'Choose any ' + target + ' ' + itemPlural + (price ? ' for just ' + price : ''));
    }
    if (instructionsTitle && requirements.length) {
      replaceStyledText(instructionsTitle, 'Choose ' + sentenceList(requirements));
    }
    if (instructionsPrice && price) {
      replaceStyledText(instructionsPrice, slots.length
        ? 'Complete all categories to get the ' + price + ' bundle price.'
        : 'Complete your pack to get the ' + price + ' bundle price.');
    }
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
    var slots = Array.isArray(selectionConfig.slots) && selectionConfig.slots.length ? selectionConfig.slots.map(function (slot) {
      return {
        id: String(slot && slot.id || '').trim(),
        label: String(slot && slot.label || slot && slot.id || '').trim(),
        quantity: Number(slot && slot.quantity),
        eligibleProductTypes: normalizedList(slot && slot.eligibleProductTypes),
        eligibleHandles: normalizedList(slot && slot.eligibleHandles)
      };
    }) : [];
    var hasSlots = slots.length > 0;
    var allowPartialCheckout = selectionConfig.allowPartialCheckout === true;
    var slotCapacity = slots.reduce(function (sum, slot) { return sum + slot.quantity; }, 0);
    var configuredMaximum = Number(selectionConfig.maximum);
    var maximum = hasSlots ? slotCapacity : (configuredMaximum || target);
    var minimumCheckout = Number(selectionConfig.minimumCheckout) || 1;
    var itemSingular = builder.itemLabel || 'item';
    var itemPlural = builder.itemLabelPlural || itemSingular + 's';
    var checkoutLabel = builder.addButtonText || 'Go to Checkout';
    syncMixedTemplateContent(target, slots, pricing, itemPlural);
    var componentSelector = '[data-cl-pack-for="' + CSS.escape(builder.key) + '"]';
    var components = Array.from(document.querySelectorAll(componentSelector));
    var cards = [];
    var selected = new Map();
    var bundleId = uid(builder.key);
    var selectionCacheKey = 'cl-pack-selection:' + builder.key;
    var reconciledCart = null;
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
    var grid = one('[data-cl-pack-grid]');
    var slotGuide = null;
    var cardSlots = new Map();
    var slotConfigErrors = [];
    if (!cards.length || !summary || !checkout) {
      console.warn('CL pack builder is missing its grid or summary mount.', builder.key);
      return;
    }

    if (hasSlots) {
      var slotIds = {};
      slots.forEach(function (slot) {
        if (!slot.id) slotConfigErrors.push('Every selection slot requires an id.');
        else if (slotIds[slot.id]) slotConfigErrors.push('Duplicate selection slot id: ' + slot.id + '.');
        else slotIds[slot.id] = true;
        if (!Number.isInteger(slot.quantity) || slot.quantity < 1) slotConfigErrors.push('Selection slot "' + (slot.label || slot.id || 'unnamed') + '" requires a positive whole-number quantity.');
        if (!slot.eligibleProductTypes.length && !slot.eligibleHandles.length) slotConfigErrors.push('Selection slot "' + (slot.label || slot.id || 'unnamed') + '" requires an eligibility rule.');
      });
      if (Object.prototype.hasOwnProperty.call(selectionConfig, 'maximum') && configuredMaximum !== slotCapacity) {
        slotConfigErrors.push('selection.maximum must equal the total slot quantity (' + slotCapacity + ').');
      }
      cards.forEach(function (card) {
        var handle = String(card.dataset.clHandle || '').trim().toLowerCase();
        var productType = String(card.dataset.clProductType || '').trim().toLowerCase();
        var matches = slots.filter(function (slot) {
          return slot.eligibleHandles.indexOf(handle) !== -1 || slot.eligibleProductTypes.indexOf(productType) !== -1;
        });
        if (matches.length > 1) {
          slotConfigErrors.push('Product "' + (card.dataset.clTitle || handle || 'unknown') + '" matches more than one selection slot.');
          cardSlots.set(card, null);
        } else {
          cardSlots.set(card, matches[0] || null);
        }
      });
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
    function slotForCard(card) { return hasSlots ? cardSlots.get(card) || null : null; }
    function slotQuantity(slotId, excludeSelectionIds) {
      var total = 0;
      excludeSelectionIds = excludeSelectionIds || [];
      selected.forEach(function (item, selectionId) {
        if (excludeSelectionIds.indexOf(selectionId) === -1 && item.slotId === slotId) total += item.quantity;
      });
      return total;
    }
    function slotStates() {
      return slots.map(function (slot) {
        var filled = slotQuantity(slot.id);
        return { id: slot.id, label: slot.label || slot.id, quantity: slot.quantity, filled: filled, complete: filled === slot.quantity };
      });
    }
    function incompleteSlots() {
      return hasSlots ? slotStates().filter(function (slot) { return !slot.complete; }) : [];
    }
    function slotAllows(slot, quantity, excludeSelectionIds) {
      return !!slot && slotQuantity(slot.id, excludeSelectionIds) + quantity <= slot.quantity;
    }
    function slotCanReplace(slot) {
      return !!slot && slot.quantity === 1 && slotQuantity(slot.id) === 1;
    }
    function replaceSlotSelection(slot) {
      if (!slotCanReplace(slot)) return false;
      Array.from(selected.entries()).forEach(function (entry) {
        if (entry[1].slotId === slot.id) selected.delete(entry[0]);
      });
      return true;
    }
    function validationError(code, message, extra) {
      var detail = Object.assign({ builderKey: builder.key, bundleId: bundleId, code: code, message: message }, extra || {});
      dispatch('cl:pack:validation-error', detail);
      return detail;
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
        totalQuantity: totalQuantity(),
        slots: hasSlots ? slotStates() : []
      };
    }
    function cacheSelection() {
      try {
        if (!selected.size) {
          window.sessionStorage.removeItem(selectionCacheKey);
          return;
        }
        window.sessionStorage.setItem(selectionCacheKey, JSON.stringify({
          bundleId: bundleId,
          items: Array.from(selected.values()).map(function (item) {
            return {
              variantId: item.variantId,
              quantity: item.quantity,
              properties: item.properties || {}
            };
          })
        }));
      } catch (error) {}
    }
    function clearSelectionCache() {
      try { window.sessionStorage.removeItem(selectionCacheKey); } catch (error) {}
    }
    function restoreCachedSelection() {
      if (cartConfig.restoreOnLoad === false) return false;
      try {
        var cached = JSON.parse(window.sessionStorage.getItem(selectionCacheKey) || 'null');
        if (!cached || !Array.isArray(cached.items) || !cached.items.length) return false;
        var restored = new Map();
        var restoredTotal = 0;
        if (cached.bundleId) bundleId = cached.bundleId;
        cached.items.forEach(function (item) {
          if (restoredTotal >= maximum) return;
          var card = cardForVariant(item.variantId);
          if (!card) return;
          var data = cardDataFromRead(card, { values: item.properties || {}, valid: true });
          var quantity = Math.min(Number(item.quantity) || 0, maximum - restoredTotal);
          var slot = hasSlots ? slotForCard(card) : null;
          if (hasSlots && !slot) return;
          if (hasSlots) quantity = Math.min(quantity, Math.max(0, slot.quantity - Array.from(restored.values()).filter(function (entry) { return entry.slotId === slot.id; }).reduce(function (sum, entry) { return sum + entry.quantity; }, 0)));
          if (quantity < 1) return;
          delete data.valid;
          restored.set(data.selectionId, Object.assign(data, { quantity: quantity }));
          restoredTotal += quantity;
        });
        if (!restored.size) { clearSelectionCache(); return false; }
        selected = restored;
        return true;
      } catch (error) {
        clearSelectionCache();
        return false;
      }
    }
    function publishChanged(reason) {
      cacheSelection();
      dispatch('cl:pack:changed', { builderKey: builder.key, bundleId: bundleId, state: state(), reason: reason });
    }

    function installSlotPresentation() {
      if (!hasSlots || !grid) return;
      if (slots.length > 1) {
        slotGuide = document.createElement('section');
        slotGuide.className = 'cl-hypro cl-pack-slot-guide';
        slotGuide.setAttribute('data-cl-pack-slot-guide', '');
        slotGuide.setAttribute('aria-label', 'Bundle requirements');
        grid.parentNode.insertBefore(slotGuide, grid);
      }

      var groupedCards = document.createDocumentFragment();
      slots.forEach(function (slot, index) {
        var matchingCards = cards.filter(function (card) { return slotForCard(card) === slot; });
        if (!matchingCards.length) return;
        if (slots.length > 1) {
          var heading = document.createElement('div');
          heading.className = 'cl-pack-slot-heading';
          heading.setAttribute('data-cl-pack-slot-heading', slot.id);
          heading.innerHTML = '<span class="cl-pack-slot-heading__number">' + (index + 1) + '</span>' +
            '<span><strong>Choose your ' + escapeHtml(slot.label || slot.id) + '</strong><small>Select ' + slot.quantity + ' from this category</small></span>';
          groupedCards.appendChild(heading);
        }
        matchingCards.forEach(function (card) { groupedCards.appendChild(card); });
      });
      cards.filter(function (card) { return !slotForCard(card); }).forEach(function (card) { groupedCards.appendChild(card); });
      grid.insertBefore(groupedCards, errorEl || null);

    }

    function renderSlotPresentation(totals) {
      if (!hasSlots) return;
      var states = slotStates();
      if (slotGuide) {
        slotGuide.innerHTML = '<div class="cl-pack-slot-guide__steps">' + states.map(function (slot, index) {
            return '<span class="' + (slot.complete ? 'is-complete' : '') + '"><b>' + (slot.complete ? '&#10003;' : index + 1) + '</b>' + escapeHtml(slot.label) + '</span>';
          }).join('') + '</div>';
      }
      slots.forEach(function (slot) {
        var heading = one('[data-cl-pack-slot-heading="' + CSS.escape(slot.id) + '"]');
        if (heading) heading.classList.toggle('is-complete', slotQuantity(slot.id) === slot.quantity);
      });
    }

    function cardDataFromRead(card, read) {
      var control = variantControl(card);
      var option = selectedOption(control);
      var image = card.querySelector('[data-cl-pack-image], .cl-hypro-card__image');
      var id = variantId(card);
      var slot = slotForCard(card);
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
        slotId: slot ? slot.id : '',
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
      var slot = slotForCard(card);
      var slotUnavailable = hasSlots && (!slot || !slotAllows(slot, 1));
      var canReplace = hasSlots && !current && slotCanReplace(slot);
      var configInvalid = slotConfigErrors.length > 0;
      card.classList.toggle('is-selected', aggregate > 0);
      card.classList.toggle('is-slot-ineligible', hasSlots && !slot);
      card.classList.toggle('is-slot-full', hasSlots && !!slot && !slotAllows(slot, 1));
      if (hasSlots) {
        card.setAttribute('data-cl-pack-slot-id', slot ? slot.id : '');
        card.setAttribute('aria-disabled', configInvalid || !slot ? 'true' : 'false');
      }
      if (badge) {
        badge.textContent = 'x' + aggregate;
        badge.setAttribute('aria-label', aggregate + ' selected');
      }
      if (add) {
        add.textContent = configInvalid ? 'Bundle unavailable' : (hasSlots && !slot ? 'Not available for this bundle' : (modalEditing ? (slotUnavailable || total >= maximum ? 'This category is full' : 'Personalize & Add') : (isEditing ? 'Update' : (current ? '✓ Added' : (canReplace ? 'Choose another' : (slotUnavailable || total >= maximum ? 'This category is full' : 'Add to Bundle'))))));
        add.classList.toggle('is-added', modalEditing ? aggregate > 0 : !!current);
        add.classList.toggle('is-editing', isEditing);
        add.disabled = configInvalid || (slotUnavailable && !canReplace) || (modalEditing ? total >= maximum : (isEditing ? false : (!!current || (total >= maximum && !canReplace))));
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
      var priceHtml = totals.unlocked && savings > 0
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
      renderSlotPresentation(totals);
      all('[data-cl-pack-total], [data-cl-pack-total-copy], [data-cl-pack-mobile-count]').forEach(function (node) { node.textContent = totals.total; });
      all('[data-cl-pack-slot]').forEach(function (slot, index) {
        var minimum = Number(slot.getAttribute('data-cl-pack-minimum')) || (index + 1);
        slot.classList.toggle('is-filled', totals.total >= minimum);
      });
      var subtotalEl = one('[data-cl-pack-subtotal]');
      var savingsEl = one('[data-cl-pack-savings]');
      var savingsRowEl = one('[data-cl-pack-savings-row]');
      var estimatedEl = one('[data-cl-pack-estimated]');
      var messageEl = one('[data-cl-pack-message]');
      var nextDiscountEl = one('[data-cl-pack-next-discount]');
      var nextGiftEl = one('[data-cl-pack-next-gift]');
      var rewardEl = one('[data-cl-pack-reward-pill]');
      var giftTotalEl = one('[data-cl-pack-gift-total]');
      var itemsEl = one('[data-cl-pack-summary-items]');
      if (subtotalEl) subtotalEl.textContent = money(totals.subtotal);
      if (savingsEl) savingsEl.textContent = totals.savings ? '- ' + money(totals.savings) : '$0.00';
      if (savingsRowEl) savingsRowEl.hidden = totals.savings <= 0;
      if (estimatedEl) estimatedEl.textContent = money(totals.estimated);
      var displayUnit = Number(pricing.displayUnitPrice) || 0;
      if (rewardEl) rewardEl.textContent = totals.unlocked
        ? ((pricing.rewardLabel || (totals.tier ? money(totals.tier.unitPrice) + '/' + itemSingular : money(totals.estimated))) + ' ✓')
        : (pricing.rewardLabel || (pricing.mode === 'fixed_total' && Number(pricing.fixedTotal)
          ? 'Unlock ' + money(Number(pricing.fixedTotal)) + ' when you buy ' + target
          : 'Unlock ' + money(displayUnit) + '/' + itemSingular + ' when you buy ' + target));
      if (messageEl) {
        var remaining = Math.max(0, target - totals.total);
        var unlockedGift = rewards.some(function (reward) { return rewardIsUnlocked(reward, totals.total); });
        var messageMissingSlots = incompleteSlots();
        messageEl.textContent = totals.unlocked ? '🎉 You\'ve unlocked ' + (totals.tier ? money(totals.tier.unitPrice) + '/' + itemSingular + ' pricing' : 'your ' + money(totals.estimated) + ' bundle') + (unlockedGift ? ' and a free gift!' : '!') :
          (messageMissingSlots.length ? 'Next: choose your ' + messageMissingSlots[0].label + ' to unlock' + (pricing.mode === 'fixed_total' && Number(pricing.fixedTotal) ? ' the ' + money(pricing.fixedTotal) + ' bundle.' : ' your discount.') :
          'Add ' + remaining + ' more ' + (remaining === 1 ? itemSingular : itemPlural) + ' to unlock your discount.');
      }
      if (nextDiscountEl) {
        var baseTier = pricingTiers.slice().sort(function (a, b) { return Number(a.minimum) - Number(b.minimum); })[0];
        var currentUnit = totals.tier ? Number(totals.tier.unitPrice) : (baseTier ? Number(baseTier.unitPrice) : Infinity);
        var nextTier = pricingTiers.filter(function (tier) {
          return Number(tier.minimum) > totals.total && Number(tier.unitPrice) < currentUnit;
        }).sort(function (a, b) { return Number(a.minimum) - Number(b.minimum); })[0];
        nextDiscountEl.textContent = nextTier
          ? 'Next discount: ' + (Number(nextTier.minimum) - totals.total) + ' more \u2192 ' + money(Number(nextTier.unitPrice)) + '/' + itemSingular
          : (totals.tier ? 'Best price unlocked: ' + money(Number(totals.tier.unitPrice)) + '/' + itemSingular : '');
        nextDiscountEl.hidden = !nextDiscountEl.textContent;
      }
      if (nextGiftEl) {
        var nextGift = rewards.filter(function (reward) { return !rewardIsUnlocked(reward, totals.total); }).sort(function (a, b) {
          return (Number(a.minimum) || target) - (Number(b.minimum) || target);
        })[0];
        nextGiftEl.textContent = nextGift
          ? 'Free gift: ' + ((Number(nextGift.minimum) || target) - totals.total) + ' more \u2192 ' + (nextGift.title || nextGift.label || 'Gift')
          : (rewards.length ? 'Free gift unlocked' : '');
        nextGiftEl.hidden = !nextGiftEl.textContent;
      }
      var rewardHtml = rewards.map(function (reward) { return renderReward(reward, totals.total); }).join('');
      var fixedAllocations = fixedTotalUnitAllocations(totals);
      var selectedHtml = selected.size ? Array.from(selected.values()).map(function (item) {
        return renderSummaryItem(item, totals, fixedAllocations);
      }).join('') : '<p class="cl-hypro-summary__empty">No ' + escapeHtml(itemPlural) + ' added yet.</p>';
      if (itemsEl) itemsEl.innerHTML = rewardHtml + selectedHtml;
      if (giftTotalEl) giftTotalEl.hidden = !rewards.some(function (reward) { return rewardIsUnlocked(reward, totals.total); });
      var missingSlots = incompleteSlots();
      checkout.disabled = slotConfigErrors.length > 0 || totals.total < minimumCheckout || (!allowPartialCheckout && missingSlots.length > 0);
      var checkoutReward = pricing.mode === 'fixed_total' && Number(pricing.fixedTotal) ? ' for ' + money(pricing.fixedTotal) : '';
      checkout.textContent = slotConfigErrors.length ? 'Bundle configuration unavailable' :
        (totals.total < minimumCheckout ? 'Add ' + itemPlural + ' to get started' :
          (missingSlots.length && !allowPartialCheckout ? 'Choose your ' + missingSlots[0].label + checkoutReward :
            (missingSlots.length ? 'Checkout (' + money(totals.estimated) + ')' : checkoutLabel + ' (' + money(totals.estimated) + ')')));
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
        var editSlot = slotForCard(editorSourceCard);
        var editExclusions = [editorSelectionId];
        if (existing) editExclusions.push(data.selectionId);
        if (hasSlots && !slotAllows(editSlot, mergedQuantity, editExclusions)) {
          validationError('slot_full', (editSlot ? editSlot.label : 'This category') + ' is already full.', { slotId: editSlot ? editSlot.id : '' });
          return;
        }
        if (totalQuantity() - oldItem.quantity - (existing ? existing.quantity : 0) + mergedQuantity > maximum) return;
        selected.delete(editorSelectionId);
        selected.set(data.selectionId, Object.assign({}, oldItem, data, { quantity: mergedQuantity }));
        closeEditor();
        render();
        publishChanged('edit');
        return;
      }
      if (totalQuantity() >= maximum) return;
      var newSlot = slotForCard(editorSourceCard);
      if (hasSlots && !slotAllows(newSlot, 1)) {
        validationError(newSlot ? 'slot_full' : 'slot_ineligible', newSlot ? newSlot.label + ' is already full.' : 'This product is not eligible for a bundle slot.', { slotId: newSlot ? newSlot.id : '' });
        return;
      }
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
      var slot = slotForCard(card);
      if (hasSlots && !slotAllows(slot, 1)) {
        if (slotCanReplace(slot)) {
          replaceSlotSelection(slot);
        } else {
        var addMessage = slot ? slot.label + ' is already full.' : 'This product is not eligible for a bundle slot.';
        showError(addMessage);
        validationError(slot ? 'slot_full' : 'slot_ineligible', addMessage, { slotId: slot ? slot.id : '' });
        return;
        }
      }
      if (totalQuantity() >= maximum) return;
      var existing = selected.get(data.selectionId);
      if (existing) return;
      delete data.valid;
      selected.set(data.selectionId, Object.assign(data, { quantity: 1 }));
      showError('');
      render();
      publishChanged(hasSlots && slot && slot.quantity === 1 ? 'select-slot' : 'add');
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
      var slot = slotForCard(card);
      var mergedQuantity = oldItem.quantity + (existing ? existing.quantity : 0);
      var exclusions = [oldId];
      if (existing) exclusions.push(data.selectionId);
      if (hasSlots && !slotAllows(slot, mergedQuantity, exclusions)) {
        validationError(slot ? 'slot_full' : 'slot_ineligible', slot ? slot.label + ' is already full.' : 'This product is not eligible for a bundle slot.', { slotId: slot ? slot.id : '' });
        return;
      }
      selected.delete(oldId);
      delete data.valid;
      selected.set(data.selectionId, Object.assign({}, oldItem, data, {
        quantity: mergedQuantity
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
      else if (delta < 0 || totalQuantity() < maximum) {
        var slot = hasSlots ? slots.find(function (candidate) { return candidate.id === item.slotId; }) : null;
        if (delta > 0 && hasSlots && !slotAllows(slot, delta)) {
          validationError(slot ? 'slot_full' : 'slot_ineligible', slot ? slot.label + ' is already full.' : 'This product is not eligible for a bundle slot.', { slotId: slot ? slot.id : '' });
          return;
        }
        selected.set(selectionId, Object.assign({}, item, { quantity: next }));
      }
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
      reconciledCart = await response.json();
      return reconciledCart;
    }

    async function removeCurrentBundle() {
      var cart = reconciledCart || await readCart();
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
      reconciledCart = await response.json();
      return reconciledCart;
    }

    function cartAlreadyMatches(items) {
      if (!reconciledCart || !Array.isArray(reconciledCart.items)) return false;
      var existing = reconciledCart.items.filter(function (line) {
        var properties = line.properties || {};
        return properties[propNames.bundleId || '_bundle_id'] === bundleId && matchesBuilder(properties);
      });
      if (existing.length !== items.length) return false;
      var used = new Set();
      return items.every(function (item) {
        for (var index = 0; index < existing.length; index += 1) {
          if (used.has(index)) continue;
          var line = existing[index];
          if (String(line.variant_id || line.id) !== String(item.id) || Number(line.quantity) !== Number(item.quantity)) continue;
          var properties = line.properties || {};
          var matches = Object.keys(item.properties || {}).every(function (key) {
            return String(properties[key] == null ? '' : properties[key]) === String(item.properties[key] == null ? '' : item.properties[key]);
          });
          if (!matches) continue;
          used.add(index);
          return true;
        }
        return false;
      });
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
      if (slotConfigErrors.length) return;
      try {
        restoring = true;
        var cart = await readCart();
        if (userHasInteracted) return;
        var candidate = (cart.items || []).filter(function (line) {
          return matchesBuilder(line.properties) && (line.properties || {})[propNames.bundleItem || '_bundle_item'] === 'true';
        });
        if (!candidate.length) {
          selected.clear();
          clearSelectionCache();
          render();
          return;
        }
        var restoredId = (candidate[0].properties || {})[propNames.bundleId || '_bundle_id'];
        if (restoredId) {
          bundleId = restoredId;
          candidate = candidate.filter(function (line) { return (line.properties || {})[propNames.bundleId || '_bundle_id'] === restoredId; });
        }
        selected.clear();
        if (hasSlots) {
          candidate.forEach(function (line) {
            var id = String(line.variant_id || line.id);
            var card = cardForVariant(id);
            if (!card) {
              validationError('restore_slot_ineligible', 'A saved bundle item is no longer eligible and was not restored.', { variantId: id });
              return;
            }
            var slot = slotForCard(card);
            if (!slot) {
              validationError('restore_slot_ineligible', (card.dataset.clTitle || 'A saved bundle item') + ' is not eligible for a slot and was not restored.', { variantId: id });
              return;
            }
            var requestedQuantity = Number(line.quantity) || 0;
            var remaining = Math.max(0, slot.quantity - slotQuantity(slot.id));
            var quantity = Math.min(requestedQuantity, remaining);
            if (requestedQuantity > remaining) {
              validationError('restore_slot_overflow', 'Saved items exceeded the capacity for ' + slot.label + '; the excess was not restored.', { slotId: slot.id, ignoredQuantity: requestedQuantity - remaining });
            }
            if (quantity < 1) return;
            var data;
            if (editingConfig.presentation === 'modal' && perso.mode === 'per_item') {
              var values = publicPersonalization(line.properties || {});
              data = cardDataFromRead(card, { values: values, valid: true });
            } else {
              hydrateCard(card, line.properties || {});
              data = cardData(card);
            }
            if (!data.valid) {
              validationError('restore_invalid_personalization', (card.dataset.clTitle || 'A saved bundle item') + ' has invalid personalization and was not restored.', { variantId: id });
              return;
            }
            delete data.valid;
            var existing = selected.get(data.selectionId);
            selected.set(data.selectionId, Object.assign({}, existing || data, data, { quantity: quantity + (existing ? existing.quantity : 0) }));
          });
          render();
          cacheSelection();
          return;
        }
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
        cacheSelection();
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
      if (slotConfigErrors.length) { showError(slotConfigErrors[0]); return; }
      var missingSlots = incompleteSlots();
      if (missingSlots.length && !allowPartialCheckout) {
        var slotMessage = 'Complete ' + missingSlots.map(function (slot) { return slot.label; }).join(', ') + ' before checkout.';
        showError(slotMessage);
        validationError('slots_incomplete', slotMessage, { slots: missingSlots });
        return;
      }
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
      if (cartAlreadyMatches(items)) {
        cacheSelection();
        if (typeof window.CLFreeGiftBuy2Reconcile === 'function') await window.CLFreeGiftBuy2Reconcile();
        window.location.assign((config.checkout || {}).destination || '/checkout');
        return;
      }
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
        cacheSelection();
        if (typeof window.CLFreeGiftBuy2Reconcile === 'function') await window.CLFreeGiftBuy2Reconcile();
        window.location.assign((config.checkout || {}).destination || '/checkout');
      } catch (error) {
        window.clCheckoutInProgress = false;
        showError(error.message || 'The bundle could not be added. Please try again.');
        render();
      }
    });

    installSlotPresentation();
    restoreCachedSelection();
    render();
    if (slotConfigErrors.length) {
      showError(slotConfigErrors[0]);
      validationError('invalid_slot_config', slotConfigErrors.join(' '), { errors: slotConfigErrors.slice() });
    }
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
