/* CityLocs pack-builder image-overlay preview adapter. */
(function () {
  'use strict';

  var IMAGE_BASE = 'https://cdn-zeptoapps.com/product-personalizer/images/citylocs.myshopify.com/';
  var FONT_BASE = 'https://cdn-zeptoapps.com/product-personalizer/font/citylocs.myshopify.com/';
  var CANVAS_WIDTH = 800;
  var fonts = {};

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fontFamily(file) {
    var family = file === 'Clocs-license-plate.ttf' ? 'CLLicensePlate' : 'CLPreview_' + String(file || '').replace(/[^A-Za-z0-9]/g, '_');
    if (file && !fonts[family]) {
      fonts[family] = true;
      var style = document.createElement('style');
      style.textContent = '@font-face{font-family:"' + family + '";src:url("' + FONT_BASE + encodeURIComponent(file) + '");font-display:swap;}';
      document.head.appendChild(style);
    }
    return family;
  }

  function fit(host) {
    var photo = host.querySelector('.cl-plate-photo');
    if (!photo || !photo.clientWidth) return;
    var scale = photo.clientWidth / CANVAS_WIDTH;
    host.querySelectorAll('[data-cl-plate-field]').forEach(function (field) {
      var line = field.querySelector('[data-cl-plate-line]');
      if (!line) return;
      line.style.fontSize = ((parseFloat(field.dataset.size) || 40) * scale) + 'px';
      line.style.transform = 'none';
      var target = ((parseFloat(field.dataset.w) || 100) / 100) * photo.clientWidth;
      var width = line.offsetWidth;
      line.style.transform = 'scaleX(' + (width > target ? target / width : 1) + ')';
    });
  }

  function render(host, entry, values) {
    var field = entry && entry.f && (entry.f['Custom Text'] || entry.f['Custom Text One']);
    if (!field) return;
    var text = String((values || {})['Custom Text'] || 'CUSTOM TEXT').trim().toUpperCase();
    var family = fontFamily(field.font);
    host.innerHTML = '<div class="cl-plate-photo"><img class="cl-plate-photo-img" src="' + IMAGE_BASE + encodeURIComponent(entry.img) + '" alt="Personalized product preview" loading="lazy"><div class="cl-plate-field' + (field.vc ? ' cl-plate-field-vc' : '') + '" data-cl-plate-field data-size="' + field.size + '" data-w="' + field.w + '" style="left:' + field.cx + '%;top:' + field.cy + '%;color:' + field.color + ';font-family:\'' + family + '\',Impact,sans-serif"><span class="cl-plate-fitline" data-cl-plate-line>' + escapeHtml(text) + '</span></div></div>';
    // Force the plate font onto the fit-line with !important. Builder resets such as
    // `.cl-hypro *{font-family:Inter!important}` otherwise override the (inherited,
    // non-important) family on .cl-plate-field and drop the preview to a plain sans.
    host.querySelectorAll('[data-cl-plate-field]').forEach(function (fld) {
      var ln = fld.querySelector('[data-cl-plate-line]');
      var fam = fld.style.getPropertyValue('font-family');
      if (ln && fam) ln.style.setProperty('font-family', fam, 'important');
    });
    fit(host);
    var refit = function () { fit(host); };
    if (document.fonts && document.fonts.load) document.fonts.load('16px "' + family + '"').then(refit).catch(refit);
    setTimeout(refit, 250);
  }

  function create(config) {
    config = config || {};
    var enabled = config.mode === 'image_overlay';
    var data = null;
    var loading = null;
    function load() {
      if (data) return Promise.resolve(data);
      if (!enabled || !config.configUrl) return Promise.resolve(null);
      if (!loading) loading = fetch(config.configUrl).then(function (response) {
        if (!response.ok) throw new Error('Preview configuration could not be loaded.');
        return response.json();
      }).then(function (json) { data = json; return data; }).catch(function (error) {
        console.warn(error.message); data = {}; return data;
      });
      return loading;
    }
    return {
      enabled: enabled,
      render: function (host, context, values) {
        if (!enabled || !host) return;
        load().then(function (entries) {
          var entry = entries && entries[(context || {}).handle];
          if (entry) render(host, entry, values);
        });
      },
      preload: function () { if (enabled) load(); }
    };
  }

  window.CLPackPreview = { create: create };
})();
