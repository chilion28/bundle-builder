(function () {
  'use strict';

  var TEMPLATE_API_URL = 'https://citylocsproduction.com/api/get-product-template';
  var roots = document.querySelectorAll('[data-cl-collection-bundle]');
  if (!roots.length) return;

  function text(value) { return String(value == null ? '' : value).trim(); }
  function escapeHtml(value) {
    return text(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fieldSettings(name, design) {
    var lower = text(name).toLowerCase();
    if (lower.indexOf('initial') !== -1) {
      return { max: design.handle.indexOf('2-letter') !== -1 ? 2 : 1, transform: 'uppercase' };
    }
    return { max: lower.indexOf('text') !== -1 ? 20 : 26, transform: '' };
  }

  roots.forEach(function (root) {
    if (root.dataset.clCdbReady === '1') return;
    root.dataset.clCdbReady = '1';
    var configNode = root.querySelector('[data-cl-cdb-designs]');
    var grid = root.querySelector('[data-cl-cdb-design-grid]');
    var fieldsPanel = root.querySelector('[data-cl-cdb-fields-panel]');
    var fields = root.querySelector('[data-cl-cdb-fields]');
    var selected = root.querySelector('[data-cl-cdb-selected] strong');
    var preview = root.querySelector('[data-cl-cdb-preview]');
    var addButton = root.querySelector('[data-cl-cdb-add]');
    var error = root.querySelector('[data-cl-cdb-error]');
    if (!configNode || !grid || !fields || !addButton) return;

    var designs = [];
    try { designs = JSON.parse(configNode.textContent || '[]'); } catch (e) { designs = []; }
    var componentSkus = text(root.dataset.componentSkus).split('|').map(text).filter(Boolean);
    var multiplier = Math.max(1, parseInt(root.dataset.componentMultiplier, 10) || 1);
    var active = null;
    var productCache = {};

    function showError(message) {
      error.textContent = message || '';
      error.hidden = !message;
    }
    function getProduct(handle) {
      if (!handle) return Promise.resolve(null);
      if (!productCache[handle]) {
        productCache[handle] = fetch('/products/' + encodeURIComponent(handle) + '.js', {
          headers: { Accept: 'application/json' }
        }).then(function (response) {
          if (!response.ok) throw new Error('design product unavailable');
          return response.json();
        });
      }
      return productCache[handle];
    }
    function resolveVariants(handle) {
      return getProduct(handle).then(function (product) {
        var bySku = {};
        (product.variants || []).forEach(function (variant) {
          if (variant.sku) bySku[text(variant.sku)] = variant.id;
        });
        var ids = componentSkus.map(function (sku) { return bySku[sku]; });
        if (!ids.length || ids.some(function (id) { return !id; })) return '';
        return ids.map(function (id) { return 'gid://shopify/ProductVariant/' + id; }).join('|');
      });
    }
    function resolveTemplate(handle) {
      return getProduct(handle).then(function (product) {
        if (!product || !product.id) throw new Error('design product unavailable');
        return fetch(TEMPLATE_API_URL, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: String(product.id) })
        }).then(function (response) {
          if (!response.ok) throw new Error('production template unavailable');
          return response.json();
        }).then(function (record) {
          var template = record && text(record.template);
          if (!template) throw new Error('production template missing');
          return { productId: String(product.id), template: template };
        });
      });
    }
    function values() {
      var result = {};
      fields.querySelectorAll('[data-cl-cdb-property]').forEach(function (input) {
        result[input.dataset.clCdbProperty] = text(input.value);
      });
      return result;
    }
    function updateReady() {
      var ready = !!active;
      fields.querySelectorAll('[data-cl-cdb-property]').forEach(function (input) {
        if (!text(input.value)) ready = false;
      });
      addButton.disabled = !ready;
    }
    function renderFields(design) {
      fields.innerHTML = '';
      (design.fields || ['Custom Initial', 'Custom Text']).forEach(function (name, index) {
        var settings = fieldSettings(name, design);
        var id = 'cl-cdb-' + root.dataset.productId + '-' + index;
        var wrap = document.createElement('div');
        wrap.className = 'cl-cdb__field';
        wrap.innerHTML = '<label for="' + id + '">' + escapeHtml(name) + ' *</label>' +
          '<input id="' + id + '" type="text" required maxlength="' + settings.max + '" ' +
          'data-cl-cdb-property="' + escapeHtml(name) + '" autocomplete="off">' +
          '<span class="cl-cdb__count">0/' + settings.max + '</span>';
        var input = wrap.querySelector('input');
        var count = wrap.querySelector('.cl-cdb__count');
        input.addEventListener('input', function () {
          if (settings.transform === 'uppercase') input.value = input.value.toUpperCase();
          count.textContent = input.value.length + '/' + settings.max;
          updateReady();
        });
        fields.appendChild(wrap);
      });
      fieldsPanel.hidden = false;
      updateReady();
    }
    function choose(design, button) {
      active = design;
      grid.querySelectorAll('.cl-cdb__design').forEach(function (item) {
        item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
      });
      selected.textContent = design.title;
      preview.src = design.image;
      preview.hidden = !design.image;
      renderFields(design);
      showError('');
    }

    designs.forEach(function (design) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'cl-cdb__design';
      button.setAttribute('aria-pressed', 'false');
      button.innerHTML = '<img src="' + escapeHtml(design.image) + '" alt="" loading="lazy">' +
        '<strong>' + escapeHtml(design.title) + '</strong>';
      button.addEventListener('click', function () { choose(design, button); });
      grid.appendChild(button);
    });

    addButton.addEventListener('click', function () {
      if (!active || addButton.disabled) return;
      var personalization = values();
      var original = addButton.innerHTML;
      addButton.disabled = true;
      addButton.textContent = 'Adding…';
      showError('');
      Promise.all([resolveVariants(active.handle), resolveTemplate(active.handle)]).then(function (resolved) {
        var properties = {
          'Bundle Design': active.title,
          '_fxb_design_product_id': resolved[1].productId,
          '_plate_product_handle': active.handle,
          '_plate_field_names': (active.fields || []).join('|'),
          '_fxb_schema_version': '3',
          '_cl_template': resolved[1].template,
          '_component_multiplier': String(multiplier)
        };
        if (resolved[0]) properties._component_variants = resolved[0];
        Object.keys(personalization).forEach(function (name) { properties[name] = personalization[name]; });
        return fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ id: root.dataset.variantId, quantity: 1, properties: properties })
        });
      }).then(function (response) {
        if (!response.ok) throw new Error('The bundle could not be added to cart.');
        if (window.AMP_API && typeof window.AMP_API.OPEN_CART === 'function') window.AMP_API.OPEN_CART();
        else window.location.href = '/cart';
      }).catch(function (reason) {
        showError(reason && reason.message ? reason.message : 'Unable to add this bundle. Please try again.');
        addButton.disabled = false;
        addButton.innerHTML = original;
      });
    });
  });
})();
