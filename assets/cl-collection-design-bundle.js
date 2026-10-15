(function () {
  'use strict';

  var TEMPLATE_API_URL = 'https://citylocsproduction.com/api/get-product-template';
  var PREVIEW_IMAGE_BASE = 'https://cdn-zeptoapps.com/product-personalizer/images/citylocs.myshopify.com/';
  var PREVIEW_FONT_BASE = 'https://cdn-zeptoapps.com/product-personalizer/font/citylocs.myshopify.com/';
  var PREVIEW_CANVAS_WIDTH = 720;
  var PREVIEW_CONFIG = {
    'monogram-custom-hat': previewConfig('Blank-Monogram-Patch-Preview.jpg', [
      previewField('Custom Text', 'Custom Initial', 1, 'Cl-monogram.ttf', 256, 50.45, 18.82, 68.65, '#fed7af', 'A'),
      previewField('Custom Text Two', 'Custom Text', 20, 'Eurostile-bold-extended.ttf', 42, 49.61, 36, 54.58, '#fed7af', '')
    ]),
    'monogram-2-letter-custom-hat': previewConfig('2-Letter-Engraved-Monogram-Patch-Preview.jpg', [
      previewField('Custom Text', 'Custom Initials', 2, 'Cl-amarillo-low.ttf', 230, 51.07, 19.33, 68.65, '#fed7af', 'AA'),
      previewField('Custom Text Two', 'Custom Text', 20, 'Eurostile-bold-extended.ttf', 42, 49.89, 35.01, 54.58, '#fed7af', '')
    ]),
    'two-letter-monogram-custom-hat': twoLetterConfig('2-Letter-Monogram-GOLD-Patch-Preview.jpg', '#e3af26'),
    'silver-2-letter-monogram-custom-hat': twoLetterConfig('2-Letter-Monogram-SILVER-Patch-Preview.jpg', '#b3b3b3'),
    'copper-2-letter-monogram-custom-hat': twoLetterConfig('2-Letter-Monogram-COPPER-Patch-Preview.jpg', '#925024'),
    'red-2-letter-monogram-custom-hat': twoLetterConfig('2-Letter-Monogram-RED-Patch-Preview.jpg', '#db1e1e'),
    'blue-2-letter-monogram-custom-hat': twoLetterConfig('2-Letter-Monogram-BLUE-Patch-Preview.jpg', '#0394fe'),
    'pink-2-letter-monogram-custom-hat': twoLetterConfig('2-Letter-Monogram-PINK-Patch-Preview.jpg', '#e61d5e'),
    'token-monogram-custom-hat': previewConfig('Token-Patch-Preview.jpg', [
      previewField('Custom Text', 'Custom Initial', 1, 'Cl-monogram.ttf', 233, 50.09, 22.1, 68.73, '#fed7af', 'A'),
      previewField('Custom Text Two', 'Custom Text', 20, 'Eurostile-bold-extended.ttf', 42, 49.91, 37.52, 54.59, '#fed7af', '')
    ])
  };
  var loadedFonts = {};

  function previewField(property, label, max, font, size, cx, cy, width, color, placeholder) {
    return { property: property, label: label, max: max, font: font, size: size, cx: cx, cy: cy, width: width, color: color, placeholder: placeholder };
  }
  function previewConfig(image, fields) { return { image: image, fields: fields }; }
  function twoLetterConfig(image, color) {
    return previewConfig(image, [
      previewField('Custom Letter', 'Custom Initials', 2, 'Eurostile-bold-extended.ttf', 213, 51.15, 21.45, 62.97, color, 'AA'),
      previewField('Custom Text Two', 'Custom Text', 20, 'Eurostile-bold-extended.ttf', 42, 50.1, 58.5, 54.6, '#020000', 'CUSTOM')
    ]);
  }
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
  function fontFamily(fontFile) {
    var family = 'CLCdb_' + fontFile.replace(/[^A-Za-z0-9]/g, '_');
    if (!loadedFonts[family]) {
      loadedFonts[family] = true;
      var style = document.createElement('style');
      style.textContent = '@font-face{font-family:"' + family + '";src:url("' +
        PREVIEW_FONT_BASE + encodeURIComponent(fontFile) + '");font-display:swap;}';
      document.head.appendChild(style);
    }
    return family;
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

    function activeFields(design) {
      var config = design && PREVIEW_CONFIG[design.handle];
      if (config) return config.fields;
      return (design.fields || ['Custom Initial', 'Custom Text']).map(function (name) {
        var settings = fieldSettings(name, design);
        return { property: name, label: name, max: settings.max, transform: settings.transform, placeholder: '' };
      });
    }

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
    function fitPreview() {
      var stage = preview.querySelector('.cl-cdb__preview-stage');
      if (!stage || !stage.clientWidth) return;
      preview.querySelectorAll('[data-cl-cdb-preview-field]').forEach(function (previewFieldEl) {
        var line = previewFieldEl.querySelector('.cl-cdb__preview-line');
        var fontSize = Number(previewFieldEl.dataset.size || 40) * stage.clientWidth / PREVIEW_CANVAS_WIDTH;
        line.style.fontSize = fontSize + 'px';
        line.style.transform = 'none';
        var target = Number(previewFieldEl.dataset.width || 100) / 100 * stage.clientWidth;
        var measured = line.offsetWidth;
        line.style.transform = measured > target ? 'scaleX(' + (target / measured) + ')' : 'none';
      });
    }
    function renderPreview() {
      if (!active) return;
      var config = PREVIEW_CONFIG[active.handle];
      if (!config) {
        preview.innerHTML = '<img src="' + escapeHtml(active.image) + '" alt="' + escapeHtml(active.title) + '">';
        preview.hidden = !active.image;
        return;
      }
      var current = values();
      var overlays = config.fields.map(function (item) {
        var display = current[item.property] || item.placeholder || '';
        var family = fontFamily(item.font);
        return '<span class="cl-cdb__preview-field" data-cl-cdb-preview-field data-size="' + item.size +
          '" data-width="' + item.width + '" style="left:' + item.cx + '%;top:' + item.cy + '%;color:' +
          item.color + ';font-family:\'' + family + '\',sans-serif"><span class="cl-cdb__preview-line">' +
          escapeHtml(display) + '</span></span>';
      }).join('');
      preview.innerHTML = '<div class="cl-cdb__preview-stage"><img src="' + PREVIEW_IMAGE_BASE +
        encodeURIComponent(config.image) + '" alt="Preview of ' + escapeHtml(active.title) + '">' + overlays +
        '</div><p class="cl-cdb__preview-note">This is just a preview. Text will be adjusted to look its best.</p>';
      preview.hidden = false;
      var image = preview.querySelector('img');
      if (image) image.addEventListener('load', fitPreview, { once: true });
      Object.keys(loadedFonts).forEach(function (family) {
        if (document.fonts && document.fonts.load) document.fonts.load('16px "' + family + '"').then(fitPreview).catch(fitPreview);
      });
      requestAnimationFrame(fitPreview);
    }
    function renderFields(design) {
      fields.innerHTML = '';
      activeFields(design).forEach(function (definition, index) {
        var name = definition.property;
        var settings = fieldSettings(name, design);
        settings.max = definition.max || settings.max;
        settings.transform = definition.transform || (/initial/i.test(definition.label || '') ? 'uppercase' : settings.transform);
        var id = 'cl-cdb-' + root.dataset.productId + '-' + index;
        var wrap = document.createElement('div');
        wrap.className = 'cl-cdb__field';
        wrap.innerHTML = '<label for="' + id + '">' + escapeHtml(definition.label || name) + ' *</label>' +
          '<input id="' + id + '" type="text" required maxlength="' + settings.max + '" ' +
          'data-cl-cdb-property="' + escapeHtml(name) + '" autocomplete="off">' +
          '<span class="cl-cdb__count">0/' + settings.max + '</span>';
        var input = wrap.querySelector('input');
        var count = wrap.querySelector('.cl-cdb__count');
        input.addEventListener('input', function () {
          if (settings.transform === 'uppercase') input.value = input.value.toUpperCase();
          count.textContent = input.value.length + '/' + settings.max;
          updateReady();
          renderPreview();
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
      renderFields(design);
      renderPreview();
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
    window.addEventListener('resize', fitPreview);

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
          '_plate_field_names': activeFields(active).map(function (item) { return item.property; }).join('|'),
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
