(function () {
  'use strict';

  if (window.CLFixedBundleCartEditor) return;

  var FIELD_DEFAULTS = {
    'Month':             { maxLength: 3,  placeholder: 'MONTH', required: true },
    'Year':              { maxLength: 4,  placeholder: 'YEAR', required: true },
    'Custom Text':       { maxLength: 20, placeholder: 'CUSTOM TEXT', required: true },
    'Custom Text One':   { maxLength: 20, placeholder: 'CUSTOM TEXT', required: true },
    'Custom Text Two':   { maxLength: 26, placeholder: 'Second line (optional)', required: false },
    'Custom Text Three': { maxLength: 30, placeholder: 'CUSTOM TEXT', required: true },
    'Custom Text Four':  { maxLength: 30, placeholder: 'CUSTOM TEXT', required: true }
  };

  var current = null;
  var lastTrigger = null;
  var modal = document.createElement('div');
  modal.className = 'cl-fxb-editor';
  modal.hidden = true;
  modal.innerHTML =
    '<div class="cl-fxb-editor__backdrop" data-cl-fxb-editor-close></div>' +
    '<section class="cl-fxb-editor__dialog" role="dialog" aria-modal="true" aria-labelledby="cl-fxb-editor-title">' +
      '<header class="cl-fxb-editor__header">' +
        '<h2 class="cl-fxb-editor__title" id="cl-fxb-editor-title">Edit personalization</h2>' +
        '<button type="button" class="cl-fxb-editor__close" data-cl-fxb-editor-close aria-label="Close">&times;</button>' +
      '</header>' +
      '<div class="cl-fxb-editor__meta" data-cl-fxb-editor-meta></div>' +
      '<form data-cl-fxb-editor-form>' +
        '<div class="cl-fxb-editor__fields" data-cl-fxb-editor-fields></div>' +
        '<div class="cl-fxb-editor__preview" data-cl-fxb-editor-preview></div>' +
        '<p class="cl-fxb-editor__error" data-cl-fxb-editor-error hidden></p>' +
        '<div class="cl-fxb-editor__actions">' +
          '<button type="button" class="cl-fxb-editor__cancel" data-cl-fxb-editor-close>Cancel</button>' +
          '<button type="submit" class="cl-fxb-editor__save">Save changes</button>' +
        '</div>' +
      '</form>' +
    '</section>';
  document.body.appendChild(modal);

  var fieldsEl = modal.querySelector('[data-cl-fxb-editor-fields]');
  var previewEl = modal.querySelector('[data-cl-fxb-editor-preview]');
  var errorEl = modal.querySelector('[data-cl-fxb-editor-error]');
  var form = modal.querySelector('[data-cl-fxb-editor-form]');
  var saveButton = modal.querySelector('.cl-fxb-editor__save');

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function values() {
    var result = {};
    fieldsEl.querySelectorAll('[data-cl-property-name]').forEach(function (input) {
      result[input.dataset.clPropertyName] = (input.value || '').trim();
    });
    return result;
  }

  function previewValues() {
    var result = values();
    current.fieldNames.forEach(function (name) {
      var defaults = FIELD_DEFAULTS[name] || {};
      if (!result[name] && defaults.required !== false) result[name] = defaults.placeholder || '';
    });
    return result;
  }

  function renderPreview() {
    if (typeof window.CLPlatePreview === 'function') {
      window.CLPlatePreview(previewEl, current.handle, previewValues());
    } else {
      previewEl.textContent = 'Preview loading…';
    }
  }

  function fieldMarkup(name, properties) {
    var defaults = FIELD_DEFAULTS[name] || { maxLength: 30, placeholder: '', required: true };
    var id = 'cl-fxb-editor-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    var value = properties[name] || '';
    var field = '<label class="cl-fxb-editor__field" for="' + id + '"' +
      (name === 'Custom Text Two' ? ' data-cl-editor-second-field' + (value ? '' : ' hidden') : '') + '>' +
      '<span class="cl-fxb-editor__label">' + escapeHtml(name) + (defaults.required ? ' *' : ' (optional)') + '</span>' +
      '<input class="cl-fxb-editor__input" id="' + id + '" type="text" autocomplete="off" ' +
        'data-cl-property-name="' + escapeHtml(name) + '" maxlength="' + defaults.maxLength + '" ' +
        'placeholder="' + escapeHtml(defaults.placeholder) + '" value="' + escapeHtml(value) + '"' +
        (defaults.required ? ' required' : '') + '>' +
      '<span class="cl-fxb-editor__count">' + value.length + '/' + defaults.maxLength + '</span>' +
    '</label>';
    if (name !== 'Custom Text Two') return field;
    return '<label class="cl-fxb-editor__second-toggle">' +
      '<input type="checkbox" data-cl-editor-second-toggle' + (value ? ' checked' : '') + '>' +
      '<span>Add a second line of text</span>' +
    '</label>' + field;
  }

  function open(trigger) {
    var properties;
    try { properties = JSON.parse(trigger.dataset.lineProperties || '{}'); }
    catch (e) { return; }
    var fieldNames = (trigger.dataset.fieldNames || '').split('|').filter(Boolean);
    if (!fieldNames.length) return;
    current = {
      key: trigger.dataset.lineKey,
      quantity: parseInt(trigger.dataset.lineQuantity, 10) || 1,
      handle: trigger.dataset.plateHandle,
      properties: properties,
      fieldNames: fieldNames
    };
    lastTrigger = trigger;
    modal.querySelector('[data-cl-fxb-editor-meta]').innerHTML =
      '<strong>' + escapeHtml(properties['Plate Design'] || 'Featured plate') + '</strong><br>' +
      escapeHtml(properties['Plate State'] || '');
    fieldsEl.innerHTML = fieldNames.map(function (name) { return fieldMarkup(name, properties); }).join('');
    errorEl.hidden = true;
    modal.hidden = false;
    document.body.classList.add('cl-fxb-editor-open');
    renderPreview();
    var first = fieldsEl.querySelector('input:not([type="checkbox"]):not([hidden])');
    if (first) first.focus();
  }

  function close() {
    modal.hidden = true;
    document.body.classList.remove('cl-fxb-editor-open');
    current = null;
    if (lastTrigger) lastTrigger.focus();
  }

  document.addEventListener('click', function (event) {
    var trigger = event.target.closest && event.target.closest('[data-cl-fxb-edit]');
    if (trigger) { open(trigger); return; }
    if (!modal.hidden && event.target.closest && event.target.closest('[data-cl-fxb-editor-close]')) close();
  });

  document.addEventListener('keydown', function (event) {
    if (!modal.hidden && event.key === 'Escape') close();
  });

  fieldsEl.addEventListener('input', function (event) {
    if (!event.target.matches('[data-cl-property-name]')) return;
    var counter = event.target.closest('.cl-fxb-editor__field').querySelector('.cl-fxb-editor__count');
    if (counter) counter.textContent = event.target.value.length + '/' + event.target.maxLength;
    renderPreview();
  });

  fieldsEl.addEventListener('change', function (event) {
    if (!event.target.matches('[data-cl-editor-second-toggle]')) return;
    var field = fieldsEl.querySelector('[data-cl-editor-second-field]');
    var input = field && field.querySelector('[data-cl-property-name="Custom Text Two"]');
    field.hidden = !event.target.checked;
    if (!event.target.checked && input) input.value = '';
    if (event.target.checked && input) input.focus();
    renderPreview();
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!current || !form.reportValidity()) return;
    var updated = Object.assign({}, current.properties);
    current.fieldNames.forEach(function (name) { delete updated[name]; });
    var edited = values();
    current.fieldNames.forEach(function (name) {
      if (edited[name]) updated[name] = edited[name];
    });
    saveButton.disabled = true;
    saveButton.textContent = 'Saving…';
    errorEl.hidden = true;
    fetch('/cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: current.key, quantity: current.quantity, properties: updated })
    }).then(function (response) {
      if (!response.ok) throw new Error('Cart update failed');
      window.location.reload();
    }).catch(function () {
      saveButton.disabled = false;
      saveButton.textContent = 'Save changes';
      errorEl.textContent = 'Sorry — we could not update this bundle. Please try again.';
      errorEl.hidden = false;
    });
  });

  window.CLFixedBundleCartEditor = { open: open };
})();
