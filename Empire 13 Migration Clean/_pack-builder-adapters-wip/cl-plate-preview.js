/*
 * cl-plate-preview.js — Preview adapter (DRAFT, pending contract sign-off)
 * Part of the pack-builder consolidation (see PACK_BUILDER_COORDINATION_CLAUDE_TO_CODEX.md §2.3).
 *
 * Faithful port of the plate/text preview renderer currently living in
 * assets/cl-pack-grid.js (renderPlatePreview / fitPlateText / measurePlateText /
 * plateFontFamily). Behaviour is intentionally identical — this only repackages it
 * as a standalone, config-driven, lazily-loaded adapter that other builders can use
 * via createPreviewAdapter(config).
 *
 * INERT: nothing loads this yet. No live section references it.
 *
 * Contract (proposed):
 *   const preview = window.CLPackPreview.create({
 *     mode: 'image_overlay' | 'none',
 *     configUrl: '<asset_url of cl-plate-config.json>'   // fetched only if enabled
 *   });
 *   preview.enabled                       // false when mode:'none' -> zero cost
 *   preview.render(previewEl, {handle, variantId}, values)   // lazy, IO-driven
 *   preview.preload([handles])            // optional warm
 */
(function () {
  'use strict';

  var PLATE_IMG_BASE = 'https://cdn-zeptoapps.com/product-personalizer/images/citylocs.myshopify.com/';
  var PLATE_FONT_URL_BASE = 'https://cdn-zeptoapps.com/product-personalizer/font/citylocs.myshopify.com/';
  var PLATE_CANVAS_W = 800; // field size/position are in this coordinate space
  var PLATE_FONT_MAP = { 'Clocs-license-plate.ttf': 'CLLicensePlate' };

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // --- font registry: map each field's Zepto font file to a CSS family, register
  // unknown fonts on the fly (identical to cl-pack-grid.js) ---
  var _plateFonts = {};
  function plateFontFamily(fontFile) {
    if (!fontFile) return 'CLLicensePlate';
    if (PLATE_FONT_MAP[fontFile]) return PLATE_FONT_MAP[fontFile];
    var fam = 'CLZepto_' + fontFile.replace(/[^A-Za-z0-9]/g, '_');
    if (!_plateFonts[fam]) {
      _plateFonts[fam] = true;
      var st = document.createElement('style');
      st.textContent = '@font-face{font-family:"' + fam + '";src:url("' +
        PLATE_FONT_URL_BASE + encodeURIComponent(fontFile) + '");font-display:swap;}';
      document.head.appendChild(st);
    }
    return fam;
  }

  // --- text measurement in a detached span OUTSIDE the .gps scope (so GemPages'
  // global max-width:100% can't clamp it) — see coordination doc §2.3 ---
  var _measEl;
  function measurePlateText(text, fontPx) {
    if (!_measEl) {
      _measEl = document.createElement('span');
      _measEl.setAttribute('aria-hidden', 'true');
      _measEl.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;' +
        'white-space:nowrap;text-transform:uppercase;letter-spacing:.01em;' +
        'font-family:"CLLicensePlate","Impact",sans-serif;';
      document.body.appendChild(_measEl);
    }
    _measEl.style.fontSize = fontPx + 'px';
    _measEl.textContent = text;
    return _measEl.offsetWidth;
  }

  function fitPlateText(previewEl) {
    var photo = previewEl.querySelector('.cl-plate-photo');
    if (!photo) return;
    var pw = photo.clientWidth;
    if (!pw) return;
    var scale = pw / PLATE_CANVAS_W;
    var fields = previewEl.querySelectorAll('[data-cl-plate-field]');
    Array.prototype.forEach.call(fields, function (field) {
      var line = field.querySelector('[data-cl-plate-line]');
      if (!line) return;
      var size = parseFloat(field.getAttribute('data-size')) || 40;
      var wpct = parseFloat(field.getAttribute('data-w')) || 100;
      var fontPx = size * scale;
      line.style.fontSize = fontPx + 'px';
      // Force the theme's global max-width:100% off inline so the field is its
      // true content width and translateX(-50%) centers correctly on cx.
      field.style.setProperty('max-width', 'none', 'important');
      line.style.setProperty('max-width', 'none', 'important');
      line.style.transform = 'none';
      var tw = line.offsetWidth;
      var target = (wpct / 100) * pw;
      var sx = tw > target ? (target / tw) : 1;
      line.style.transform = 'scaleX(' + sx + ')';
    });
  }

  function renderPlatePreview(previewEl, cfgObj, values) {
    if (!previewEl || !cfgObj) return;
    var F = cfgObj.f;
    function g(k) { var v = values && values[k]; return (v == null ? '' : String(v)).trim(); }
    var l1 = g('Custom Text') || 'CUSTOM';
    var l2 = g('Custom Text Two');
    var mo = g('Month'), yr = g('Year');
    var fams = {};
    // vcenter: true  = Month/Year small boxes (vertical-center + a +1.2% nudge);
    //          'center' = a main text line the config marks `vc:true` (true vertical
    //                     center on cy, no nudge) — e.g. boonie patches whose art
    //                     leaves a centered open band. Anything falsy = top-anchored
    //                     at cy (default; plates/pins unchanged).
    function field(cf, text, vcenter) {
      if (!cf || !text) return '';
      var vc = !!vcenter;
      var top = (vcenter === true) ? (cf.cy + 1.2) : cf.cy;
      var fam = plateFontFamily(cf.font);
      fams[fam] = 1;
      return '<div class="cl-plate-field' + (vc ? ' cl-plate-field-vc' : '') +
             '" data-cl-plate-field data-size="' + cf.size + '" data-w="' + cf.w +
             '" style="left:' + cf.cx + '%;top:' + top + '%;color:' + cf.color +
             ";font-family:'" + fam + "','Impact',sans-serif\">" +
             '<span class="cl-plate-fitline" data-cl-plate-line>' + escapeHtml(text) + '</span></div>';
    }
    var overlay;
    if (l2 && F['Custom Text One'] && F['Custom Text Two']) {
      overlay = field(F['Custom Text One'], l1) + field(F['Custom Text Two'], l2);
    } else {
      var mainCf = F['Custom Text'] || F['Custom Text One'];
      // Honor per-field `vc:true` → true vertical-centering on cy (e.g. boonie patches).
      overlay = field(mainCf, l1, (mainCf && mainCf.vc) ? 'center' : false);
    }
    if (F['Month'] && mo) overlay += field(F['Month'], mo, true);
    if (F['Year'] && yr) overlay += field(F['Year'], yr, true);
    previewEl.innerHTML =
      '<div class="cl-plate-photo">' +
        '<img class="cl-plate-photo-img" src="' + PLATE_IMG_BASE + cfgObj.img + '" alt="Plate preview" loading="lazy">' +
        overlay +
      '</div>';
    // Force the plate font onto the fit-line with !important. Builder resets like
    // `.cl-hypro *{font-family:Inter!important}` otherwise override the (inherited,
    // non-important) family set on the parent .cl-plate-field, dropping the preview
    // to a plain sans. Copy each field's own family down to its line, !important —
    // font-agnostic (works for any config font).
    previewEl.querySelectorAll('[data-cl-plate-field]').forEach(function (fld) {
      var ln = fld.querySelector('[data-cl-plate-line]');
      var famVal = fld.style.getPropertyValue('font-family');
      if (ln && famVal) ln.style.setProperty('font-family', famVal, 'important');
    });
    fitPlateText(previewEl);
    var refit = function () { fitPlateText(previewEl); };
    Object.keys(fams).forEach(function (fam) {
      if (document.fonts && document.fonts.load) document.fonts.load('16px "' + fam + '"').then(refit).catch(refit);
    });
    setTimeout(refit, 250);
  }

  // --- adapter factory ---
  function create(config) {
    config = config || {};
    var enabled = config.mode === 'image_overlay';
    var cfgUrl = config.configUrl || null;
    var CFG = config.config || null;   // allow injecting a preloaded config (tests)
    var _loading = null;

    function load() {
      if (CFG) return Promise.resolve(CFG);
      if (_loading) return _loading;
      if (!cfgUrl) return Promise.resolve(null);
      _loading = fetch(cfgUrl).then(function (r) { return r.json(); })
        .then(function (json) { CFG = json; return CFG; })
        .catch(function () { CFG = {}; return CFG; });
      return _loading;
    }

    return {
      enabled: enabled,
      // Draw the preview for one element. Lazy: fetches the config on first use,
      // so builders with mode:'none' never load the (large) plate config.
      render: function (previewEl, ctx, values) {
        if (!enabled || !previewEl) return;
        ctx = ctx || {};
        load().then(function (cfg) {
          if (!cfg) return;
          var obj = cfg[ctx.handle || ''];
          if (!obj) return; // no preview config for this product -> leave as-is
          renderPlatePreview(previewEl, obj, values || {});
        });
      },
      preload: function (handles) { if (enabled) load(); return handles; },
      // exposed for tests / the pins migration
      _renderPlatePreview: renderPlatePreview,
      _load: load
    };
  }

  window.CLPackPreview = { create: create };
})();
