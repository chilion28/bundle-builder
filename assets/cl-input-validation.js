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
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('is-on'); }, 2600);
  }

  // Capture phase so we clean the value before framework input handlers read it.
  document.addEventListener('input', onInput, true);

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
      this.__clCartUrl = CART_RE.test(url || '');
      return _open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
      try { if (this.__clCartUrl && body != null) arguments[0] = cleanBody(body); } catch (_) {}
      return _send.apply(this, arguments);
    };
    XMLHttpRequest.prototype.__clWrapped = true;
  }

  // Expose for reuse/testing.
  window.CLInputValidation = { clean: clean, isTarget: isTarget, cleanBody: cleanBody };
})();
