/*
 * cl-pack-perso.js — Personalization adapter (schema-v1 approved)
 * Part of the pack-builder consolidation (see PACK_BUILDER_COORDINATION_CLAUDE_TO_CODEX.md §2.2).
 *
 * Faithful port of the inline per-item personalization currently in
 * assets/cl-pack-grid.js (initPersonalization / FIELD_DEFAULTS / OPTIONAL_FIELDS)
 * and the section's selection-key logic (makeItemKey / personalizationHash).
 * Behaviour is intentionally identical; this only repackages it as a standalone
 * mode-driven adapter.
 *
 * Loaded by the unified pack engine when personalization is enabled.
 *
 * Contract (proposed):
 *   const perso = window.CLPackPerso.create({
 *     mode: 'none' | 'shared' | 'per_item',
 *     preview: <preview adapter from cl-plate-preview.js, or null>
 *   });
 *   perso.mode
 *   perso.attach(cardEl, ctx)   // wire inputs + live preview; ctx = {handle, variantId}
 *                               // returns a per-card controller (also set on cardEl.__clPerso)
 *   perso.read(cardEl)               => { values, valid, missing }
 *   perso.selectionKey(variantId, values) => string   // === production makeItemKey
 *   perso.validate(fields, values)   => { valid, missing }
 *
 * Field labels are frozen to the Zepto contract: Custom Text, Custom Text Two, Month, Year.
 */
