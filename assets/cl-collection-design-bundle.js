(function () {
  'use strict';

  var TEMPLATE_API_URL = 'https://citylocsproduction.com/api/get-product-template';
  var PREVIEW_IMAGE_BASE = 'https://cdn-zeptoapps.com/product-personalizer/images/citylocs.myshopify.com/';
  var PREVIEW_FONT_BASE = 'https://cdn-zeptoapps.com/product-personalizer/font/citylocs.myshopify.com/';
  var PREVIEW_CONFIG = {
    'monogram-custom-hat': previewConfig('Blank-Monogram-Patch-Preview.jpg', [
      previewField('Custom Text', 'Custom Initial', 1, 'Cl-monogram.ttf', 409.333, 50.45, 457.56, 68.65, '#fed7af', 'A', null, 122),
      previewField('Custom Text Two', 'Custom Text', 20, 'Eurostile-bold-extended.ttf', 66.6667, 49.61, 338, 54.58, '#fed7af', '', 313)
    ], 720, 800),
    'monogram-2-letter-custom-hat': previewConfig('2-Letter-Engraved-Monogram-Patch-Preview.jpg', [
      previewField('Custom Text', 'Custom Initials', 2, 'Cl-amarillo-low.ttf', 276, 51.07, 322.98, 68.65, '#fed7af', 'AA'),
      previewField('Custom Text Two', 'Custom Text', 20, 'Eurostile-bold-extended.ttf', 49.3333, 49.89, 247.06, 54.58, '#fed7af', '', 228.56)
    ], 800, 600, '2-Letter-Engraved-Monogram-Patch-Cover-Bar-Thin.png'),
    'two-letter-monogram-custom-hat': twoLetterConfig('2-Letter-Monogram-GOLD-Patch-Preview.jpg', '#e3af26'),
    'silver-2-letter-monogram-custom-hat': twoLetterConfig('2-Letter-Monogram-SILVER-Patch-Preview.jpg', '#b3b3b3'),
    'copper-2-letter-monogram-custom-hat': twoLetterConfig('2-Letter-Monogram-COPPER-Patch-Preview.jpg', '#925024'),
    'red-2-letter-monogram-custom-hat': twoLetterConfig('2-Letter-Monogram-RED-Patch-Preview.jpg', '#db1e1e'),
    'blue-2-letter-monogram-custom-hat': twoLetterConfig('2-Letter-Monogram-BLUE-Patch-Preview.jpg', '#0394fe'),
    'pink-2-letter-monogram-custom-hat': twoLetterConfig('2-Letter-Monogram-PINK-Patch-Preview.jpg', '#e61d5e'),
    'token-monogram-custom-hat': previewConfig('Token-Patch-Preview.jpg', [
      previewField('Custom Text', 'Custom Initial', 1, 'Cl-monogram.ttf', 372, 50.09, 455.8, 68.73, '#fed7af', 'A'),
      previewField('Custom Text Two', 'Custom Text', 20, 'Eurostile-bold-extended.ttf', 66.6667, 49.91, 350.16, 52, '#fed7af', '', 325.16)
    ], 720, 800)
  };
  var loadedFonts = {};

  function previewField(property, label, max, font, size, cx, baseline, width, color, placeholder, baselineAnchor, startX) {
    return { property: property, label: label, max: max, font: font, size: size, cx: cx, baseline: baseline, width: width, color: color, placeholder: placeholder, baselineAnchor: baselineAnchor, startX: startX };
  }
  function previewConfig(image, fields, width, height, cover) {
    return { image: image, fields: fields, width: width || 800, height: height || 600, cover: cover || '' };
  }
  function twoLetterConfig(image, color) {
    return previewConfig(image, [
      previewField('Custom Letter', 'Custom Initials', 2, 'Eurostile-bold-extended.ttf', 238.667, 51.15, 313.7, 62.97, color, 'AA'),
      previewField('Custom Text Two', 'Custom Text', 20, 'Eurostile-bold-extended.ttf', 49.3333, 50.1, 388, 54.6, '#020000', 'CUSTOM', 369.5)
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
    var productId = root.dataset.productId;
    var componentScope = document.querySelectorAll('[data-cl-cdb-product="' + productId + '"]');
    function findPart(selector) {
      var local = root.querySelector(selector);
      if (local) return local;
      for (var i = 0; i < componentScope.length; i += 1) {
        var match = componentScope[i].matches(selector) ? componentScope[i] : componentScope[i].querySelector(selector);
        if (match) return match;
      }
      return null;
    }
    var configNode = findPart('[data-cl-cdb-designs]');
    var grid = findPart('[data-cl-cdb-design-grid]');
    var fieldsPanel = findPart('[data-cl-cdb-fields-panel]');
    var fields = findPart('[data-cl-cdb-fields]');
    var selected = findPart('[data-cl-cdb-selected] strong');
    var preview = findPart('[data-cl-cdb-preview]');
    var previewComponent = preview && preview.closest('.cl-cdb-preview-component');
    var addButton = root.querySelector('[data-cl-cdb-add]');
    var error = root.querySelector('[data-cl-cdb-error]');
    if (!configNode || !grid || !fields || !selected || !preview || !addButton) return;

    var designs = [];
    try { designs = JSON.parse(configNode.textContent || '[]'); } catch (e) { designs = []; }
    var componentSkus = text(root.dataset.componentSkus).split('|').map(text).filter(Boolean);
    var multiplier = Math.max(1, parseInt(root.dataset.componentMultiplier, 10) || 1);
    var designLayout = text(grid.dataset.clCdbLayout || 'grid').toLowerCase();
    if (['grid', 'carousel', 'dropdown'].indexOf(designLayout) === -1) designLayout = 'grid';
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
    function setPreviewHidden(hidden) {
      preview.hidden = hidden;
      if (previewComponent) previewComponent.hidden = hidden;
    }
    function fitPreview() {
      var canvas = preview.querySelector('[data-cl-cdb-preview-canvas="base"]');
      var topCanvas = preview.querySelector('[data-cl-cdb-preview-canvas="top"]');
      var config = active && PREVIEW_CONFIG[active.handle];
      if (!canvas || !topCanvas || !config) return;
      var context = canvas.getContext('2d');
      var topContext = topCanvas.getContext('2d');
      var current = values();
      context.clearRect(0, 0, config.width, config.height);
      topContext.clearRect(0, 0, config.width, config.height);
      config.fields.forEach(function (item, index) {
        var display = current[item.property] || item.placeholder || '';
        if (!display) return;
        var drawContext = config.cover && index > 0 ? topContext : context;
        var family = fontFamily(item.font);
        var fontSize = item.size;
        var maxWidth = item.width / 100 * config.width;
        drawContext.font = fontSize + 'px "' + family + '"';
        while (fontSize > 8 && drawContext.measureText(display).width > maxWidth) {
          fontSize = Math.max(8, fontSize - 4 / 3);
          drawContext.font = fontSize + 'px "' + family + '"';
        }
        var baseline = item.baselineAnchor == null ? item.baseline : item.baselineAnchor + fontSize * .375;
        drawContext.fillStyle = item.color;
        drawContext.textAlign = item.startX == null ? 'center' : 'start';
        drawContext.textBaseline = 'alphabetic';
        drawContext.fillText(display.toUpperCase(), item.startX == null ? item.cx / 100 * config.width : item.startX, baseline);
      });
    }
    function renderPreview() {
      if (!active) return;
      var config = PREVIEW_CONFIG[active.handle];
      if (!config) {
        preview.innerHTML = '<img src="' + escapeHtml(active.image) + '" alt="' + escapeHtml(active.title) + '">';
        setPreviewHidden(!active.image);
        return;
      }
      config.fields.forEach(function (item) { fontFamily(item.font); });
      preview.innerHTML = '<div class="cl-cdb__preview-stage" style="aspect-ratio:' + config.width + '/' + config.height + '"><img src="' + PREVIEW_IMAGE_BASE +
        encodeURIComponent(config.image) + '" alt="Preview of ' + escapeHtml(active.title) + '">' +
        '<canvas class="cl-cdb__preview-canvas" data-cl-cdb-preview-canvas="base" width="' + config.width +
        '" height="' + config.height + '" aria-hidden="true"></canvas>' +
        (config.cover ? '<img class="cl-cdb__preview-cover" src="' + PREVIEW_IMAGE_BASE + encodeURIComponent(config.cover) + '" alt="" aria-hidden="true">' : '') +
        '<canvas class="cl-cdb__preview-canvas" data-cl-cdb-preview-canvas="top" width="' + config.width +
        '" height="' + config.height + '" aria-hidden="true"></canvas>' +
        '</div>';
      setPreviewHidden(false);
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
    function setDropdownOverflow(open) {
      var parent = grid.parentElement;
      while (parent && parent !== document.body) {
        if (parent.matches('.gp-accordion-item_body, .gp-accordion-item, .gp-overflow-clip')) {
          parent.classList.toggle('cl-cdb-dropdown-open', open);
        }
        parent = parent.parentElement;
      }
    }
    function choose(design, button) {
      active = design;
      grid.querySelectorAll('.cl-cdb__design').forEach(function (item) {
        item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
      });
      var dropdownSearch = grid.querySelector('[data-cl-cdb-design-search]');
      var dropdownMenu = grid.querySelector('[data-cl-cdb-design-menu]');
      var dropdownClear = grid.querySelector('[data-cl-cdb-design-clear]');
      if (dropdownSearch) {
        dropdownSearch.value = design.title;
        dropdownSearch.setAttribute('aria-expanded', 'false');
      }
      if (dropdownMenu) dropdownMenu.hidden = true;
      setDropdownOverflow(false);
      if (dropdownClear) dropdownClear.hidden = false;
      var dropdownImage = grid.querySelector('[data-cl-cdb-dropdown-image]');
      var dropdownTitle = grid.querySelector('[data-cl-cdb-dropdown-title]');
      var dropdownChoice = grid.querySelector('[data-cl-cdb-dropdown-choice]');
      if (dropdownImage) {
        dropdownImage.src = design.image || '';
        dropdownImage.alt = '';
      }
      if (dropdownTitle) dropdownTitle.textContent = design.title;
      if (dropdownChoice) dropdownChoice.hidden = false;
      selected.textContent = design.title;
      renderFields(design);
      renderPreview();
      showError('');
    }

    function renderDesignButton(design, container) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'cl-cdb__design';
      button.setAttribute('aria-pressed', 'false');
      button.innerHTML = '<img src="' + escapeHtml(design.image) + '" alt="" loading="lazy">' +
        '<strong>' + escapeHtml(design.title) + '</strong>';
      button.addEventListener('click', function () { choose(design, button); });
      container.appendChild(button);
    }

    if (designLayout === 'dropdown') {
      grid.innerHTML = '<div class="cl-cdb__design-combo" data-cl-cdb-design-combo>' +
        '<input class="cl-cdb__design-search" type="text" autocomplete="off" ' +
          'placeholder="Search or choose a design…" role="combobox" aria-autocomplete="list" ' +
          'aria-expanded="false" aria-controls="cl-cdb-design-menu-' + escapeHtml(productId) + '" ' +
          'data-cl-cdb-design-search>' +
        '<button class="cl-cdb__design-clear" type="button" aria-label="Clear selected design" ' +
          'data-cl-cdb-design-clear hidden>×</button>' +
        '<ul class="cl-cdb__design-menu" id="cl-cdb-design-menu-' + escapeHtml(productId) + '" ' +
          'role="listbox" data-cl-cdb-design-menu hidden></ul>' +
      '</div>' +
      '<div class="cl-cdb__dropdown-choice" data-cl-cdb-dropdown-choice hidden>' +
        '<img data-cl-cdb-dropdown-image alt="">' +
        '<div><span>Selected Design</span><strong data-cl-cdb-dropdown-title></strong></div>' +
      '</div>';
      var combo = grid.querySelector('[data-cl-cdb-design-combo]');
      var search = grid.querySelector('[data-cl-cdb-design-search]');
      var menu = grid.querySelector('[data-cl-cdb-design-menu]');
      var clear = grid.querySelector('[data-cl-cdb-design-clear]');
      var filteredDesigns = designs.slice();
      var activeOption = -1;

      function clearDropdownSelection() {
        active = null;
        selected.textContent = 'Choose a design';
        fields.innerHTML = '';
        fieldsPanel.hidden = true;
        preview.innerHTML = '';
        setPreviewHidden(true);
        grid.querySelector('[data-cl-cdb-dropdown-choice]').hidden = true;
        clear.hidden = true;
        addButton.disabled = true;
      }
      function renderDesignMenu(showAll) {
        var query = showAll ? '' : text(search.value).toLowerCase();
        filteredDesigns = designs.filter(function (design) {
          return !query || design.title.toLowerCase().indexOf(query) !== -1;
        });
        activeOption = Math.min(activeOption, filteredDesigns.length - 1);
        menu.innerHTML = filteredDesigns.length ? filteredDesigns.map(function (design, index) {
          return '<li class="cl-cdb__design-option' + (index === activeOption ? ' is-active' : '') + '" ' +
            'role="option" data-cl-cdb-design-option="' + escapeHtml(design.handle) + '">' +
              '<img src="' + escapeHtml(design.image) + '" alt="" loading="lazy">' +
              '<span>' + escapeHtml(design.title) + '</span>' +
            '</li>';
        }).join('') : '<li class="cl-cdb__design-no-results">No designs found</li>';
      }
      function openDesignMenu(showAll) {
        renderDesignMenu(showAll);
        menu.hidden = false;
        search.setAttribute('aria-expanded', 'true');
        setDropdownOverflow(true);
      }
      function closeDesignMenu() {
        menu.hidden = true;
        activeOption = -1;
        search.setAttribute('aria-expanded', 'false');
        setDropdownOverflow(false);
        if (active) search.value = active.title;
      }
      search.addEventListener('focus', function () {
        search.select();
        activeOption = -1;
        openDesignMenu(true);
      });
      search.addEventListener('input', function () {
        clearDropdownSelection();
        activeOption = -1;
        clear.hidden = !text(search.value);
        openDesignMenu(false);
      });
      search.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          if (menu.hidden) openDesignMenu(false);
          activeOption = Math.min(activeOption + 1, filteredDesigns.length - 1);
          renderDesignMenu(false);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          activeOption = Math.max(activeOption - 1, 0);
          renderDesignMenu(false);
        } else if (event.key === 'Enter' && activeOption >= 0 && filteredDesigns[activeOption]) {
          event.preventDefault();
          choose(filteredDesigns[activeOption], null);
        } else if (event.key === 'Escape') closeDesignMenu();
      });
      menu.addEventListener('mousedown', function (event) {
        var option = event.target.closest('[data-cl-cdb-design-option]');
        if (!option) return;
        event.preventDefault();
        var design = designs.find(function (item) { return item.handle === option.dataset.clCdbDesignOption; });
        if (design) choose(design, null);
      });
      clear.addEventListener('click', function () {
        search.value = '';
        clearDropdownSelection();
        search.focus();
        openDesignMenu(true);
      });
      document.addEventListener('click', function (event) { if (!combo.contains(event.target)) closeDesignMenu(); });
    } else if (designLayout === 'carousel') {
      var carousel = document.createElement('div');
      carousel.className = 'cl-cdb__design-carousel';
      carousel.setAttribute('data-cl-cdb-carousel', '');
      designs.forEach(function (design) { renderDesignButton(design, carousel); });
      grid.appendChild(carousel);
      var controls = document.createElement('div');
      controls.className = 'cl-cdb__carousel-controls';
      controls.innerHTML = '<button type="button" data-cl-cdb-carousel-prev aria-label="Previous designs">‹</button>' +
        '<button type="button" data-cl-cdb-carousel-next aria-label="Next designs">›</button>';
      controls.addEventListener('click', function (event) {
        var direction = event.target.closest('[data-cl-cdb-carousel-prev]') ? -1 :
          (event.target.closest('[data-cl-cdb-carousel-next]') ? 1 : 0);
        if (direction) carousel.scrollBy({ left: direction * Math.max(240, carousel.clientWidth * .8), behavior: 'smooth' });
      });
      grid.appendChild(controls);
    } else {
      grid.classList.add('cl-cdb__design-grid');
      designs.forEach(function (design) { renderDesignButton(design, grid); });
    }
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
