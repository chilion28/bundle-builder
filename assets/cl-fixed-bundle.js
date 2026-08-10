/* Fixed 3-Hat Bundle — state/design personalizer.
 *
 * Inventory remains controlled by the parent product's custom.bundle_components
 * metafield and the existing Cart Transform. This file only supplies the plate
 * design contract and exact line-item property names used by production.
 */
(function () {
  'use strict';

  var CART_EDIT_STORAGE_KEY = 'cl-fixed-bundle-cart-edit';

  var FIELD_DEFAULTS = {
    'Month':             { maxLength: 3,  placeholder: 'MONTH', required: true },
    'Year':              { maxLength: 4,  placeholder: 'YEAR', required: true },
    'Custom Text':       { maxLength: 20, placeholder: 'CUSTOM TEXT', required: true },
    'Custom Text One':   { maxLength: 20, placeholder: 'CUSTOM TEXT', required: true },
    'Custom Text Two':   { maxLength: 26, placeholder: 'OPTIONAL', required: false },
    'Custom Text Three': { maxLength: 30, placeholder: 'CUSTOM TEXT', required: true },
    'Custom Text Four':  { maxLength: 30, placeholder: 'CUSTOM TEXT', required: true }
  };

  /* Initial featured-design map, derived from the 3-pack builder's current
   * featured order. Change only the handle/title/fields for a state when its
   * approved bestseller changes. Field names are the Zepto/production contract. */
  var STATE_DESIGNS = {
    'Alabama':        design('hat-alabama-plate', 'Alabama Plate Hat'),
    'Alaska':         design('test-plate', 'Alaska Plate Hat'),
    'Arizona':        design('hat-arizona-plate-2018', 'Arizona 2018 Plate Hat'),
    'Arkansas':       design('hat-arkansas-plate', 'Arkansas Plate Hat'),
    'California':     design('hat-cali-plates', "California 60's Plate Hat", ['Custom Text', 'Custom Text Two', 'Month', 'Year']),
    'Colorado':       design('hat-colorado-plate', 'Colorado Plate Hat'),
    'Connecticut':    design('hat-connecticut-plate', 'Connecticut Plate Hat'),
    'Delaware':       design('hat-delaware-plate', 'Delaware Plate Hat'),
    'District of Columbia': design('copy-of-hat-washington-plate', 'Washington DC Plate Hat'),
    'Florida':        design('hat-florida', 'Florida Plate Hat'),
    'Georgia':        design('hat-georgia-plate', 'Georgia Plate Hat'),
    'Hawaii':         design('hat-hawaii-plate', 'Hawaii Plate Hat'),
    'Idaho':          design('hat-idaho-plate', 'Idaho Plate Hat'),
    'Illinois':       design('hat-illinois', 'Illinois Plate Hat'),
    'Indiana':        design('hat-indiana-plate', 'Indiana Plate Hat'),
    'Iowa':           design('hat-iowa-plate', 'Iowa Plate Hat'),
    'Kansas':         design('hat-kansas', 'Kansas Plate Hat'),
    'Kentucky':       design('hat-kentucky-plate', 'Kentucky Plate Hat'),
    'Louisiana':      design('louisiana-2022-plate-hat', 'Louisiana 2022 Plate Hat'),
    'Maine':          design('hat-maine-plate', 'Maine Plate Hat'),
    'Maryland':       design('hat-maryland-plate', 'Maryland Plate Hat'),
    'Massachusetts':  design('hat-massachusetts', 'Massachusetts Plate Hat'),
    'Michigan':       design('hat-michigan', 'Michigan Plate Hat'),
    'Minnesota':      design('hat-minnesota-plate', 'Minnesota Plate Hat'),
    'Mississippi':    design('mississippi-2022-plate-hat', 'Mississippi 2022 Plate Hat'),
    'Missouri':       design('missouri-plate-hat-v2', 'Missouri Plate Hat v2'),
    'Montana':        design('hat-montana', 'Montana Plate Hat'),
    'Nebraska':       design('nebraska-2023-plate-hat', 'Nebraska 2023 Plate Hat'),
    'Nevada':         design('hat-nevada-plate', 'Nevada Plate Hat'),
    'New Hampshire':  design('hat-new-hampshire-plate', 'New Hampshire Plate Hat'),
    'New Jersey':     design('hat-new-jersey', 'New Jersey Plate Hat'),
    'New Mexico':     design('new-mexico-chile-plate-hat', 'New Mexico Chiles Plate Hat'),
    'New York':       design('new-york-2022-plate-hat', 'New York 2022 Plate Hat'),
    'North Carolina': design('hat-north-carolina-plate', 'North Carolina Plate Hat'),
    'North Dakota':   design('hat-north-dakota-plate', 'North Dakota Plate Hat'),
    'Ohio':           design('hat-ohio-plate', 'Ohio Plate Hat'),
    'Oklahoma':       design('oklahoma-red-plate-hat', 'Oklahoma Red Plate Hat'),
    'Oregon':         design('hat-oregon', 'Oregon Plate Hat'),
    'Pennsylvania':   design('pennsylvania-2025-plate-hat', 'Pennsylvania 2025 Plate Hat'),
    'Rhode Island':   design('hat-rhode-island-plate', 'Rhode Island Plate Hat'),
    'South Carolina': design('south-carolina-2022-plate-hat', 'South Carolina 2022 Plate Hat'),
    'South Dakota':   design('hat-south-dakota-plate', 'South Dakota Plate Hat'),
    'Tennessee':      design('tennessee-2022-plate-hat', 'Tennessee 2022 Plate Hat'),
    'Texas':          design('hat-60s-texas-plate', 'Texas Black Plate Hat'),
    'Utah':           design('hat-utah-plate', 'Utah Plate Hat'),
    'Vermont':        design('hat-vermont-plate', 'Vermont Plate Hat'),
    'Virginia':       design('hat-virginia', 'Virginia Plate Hat'),
    'Washington':     design('hat-washington', 'Washington Plate Hat'),
    'West Virginia':  design('hat-west-virginia-plate', 'West Virginia Plate Hat'),
    'Wisconsin':      design('hat-wisconsin-plate', 'Wisconsin Hat'),
    'Wyoming':        design('wyoming-2022-plate-hat', 'Wyoming 2022 Plate Hat')
  };

  function design(handle, title, fields) {
    return { handle: handle, title: title, fields: fields || ['Custom Text', 'Custom Text Two'] };
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var stateSelect = document.getElementById('cl-fxb-state');       // hidden value holder
  var searchInput = document.getElementById('cl-fxb-state-search'); // searchable input
  var stateMenu = document.getElementById('cl-fxb-state-menu');
  var stateCombo = document.querySelector('[data-cl-combo]');
  var designPanel = document.getElementById('cl-fxb-design');
  var designName = document.getElementById('cl-fxb-design-name');
  var fieldsWrap = document.getElementById('cl-fxb-fields');
  var fieldsList = document.getElementById('cl-fxb-fields-list');
  var previewEl = document.getElementById('cl-fxb-preview');
  var form = document.getElementById('cl-fxb-form');
  if (!stateSelect || !searchInput || !stateMenu || !fieldsList || !previewEl || !form) return;

  /* SKU-bridge: the promo Bundle Hat component variants share a SKU with a
   * matching variant on every design product. Emitted by the Liquid snippet as
   * "SKU|SKU|SKU"; resolved at add-time against /products/<handle>.js so each
   * order line becomes the customer's REAL chosen design product (routable by
   * the production app). Falls back to the parent metafield if unresolved. */
  var personalizerRoot = document.getElementById('cl-fxb-personalizer');
  var COMPONENT_SKUS = ((personalizerRoot && personalizerRoot.getAttribute('data-component-skus')) || '')
    .split('|').map(function (s) { return s.trim(); }).filter(Boolean);
  var productJsonCache = {};

  /* Resolve the chosen design's variant GIDs for the promo SKUs. Returns a
   * pipe-joined GID string, or '' if it can't confidently match all SKUs (so
   * the cart transform safely falls back to the metafield). */
  function resolveComponentVariants(handle) {
    if (!handle || COMPONENT_SKUS.length === 0) return Promise.resolve('');
    var fetchJson = productJsonCache[handle] ||
      (productJsonCache[handle] = fetch('/products/' + encodeURIComponent(handle) + '.js', {
        headers: { 'Accept': 'application/json' }
      }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }));
    return fetchJson.then(function (data) {
      if (!data || !Array.isArray(data.variants)) return '';
      var bySku = {};
      data.variants.forEach(function (v) { if (v && v.sku) bySku[String(v.sku).trim()] = v.id; });
      var gids = [];
      for (var i = 0; i < COMPONENT_SKUS.length; i++) {
        var id = bySku[COMPONENT_SKUS[i]];
        if (!id) return ''; // missing a component → fall back to metafield
        gids.push('gid://shopify/ProductVariant/' + id);
      }
      return gids.join('|');
    }).catch(function () { return ''; });
  }
  if (stateSelect.dataset.clInit === '1') return;
  stateSelect.dataset.clInit = '1';

  var cartEdit = null;
  var editLineKey = '';
  var editParams = new URLSearchParams(window.location.search);
  function usableCartEdit(edit) {
    return !!(edit && edit.properties && STATE_DESIGNS[edit.properties['Plate State']]);
  }
  function cartEditFromParams() {
    var state = editParams.get('edit_state') || '';
    if (!STATE_DESIGNS[state]) return null;
    var fieldNames = [];
    var properties = {
      'Plate State': state,
      'Plate Design': editParams.get('edit_design') || STATE_DESIGNS[state].title,
      '_plate_product_handle': editParams.get('edit_handle') || STATE_DESIGNS[state].handle
    };
    for (var index = 0; index < 4; index++) {
      var name = editParams.get('edit_field_' + index);
      if (!name) continue;
      fieldNames.push(name);
      var value = editParams.get('edit_value_' + index) || '';
      if (value) properties[name] = value;
    }
    if (!fieldNames.length) fieldNames = STATE_DESIGNS[state].fields.slice();
    properties._plate_field_names = fieldNames.join('|');
    return {
      key: editLineKey,
      quantity: parseInt(editParams.get('edit_quantity'), 10) || 1,
      properties: properties,
      fieldNames: fieldNames,
      handle: properties._plate_product_handle
    };
  }
  if (editParams.get('edit_bundle') === '1') {
    editLineKey = editParams.get('line_key') || '';
    try {
      cartEdit = JSON.parse(editParams.get('edit_data') || 'null');
      if (!cartEdit || (editLineKey && cartEdit.key !== editLineKey)) cartEdit = null;
    } catch (error) {
      cartEdit = null;
    }
    try {
      if (!cartEdit) {
        cartEdit = JSON.parse(window.sessionStorage.getItem(CART_EDIT_STORAGE_KEY) || 'null');
        if (!cartEdit || (editLineKey && cartEdit.key !== editLineKey)) cartEdit = null;
      }
    } catch (error) {
      cartEdit = null;
    }
    if (!usableCartEdit(cartEdit)) cartEdit = cartEditFromParams();
  }

  // ---- Searchable state combobox (like the pack builder). #cl-fxb-state stays
  // the hidden value holder so all downstream logic keeps working; picking a
  // state sets its value and dispatches 'change'. ----
  var STATE_LIST = Object.keys(STATE_DESIGNS).sort();
  var comboActiveIdx = -1;
  var comboFiltered = STATE_LIST.slice();
  var comboClear = document.querySelector('[data-cl-combo-clear]');
  function updateClearBtn() { if (comboClear) comboClear.hidden = !(searchInput.value || '').trim(); }

  function comboRenderMenu(showAll) {
    var q = showAll ? '' : (searchInput.value || '').trim().toLowerCase();
    comboFiltered = STATE_LIST.filter(function (s) { return !q || s.toLowerCase().indexOf(q) !== -1; });
    if (!comboFiltered.length) { stateMenu.innerHTML = '<li class="cl-fxb__combo-empty">No states found</li>'; return; }
    stateMenu.innerHTML = comboFiltered.map(function (s, i) {
      return '<li class="cl-fxb__combo-item' + (i === comboActiveIdx ? ' is-active' : '') +
        '" role="option" data-val="' + escapeHtml(s) + '">' + escapeHtml(s) + '</li>';
    }).join('');
  }
  function comboOpen(showAll) { comboRenderMenu(showAll); stateMenu.hidden = false; searchInput.setAttribute('aria-expanded', 'true'); }
  function comboClose() {
    stateMenu.hidden = true; comboActiveIdx = -1; searchInput.setAttribute('aria-expanded', 'false');
    // If a valid state is still selected, restore its name (undo an abandoned search).
    if (stateSelect.value) searchInput.value = stateSelect.value;
  }
  function comboScroll() { var el = stateMenu.querySelector('.cl-fxb__combo-item.is-active'); if (el) el.scrollIntoView({ block: 'nearest' }); }
  function comboSelect(state) {
    stateSelect.value = state;
    searchInput.value = state;
    updateClearBtn();
    comboClose();
    stateSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function comboSyncFromValue() { if (stateSelect.value) searchInput.value = stateSelect.value; updateClearBtn(); }
  function comboClearState() {
    searchInput.value = '';
    stateSelect.value = '';
    updateClearBtn();
    stateSelect.dispatchEvent(new Event('change', { bubbles: true })); // clears design/fields/preview
    searchInput.focus();
    comboOpen(true);
  }

  // On focus: select the current text (so typing replaces it) and show the FULL
  // list — no need to delete the current state before searching a new one.
  searchInput.addEventListener('focus', function () { searchInput.select(); comboActiveIdx = -1; comboOpen(true); });
  searchInput.addEventListener('input', function () { stateSelect.value = ''; comboActiveIdx = -1; updateClearBtn(); comboOpen(false); });
  if (comboClear) comboClear.addEventListener('click', comboClearState);
  updateClearBtn();
  stateMenu.addEventListener('mousedown', function (event) {
    var li = event.target.closest ? event.target.closest('[data-val]') : null;
    if (li) { event.preventDefault(); comboSelect(li.getAttribute('data-val')); }
  });
  searchInput.addEventListener('keydown', function (event) {
    if (stateMenu.hidden && event.key === 'ArrowDown') { comboOpen(); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); comboActiveIdx = Math.min(comboActiveIdx + 1, comboFiltered.length - 1); comboRenderMenu(); comboScroll(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); comboActiveIdx = Math.max(comboActiveIdx - 1, 0); comboRenderMenu(); comboScroll(); }
    else if (event.key === 'Enter') { if (comboActiveIdx >= 0 && comboFiltered[comboActiveIdx]) { event.preventDefault(); comboSelect(comboFiltered[comboActiveIdx]); } }
    else if (event.key === 'Escape') { comboClose(); }
  });
  document.addEventListener('click', function (event) { if (stateCombo && !stateCombo.contains(event.target)) comboClose(); });

  function activeDesign() { return STATE_DESIGNS[stateSelect.value] || null; }

  function activeValues() {
    var values = {};
    fieldsList.querySelectorAll('[data-cl-property-name]').forEach(function (input) {
      values[input.getAttribute('data-cl-property-name')] = (input.value || '').trim();
    });
    return values;
  }

  function renderFields(cfg) {
    if (!cfg) {
      fieldsList.innerHTML = '';
      fieldsWrap.hidden = true;
      designPanel.hidden = true;
      renderPreview();
      return;
    }

    designName.textContent = cfg.title;
    designPanel.hidden = false;
    fieldsWrap.hidden = false;
    fieldsList.innerHTML = cfg.fields.map(function (propertyName) {
      var field = FIELD_DEFAULTS[propertyName] || { maxLength: 30, placeholder: '', required: true };
      var id = 'cl-fxb-field-' + propertyName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      var inputField = '<label class="cl-fxb__field cl-fxb__dynamic-field" for="' + id + '"' +
        (propertyName === 'Custom Text Two' ? ' data-cl-second-line-field hidden' : '') + '>' +
        '<span class="cl-fxb__field-label">' + escapeHtml(propertyName) + (field.required ? ' <span aria-hidden="true">*</span>' : ' <small>(optional)</small>') + '</span>' +
        '<input id="' + id + '" class="cl-fxb__input" type="text" autocomplete="off" ' +
          'data-cl-property-name="' + escapeHtml(propertyName) + '" maxlength="' + field.maxLength + '" ' +
          'placeholder="' + escapeHtml(field.placeholder) + '"' + (field.required ? ' required' : '') + '>' +
        '<span class="cl-fxb__count" data-cl-count-for="' + escapeHtml(propertyName) + '">0/' + field.maxLength + '</span>' +
      '</label>';
      if (propertyName !== 'Custom Text Two') return inputField;
      return '<label class="cl-fxb__second-toggle">' +
        '<input type="checkbox" data-cl-second-line-toggle> ' +
        '<span>Add a second line of text</span>' +
      '</label>' + inputField;
    }).join('');
    renderPreview();
  }

  function previewValues(cfg) {
    var values = activeValues();
    cfg.fields.forEach(function (propertyName) {
      var defaults = FIELD_DEFAULTS[propertyName] || {};
      if (!values[propertyName] && defaults.required !== false) values[propertyName] = defaults.placeholder || '';
    });
    return values;
  }

  function renderPreview() {
    var cfg = activeDesign();
    if (!cfg) {
      previewEl.innerHTML = '<div class="cl-perso-empty">Choose a state to preview its featured plate.</div>';
      return;
    }
    if (typeof window.CLPlatePreview === 'function' && window.CLPlatePreview(previewEl, cfg.handle, previewValues(cfg))) return;
    previewEl.innerHTML = '<div class="cl-perso-empty">Preview loading…</div>';
  }

  function updateCount(input) {
    var propertyName = input.getAttribute('data-cl-property-name');
    var counter = fieldsList.querySelector('[data-cl-count-for="' + CSS.escape(propertyName) + '"]');
    if (counter) counter.textContent = input.value.length + '/' + input.maxLength;
  }

  stateSelect.addEventListener('change', function () { renderFields(activeDesign()); });
  fieldsList.addEventListener('input', function (event) {
    if (!event.target.matches('[data-cl-property-name]')) return;
    updateCount(event.target);
    renderPreview();
  });
  fieldsList.addEventListener('change', function (event) {
    if (!event.target.matches('[data-cl-second-line-toggle]')) return;
    var secondLineField = fieldsList.querySelector('[data-cl-second-line-field]');
    var secondLineInput = secondLineField && secondLineField.querySelector('[data-cl-property-name="Custom Text Two"]');
    secondLineField.hidden = !event.target.checked;
    if (!event.target.checked && secondLineInput) {
      secondLineInput.value = '';
      updateCount(secondLineInput);
    } else if (secondLineInput) {
      secondLineInput.focus();
    }
    renderPreview();
  });

  function focusFirstInvalid(cfg, values) {
    for (var i = 0; i < cfg.fields.length; i++) {
      var name = cfg.fields[i];
      var defaults = FIELD_DEFAULTS[name] || { required: true };
      if (defaults.required !== false && !values[name]) {
        var input = fieldsList.querySelector('[data-cl-property-name="' + CSS.escape(name) + '"]');
        if (input) input.focus();
        return true;
      }
    }
    return false;
  }

  function addToCart(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    }
    var cfg = activeDesign();
    if (!cfg) { searchInput.focus(); comboOpen(); return; }
    var values = activeValues();
    if (focusFirstInvalid(cfg, values)) return;

    var cta = form.querySelector('.cl-fxb__cta');
    var variantInput = form.querySelector('input[name="id"]');
    if (!cta || !variantInput || !variantInput.value) return;

    /* Public properties are visible to staff/customers. Underscored properties
     * remain on the order for integrations while staying out of cart displays. */
    var properties = cartEdit ? Object.assign({}, cartEdit.properties || {}) : {};
    var oldFields = cartEdit && Array.isArray(cartEdit.fieldNames) ? cartEdit.fieldNames : [];
    oldFields.concat(Object.keys(FIELD_DEFAULTS)).forEach(function (name) { delete properties[name]; });
    properties['Plate State'] = stateSelect.value;
    properties['Plate Design'] = cfg.title;
    properties['_plate_product_handle'] = cfg.handle;
    properties['_plate_field_names'] = cfg.fields.join('|');
    cfg.fields.forEach(function (name) {
      if (values[name]) properties[name] = values[name];
    });

    var original = cta.innerHTML;
    cta.disabled = true;
    cta.textContent = 'Adding…';
    var editing = cartEdit && cartEdit.key;
    var endpoint = editing ? '/cart/change.js' : '/cart/add.js';

    delete properties['_component_variants'];
    resolveComponentVariants(cfg.handle).then(function (componentGids) {
      if (componentGids) properties['_component_variants'] = componentGids;
      var payload = editing ? {
        id: cartEdit.key,
        quantity: parseInt(cartEdit.quantity, 10) || 1,
        properties: properties
      } : { id: variantInput.value, quantity: 1, properties: properties };
      return fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }).then(function (response) {
      if (!response.ok) throw new Error('add failed');
      cta.disabled = false;
      cta.innerHTML = original;
      if (editing) {
        window.sessionStorage.removeItem(CART_EDIT_STORAGE_KEY);
        window.location.href = '/cart';
      }
      else if (window.AMP_API && typeof window.AMP_API.OPEN_CART === 'function') window.AMP_API.OPEN_CART();
      else window.location.href = '/cart';
    }).catch(function () {
      cta.disabled = false;
      cta.innerHTML = original;
      alert('Sorry — we couldn’t add the bundle. Please try again.');
    });
  }

  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest ? event.target.closest('#cl-fxb-form .cl-fxb__cta') : null;
    if (button) addToCart(event);
  }, true);
  document.addEventListener('submit', function (event) {
    if (event.target && event.target.id === 'cl-fxb-form') addToCart(event);
  }, true);

  function applyCartEdit(edit) {
    cartEdit = edit;
    if (!cartEdit || !cartEdit.properties || !STATE_DESIGNS[cartEdit.properties['Plate State']]) {
      renderFields(null);
      return;
    }
    stateSelect.value = cartEdit.properties['Plate State'];
    comboSyncFromValue();
    renderFields(activeDesign());
    fieldsList.querySelectorAll('[data-cl-property-name]').forEach(function (input) {
      var name = input.getAttribute('data-cl-property-name');
      input.value = cartEdit.properties[name] || '';
      updateCount(input);
    });
    var secondToggle = fieldsList.querySelector('[data-cl-second-line-toggle]');
    var secondField = fieldsList.querySelector('[data-cl-second-line-field]');
    if (secondToggle && secondField) {
      secondToggle.checked = !!cartEdit.properties['Custom Text Two'];
      secondField.hidden = !secondToggle.checked;
    }
    var notice = document.createElement('div');
    notice.className = 'cl-fxb__editing-notice';
    notice.innerHTML = '<span>Editing bundle from your cart</span><button type="button" class="cl-fxb__editing-cancel">Cancel</button>';
    form.insertBefore(notice, form.firstChild);
    notice.querySelector('.cl-fxb__editing-cancel').addEventListener('click', function () {
      window.sessionStorage.removeItem(CART_EDIT_STORAGE_KEY);
      window.location.href = '/cart';
    });
    var editCta = form.querySelector('.cl-fxb__cta');
    if (editCta) editCta.innerHTML = 'SAVE CHANGES <span aria-hidden="true">→</span>';
    renderPreview();
  }

  if (cartEdit) {
    applyCartEdit(cartEdit);
  } else if (editLineKey) {
    previewEl.innerHTML = '<div class="cl-perso-empty">Loading your customization…</div>';
    fetch('/cart.js', { headers: { 'Accept': 'application/json' } })
      .then(function (response) {
        if (!response.ok) throw new Error('cart load failed');
        return response.json();
      })
      .then(function (cart) {
        var item = (cart.items || []).find(function (candidate) { return candidate.key === editLineKey; });
        if (!item || !item.properties) throw new Error('bundle line missing');
        var properties = item.properties;
        applyCartEdit({
          key: item.key,
          quantity: item.quantity || 1,
          productId: String(item.product_id || ''),
          properties: properties,
          fieldNames: String(properties._plate_field_names || '').split('|').filter(Boolean),
          handle: properties._plate_product_handle || ''
        });
      })
      .catch(function () {
        renderFields(null);
        var message = document.createElement('div');
        message.className = 'cl-fxb__editing-notice';
        message.innerHTML = '<span>We could not load that cart customization.</span><button type="button" class="cl-fxb__editing-cancel">Return to cart</button>';
        form.insertBefore(message, form.firstChild);
        message.querySelector('button').addEventListener('click', function () { window.location.href = '/cart'; });
      });
  } else {
    renderFields(null);
  }
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    if (typeof window.CLPlatePreview === 'function') { renderPreview(); clearInterval(timer); }
    else if (tries > 40) clearInterval(timer);
  }, 250);
})();
