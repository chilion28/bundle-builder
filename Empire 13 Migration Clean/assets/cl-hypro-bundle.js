(function () {
  'use strict';

  var ROOT_SELECTOR = '[data-cl-hypro-config]';

  function money(cents) {
    return '$' + (Number(cents || 0) / 100).toFixed(2);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

    function selectedOption(control) {
    if (!control) return null;
    if (control.tagName === 'SELECT') return control.options[control.selectedIndex];
      return control;
    }

    function controlVariantId(control) {
      if (!control) return 0;
      return Number(control.value || control.dataset.variantId || control.dataset.clHyproVariant) || 0;
    }

  function init(config) {
    if (config.dataset.clHyproReady === 'true') return;
    config.dataset.clHyproReady = 'true';

    var builderId = config.dataset.clHyproFor;
    var componentSelector = '[data-cl-hypro-for="' + CSS.escape(builderId) + '"]';
    var components = Array.from(document.querySelectorAll(componentSelector));
    function one(selector) {
      for (var i = 0; i < components.length; i += 1) {
        var match = components[i].matches(selector) ? components[i] : components[i].querySelector(selector);
        if (match) return match;
      }
      return null;
    }
    function all(selector) {
      var matches = [];
      components.forEach(function (component) {
        if (component.matches(selector)) matches.push(component);
        component.querySelectorAll(selector).forEach(function (match) { matches.push(match); });
      });
      return matches;
    }

    var requiredQuantity = Number(config.dataset.requiredQuantity) || 3;
    var bundlePrice = Number(config.dataset.bundlePrice) || 9900;
    var collectionHandle = config.dataset.collectionHandle || 'hypro-3-pack';
    var bundleTitle = config.dataset.bundleTitle || 'Hypro Sunglasses 3-Pack';
    var builderUrl = window.location.pathname + window.location.search + window.location.hash;
    var itemSingular = config.dataset.itemSingular || 'pair';
    var itemPlural = config.dataset.itemPlural || 'pairs';
    var personalizationMode = config.dataset.personalizationMode || 'shared';
    var selected = new Map();
    var userHasInteracted = false;
    var engraving = one('[data-cl-hypro-engraving]');
    var checkout = one('[data-cl-hypro-checkout]');
    var summary = one('[data-cl-hypro-summary]');
    var overlay = one('[data-cl-hypro-overlay]');
    var error = one('[data-cl-hypro-error]');

    if ((personalizationMode === 'shared' && !engraving) || !checkout || !summary || !all('[data-cl-hypro-card]').length) {
      console.warn('Hypro builder is missing its engraving, grid, or summary block.', builderId);
      return;
    }

    try {
      var collectionMap = JSON.parse(localStorage.getItem('cl_bundle_collections') || '{}');
      collectionMap[bundleTitle] = builderUrl;
      localStorage.setItem('cl_bundle_collections', JSON.stringify(collectionMap));
    } catch (storageError) {}

    function totalQuantity() {
      var total = 0;
      selected.forEach(function (item) { total += item.quantity; });
      return total;
    }

    function showError(message) {
      if (!error) return;
      error.textContent = message || '';
      error.hidden = !message;
      if (message) error.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function getCardData(card) {
      var control = card.querySelector('[data-cl-hypro-variant]');
      var option = selectedOption(control);
      var image = card.querySelector('.cl-hypro-card__image');
      return {
        id: controlVariantId(control),
        title: card.dataset.productTitle || '',
        handle: card.dataset.productHandle || '',
        variantTitle: option && option.textContent ? option.textContent.trim().replace(/ — Sold out$/, '') : '',
        price: Number(option && option.dataset.price) || 0,
        image: (option && option.dataset.image) || (image && image.src) || '',
        customText: personalizationMode === 'per_item' ? cardEngraving(card) : ''
      };
    }

    function cardEngraving(card) {
      var input = card && card.querySelector('[data-cl-hypro-card-engraving]');
      return input ? input.value.trim() : '';
    }

    function setCardEngraving(card, value) {
      var input = card && card.querySelector('[data-cl-hypro-card-engraving]');
      if (!input) return;
      input.value = String(value || '').slice(0, input.maxLength || 20);
      var counter = card.querySelector('[data-cl-hypro-card-counter]');
      if (counter) counter.textContent = input.value.length + '/20';
    }

    function syncCard(card) {
      var data = getCardData(card);
      var item = selected.get(data.id);
      var quantity = item ? item.quantity : 0;
      var add = card.querySelector('[data-cl-hypro-add]');
      var controls = card.querySelector('[data-cl-hypro-quantity]');
      var count = card.querySelector('[data-cl-hypro-card-count]');
      var badge = card.querySelector('[data-cl-hypro-card-badge]');
      var total = totalQuantity();
      card.classList.toggle('is-selected', quantity > 0);
      if (badge) {
        badge.textContent = quantity;
        badge.setAttribute('aria-label', quantity + ' selected');
      }
      if (add) {
        add.hidden = false;
        add.textContent = quantity > 0 ? '✓ Added' : (total >= requiredQuantity ? 'Your pack is full' : 'Add to Bundle');
        add.classList.toggle('is-added', quantity > 0);
        add.disabled = quantity > 0 || total >= requiredQuantity;
      }
      if (controls) controls.hidden = true;
      if (count) count.textContent = quantity;
      var plus = card.querySelector('[data-cl-hypro-plus]');
      if (plus) plus.disabled = total >= requiredQuantity;
      var variantControl = card.querySelector('select[data-cl-hypro-variant]');
      if (variantControl) variantControl.disabled = quantity > 0;
    }

    function setQuantity(card, nextQuantity) {
      userHasInteracted = true;
      var data = getCardData(card);
      if (!data.id) return;
      if (nextQuantity > 0 && personalizationMode === 'per_item' && !data.customText) {
        showError('Please enter the engraving text for ' + (data.title || 'this item') + '.');
        var input = card.querySelector('[data-cl-hypro-card-engraving]');
        if (input) input.focus();
        return;
      }
      var current = selected.get(data.id);
      var currentQuantity = current ? current.quantity : 0;
      var availableSpace = requiredQuantity - totalQuantity() + currentQuantity;
      var quantity = Math.max(0, Math.min(nextQuantity, availableSpace));

      if (quantity > 0) selected.set(data.id, Object.assign(data, { quantity: quantity }));
      else selected.delete(data.id);

      showError('');
      render();
    }

    function render() {
      var total = totalQuantity();
      var subtotal = 0;
      selected.forEach(function (item) { subtotal += item.price * item.quantity; });
      var unlocked = total === requiredQuantity;
      var estimated = unlocked ? bundlePrice : subtotal;
      var savings = unlocked ? Math.max(0, subtotal - bundlePrice) : 0;

      all('[data-cl-hypro-card]').forEach(syncCard);
      all('[data-cl-hypro-total], [data-cl-hypro-total-copy], [data-cl-hypro-mobile-count]').forEach(function (el) {
        el.textContent = total;
      });
      all('[data-cl-hypro-slot]').forEach(function (slot, index) {
        slot.classList.toggle('is-filled', index < total);
      });

      var subtotalEl = one('[data-cl-hypro-subtotal]');
      var savingsEl = one('[data-cl-hypro-savings]');
      var estimatedEl = one('[data-cl-hypro-estimated]');
      var message = one('[data-cl-hypro-message]');
      var rewardPill = one('[data-cl-hypro-reward-pill]');
      if (subtotalEl) subtotalEl.textContent = money(subtotal);
      if (savingsEl) savingsEl.textContent = savings ? '- ' + money(savings) : '$0.00';
      if (estimatedEl) estimatedEl.textContent = money(estimated);
      if (rewardPill) rewardPill.textContent = unlocked ? '$33 / pair ✓' : 'Unlock $33/pair when you buy 3';
      if (message) {
        var remaining = requiredQuantity - total;
        message.textContent = unlocked
          ? '🎉 You\'ve unlocked your $99 bundle!'
          : 'Add ' + remaining + ' more ' + (remaining === 1 ? itemSingular : itemPlural) + ' to unlock your discount.';
      }

      var itemsEl = one('[data-cl-hypro-summary-items]');
      if (itemsEl) {
        if (!selected.size) {
          itemsEl.innerHTML = '<p class="cl-hypro-summary__empty">No ' + escapeHtml(itemPlural) + ' added yet.</p>';
        } else {
          var bundleUnitPrice = Math.round(bundlePrice / requiredQuantity);
          var sharedText = engraving ? engraving.value.trim() : '';
          itemsEl.innerHTML = Array.from(selected.values()).map(function (item) {
            var unitSavings = Math.max(0, item.price - bundleUnitPrice);
            var priceLine = unlocked
              ? '<span class="cl-hypro-summary-item__prices"><s>' + money(item.price) + '</s> <strong>' + money(bundleUnitPrice) + '</strong> each <em>Save ' + money(unitSavings) + '</em></span>'
              : '<span>' + money(item.price) + ' each</span>';
            return '<div class="cl-hypro-summary-item" data-cl-hypro-summary-item="' + item.id + '">' +
              '<img src="' + escapeHtml(item.image) + '" alt="" width="64" height="64">' +
              '<div><strong>' + escapeHtml(item.title) + '</strong>' +
              (item.variantTitle && item.variantTitle !== 'Default Title' ? '<span>' + escapeHtml(item.variantTitle) + '</span>' : '') +
              priceLine +
              '<span class="cl-hypro-summary-item__personalization"><span>Custom Text</span><strong>' + escapeHtml(personalizationMode === 'per_item' ? item.customText : (sharedText || '—')) + '</strong></span></div>' +
              '<div class="cl-hypro-summary-item__right"><strong class="cl-hypro-summary-item__count">x' + item.quantity + '</strong>' +
              '<div class="cl-hypro-summary-item__quantity"><button type="button" data-cl-hypro-summary-minus="' + item.id + '" aria-label="Remove one">−</button><span>' + item.quantity + '</span><button type="button" data-cl-hypro-summary-plus="' + item.id + '" aria-label="Add one">+</button></div></div>' +
            '</div>';
          }).join('');
        }
      }

      checkout.disabled = total < 1;
      checkout.textContent = total < 1
        ? 'Add ' + itemPlural + ' to get started'
        : 'Go to Checkout (' + money(estimated) + ')';
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

    async function replaceExistingPack() {
      var cart = await fetch('/cart.js', { headers: { 'Accept': 'application/json' } }).then(function (response) {
        if (!response.ok) throw new Error('The existing cart could not be read.');
        return response.json();
      });
      var updates = {};
      (cart.items || []).forEach(function (item) {
        var properties = item.properties || {};
        if (properties._bundle_collection === collectionHandle) updates[item.key] = 0;
      });
      if (!Object.keys(updates).length) return;
      var response = await fetch('/cart/update.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ updates: updates })
      });
      if (!response.ok) throw new Error('The existing Hypro bundle could not be replaced.');
    }

    function cardForVariant(variantId) {
      var cards = all('[data-cl-hypro-card]');
      for (var i = 0; i < cards.length; i += 1) {
        var control = cards[i].querySelector('[data-cl-hypro-variant]');
        if (!control) continue;
        if (control.tagName === 'SELECT') {
          var hasVariant = Array.prototype.some.call(control.options, function (option) {
            return Number(option.value) === variantId;
          });
          if (!hasVariant) continue;
          control.value = String(variantId);
        } else if (controlVariantId(control) !== variantId) {
          continue;
        }
        return cards[i];
      }
      return null;
    }

    async function restoreFromCart() {
      try {
        var response = await fetch('/cart.js', { headers: { 'Accept': 'application/json' } });
        if (!response.ok) return;
        var cart = await response.json();
        if (userHasInteracted) return;

        var bundleItems = (cart.items || []).filter(function (item) {
          var properties = item.properties || {};
          return properties._bundle_collection === collectionHandle && properties._bundle_item === 'true';
        });
        if (!bundleItems.length) return;

        selected.clear();
        var restoredTotal = 0;
        bundleItems.forEach(function (cartItem) {
          if (restoredTotal >= requiredQuantity) return;
          var variantId = Number(cartItem.variant_id || cartItem.id);
          var card = cardForVariant(variantId);
          if (!card) return;
          var quantity = Math.min(Number(cartItem.quantity) || 0, requiredQuantity - restoredTotal);
          if (quantity < 1) return;
          selected.set(variantId, Object.assign(getCardData(card), { quantity: quantity }));
          if (personalizationMode === 'per_item') {
            var restoredText = cartItem.properties && cartItem.properties['Custom Text'];
            setCardEngraving(card, restoredText || '');
            selected.set(variantId, Object.assign(getCardData(card), { quantity: quantity }));
          }
          restoredTotal += quantity;
        });

        var customTextItem = bundleItems.find(function (item) {
          return item.properties && item.properties['Custom Text'];
        });
        if (personalizationMode === 'shared' && engraving && customTextItem) {
          engraving.value = String(customTextItem.properties['Custom Text']).slice(0, engraving.maxLength || 20);
          var counter = one('[data-cl-hypro-counter]');
          if (counter) counter.textContent = engraving.value.length + '/20';
        }
        render();
      } catch (restoreError) {
        console.warn('The existing Hypro selection could not be restored.', restoreError);
      }
    }

    components.forEach(function (component) { component.addEventListener('click', function (event) {
      var card = event.target.closest('[data-cl-hypro-card]');
      if (event.target.closest('[data-cl-hypro-add]') && card) setQuantity(card, 1);
      if (event.target.closest('[data-cl-hypro-plus]') && card) {
        var plusData = getCardData(card);
        setQuantity(card, ((selected.get(plusData.id) || {}).quantity || 0) + 1);
      }
      if (event.target.closest('[data-cl-hypro-minus]') && card) {
        var minusData = getCardData(card);
        setQuantity(card, ((selected.get(minusData.id) || {}).quantity || 0) - 1);
      }
      if (event.target.closest('[data-cl-hypro-open]')) openSummary();
      if (event.target.closest('[data-cl-hypro-close]') || event.target.closest('[data-cl-hypro-overlay]')) closeSummary();
      if (event.target.closest('[data-cl-hypro-clear]')) {
        userHasInteracted = true;
        selected.clear();
        if (engraving) engraving.value = '';
        all('[data-cl-hypro-card]').forEach(function (itemCard) { setCardEngraving(itemCard, ''); });
        var counter = one('[data-cl-hypro-counter]');
        if (counter) counter.textContent = '0/20';
        showError('');
        render();
        window.clCheckoutInProgress = true;
        replaceExistingPack().then(function () {
          document.dispatchEvent(new CustomEvent('cart:refresh'));
          document.dispatchEvent(new CustomEvent('cart:updated'));
        }).catch(function (clearError) {
          showError(clearError.message || 'The Hypro selection could not be removed from the cart.');
        }).finally(function () {
          window.clCheckoutInProgress = false;
        });
        return;
      }
      var summaryMinus = event.target.closest('[data-cl-hypro-summary-minus]');
      var summaryPlus = event.target.closest('[data-cl-hypro-summary-plus]');
      if (summaryMinus || summaryPlus) {
        userHasInteracted = true;
        var itemId = Number((summaryMinus || summaryPlus).getAttribute(summaryMinus ? 'data-cl-hypro-summary-minus' : 'data-cl-hypro-summary-plus'));
        var summaryItem = selected.get(itemId);
        if (summaryItem) {
          var next = summaryItem.quantity + (summaryPlus ? 1 : -1);
          if (next > 0) selected.set(itemId, Object.assign({}, summaryItem, { quantity: Math.min(next, requiredQuantity - totalQuantity() + summaryItem.quantity) }));
          else selected.delete(itemId);
          render();
        }
      }
    }, true); });

    all('[data-cl-hypro-add]').forEach(function (button) {
      button.addEventListener('pointerdown', function (event) {
        if (event.button !== 0) return;
        var card = button.closest('[data-cl-hypro-card]');
        if (card) setQuantity(card, 1);
      }, true);
      button.addEventListener('click', function (event) {
        var card = button.closest('[data-cl-hypro-card]');
        if (!card) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        setQuantity(card, 1);
      }, true);
      button.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        var card = button.closest('[data-cl-hypro-card]');
        if (!card) return;
        event.preventDefault();
        setQuantity(card, 1);
      }, true);
    });

    components.forEach(function (component) { component.addEventListener('change', function (event) {
      var control = event.target.closest('[data-cl-hypro-variant]');
      if (!control) return;
      userHasInteracted = true;
      var card = control.closest('[data-cl-hypro-card]');
      var image = card && card.querySelector('.cl-hypro-card__image');
      var option = selectedOption(control);
      if (image && option && option.dataset.image) image.src = option.dataset.image;
      if (card) syncCard(card);
    }); });

    if (engraving) {
      engraving.addEventListener('input', function () {
        userHasInteracted = true;
        var counter = one('[data-cl-hypro-counter]');
        if (counter) counter.textContent = engraving.value.length + '/20';
        showError('');
        render();
      });
    }

    components.forEach(function (component) { component.addEventListener('input', function (event) {
      var input = event.target.closest('[data-cl-hypro-card-engraving]');
      if (!input) return;
      userHasInteracted = true;
      var card = input.closest('[data-cl-hypro-card]');
      var counter = card && card.querySelector('[data-cl-hypro-card-counter]');
      if (counter) counter.textContent = input.value.length + '/20';
      var data = card && getCardData(card);
      var item = data && selected.get(data.id);
      if (item) selected.set(data.id, Object.assign({}, item, { customText: input.value.trim() }));
      showError('');
      render();
    }); });

    window.addEventListener('click', function (event) {
      var cartLink = event.target.closest(
        'a[href="/cart"], a[href*="/cart"], [data-amp-cart-trigger], .amp-cart-trigger, .cart-icon, .header__icon--cart'
      );
      if (!cartLink || !document.documentElement.contains(summary)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (window.innerWidth <= 989) {
        openSummary();
      } else {
        summary.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, true);

    checkout.addEventListener('click', async function () {
      var text = engraving ? engraving.value.trim() : '';
      var total = totalQuantity();
      if (total < 1) {
        showError('Please select at least 1 ' + itemSingular + '.');
        return;
      }
      if (personalizationMode === 'shared' && !text) {
        showError('Please enter the engraving text that should appear on the selected ' + itemPlural + '.');
        if (engraving) engraving.focus();
        return;
      }
      if (personalizationMode === 'per_item') {
        var missingTextItem = Array.from(selected.values()).find(function (item) { return !item.customText; });
        if (missingTextItem) {
          showError('Please enter the engraving text for ' + (missingTextItem.title || 'each selected item') + '.');
          var missingCard = cardForVariant(missingTextItem.id);
          var missingInput = missingCard && missingCard.querySelector('[data-cl-hypro-card-engraving]');
          if (missingInput) missingInput.focus();
          return;
        }
      }

      var bundleId = 'cl-hypro-' + Date.now();
      var items = Array.from(selected.values()).map(function (item) {
        return {
          id: item.id,
          quantity: item.quantity,
          properties: {
            'Custom Text': personalizationMode === 'per_item' ? item.customText : text,
            '_builder': bundleTitle,
            '_bundle_id': bundleId,
            '_bundle_name': bundleTitle,
            '_bundle_size': String(total),
            '_bundle_max': String(requiredQuantity),
            '_bundle_collection': collectionHandle,
            '_bundle_builder_url': builderUrl,
            '_bundle_item': 'true',
            'Pack': bundleTitle
          }
        };
      });

      checkout.disabled = true;
      checkout.textContent = 'Adding your bundle...';
      try {
        window.clCheckoutInProgress = true;
        await replaceExistingPack();
        var response = await fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ items: items })
        });
        if (!response.ok) {
          var data = await response.json().catch(function () { return {}; });
          throw new Error(data.description || data.message || 'The bundle could not be added.');
        }
        window.location.assign('/checkout');
      } catch (requestError) {
        window.clCheckoutInProgress = false;
        showError(requestError.message || 'The bundle could not be added. Please try again.');
        render();
      }
    });

    render();
    restoreFromCart();
  }

  function boot() {
    document.querySelectorAll(ROOT_SELECTOR).forEach(init);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  document.addEventListener('shopify:section:load', boot);
}());
