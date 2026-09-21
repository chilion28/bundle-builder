/*
 * cl-input-validation.js
 * ---------------------------------------------------------------------------
 * Character validation for CityLocs personalization text fields (plate-hat
 * builder, AI/image-hat builder, fixed-bundle personalizer, and GemPages
 * custom-text forms).
 *
 * Blocks emojis, dingbats/symbols (♥ ♠ ♡), decorative Unicode letters
 * (Ɓ Ƙ Ƴ …), and non-keyboard currency (¥ € £). ALLOWS normal keyboard text
 * (printable ASCII) plus accented Latin letters for names (é ñ ü á č …).
 *
 * How it works: a single capture-phase `input` listener cleans the field value
 * BEFORE any framework's own `@input`/change handler reads it, so it works with
 * the Vue-bound builder inputs (which read $event.target.value) as well as plain
 * inputs — without fighting reactivity or dispatching synthetic events. A `paste`
 * fires an `input` event too, so paste is covered by the same path. Invalid
 * characters are stripped as they arrive and a brief toast explains why.
 *
 * Self-contained, dependency-free, idempotent. Inert on pages with no target
 * fields.
 * ------------------------------------------------------------------------- */
(function () {
  'use strict';

  if (window.__clInputValidationInit) return;
  window.__clInputValidationInit = true;

  // Allowed: printable ASCII (0x20–0x7E: letters, digits, space, standard
  // punctuation) + accented Latin (Latin-1 Supplement + Latin Extended-A,
  // skipping the × and ÷ math symbols). Latin Extended-B (0x0180+) and beyond —
  // the decorative Ɓ/Ƙ/Ƴ letters, emoji, dingbats, currency — are excluded.
  var ALLOWED_CP = /^[\x20-\x7EÀ-ÖØ-öø-ſ]$/;

  function clean(raw) {
    if (raw == null) return raw;
    var s = String(raw)
      // fold common typographic characters to their ASCII equivalents so that,
      // e.g., an autocorrected curly apostrophe in "O’Brien" is kept as "O'Brien"
      .replace(/[‘’‚‛]/g, "'")
      .replace(/[“”„‟]/g, '"')
      .replace(/[–—−]/g, '-')
      .replace(/…/g, '...');
    var out = '';
    // iterate by code point so multi-unit emoji are handled as single units
    for (var ch of s) {
      if (ALLOWED_CP.test(ch)) out += ch;
    }
    return out;
  }

  // ---- Which fields to validate ------------------------------------------
  var OPT_IN = '.cl-qv-custom-input, .cl-ai-ed__textinput, [data-cl-validate-text]';
  var SKIP_TYPES = {
    hidden: 1, number: 1, email: 1, tel: 1, search: 1, url: 1,
    checkbox: 1, radio: 1, range: 1, file: 1, password: 1,
    date: 1, 'datetime-local': 1, month: 1, time: 1, week: 1,
    color: 1, submit: 1, button: 1, reset: 1, image: 1
  };
  // Names/ids that are clearly not free-text personalization.
  var SKIP_NAME = /qty|quantity|zip|postal|phone|email|search|state|address|city|price/i;

  function isTarget(el) {
    if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return false;
    if (el.tagName === 'INPUT') {
      var t = (el.getAttribute('type') || 'text').toLowerCase();
      if (SKIP_TYPES[t]) return false;
      if ((el.getAttribute('inputmode') || '').toLowerCase() === 'numeric') return false;
    }
    if (el.matches(OPT_IN)) return true;
    var name = el.getAttribute('name') || '';
    if (name.indexOf('properties[') === 0) return !SKIP_NAME.test(name);
    return false;
  }

  // ---- Handler ------------------------------------------------------------
  function onInput(e) {
    var el = e.target;
    if (!isTarget(el)) return;
    var v = el.value;
    if (v == null) return;
    var c = clean(v);
    if (c === v) return;

    var removed = v.length - c.length;
    var caret = el.selectionStart;
    el.value = c;
    // keep the caret from jumping to the end when characters are stripped
    if (typeof caret === 'number') {
      var pos = Math.max(0, caret - removed);
      try { el.setSelectionRange(pos, pos); } catch (_) {}
    }
    showToast();
  }

  // ---- Brief toast (shared; avoids inserting nodes into Vue-managed DOM) ---
  var toast, toastTimer;
  function ensureToast() {
    if (toast) return;
    var style = document.createElement('style');
    style.textContent =
      '.cl-invalid-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(12px);' +
      'z-index:100000;max-width:90vw;padding:10px 16px;border-radius:8px;background:#1f2937;color:#fff;' +
      'font-size:14px;font-weight:600;line-height:1.3;box-shadow:0 6px 20px rgba(0,0,0,.25);' +
      'opacity:0;pointer-events:none;transition:opacity .18s ease,transform .18s ease;text-align:center}' +
      '.cl-invalid-toast.is-on{opacity:1;transform:translateX(-50%) translateY(0)}';
    document.head.appendChild(style);
    toast = document.createElement('div');
    toast.className = 'cl-invalid-toast';
    toast.setAttribute('role', 'status');
    toast.textContent = "Emojis and special symbols aren’t allowed here.";
    document.body.appendChild(toast);
  }
  function showToast() {
    ensureToast();
    toast.textContent = "Emojis and special symbols aren’t allowed here.";
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('is-on'); }, 2600);
  }

  // ---- Required-personalization add-to-cart guard ------------------------
  // Zepto and several GemPages product forms submit through their own AJAX
  // handlers. Those handlers do not consistently call form.checkValidity(),
  // so an input can be correctly marked `required` and still be added blank.
  // Run before those handlers (capture phase) and stop the add at its source.
  var REQUIRED_CUSTOM_SELECTOR =
    '[required][name^="properties["], .cstmfy_c_required, [data-cl-required-customization]';
  var ADD_BUTTON_SELECTOR =
    'button[type="submit"], input[type="submit"], .product-form--atc-button, ' +
    '.gp-button-atc, [data-product-atc], [data-product-add], #product-cl-add-cart';

  function isBlankRequiredField(el, scope) {
    if (!el || el.disabled) return false;
    var type = (el.getAttribute('type') || '').toLowerCase();
    if (type === 'checkbox' || type === 'radio') {
      if (!el.name) return !el.checked;
      var group = (scope || document).querySelectorAll('[name="' +
        String(el.name).replace(/(["\\])/g, '\\$1') + '"]');
      return !Array.prototype.some.call(group, function (item) { return item.checked; });
    }
    if (type === 'file') return !(el.files && el.files.length);
    // GemPages and older product templates can render desktop/mobile copies of
    // the same property. Treat the property as complete if either copy has a
    // value so a hidden duplicate cannot incorrectly block the customer.
    if (el.name) {
      var peers = document.querySelectorAll('[name="' +
        String(el.name).replace(/(["\\])/g, '\\$1') + '"]');
      if (Array.prototype.some.call(peers, function (item) {
        return !item.disabled && String(item.value == null ? '' : item.value).trim() !== '';
      })) return false;
    }
    return !String(el.value == null ? '' : el.value).trim();
  }

  function fieldLabel(el) {
    var name = el && (el.getAttribute('name') || '');
    var match = /properties\[([^\]]+)\]/.exec(name);
    return (match && match[1] ? match[1] : 'customization').replace(/^_+/, '');
  }

  function showRequiredError(el, message) {
    var text = message || ('Please enter ' + fieldLabel(el) + ' before adding to cart.');
    if (el) {
      try { el.setCustomValidity(text); } catch (_) {}
      try { el.reportValidity(); } catch (_) {}
      try { el.focus({ preventScroll: true }); } catch (_) { try { el.focus(); } catch (__) {} }
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
    }
    ensureToast();
    toast.textContent = text;
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('is-on'); }, 3200);
  }

  function requiredFieldsFor(form) {
    if (!form || !form.querySelectorAll) return [];
    return Array.prototype.filter.call(
      form.querySelectorAll(REQUIRED_CUSTOM_SELECTOR),
      function (el) { return isBlankRequiredField(el, form); }
    );
  }

  function hasPersonalizeGate(form) {
    if (!form) return false;
    var root = form.closest(
      '.product-form--regular, .product-form, [data-product-wrapper], .shopify-section'
    ) || document;
    var trigger = root.querySelector('.pplr-c-button, [data-personalize-trigger]');
    if (!trigger) return false;

    // Once a modal personalizer has completed, it supplies at least one
    // non-empty line-item property or its customization id to the product form.
    var props = form.querySelectorAll('[name^="properties["]');
    var completed = Array.prototype.some.call(props, function (el) {
      return String(el.value == null ? '' : el.value).trim() !== '';
    });
    return completed ? false : trigger;
  }

  // ---- Empty-selection guard for the Zepto multi-quantity grid -----------
  // The plate-hat "SELECT HAT STYLE" grid (Zepto pplr_atc_form with per-color
  // .qty-box steppers) lets the customer click Add To Cart with every quantity
  // still 0. Zepto then silently adds nothing while the theme opens the cart
  // drawer — so the customer gets no feedback and no item. We detect a zero
  // selection at click time and show an error instead.
  //
  // Signal: Zepto keeps a running SUBTOTAL inside the form that reflects the
  // TOTAL selection across every style tab (not just the visible one), so it is
  // immune to tab switching (a per-tab qty-box sum is not — Zepto only renders
  // the active tab's boxes). If the subtotal has no non-zero digit, nothing is
  // selected. Falls back to summing the visible qty-boxes if no subtotal shows.
  function zeptoSelectionEmpty(form) {
    if (!form || !form.matches || !form.matches('form.pplr_atc_form')) return false;
    if (!form.querySelector('input.qty-box[name="qty"]')) return false; // not a qty grid
    var subtotalEl = Array.prototype.find.call(
      form.querySelectorAll('*'),
      function (el) {
        return el.children.length === 0 && /subtotal\s*[\$£€¥]/i.test(el.textContent || '');
      }
    );
    if (subtotalEl) return !/[1-9]/.test(subtotalEl.textContent || '');
    var sum = 0;
    form.querySelectorAll('input.qty-box[name="qty"]').forEach(function (i) {
      sum += parseInt(i.value, 10) || 0;
    });
    return sum <= 0;
  }

  function stopAdd(e, form) {
    if (zeptoSelectionEmpty(form)) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      showRequiredError(null, 'Please choose a hat style and quantity before adding to cart.');
      return true;
    }

    var missing = requiredFieldsFor(form);
    if (missing.length) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      showRequiredError(missing[0]);
      return true;
    }

    var personalize = hasPersonalizeGate(form);
    if (personalize) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      showRequiredError(null, 'Please personalize this item before adding it to cart.');
      try { personalize.click(); } catch (_) {}
      return true;
    }
    return false;
  }

  function currentPageBlocker() {
    var fields = document.querySelectorAll(REQUIRED_CUSTOM_SELECTOR);
    for (var i = 0; i < fields.length; i += 1) {
      var scope = fields[i].closest('form') || document;
      if (isBlankRequiredField(fields[i], scope)) {
        return {
          field: fields[i],
          message: 'Please enter ' + fieldLabel(fields[i]) + ' before adding to cart.'
        };
      }
    }
    var forms = document.querySelectorAll('form[action*="/cart/add"], form.pplr_atc_form');
    for (var j = 0; j < forms.length; j += 1) {
      var trigger = hasPersonalizeGate(forms[j]);
      if (trigger) {
        return {
          trigger: trigger,
          message: 'Please personalize this item before adding it to cart.'
        };
      }
    }
    return null;
  }

  function showPageBlocker(blocker) {
    if (!blocker) return;
    showRequiredError(blocker.field || null, blocker.message);
    if (blocker.trigger) {
      try { blocker.trigger.click(); } catch (_) {}
    }
  }

  document.addEventListener('click', function (e) {
    var button = e.target && e.target.closest && e.target.closest(ADD_BUTTON_SELECTOR);
    if (!button) return;
    var form = button.closest('form[action*="/cart/add"], form.pplr_atc_form');
    if (form) stopAdd(e, form);
  }, true);

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.matches ||
        !form.matches('form[action*="/cart/add"], form.pplr_atc_form')) return;
    stopAdd(e, form);
  }, true);

  // Remove our custom error as soon as the customer corrects the field.
  document.addEventListener('input', function (e) {
    if (!e.target || !e.target.matches || !e.target.matches(REQUIRED_CUSTOM_SELECTOR)) return;
    try { e.target.setCustomValidity(''); } catch (_) {}
  }, true);
  document.addEventListener('change', function (e) {
    if (!e.target || !e.target.matches || !e.target.matches(REQUIRED_CUSTOM_SELECTOR)) return;
    try { e.target.setCustomValidity(''); } catch (_) {}
  }, true);

  // Capture phase so we clean the value before framework input handlers read it.
  document.addEventListener('input', onInput, true);

  // ---- Always-visible helper hint under each personalization group --------
  var HINT_TEXT =
    'Letters, numbers, and basic symbols only — emojis and special characters can’t be printed.';
  var HINT_CSS =
    '.cl-input-hint{display:block;margin:6px 2px 8px;font-size:12.5px;line-height:1.35;' +
    'color:#6b7280;font-weight:400;}';

  function hintStyle() {
    if (document.getElementById('cl-input-hint-style')) return;
    var s = document.createElement('style');
    s.id = 'cl-input-hint-style';
    s.textContent = HINT_CSS;
    document.head.appendChild(s);
  }
  function groupOf(el) {
    return (
      el.closest('.product-personalizer, .cl-cfg, .cl-ai, .cl-up2, form') ||
      el.parentElement
    );
  }
  function addHints() {
    var fields = document.querySelectorAll('input, textarea');
    Array.prototype.forEach.call(fields, function (el) {
      if (!isTarget(el)) return;
      var g = groupOf(el);
      if (!g) return;
      // Compute the placement anchor: after this group's LAST field's row/wrapper,
      // so the hint sits on its own line (e.g. the AI-hat editor's flex text row).
      var groupFields = Array.prototype.filter.call(
        g.querySelectorAll('input, textarea'),
        isTarget
      );
      var last = groupFields[groupFields.length - 1] || el;
      var anchor = last.closest('.pplr-wrapper, .cl-ai-ed__textrow') || last;
      if (!anchor || !anchor.parentNode) return;
      // De-dupe by the ACTUAL placement (anchor's next sibling) — the anchor may
      // sit outside `g`, so a group-scoped query would miss it and loop forever.
      var nx = anchor.nextElementSibling;
      if (nx && nx.classList && nx.classList.contains('cl-input-hint')) return;
      hintStyle();
      var hint = document.createElement('div');
      hint.className = 'cl-input-hint';
      hint.textContent = HINT_TEXT;
      anchor.parentNode.insertBefore(hint, anchor.nextSibling);
    });
  }

  // Re-run for fields added later (Vue builder modal, AI-hat editor, GemPages).
  var hintTimer;
  function scheduleHints() {
    clearTimeout(hintTimer);
    hintTimer = setTimeout(addHints, 150);
  }
  if (window.MutationObserver) {
    new MutationObserver(scheduleHints).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addHints);
  } else {
    addHints();
  }

  // Submit-time safety net for standard forms: clean any target field on submit.
  document.addEventListener(
    'submit',
    function (e) {
      var form = e.target;
      if (!form || !form.querySelectorAll) return;
      form.querySelectorAll('input, textarea').forEach(function (el) {
        if (isTarget(el)) el.value = clean(el.value);
      });
    },
    true
  );

  // ---- Network safety net -------------------------------------------------
  // The visible-field cleaning above can be bypassed: the Zepto personalizer and
  // the custom builders add to cart via AJAX with values they captured on their
  // own, so a stray emoji can still reach the order. As a guarantee, intercept
  // cart requests and clean line-item property VALUES before they leave the
  // browser. Only non-system properties are touched — keys starting with "_"
  // (Shopify's hidden props: _Artwork Print URLs, _pplr_customization JSON, …)
  // are left intact.
  var CART_RE = /\/cart\/(add|change|update)(\.js)?(\?|$)/i;

  function cleanPropsObject(props) {
    if (!props || typeof props !== 'object') return;
    Object.keys(props).forEach(function (k) {
      if (k.charAt(0) !== '_' && typeof props[k] === 'string') props[k] = clean(props[k]);
    });
  }
  function cleanCartData(data) {
    if (!data || typeof data !== 'object') return data;
    if (data.properties) cleanPropsObject(data.properties);
    if (Array.isArray(data.items)) data.items.forEach(function (it) { if (it) cleanPropsObject(it.properties); });
    return data;
  }
  function cleanUSP(usp) {
    var keys = [];
    usp.forEach(function (v, k) { keys.push(k); });
    keys.forEach(function (k) {
      var m = /^properties\[(.+)\]$/.exec(k);
      if (m && m[1].charAt(0) !== '_') usp.set(k, clean(usp.get(k)));
    });
    return usp;
  }
  function cleanBody(body) {
    try {
      if (!body) return body;
      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        var fkeys = [];
        body.forEach(function (v, k) { if (typeof v === 'string') fkeys.push(k); });
        fkeys.forEach(function (k) {
          var m = /^properties\[(.+)\]$/.exec(k);
          if (m && m[1].charAt(0) !== '_') body.set(k, clean(body.get(k)));
        });
        return body;
      }
      if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
        return cleanUSP(body);
      }
      if (typeof body === 'string') {
        var trimmed = body.replace(/^\s+/, '');
        if (trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') {
          try { return JSON.stringify(cleanCartData(JSON.parse(body))); } catch (_) { return body; }
        }
        return cleanUSP(new URLSearchParams(body)).toString();
      }
    } catch (_) {}
    return body;
  }

  if (typeof window.fetch === 'function' && !window.fetch.__clWrapped) {
    var _fetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (CART_RE.test(url) && /\/cart\/add/i.test(url)) {
          var blocker = currentPageBlocker();
          if (blocker) {
            showPageBlocker(blocker);
            return Promise.resolve(new Response(JSON.stringify({
              status: 422,
              message: blocker.message,
              description: blocker.message
            }), {
              status: 422,
              headers: { 'Content-Type': 'application/json' }
            }));
          }
        }
        if (CART_RE.test(url) && init && init.body != null) init.body = cleanBody(init.body);
      } catch (_) {}
      return _fetch.apply(this, arguments);
    };
    window.fetch.__clWrapped = true;
  }

  if (window.XMLHttpRequest && !XMLHttpRequest.prototype.__clWrapped) {
    var _open = XMLHttpRequest.prototype.open;
    var _send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      var match = /\/cart\/(add|change|update)(?:\.js)?(?:\?|$)/i.exec(url || '');
      this.__clCartAction = match ? match[1].toLowerCase() : '';
      return _open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
      try {
        if (this.__clCartAction) {
          if (this.__clCartAction === 'add') {
            var blocker = currentPageBlocker();
            if (blocker) {
              showPageBlocker(blocker);
              try { this.abort(); } catch (_) {}
              return;
            }
          }
          if (body != null) arguments[0] = cleanBody(body);
        }
      } catch (_) {}
      return _send.apply(this, arguments);
    };
    XMLHttpRequest.prototype.__clWrapped = true;
  }

  // Expose for reuse/testing.
  window.CLInputValidation = { clean: clean, isTarget: isTarget, cleanBody: cleanBody };
})();
