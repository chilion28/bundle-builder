/*
 * cl-pack-perso.js — Personalization adapter (DRAFT, pending contract sign-off)
 * Part of the pack-builder consolidation (see PACK_BUILDER_COORDINATION_CLAUDE_TO_CODEX.md §2.2).
 *
 * Faithful port of the inline per-item personalization currently in
 * assets/cl-pack-grid.js (initPersonalization / FIELD_DEFAULTS / OPTIONAL_FIELDS)
 * and the section's selection-key logic (makeItemKey / personalizationHash).
 * Behaviour is intentionally identical; this only repackages it as a standalone
 * mode-driven adapter.
 *
 * INERT: nothing loads this yet.
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

  // --- Emoji detection (Unicode-property based; NO hand-maintained range list) ---
  // Blocks emoji per Codex policy: block submission, one inline error, value kept.
  // Matches emoji pictographs, regional-indicator flags, and keycap combiners.
  // The three text-default pictographics © ® ™ are exempted (legitimate text).
  var _EMOJI = /[\u{1F1E6}-\u{1F1FF}\u{20E3}]|\p{Extended_Pictographic}/u;
  var _EMOJI_TEXT_EXEMPT = /[©®™]/g; // © ® ™
  function hasEmoji(s) {
    if (s == null || s === '') return false;
    return _EMOJI.test(String(s).replace(_EMOJI_TEXT_EXEMPT, ''));
  }

  // Parse a field's `transform` (string OR array) into value-MUTATIONS applied on
  // input (currently just 'uppercase') and VALIDATORS that gate validity without
  // mutating the value ('no_emoji'). Keeps "block, preserve typed text" semantics.
  function parseTransform(t) {
    var list = Array.isArray(t) ? t : (t == null ? ['uppercase'] : [t]);
    return {
      mutations: list.filter(function (x) { return x === 'uppercase'; }),
      noEmoji: list.indexOf('no_emoji') !== -1
    };
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
      var tf = parseTransform(o.transform);
      return {
        label: label,
        maxLength: o.maxLength != null ? o.maxLength : d.maxLength,
        placeholder: o.placeholder != null ? o.placeholder : d.placeholder,
        // required wins if provided; otherwise fall back to the frozen optional set
        optional: (o.required != null) ? !o.required : !!OPTIONAL_FIELDS[label],
        mutations: tf.mutations,   // value transforms applied on input
        noEmoji: tf.noEmoji        // validator: block emoji, keep typed value
      };
    });
  }

  // Apply value-mutating transforms only (validators like no_emoji never mutate).
  function applyMutations(val, field) {
    var out = String(val);
    (field.mutations || []).forEach(function (m) { if (m === 'uppercase') out = out.toUpperCase(); });
    return out;
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
    var errors = []; // [{ label, code:'required'|'emoji', message }]
    fields.forEach(function (f) {
      var raw = values[f.label];
      var trimmed = ((raw || '') + '').trim();
      if (!f.optional && !trimmed) {
        missing.push(f);
        errors.push({ label: f.label, code: 'required', message: 'Enter your ' + f.label.toLowerCase() + '.' });
      } else if (f.noEmoji && hasEmoji(raw)) {
        // Emoji present → block, but the typed value is preserved (never stripped).
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
  function attachPerItem(adapter, cardEl, ctx, opts) {
    ctx = ctx || {};
    opts = opts || {};
    var labels = resolveLabels(adapter, cardEl, ctx);
    var fields = fieldDefs(labels, adapter.configFields);
    var values = {};
    var previewEl = cardEl.querySelector('[data-cl-perso-preview]');
    var handle = ctx.handle || cardEl.getAttribute('data-cl-handle') || '';

    function get(label) { return (values[label] || '').trim(); }

    function renderPreview() {
      if (!previewEl) return;
      if (adapter.preview && adapter.preview.enabled) {
        adapter.preview.render(previewEl, { handle: handle, variantId: ctx.variantId }, values);
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
        renderPreview();
      }
    }

    fields.forEach(function (f) {
      var input = cardEl.querySelector('[data-cl-perso-input="' + cssEscape(f.label) + '"]');
      if (!input) return;
      input.maxLength = f.maxLength;
      input.placeholder = f.placeholder;
      // All-caps everywhere: the value is already stored uppercased (mutation), and
      // this makes the input BOX display caps too — via CSS so the caret never jumps
      // (rewriting input.value each keystroke would). Preview + cart use the stored
      // uppercased value, so display is caps end-to-end.
      if ((f.mutations || []).indexOf('uppercase') !== -1) {
        try { input.style.textTransform = 'uppercase'; } catch (e) {}
      }
      values[f.label] = '';
      syncField(f.label);
      input.addEventListener('input', function () {
        values[f.label] = applyMutations(input.value, f); // value transforms (e.g. uppercase); never strips
        syncField(f.label);
        // Live emoji feedback: show the one inline error while an emoji is present,
        // but keep what the customer typed. Otherwise clear the notice.
        if (f.noEmoji && hasEmoji(values[f.label])) {
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

    // Seed initial values (edit-draft hydration). Reveals the second line if the
    // edited selection had a Custom Text Two. Never dispatches selection events —
    // a draft reads/validates only; the engine owns the actual selection swap.
    if (opts.initialValues) {
      fields.forEach(function (f) {
        var iv = opts.initialValues[f.label];
        if (iv == null || iv === '') return;
        values[f.label] = applyMutations(iv, f);
        var input = cardEl.querySelector('[data-cl-perso-input="' + cssEscape(f.label) + '"]');
        if (input) input.value = values[f.label];
        syncField(f.label);
        if (f.label === 'Custom Text Two' && secondLineCb && ct2Field) {
          secondLineCb.checked = true; ct2Field.hidden = false;
        }
      });
      renderPreview();
    }

    var controller = {
      config: { fields: fields },
      get values() { return cleanValues(fields, values); },
      get valid() { return validate(fields, values).valid; },
      // Draft/edit convenience: the selection key for the current draft values.
      // Engine uses this to atomically replace the edited selectionId.
      selectionKey: function () { return selectionKey(ctx.variantId, cleanValues(fields, values)); },
      // Called when an add is blocked: open the accordion, focus the first field
      // in error, and show its single inline message (emoji OR required).
      promptMissing: function () {
        openAccordion();
        var err = validate(fields, values).errors[0];
        if (err) {
          var input = cardEl.querySelector('[data-cl-perso-input="' + cssEscape(err.label) + '"]');
          if (input) input.focus();
          showNotice(err.code === 'required'
            ? 'Enter your ' + err.label.toLowerCase() + ' to add this to your pack.'
            : err.message);
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
        if (persoBlock) persoBlock.hidden = true;
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
    // Edit-draft: hydrate/read/validate the same fields in a card OR modal host
    // WITHOUT writing selection state (schema §"Selection editing presentation").
    // Returns a controller exposing values / valid / selectionKey() / promptMissing / reset.
    adapter.createDraft = function (hostEl, ctx, initialValues) {
      if (mode === 'none') return null;
      return attachPerItem(adapter, hostEl, ctx || {}, { initialValues: initialValues || {} });
    };
    adapter.attach = function (cardEl, ctx) {
      if (mode === 'none') { cardEl.__clPerso = null; return null; }
      if (mode === 'per_item') return attachPerItem(adapter, cardEl, ctx);
      // 'shared' mode (Hypro): one value-set broadcast to all items — wired at the
      // builder level, not per card. Left as a documented stub for Codex's Hypro
      // pilot; the pins pilot only needs per_item.
      return null;
    };
    return adapter;
  }

  window.CLPackPerso = { create: create, selectionKey: selectionKey, _validate: validate, _hash: personalizationHash };
})();