(function () {
  'use strict';

  // Mirrors the builder's per-label defaults (labels are the Zepto contract).
  var FIELD_DEFAULTS = {
    'Month':           { maxLength: 3,  placeholder: 'MONTH' },
    'Year':            { maxLength: 4,  placeholder: 'YEAR' },
    'Custom Text':     { maxLength: 20, placeholder: 'CUSTOM' },
    'Custom Text One': { maxLength: 20, placeholder: '' },
    'Custom Text Two': { maxLength: 26, placeholder: '' }
  };
  var OPTIONAL_FIELDS = { 'Custom Text Two': true };
  var EMOJI = /[\u{1F1E6}-\u{1F1FF}\u{20E3}]|\p{Extended_Pictographic}/u;

  function hasEmoji(value) {
    return EMOJI.test(String(value == null ? '' : value).replace(/[©®™]/g, ''));
  }

  function transformList(value) {
    return Array.isArray(value) ? value : [value == null ? 'uppercase' : value];
  }

  // Resolve a field's definition: start from the frozen defaults, then let any
  // config-level field entry (matched by `property`) override maxLength / required
  // / placeholder / transform. This is the "combine per-card list with the
  // configuration-level field definitions/defaults" behavior Codex approved.
  function fieldDefs(labels, configFields) {
    var byProp = {};
    (configFields || []).forEach(function (f) { byProp[f.property || f.label] = f; });
    return (labels || []).map(function (label) {
      var d = FIELD_DEFAULTS[label] || { maxLength: 30, placeholder: '' };
      var o = byProp[label] || {};
      return {
        label: label,
        maxLength: o.maxLength != null ? o.maxLength : d.maxLength,
        placeholder: o.placeholder != null ? o.placeholder : d.placeholder,
        // required wins if provided; otherwise fall back to the frozen optional set
        optional: (o.required != null) ? !o.required : !!OPTIONAL_FIELDS[label],
        transforms: transformList(o.transform)
      };
    });
  }

  function applyTransforms(val, transforms) {
    var result = String(val);
    (transforms || []).forEach(function (transform) {
      if (transform === 'uppercase') result = result.toUpperCase();
    });
    return result;
  }

  // Eligibility: a config-level field applies to a card when its type/handle match
  // (empty lists = applies to all). Used only in `explicit` fieldsMode.
  function eligibleFor(field, productType, handle) {
    var types = field.eligibleTypes || [];
    var handles = field.eligibleHandles || [];
    return (!types.length || types.indexOf(productType) !== -1) &&
           (!handles.length || handles.indexOf(handle) !== -1);
  }

  // Decide a card's applicable field-label list per the approved fieldsMode:
  //  - 'per_product' (canonical): the card's own data-cl-perso-fields list.
  //  - 'explicit': one config field list, filtered by eligibility.
  // `auto_from_preview` intentionally NOT here — field availability must never
  // depend on loading the (lazy) preview config. Liquid emits data-cl-perso-fields.
  function resolveLabels(adapter, cardEl, ctx) {
    if (adapter.fieldsMode === 'explicit') {
      var type = (ctx && ctx.productType) || cardEl.getAttribute('data-cl-product-type') || '';
      var handle = (ctx && ctx.handle) || cardEl.getAttribute('data-cl-handle') || '';
      return (adapter.configFields || [])
        .filter(function (f) { return eligibleFor(f, type, handle); })
        .map(function (f) { return f.property || f.label; });
    }
    // default 'per_product'
    try { return JSON.parse(cardEl.getAttribute('data-cl-perso-fields')) || []; }
    catch (e) { return []; }
  }

  // --- selection key: identical to production makeItemKey/personalizationHash ---
  function personalizationHash(p) {
    if (!p) return '';
    var keys = Object.keys(p).filter(function (k) { return p[k] !== '' && p[k] != null; }).sort();
    return keys.map(function (k) { return k + '=' + p[k]; }).join('|');
  }
  function selectionKey(variantId, values) {
    variantId = String(variantId); // contract §4: stringify so numeric /cart.js ids match DOM string ids
    var h = personalizationHash(values);
    return h ? (variantId + '::' + h) : variantId;
  }

  function cleanValues(fields, values) {
    var out = {};
    fields.forEach(function (f) {
      var v = ((values[f.label] || '') + '').trim();
      if (v) out[f.label] = v; // omit empties, mirroring Zepto
    });
    return out;
  }
  function validate(fields, values) {
    var missing = [];
    var errors = [];
    fields.forEach(function (f) {
      var value = ((values[f.label] || '') + '').trim();
      if (!f.optional && !value) {
        missing.push(f);
        errors.push({ label: f.label, code: 'required', message: 'Enter your ' + f.label.toLowerCase() + '.' });
      } else if (f.transforms.indexOf('no_emoji') !== -1 && hasEmoji(value)) {
        errors.push({ label: f.label, code: 'emoji', message: 'Emojis aren’t allowed in ' + f.label.toLowerCase() + '.' });
      }
    });
    return { valid: errors.length === 0, missing: missing, errors: errors };
  }

  function cssEscape(s) {
    return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\\]]/g, '\\$&');
  }

  // --- per-item DOM wiring: faithful port of initPersonalization ---
  // Returns a controller object; also stored on cardEl.__clPerso for the engine.
  function attachPerItem(adapter, cardEl, ctx) {
    ctx = ctx || {};
    var labels = resolveLabels(adapter, cardEl, ctx);
    var fields = fieldDefs(labels, adapter.configFields);
    var values = {};
    var previewEl = cardEl.querySelector('[data-cl-perso-preview]');
    var handle = ctx.handle || cardEl.getAttribute('data-cl-handle') || '';
    var currentVariantId = ctx.variantId || '';

    function get(label) { return (values[label] || '').trim(); }

    function renderPreview() {
      if (!previewEl) return;
      if (adapter.preview && adapter.preview.enabled) {
        adapter.preview.render(previewEl, { handle: handle, variantId: currentVariantId }, values);
        return;
      }
      // Fallback generic text preview (no image adapter).
      var lines = fields.map(function (f) { return get(f.label); }).filter(Boolean);
      previewEl.innerHTML = '<div class="cl-perso-generic">' +
        (lines.length
          ? lines.map(function (l) { return '<div>' + l.replace(/</g, '&lt;') + '</div>'; }).join('')
          : '<div class="cl-perso-empty">Your text preview</div>') + '</div>';
    }

    function syncField(label) {
      var field = fields.filter(function (f) { return f.label === label; })[0];
      var counter = cardEl.querySelector('[data-cl-perso-count="' + cssEscape(label) + '"]');
      if (counter && field) {
        counter.textContent = (field.maxLength - (values[label] || '').length) + '/' + field.maxLength;
      }
    }

    var noticeEl = document.createElement('div');
    noticeEl.className = 'cl-perso-notice';
    noticeEl.hidden = true;
    function showNotice(m) { noticeEl.textContent = m; noticeEl.hidden = false; }
    function hideNotice() { noticeEl.hidden = true; }

    var persoBlock = cardEl.querySelector('[data-cl-perso]');
    function openAccordion() {
      if (persoBlock && persoBlock.hidden) {
        persoBlock.hidden = false;
        if (persoToggle) {
          persoToggle.classList.add('is-open');
          persoToggle.setAttribute('aria-expanded', 'true');
        }
        renderPreview();
      }
    }

    fields.forEach(function (f) {
      var input = cardEl.querySelector('[data-cl-perso-input="' + cssEscape(f.label) + '"]');
      if (!input) return;
      input.maxLength = f.maxLength;
      input.placeholder = f.placeholder;
      if (f.transforms.indexOf('uppercase') !== -1) input.style.textTransform = 'uppercase';
      values[f.label] = '';
      syncField(f.label);
      input.addEventListener('input', function () {
        values[f.label] = applyTransforms(input.value, f.transforms);
        syncField(f.label);
        if (f.transforms.indexOf('no_emoji') !== -1 && hasEmoji(values[f.label])) {
          showNotice('Emojis aren’t allowed in ' + f.label.toLowerCase() + '.');
        } else {
          hideNotice();
        }
        renderPreview();
        cardEl.dispatchEvent(new CustomEvent('cl:perso-change', { bubbles: true }));
      });
    });

    // --- Accordion toggle (server-rendered [data-cl-perso-toggle]; adapter wires) ---
    // The card snippet renders the collapsible "Personalize" control and starts the
    // body collapsed; we just wire open/close and re-render the preview on open so
    // plate text fits once the box has real dimensions.
    var persoToggle = cardEl.querySelector('[data-cl-perso-toggle]');
    if (persoToggle && persoBlock) {
      persoToggle.addEventListener('click', function () {
        var willOpen = persoBlock.hidden;
        persoBlock.hidden = !willOpen;
        persoToggle.classList.toggle('is-open', willOpen);
        persoToggle.setAttribute('aria-expanded', String(willOpen));
        if (willOpen) renderPreview();
      });
    }

    // --- Optional "Add a second line" (server-rendered [data-cl-perso-second-line]) ---
    // Reveals the Custom Text Two field; clears it when hidden so it never lands in
    // values/selectionKey while collapsed.
    var secondLineCb = cardEl.querySelector('[data-cl-perso-second-line]');
    var ct2Input = cardEl.querySelector('[data-cl-perso-input="' + cssEscape('Custom Text Two') + '"]');
    // §5 doesn't mandate a field-wrapper hook, so resolve the Custom Text Two
    // container robustly against whatever markup the snippet renders.
    var ct2Field = ct2Input ? (ct2Input.closest('[data-cl-perso-field]')
      || ct2Input.closest('.cl-grid-perso-field') || ct2Input.closest('label')
      || ct2Input.parentElement) : null;
    if (secondLineCb && ct2Field) {
      if (ct2Field.hidden === false) ct2Field.hidden = !secondLineCb.checked; // start collapsed unless pre-checked
      secondLineCb.addEventListener('change', function () {
        ct2Field.hidden = !secondLineCb.checked;
        if (!secondLineCb.checked) {
          values['Custom Text Two'] = '';
          if (ct2Input) ct2Input.value = '';
          syncField('Custom Text Two');
        } else if (ct2Input) {
          ct2Input.focus();
        }
        renderPreview();
        cardEl.dispatchEvent(new CustomEvent('cl:perso-change', { bubbles: true }));
      });
    }

    var controller = {
      config: { fields: fields },
      get values() { return cleanValues(fields, values); },
      get valid() { return validate(fields, values).valid; },
      hydrate: function (initialValues) {
        initialValues = initialValues || {};
        fields.forEach(function (f) {
          var next = applyTransforms(initialValues[f.label] || '', f.transforms);
          values[f.label] = next;
          var input = cardEl.querySelector('[data-cl-perso-input="' + cssEscape(f.label) + '"]');
          if (input) input.value = next;
          syncField(f.label);
        });
        hideNotice();
        renderPreview();
      },
      setContext: function (nextContext) {
        nextContext = nextContext || {};
        handle = nextContext.handle || cardEl.getAttribute('data-cl-handle') || '';
        currentVariantId = nextContext.variantId || '';
        renderPreview();
      },
      promptMissing: function () {
        openAccordion();
        var error = validate(fields, values).errors[0];
        if (error) {
          var input = cardEl.querySelector('[data-cl-perso-input="' + cssEscape(error.label) + '"]');
          if (input) input.focus();
          showNotice(error.code === 'required'
            ? 'Enter your ' + error.label.toLowerCase() + ' to add this to your pack.'
            : error.message);
        }
      },
      reset: function () {
        fields.forEach(function (f) {
          values[f.label] = '';
          var input = cardEl.querySelector('[data-cl-perso-input="' + cssEscape(f.label) + '"]');
          if (input) input.value = '';
          syncField(f.label);
        });
        // collapse second line + accordion back to initial state
        if (secondLineCb) secondLineCb.checked = false;
        if (ct2Field) ct2Field.hidden = true;
        // Always-visible builders (Hypro) intentionally omit the accordion toggle.
        // Only collapse a personalization region that actually has a toggle.
        if (persoBlock && persoToggle) persoBlock.hidden = true;
        if (persoToggle) { persoToggle.classList.remove('is-open'); persoToggle.setAttribute('aria-expanded', 'false'); }
        hideNotice();
        renderPreview();
        cardEl.dispatchEvent(new CustomEvent('cl:perso-change', { bubbles: true }));
      }
    };
    if (persoBlock) persoBlock.appendChild(noticeEl);
    cardEl.__clPerso = controller;
    renderPreview();
    return controller;
  }

  function create(config) {
    config = config || {};
    var mode = config.mode || 'none';
    var adapter = {
      mode: mode,
      preview: config.preview || null,
      fieldsMode: config.fieldsMode || 'per_product',   // 'per_product' | 'explicit'
      configFields: config.fields || []                 // config-level field defs/overrides
    };

    adapter.selectionKey = selectionKey;
    adapter.validate = function (fields, values) { return validate(fields, values); };
    adapter.read = function (cardEl) {
      var c = cardEl && cardEl.__clPerso;
      if (!c) return { values: {}, valid: true, missing: [], errors: [] };
      var v = c.values;
      var res = validate(c.config.fields, v);
      return { values: v, valid: res.valid, missing: res.missing, errors: res.errors };
    };
    adapter.attach = function (cardEl, ctx) {
      if (mode === 'none') { cardEl.__clPerso = null; return null; }
      if (mode === 'per_item') return attachPerItem(adapter, cardEl, ctx);
      // 'shared' mode (Hypro): one value-set broadcast to all items — wired at the
      // builder level, not per card. Left as a documented stub for Codex's Hypro
      // pilot; the pins pilot only needs per_item.
      return null;
    };
    adapter.createDraft = function (hostEl, ctx, initialValues) {
      var controller = hostEl && hostEl.__clPerso;
      if (!controller && hostEl) controller = adapter.attach(hostEl, ctx || {});
      if (controller && controller.setContext) controller.setContext(ctx || {});
      if (controller && controller.hydrate) controller.hydrate(initialValues || {});
      return controller;
    };
    return adapter;
  }

  window.CLPackPerso = { create: create, selectionKey: selectionKey, _validate: validate, _hash: personalizationHash };
})();
