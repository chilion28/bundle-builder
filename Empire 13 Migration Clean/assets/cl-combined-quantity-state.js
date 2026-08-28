(function () {
  if (window.CLCombinedQuantityState) return;
  window.CLCombinedQuantityState = true;

  var stores = new WeakMap();
  function root(el) { return el && el.closest('product-hot-reload'); }
  function context(product) {
    function selectedValue(name) {
      var select = product.querySelector('select[name="' + name + '"]');
      var radio = product.querySelector('input[type="radio"][name="' + name + '"]:checked');
      return String((select && select.value) || (radio && radio.value) || '').trim();
    }
    return selectedValue('Select State') + '::' + selectedValue('Select Design');
  }
  function store(el) {
    var product = root(el);
    if (!product) return null;
    if (!stores.has(product)) {
      stores.set(product, { context: context(product), quantities: new Map() });
    }
    return stores.get(product);
  }
  function sync(product) {
    var state = store(product);
    var quantities = state.quantities;
    product.querySelectorAll('[data-cl-combined-quantity-row]').forEach(function (row) {
      if (row.dataset.clVirtualRow) return;
      var input = row.querySelector('[data-cl-combined-qty]');
      var qty = Math.max(0, parseInt(input && input.value, 10) || 0);
      if (qty) quantities.set(row.dataset.variantId, qty);
      else quantities.delete(row.dataset.variantId);
    });
  }
  function restore(product) {
    var state = store(product);
    var nextContext = context(product);
    if (state.context !== nextContext) {
      state.context = nextContext;
      state.quantities.clear();
    }
    var quantities = state.quantities;
    product.querySelectorAll('[data-cl-combined-quantity-row]:not([data-cl-virtual-row])').forEach(function (row) {
      var input = row.querySelector('[data-cl-combined-qty]');
      if (input) input.value = quantities.get(row.dataset.variantId) || 0;
    });
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
    var state = store(product);
    sync(product);
    var nextContext = context(product);
    if (state.context !== nextContext) {
      state.context = nextContext;
      state.quantities.clear();
    }
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
        return;
      }
    }

    var quantities = store(product).quantities;
    var properties = Array.from(form.elements).reduce(function (result, field) {
      var match = field.name && field.name.match(/^properties\[(.+)\]$/);
      if (!match || field.disabled || ((field.type === 'checkbox' || field.type === 'radio') && !field.checked)) return result;
      if (field.value !== '') result[match[1]] = field.value;
      return result;
    }, {});
    var items = Array.from(quantities, function (entry) {
      return { id: entry[0], quantity: entry[1], properties: properties };
    });

    if (!items.length) {
      var grid = product.querySelector('[data-cl-combined-quantity-grid]');
      if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.alert('Please choose a quantity for at least one color.');
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
