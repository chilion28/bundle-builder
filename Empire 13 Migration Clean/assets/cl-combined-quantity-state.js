(function () {
  if (window.CLCombinedQuantityState) return;
  window.CLCombinedQuantityState = true;

  var stores = new WeakMap();
  var submitting = new WeakSet();
  function root(el) { return el && el.closest('product-hot-reload'); }
  function store(el) {
    var product = root(el);
    if (!product) return null;
    if (!stores.has(product)) {
      stores.set(product, { quantities: new Map(), tierKey: '', tiers: null, tierLoading: false, tierAttempted: false });
    }
    return stores.get(product);
  }
  function propertiesFor(product) {
    var form = product && product.querySelector('form[action*="/cart/add"]');
    if (!form) return {};
    return Array.from(form.elements).reduce(function (result, field) {
      var match = field.name && field.name.match(/^properties\[(.+)\]$/);
      if (!match || field.disabled || ((field.type === 'checkbox' || field.type === 'radio') && !field.checked)) return result;
      if (field.value !== '') result[match[1]] = field.value;
      return result;
    }, {});
  }
  function money(cents) { return '$' + (Math.max(0, cents) / 100).toFixed(2); }
  function setText(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
  }
  function tierIndex(tiers, qty) {
    var index = 0;
    for (var i = 0; i < tiers.qtys.length; i++) {
      if (qty < tiers.qtys[i]) break;
      index = i;
    }
    return index;
  }
  function loadTiers(product, panel, state) {
    var key = panel.dataset.tags || '[]';
    if (state.tierKey !== key) {
      state.tierKey = key;
      state.tiers = null;
      state.tierAttempted = false;
    }
    if (state.tiers || state.tierLoading || state.tierAttempted) return;
    state.tierAttempted = true;

    // Combined Listing parents currently have no product tags. The pricing
    // endpoint rejects an empty tag array, so use the established fallback
    // tiers below without making a request.
    try {
      if (!JSON.parse(key).length) return;
    } catch (error) {
      return;
    }

    state.tierLoading = true;
    fetch('/apps/citylocs/discount-info?tags=' + encodeURIComponent(key))
      .then(function (response) {
        if (!response.ok) throw new Error('Discount tier request failed');
        return response.json();
      })
      .then(function (data) {
        if (data && data.discountBreak && data.discountAmount) {
          state.tiers = {
            qtys: [1].concat(data.discountBreak.map(Number)),
            amounts: [0].concat(data.discountAmount.map(Number))
          };
        }
      })
      .catch(function () {})
      .finally(function () {
        state.tierLoading = false;
        updateSummary(product);
      });
  }
  function updateSummary(product) {
    if (!product) return;
    var panel = product.querySelector('[data-cl-combined-pricing]');
    if (!panel) return;
    var state = store(product);
    loadTiers(product, panel, state);

    var entries = Array.from(state.quantities.values());
    var qty = entries.reduce(function (sum, entry) { return sum + entry.quantity; }, 0);
    var subtotal = entries.reduce(function (sum, entry) { return sum + (entry.price * entry.quantity); }, 0);
    var visiblePrices = Array.from(product.querySelectorAll('[data-cl-combined-quantity-row]')).map(function (row) {
      return parseInt(row.dataset.price, 10) || 0;
    }).filter(Boolean);
    var basePrice = entries.length
      ? Math.min.apply(null, entries.map(function (entry) { return entry.price; }))
      : (visiblePrices.length ? Math.min.apply(null, visiblePrices) : 0);

    var tiers = state.tiers || { qtys: [1, 2, 3, 6, 12, 24, 36], amounts: [0, 2, 4, 5, 10, 12, 16] };
    var index = tierIndex(tiers, qty);
    var discountCents = Math.round((tiers.amounts[index] || 0) * 100);
    var savings = discountCents * qty;
    var estimated = subtotal - savings;
    var priceEach = qty ? Math.round(estimated / qty) : basePrice;

    setText(panel.querySelector('[data-cl-pricing-qty]'), String(qty));
    setText(panel.querySelector('[data-cl-pricing-each]'), money(priceEach));
    setText(panel.querySelector('[data-cl-pricing-subtotal]'), money(subtotal));
    setText(panel.querySelector('[data-cl-pricing-save]'), '− ' + money(savings));
    setText(panel.querySelector('[data-cl-pricing-total]'), money(estimated));

    var unlock = panel.querySelector('[data-cl-pricing-unlock]');
    if (index < tiers.qtys.length - 1) {
      var nextQty = tiers.qtys[index + 1];
      var nextPrice = basePrice - Math.round((tiers.amounts[index + 1] || 0) * 100);
      setText(unlock, 'ORDER ' + (nextQty - qty) + ' MORE AND GET THEM AT ' + money(nextPrice) + ' EACH');
    } else {
      setText(unlock, "YOU'VE UNLOCKED OUR BEST PRICE — " + money(basePrice - discountCents) + ' EACH');
    }
  }
  function sync(product) {
    var state = store(product);
    var quantities = state.quantities;
    var properties = propertiesFor(product);
    product.querySelectorAll('[data-cl-combined-quantity-row]').forEach(function (row) {
      if (row.dataset.clVirtualRow) return;
      var input = row.querySelector('[data-cl-combined-qty]');
      var qty = Math.max(0, parseInt(input && input.value, 10) || 0);
      if (qty) quantities.set(row.dataset.variantId, {
        quantity: qty,
        price: parseInt(row.dataset.price, 10) || 0,
        properties: Object.assign({}, properties)
      });
      else quantities.delete(row.dataset.variantId);
    });
    updateSummary(product);
  }
  function restore(product) {
    var state = store(product);
    var quantities = state.quantities;
    product.querySelectorAll('[data-cl-combined-quantity-row]:not([data-cl-virtual-row])').forEach(function (row) {
      var input = row.querySelector('[data-cl-combined-qty]');
      var entry = quantities.get(row.dataset.variantId);
      if (input) input.value = entry ? entry.quantity : 0;
    });
    updateSummary(product);
  }

  document.addEventListener('click', function (event) {
    if (!event.target.closest('[data-cl-combined-plus], [data-cl-combined-minus]')) return;
    var product = root(event.target);
    requestAnimationFrame(function () { sync(product); });
  }, true);
  document.addEventListener('input', function (event) {
    if (event.target.matches('[data-cl-combined-qty]')) sync(root(event.target));
  }, true);
  document.addEventListener('change', function (event) {
    if (!event.target.hasAttribute('data-product-hot-reload-trigger')) return;
    var product = root(event.target);
    sync(product);
    // Keep quantities from every design in the same Combined Listing session.
    // A design change hot-reloads the wrapper contents, but the wrapper itself
    // survives, so its draft can safely contain variant IDs from sibling products.
    setTimeout(function () { restore(product); }, 700);
  }, true);
  async function submitCombined(event, explicitForm) {
    var product = this instanceof HTMLElement ? this : root(event.target);
    if (!product || !product.querySelector('[data-cl-combined-quantity-grid]')) return;
    var form = explicitForm || (event.target.matches && event.target.matches('form') ? event.target : event.target.closest('form'));
    if (!form) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    // The button listener plus Empire/AMP capture fallbacks can observe the same
    // customer action. Only one handler may validate or send the accumulated draft.
    if (submitting.has(product)) return;
    submitting.add(product);

    sync(product);

    // Enforce required personalization fields (e.g. Custom Text). The combined
    // add-to-cart bypasses native form validation, so check it ourselves. A
    // field counts as required only when it's `required` and enabled (Month/Year
    // and the optional second line are disabled when not in use, so they're
    // skipped). Open its accordion + focus it so the customer sees what's missing.
    var personalizationFields = product.querySelectorAll('[data-cl-personalization-field]');
    for (var pf = 0; pf < personalizationFields.length; pf++) {
      var pField = personalizationFields[pf];
      if (pField.required && !pField.disabled && !String(pField.value || '').trim()) {
        var det = pField.closest('details');
        if (det && !det.open) det.open = true;
        pField.scrollIntoView({ behavior: 'smooth', block: 'center' });
        try { pField.focus({ preventScroll: true }); } catch (e) { try { pField.focus(); } catch (e2) {} }
        if (typeof pField.reportValidity === 'function') pField.reportValidity();
        submitting.delete(product);
        return;
      }
    }

    var quantities = store(product).quantities;
    var items = Array.from(quantities, function (entry) {
      return { id: entry[0], quantity: entry[1].quantity, properties: entry[1].properties };
    });

    if (!items.length) {
      var grid = product.querySelector('[data-cl-combined-quantity-grid]');
      if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.alert('Please choose a quantity for at least one color.');
      submitting.delete(product);
      return;
    }

    var submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
      var response = await fetch(window.Shopify.routes.root + 'cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ items: items })
      });
      if (!response.ok) throw await response.json();

      quantities.clear();
      restore(product);
      if (window.AMP_API && typeof window.AMP_API.OPEN_CART === 'function') {
        window.AMP_API.OPEN_CART();
      } else {
        window.location.href = window.Shopify.routes.root + 'cart';
      }
    } catch (error) {
      console.error('Unable to add combined-listing quantities:', error);
      window.alert(error.description || error.message || 'Unable to add the selected hats to the cart.');
    } finally {
      submitting.delete(product);
      if (submitButton) submitButton.disabled = false;
    }
  }

  function armBatchButton(product) {
    if (!product || !product.querySelector('[data-cl-combined-quantity-grid]')) return;
    var form = product.querySelector('form[action*="/cart/add"]');
    var button = form && form.querySelector('.add-to-cart-button, button[type="submit"]');
    if (!button || button.dataset.clCombinedBatchButton === 'true') return;

    // This button must never enter Empire's one-variant submit pipeline.
    button.type = 'button';
    button.dataset.clCombinedBatchButton = 'true';
    button.addEventListener('click', function (event) {
      submitCombined.call(product, event, form);
    });
  }

  function armAllBatchButtons(scope) {
    if (scope.matches && scope.matches('product-hot-reload')) armBatchButton(scope);
    scope.querySelectorAll && scope.querySelectorAll('product-hot-reload').forEach(armBatchButton);
  }

  // First-load default: select the state's own plate (tagged
  // [data-cl-state-plate]) instead of Shopify's default variant (which lands on
  // whichever design is the first available variant, e.g. Blackout). Only fires
  // on the initial page load — when the URL carries no ?variant= selection — so
  // it never overrides a customer who has actively chosen a design. After this
  // one hot-reload, design switching behaves normally.
  function defaultToStatePlate(product) {
    if (!product || product.dataset.clStatePlateDefaulted === 'true') return;
    if (!product.querySelector('[data-cl-combined-quantity-grid]')) return;
    // Respect an explicit variant selection carried in the URL.
    try {
      if (new URLSearchParams(window.location.search).has('variant')) {
        product.dataset.clStatePlateDefaulted = 'true';
        return;
      }
    } catch (e) {}
    var statePlate = product.querySelector('input[type="radio"][data-cl-state-plate]');
    if (!statePlate) { product.dataset.clStatePlateDefaulted = 'true'; return; }
    product.dataset.clStatePlateDefaulted = 'true';
    if (statePlate.checked) return; // already the default — nothing to do
    // Trigger the theme's normal design-change flow.
    statePlate.checked = true;
    statePlate.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function defaultAll(scope) {
    if (scope.matches && scope.matches('product-hot-reload')) defaultToStatePlate(scope);
    scope.querySelectorAll && scope.querySelectorAll('product-hot-reload').forEach(defaultToStatePlate);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { armAllBatchButtons(document); defaultAll(document); });
  } else {
    armAllBatchButtons(document);
    defaultAll(document);
  }

  window.addEventListener('click', function (event) {
    var submitButton = event.target.closest && event.target.closest('button[type="submit"], input[type="submit"]');
    var product = root(submitButton);
    if (!submitButton || !product || !product.querySelector('[data-cl-combined-quantity-grid]')) return;
    submitCombined.call(product, event);
  }, true);

  // Intercept at window capture so Empire/AMP cannot submit the currently
  // selected variant before the combined-listing batch request is assembled.
  window.addEventListener('submit', function (event) {
    var product = root(event.target);
    if (!product || !product.querySelector('[data-cl-combined-quantity-grid]')) return;
    submitCombined.call(product, event);
  }, true);

  customElements.whenDefined('product-hot-reload').then(function () {
    var ProductHotReload = customElements.get('product-hot-reload');
    if (!ProductHotReload || ProductHotReload.prototype.clCombinedSubmitPatched) return;
    ProductHotReload.prototype.onCombinedQuantitySubmit = submitCombined;
    ProductHotReload.prototype.clCombinedSubmitPatched = true;
  });

  new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      var product = root(mutation.target);
      if (product) {
        restore(product);
        armBatchButton(product);
      }
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType === 1) armAllBatchButtons(node);
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
