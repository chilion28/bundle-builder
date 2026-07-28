/* Create Your AI Hat — builder behaviour.
 * Self-contained. Loaded by snippets/cl-ai-hat-builder.liquid.
 *
 *   Step 1  copy prompt to clipboard
 *   Step 2  drag/drop or choose an image; client-side print-quality analysis,
 *           then upload to Cloudinary (unsigned) — or a local-preview fallback
 *           until credentials are set.
 *   Step 3  Style/Color -> Shopify variant; Patch Shape/Text -> line-item props.
 *   Step 4  live quality scorecard.
 *   ATC     POST /cart/add.js, then open the AMP/iCart drawer (see cl-fixed-bundle.js).
 */
(function () {
  'use strict';

  /* =====================================================================
   * CONFIG — paste your Cloudinary values here when the account is ready.
   * Leave as-is to run in local-preview fallback mode (no real upload).
   * How to get these: cloudinary.com → dashboard (cloudName) and
   * Settings ▸ Upload ▸ Add upload preset (Unsigned) → its name (uploadPreset).
   * ===================================================================== */
  var CL_AI_HAT = {
    cloudName: 'ycnncucq',
    uploadPreset: 'ai_hat_unsigned',
    // NOTE: never put api_key / api_secret here — unsigned uploads don't need them.
    // Physical patch size is per-shape — see PATCH_IN below (production spec).
    targetDpi: 300,
    maxFileMB: 25,
    patchBg: '#ffffff'   // default pad for transparent art
  };
  function cloudinaryReady() {
    return CL_AI_HAT.cloudName && CL_AI_HAT.cloudName !== 'YOUR_CLOUD_NAME' &&
           CL_AI_HAT.uploadPreset && CL_AI_HAT.uploadPreset !== 'YOUR_PRESET';
  }

  var root = document.querySelector('[data-cl-ai-builder]');
  if (!root || root.dataset.clInit === '1') return;
  root.dataset.clInit = '1';

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* ---- parse variant data ---- */
  var data = {};
  try { data = JSON.parse($('[data-cl-ai-hat-data]').textContent); } catch (e) { data = { variants: [] }; }
  var variants = data.variants || [];
  var moneyFormat = data.moneyFormat || '${{amount}}';

  function formatMoney(cents) {
    var amount = (cents / 100).toFixed(2);
    return moneyFormat.replace(/\{\{\s*amount\s*\}\}/, amount)
                      .replace(/\{\{\s*amount_no_decimals\s*\}\}/, Math.round(cents / 100));
  }

  /* selection state */
  var state = {
    style: (($('[data-cl-ai-style].is-active') || {}).dataset || {}).value || null,
    color: (($('[data-cl-ai-color].is-active') || {}).dataset || {}).value || null,
    shape: 'Rectangle',
    text: '',
    textColor: 'Black',
    artUrl: '',
    score: ''
  };

  /* =====================================================================
   * STEP 1 — copy prompt
   * The prompt carries a [[SIZE]] token replaced with guidance for the chosen
   * patch, so what ChatGPT produces already matches the window and needs no
   * cropping. Sizes are the closest ChatGPT offers to each window aspect.
   * ===================================================================== */
  /* Only the ASPECT RATIO differs per shape — never the shape itself. The builder
     crops the finished rectangle into the patch shape, so the AI must be told to
     make a normal full-bleed rectangular/square image. Describing the patch shape
     (e.g. "your patch is a HEXAGON, edges taper to points") made ChatGPT literally
     draw a hexagon-shaped picture. Rectangle and hexagon share the same wide crop. */
  var PROMPT_SIZE = {
    // window 1.88 — widest
    rectangle: 'Make a WIDE LANDSCAPE image, about 1792 x 1024 pixels (roughly 16:9).\n' +
               'Fill the ENTIRE rectangle, edge to edge. Do NOT make a square image.',
    // window 1.83 — same wide crop as rectangle
    hexagon:   'Make a WIDE LANDSCAPE image, about 1792 x 1024 pixels (roughly 16:9).\n' +
               'Fill the ENTIRE rectangle, edge to edge. Do NOT make a square image.',
    // window 1.26 — only slightly wider than tall
    rounded:   'Make a LANDSCAPE image, about 1536 x 1024 pixels (3:2).\n' +
               'Fill the ENTIRE rectangle, edge to edge. Do NOT make a square image.',
    // window 1.0 — exact square
    circle:    'Make a SQUARE image, 1024 x 1024 pixels.\n' +
               'Fill the ENTIRE square, edge to edge. Keep the main subject centred.'
  };

  var promptEl = $('[data-cl-ai-prompt]');
  var promptTemplate = promptEl ? promptEl.textContent : '';
  function syncPrompt() {
    if (!promptEl || promptTemplate.indexOf('[[SIZE]]') === -1) return;
    var guide = PROMPT_SIZE[String(state.shape).toLowerCase()] || PROMPT_SIZE.rectangle;
    promptEl.textContent = promptTemplate.replace(/\[\[SIZE\]\]/g, guide);
  }
  var copyBtn = $('[data-cl-ai-copy]');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var pre = $('[data-cl-ai-prompt]');
      var text = pre ? pre.textContent : '';
      var done = function () {
        copyBtn.classList.add('is-copied');
        var label = $('[data-cl-ai-copy-label]', copyBtn);
        var prev = label ? label.textContent : '';
        if (label) label.textContent = 'COPIED!';
        setTimeout(function () {
          copyBtn.classList.remove('is-copied');
          if (label) label.textContent = prev;
        }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text); done(); });
      } else { legacyCopy(text); done(); }
    });
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  /* =====================================================================
   * HERO gallery thumbs
   * ===================================================================== */
  var galMain = $('[data-cl-ai-gallery-main]');
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // The thumb rail mirrors the colours available for the CURRENT style, so it can
  // never drift out of sync with the option selector. Rebuilt on init + style change.
  function renderThumbs() {
    var gallery = $('[data-cl-ai-gallery]');
    if (!gallery) return;
    var rail = gallery.querySelector('.cl-ai__gallery-thumbs');
    var swatches = $$('[data-cl-ai-color]').filter(function (b) { return !b.hidden && b.dataset.swatchImg; });
    if (!swatches.length) { if (rail) rail.hidden = true; return; }
    if (!rail) {
      rail = document.createElement('ul');
      rail.className = 'cl-ai__gallery-thumbs';
      rail.setAttribute('role', 'list');
      gallery.appendChild(rail);
    }
    rail.hidden = false;
    rail.innerHTML = swatches.map(function (b) {
      var label = b.getAttribute('title') || b.dataset.value;
      return '<li><button type="button" class="cl-ai__thumb' + (b.classList.contains('is-active') ? ' is-active' : '') +
             '" data-cl-ai-thumb data-color="' + esc(b.dataset.value) + '" data-full="' + esc(b.dataset.swatchImg) +
             '" aria-label="' + esc(label) + '"><img src="' + esc(b.dataset.swatchImg) + '" alt="' + esc(label) +
             '" loading="lazy"></button></li>';
    }).join('');
  }
  function syncActiveThumb() {
    $$('[data-cl-ai-thumb]').forEach(function (t) {
      t.classList.toggle('is-active', t.dataset.color === state.color);
    });
  }
  // Delegated: thumbs are re-rendered, so don't bind them individually.
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-cl-ai-thumb]') : null;
    if (!t) return;
    var color = t.dataset.color;
    if (color) {
      var sw = $$('[data-cl-ai-color]').filter(function (b) { return b.dataset.value === color; })[0];
      if (sw) { sw.click(); return; }   // reuse the swatch handler (label, hero image, variant)
    }
    if (galMain && t.dataset.full) galMain.src = t.dataset.full;
    syncActiveThumb();
  });

  /* =====================================================================
   * STEP 2 — upload + STEP 4 quality check
   * ===================================================================== */
  var drop = $('[data-cl-ai-drop]');
  var fileInput = $('[data-cl-ai-file]');
  var actions = $('[data-cl-ai-actions]');
  var pfHint = $('[data-cl-ai-pf-hint]');
  var pfArt = $('[data-cl-ai-pf-art]');
  var patchframe = $('[data-cl-ai-patchframe]');
  var uploadStatus = $('[data-cl-ai-upload-status]');
  var qcPanel = $('[data-cl-ai-qc]');
  var qcThumb = $('[data-cl-ai-qc-thumb]');
  var patch = $('[data-cl-ai-patch]');        // hero "on the hat" overlay
  var qcVerdict = $('[data-cl-ai-qc-verdict]');
  var propArt = $('[data-cl-ai-prop-art]');
  var propOrig = $('[data-cl-ai-prop-orig]');
  var propPdf = $('[data-cl-ai-prop-pdf]');
  var propPreview = $('[data-cl-ai-prop-preview]');
  var propScore = $('[data-cl-ai-prop-score]');

  function openPicker() { if (fileInput) { fileInput.value = ''; fileInput.click(); } }
  if (drop) {
    drop.addEventListener('click', openPicker);
    drop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-drag'); });
    });
    drop.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFile(f);
    });
  }
  if (fileInput) {
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
    });
  }
  // Edit / Replace buttons on the placed preview.
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-cl-ai-replace]')) { openPicker(); }
    else if (e.target.closest('[data-cl-ai-edit]')) { if (edState.img) openEditor(false); }
  });

  function handleFile(file) {
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) { setStatus('err', 'Please upload a JPG, PNG or WEBP image.'); return; }
    if (file.size > CL_AI_HAT.maxFileMB * 1024 * 1024) { setStatus('err', 'File is over ' + CL_AI_HAT.maxFileMB + 'MB.'); return; }
    var localUrl = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      edState.img = img; edState.file = file; edState.natW = img.naturalWidth; edState.natH = img.naturalHeight;
      edState.scale = 1; edState.rotation = 0; edState.offsetX = 0; edState.offsetY = 0; edState.stretchX = 1; edState.stretchY = 1;
      edState.contentBox = computeContentBox(img);   // subject bounds for the off-safe-area warning
      edState.hasAlpha = !!edState.contentBox.hasAlpha;   // transparent file → always pad the background
      // Transparent art → pad with the real leather patch colour (cream), not the
      // black that a transparent border samples to. Opaque art → match its own edge.
      edState.bg = edState.hasAlpha ? CL_AI_HAT.patchBg : detectBgColor(img);
      if (edBg) edBg.value = edState.bg;
      // Square-ish art on a wide patch loses a lot to cropping — start those in
      // Fit so nothing is lost and production doesn't rebuild the background.
      var srcAspect = img.naturalWidth / img.naturalHeight;
      edState.fit = Math.abs(srcAspect - shapeAspect()) / shapeAspect() > 0.25;
      syncModeButtons();
      runQualityCheck(file, img.naturalWidth, img.naturalHeight); // quality reflects the SOURCE image
      openEditor(true);
    };
    img.onerror = function () { setStatus('err', 'Could not read that image. Try another file.'); };
    img.src = localUrl;
  }

  function setStatus(kind, msg) {
    if (!uploadStatus) return;
    uploadStatus.className = 'cl-ai-b__drop-status is-' + kind;
    uploadStatus.textContent = msg;
  }

  /* =====================================================================
   * CROP / ZOOM / ROTATE EDITOR (self-contained canvas — no library)
   * ===================================================================== */
  var editor = $('[data-cl-ai-editor]');
  // Portal the modal to <body> so position:fixed is measured against the viewport,
  // not trapped by any ancestor with a transform/filter/contain (theme wrappers).
  if (editor && editor.parentNode !== document.body) document.body.appendChild(editor);
  var edCanvas = $('[data-cl-ai-ed-canvas]');
  var edStage = $('[data-cl-ai-ed-stage]');
  var edMask = $('[data-cl-ai-ed-mask]');
  var edFrame = $('[data-cl-ai-ed-frame]');
  var edZoom = $('[data-cl-ai-ed-zoom]');
  var edWarn = $('[data-cl-ai-ed-warn]');
  var edBoxToggle = $('[data-cl-ai-ed-box]');
  if (edBoxToggle) edBoxToggle.addEventListener('change', function () { edState.showBox = edBoxToggle.checked; edDraw(); });
  var edBgWrap = $('[data-cl-ai-ed-bgwrap]');
  var edBg = $('[data-cl-ai-ed-bg]');
  // Reuse the Step-2 preview's frame PNG URLs (already rendered with asset_url).
  function currentFrameSrc() {
    var f = document.querySelector('.cl-ai-pf__frame[data-frame="' + String(state.shape).toLowerCase() + '"]');
    return f ? f.getAttribute('src') : '';
  }
  // Pixel-perfect window masks (derived from the frames): apply to the preview art
  // and preload for the editor's canvas clip.
  var maskUrl = function (shape) { return patchframe ? patchframe.getAttribute('data-mask-' + shape) : null; };
  function setPatchMask() {
    if (!pfArt) return;
    var url = maskUrl(String(state.shape).toLowerCase());
    if (url) { pfArt.style.webkitMaskImage = 'url("' + url + '")'; pfArt.style.maskImage = 'url("' + url + '")'; }
  }
  var edMasks = {};
  ['rectangle', 'rounded', 'circle', 'hexagon'].forEach(function (s) {
    var u = maskUrl(s); if (u) { var im = new Image(); im.src = u; edMasks[s] = im; }
  });

  // Separate CORS-enabled copies used only for EXPORT — drawing a non-CORS image
  // onto a canvas taints it and toBlob() then throws. Kept apart from the display
  // copies above so a missing CORS header can never break the editor itself.
  var exportMasks = {}, exportFrames = {};
  ['rectangle', 'rounded', 'circle', 'hexagon'].forEach(function (s) {
    var mu = maskUrl(s);
    if (mu) { var mi = new Image(); mi.crossOrigin = 'anonymous'; mi.src = mu; exportMasks[s] = mi; }
    var fEl = document.querySelector('.cl-ai-pf__frame[data-frame="' + s + '"]');
    if (fEl) { var fi = new Image(); fi.crossOrigin = 'anonymous'; fi.src = fEl.getAttribute('src'); exportFrames[s] = fi; }
  });

  // Artwork composited inside the real patch frame — the visual reference of the
  // finished patch for production/CS. Null if the frame isn't usable for export.
  function buildPreviewCanvas(printCanvas) {
    var shape = String(state.shape).toLowerCase();
    var win = WINDOW[shape] || WINDOW.rectangle;
    var frame = exportFrames[shape], mask = exportMasks[shape];
    if (!frame || !frame.complete || !frame.naturalWidth) return null;
    var S = 1200;
    var dx = win.l * S, dy = win.t * S, dw = win.w * S, dh = win.h * S;
    var art = document.createElement('canvas'); art.width = S; art.height = S;
    var actx = art.getContext('2d');
    actx.drawImage(printCanvas, dx, dy, dw, dh);
    if (mask && mask.complete && mask.naturalWidth) {
      actx.globalCompositeOperation = 'destination-in';
      actx.drawImage(mask, dx, dy, dw, dh);
    }
    var pv = document.createElement('canvas'); pv.width = S; pv.height = S;
    var pctx = pv.getContext('2d');
    pctx.drawImage(art, 0, 0);
    pctx.drawImage(frame, 0, 0, S, S);
    return pv;
  }
  function safeToBlob(canvas, cb) {
    try { canvas.toBlob(function (b) { cb(b); }, 'image/png'); }
    catch (e) { cb(null); }   // tainted canvas — skip rather than block the order
  }
  var edState = { img: null, file: null, natW: 0, natH: 0, scale: 1, rotation: 0, offsetX: 0, offsetY: 0,
                  baseScale: 1, maskW: 0, maskH: 0,
                  fit: false,          // false = fill/crop, true = contain + padded background
                  showBox: true,       // transform box overlay on/off
                  textNorm: null,      // caption position {x,y} normalized to the window (0,0 = centre)
                  textScale: 1,        // caption font-size multiplier (drag a handle to resize)
                  stretchX: 1, stretchY: 1,  // per-axis stretch (edge handles) — 1 = original proportions
                  bg: '#ffffff' };
  // Effective per-axis scale: uniform zoom × per-axis stretch × the cover baseline.
  function edSX() { return edState.baseScale * edState.scale * (edState.stretchX || 1); }
  function edSY() { return edState.baseScale * edState.scale * (edState.stretchY || 1); }

  /* Most AI patch art sits on a flat background, so sampling the border pixels
     gives us the colour to pad with — the same thing a designer would pick when
     extending the artwork by hand. */
  function detectBgColor(img) {
    try {
      var S = 48, c = document.createElement('canvas');
      c.width = S; c.height = S;
      var cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0, S, S);
      var d = cx.getImageData(0, 0, S, S).data, counts = {}, best = null, bestN = 0;
      var add = function (x, y) {
        var i = (y * S + x) * 4;
        var k = [d[i], d[i + 1], d[i + 2]].map(function (v) { return Math.round(v / 16) * 16; }).join(',');
        counts[k] = (counts[k] || 0) + 1;
        if (counts[k] > bestN) { bestN = counts[k]; best = k; }
      };
      for (var x = 0; x < S; x++) { add(x, 0); add(x, S - 1); }
      for (var y = 0; y < S; y++) { add(0, y); add(S - 1, y); }
      if (!best) return '#ffffff';
      var p = best.split(',').map(Number);
      return '#' + p.map(function (v) { return ('0' + Math.min(255, v).toString(16)).slice(-2); }).join('');
    } catch (e) { return '#ffffff'; }
  }

  // Each shape's artwork-window size as a fraction of the 1200×1200 frame PNG
  // (measured from the transparent windows). Drives editor aspect + output dims.
  var WINDOW = {
    rectangle: { l: 0.0342, t: 0.2592, w: 0.9317, h: 0.4958 },
    rounded:   { l: 0.0367, t: 0.1317, w: 0.9267, h: 0.7358 },
    circle:    { l: 0.0383, t: 0.0383, w: 0.9233, h: 0.9233 },
    hexagon:   { l: 0.0300, t: 0.2408, w: 0.9400, h: 0.5133 }
  };
  /* The dashed guide on each frame is the safe area: production needs artwork —
     especially text and logos — to sit inside it, or they have to nudge it by
     hand. Measured from the frames, as a fraction of the window. */
  var SAFE = {
    rectangle: { w: 0.972, h: 0.949 },
    rounded:   { w: 0.968, h: 0.960 },
    circle:    { w: 0.959, h: 0.959 },
    hexagon:   { w: 0.978, h: 0.959 }
  };
  function safeFor(shape) { return SAFE[String(shape).toLowerCase()] || SAFE.rectangle; }

  function shapeAspect() { var win = WINDOW[String(state.shape).toLowerCase()] || WINDOW.rectangle; return win.w / win.h; }

  /* Finished patch size in inches per shape (production spec). Drives the print
     file's pixel dimensions (inches × DPI) so the artwork drops into production
     at its true physical size instead of a one-size-fits-all 4" width. The
     ratios here match the WINDOW aspects above, so the on-screen crop and the
     printed file stay 1:1. */
  var PATCH_IN = {
    circle:    { w: 2.25, h: 2.25 },   // ROUND
    rectangle: { w: 3.8,  h: 2.024 },  // RECTANGLE
    rounded:   { w: 3.0,  h: 2.383 },  // SQUARE
    hexagon:   { w: 3.8,  h: 2.077 }   // HEX
  };
  function patchSize() { return PATCH_IN[String(state.shape).toLowerCase()] || PATCH_IN.rectangle; }

  function computeMask() {
    var W = edStage.clientWidth, H = edStage.clientHeight;
    var aspect = shapeAspect();
    var maskW = Math.min(W * 0.86, H * 0.86 * aspect);
    var maskH = maskW / aspect;
    edState.maskW = maskW; edState.maskH = maskH;
    if (edMask) { edMask.style.width = maskW + 'px'; edMask.style.height = maskH + 'px'; }
    // Size the real frame PNG so its transparent window lines up with the mask.
    if (edFrame) {
      var win = WINDOW[String(state.shape).toLowerCase()] || WINDOW.rectangle;
      var fw = maskW / win.w;                 // frame width whose window == maskW
      edFrame.style.width = fw + 'px'; edFrame.style.height = fw + 'px';
      var src = currentFrameSrc();
      if (src && edFrame.getAttribute('src') !== src) edFrame.setAttribute('src', src);
    }
    var rot = ((edState.rotation % 360) + 360) % 360;
    var iw = (rot === 90 || rot === 270) ? edState.natH : edState.natW;
    var ih = (rot === 90 || rot === 270) ? edState.natW : edState.natH;
    // Fill = cover (crops). Fit = contain within the SAFE area so nothing
    // important lands outside the dashed guide; the background pads the rest.
    var sf = safeFor(state.shape);
    edState.baseScale = edState.fit
      ? Math.min(maskW * sf.w / iw, maskH * sf.h / ih)
      : Math.max(maskW / iw, maskH / ih);
  }

  // On-screen axis-aligned extents of the (per-axis scaled, rotated) image.
  function edExtent() {
    var rot = ((edState.rotation % 360) + 360) % 360;
    var swap = (rot === 90 || rot === 270);
    var wx = edState.natW * edSX(), hy = edState.natH * edSY();
    return { ew: swap ? hy : wx, eh: swap ? wx : hy };
  }

  function clampOffset() {
    // Pan within the slack in BOTH directions: a larger-than-window image pans
    // the crop (fill); a smaller-than-window image (fit / zoomed out) can be
    // nudged around inside the padding. Old code zeroed the range when the image
    // was smaller than the window, which killed dragging in Fit mode.
    var ext = edExtent();
    var maxX = Math.abs(ext.ew - edState.maskW) / 2;
    var maxY = Math.abs(ext.eh - edState.maskH) / 2;
    edState.offsetX = Math.max(-maxX, Math.min(maxX, edState.offsetX));
    edState.offsetY = Math.max(-maxY, Math.min(maxY, edState.offsetY));
  }

  /* Bounding box of the actual SUBJECT (non-transparent, non-background pixels)
   * as fractions of the image, so the off-safe-area warning tests the visible art
   * — not the full rectangle, which for logos includes big transparent margins
   * and made the warning stick on forever. Handles transparent AND solid-colour
   * backgrounds (compares against the average corner colour). */
  function computeContentBox(img) {
    var full = { l: 0, t: 0, r: 1, b: 1 };
    try {
      var MAX = 220;
      var sc = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
      var w = Math.max(1, Math.round(img.naturalWidth * sc));
      var h = Math.max(1, Math.round(img.naturalHeight * sc));
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      var cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, w, h);
      var d = cx.getImageData(0, 0, w, h).data;
      var corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + (w - 1)) * 4];
      var br = 0, bgc = 0, bb = 0, ba = 0;
      corners.forEach(function (i) { br += d[i]; bgc += d[i + 1]; bb += d[i + 2]; ba += d[i + 3]; });
      br /= 4; bgc /= 4; bb /= 4; ba /= 4;
      var minX = w, minY = h, maxX = -1, maxY = -1, transp = 0;
      for (var y = 0; y < h; y += 1) {
        for (var x = 0; x < w; x += 1) {
          var i = (y * w + x) * 4, a = d[i + 3];
          if (a < 128) transp += 1;
          var diff = Math.abs(d[i] - br) + Math.abs(d[i + 1] - bgc) + Math.abs(d[i + 2] - bb);
          var subject = a > 40 && (ba < 40 || diff > 60);   // transparent bg → any opaque; solid bg → differs from it
          if (subject) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
        }
      }
      var hasAlpha = transp > w * h * 0.01;   // >1% transparent → treat as a transparent file
      if (maxX < 0) return { l: 0, t: 0, r: 1, b: 1, hasAlpha: hasAlpha };
      return { l: minX / w, t: minY / h, r: (maxX + 1) / w, b: (maxY + 1) / h, hasAlpha: hasAlpha };
    } catch (e) { return full; }   // cross-origin taint etc. → treat whole image as subject
  }

  /* On a fresh upload, frame the SUBJECT nicely inside the dashed area — centred
   * and filling a safe fraction of the shape — so our default is "good enough"
   * even if the customer never touches it (fewer files for production to fix).
   * Only zooms IN (logos that have transparent margins); full-bleed art, which
   * already fills the frame, is left alone. Per-shape usable fractions keep the
   * subject inside the tapered shapes (circle/hexagon). */
  var USABLE = { rectangle: 0.92, rounded: 0.86, circle: 0.68, hexagon: 0.74 };
  function autoFrameSubject() {
    if (!edState.img || !edState.maskW || !edState.contentBox || !edState.baseScale) return;
    // Only reframe TRANSPARENT logos (crop to their content). Opaque designs
    // have an intentional background/composition — leave them at the default
    // fit/fill so we don't zoom a designed badge past the patch edge.
    if (!edState.hasAlpha) return;
    var cb = edState.contentBox;
    var subjW = (cb.r - cb.l) * edState.natW, subjH = (cb.b - cb.t) * edState.natH;
    if (subjW <= 1 || subjH <= 1) return;
    var u = USABLE[String(state.shape).toLowerCase()] || 0.9;
    var absScale = Math.min(edState.maskW * u / subjW, edState.maskH * u / subjH);
    var rel = absScale / edState.baseScale;
    if (rel <= 1.05) return;   // subject already fills the frame — leave it
    rel = Math.min(rel, 4);
    edState.scale = rel;
    if (edZoom) edZoom.value = rel;
    var s = edState.baseScale * rel;
    edState.offsetX = -((cb.l + cb.r) / 2 - 0.5) * edState.natW * s;   // centre the subject
    edState.offsetY = -((cb.t + cb.b) / 2 - 0.5) * edState.natH * s;
    clampOffset();
  }

  // Both modes can shrink below cover: a customer who instinctively uses the
  // slider in the default Fill mode can zoom the whole image inside the dashed
  // line without discovering the Fit toggle. Gaps auto-pad — see imgCovers().
  function minZoom() { return 0.4; }

  // Does the image fully cover the window at the current scale/rotation? When it
  // doesn't, the background colour pads the gap (identically in preview + print).
  function imgCovers() {
    if (!edState.img || !edState.maskW) return true;
    var ext = edExtent();
    return ext.ew >= edState.maskW - 0.5 && ext.eh >= edState.maskH - 0.5;
  }

  // Pad (and show the background picker) whenever the patch would otherwise have
  // transparent areas: a transparent file always needs it (its see-through parts
  // show inside the window even when its box covers), and any image that doesn't
  // fully cover the window needs it for the edge gaps.
  function needsPad() { return edState.hasAlpha || !imgCovers(); }

  // Trace the current shape's window path, centred at (cx,cy), size mw×mh.
  // Geometry measured from the frame PNGs' transparent windows.
  function edShapePath(ctx, cx, cy, mw, mh) {
    var shape = String(state.shape).toLowerCase();
    var x = cx - mw / 2, y = cy - mh / 2;
    ctx.beginPath();
    if (shape === 'circle') { ctx.ellipse(cx, cy, mw / 2, mh / 2, 0, 0, Math.PI * 2); return; }
    if (shape === 'hexagon') {
      var P = [[0.5, 0], [0, 0.35], [0, 0.65], [0.5, 1], [1, 0.65], [1, 0.35]];
      P.forEach(function (p, i) { var X = x + p[0] * mw, Y = y + p[1] * mh; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
      ctx.closePath(); return;
    }
    // rectangle / rounded → elliptical-corner rounded rect
    var rx = (shape === 'rounded' ? 0.46 : 0.05) * mw;
    var ry = (shape === 'rounded' ? 0.20 : 0.08) * mh;
    rx = Math.min(rx, mw / 2); ry = Math.min(ry, mh / 2);
    ctx.moveTo(x + rx, y);
    ctx.lineTo(x + mw - rx, y);
    ctx.ellipse(x + mw - rx, y + ry, rx, ry, 0, -Math.PI / 2, 0);
    ctx.lineTo(x + mw, y + mh - ry);
    ctx.ellipse(x + mw - rx, y + mh - ry, rx, ry, 0, 0, Math.PI / 2);
    ctx.lineTo(x + rx, y + mh);
    ctx.ellipse(x + rx, y + mh - ry, rx, ry, 0, Math.PI / 2, Math.PI);
    ctx.lineTo(x, y + ry);
    ctx.ellipse(x + rx, y + ry, rx, ry, 0, Math.PI, Math.PI * 1.5);
    ctx.closePath();
  }

  function paintImage(ctx, W, H) {
    ctx.save();
    ctx.translate(W / 2 + edState.offsetX, H / 2 + edState.offsetY);
    ctx.rotate(edState.rotation * Math.PI / 180);
    ctx.scale(edSX(), edSY());
    ctx.drawImage(edState.img, -edState.natW / 2, -edState.natH / 2, edState.natW, edState.natH);
    ctx.restore();
  }

  function edDraw() {
    if (!edState.img) return;
    var dpr = window.devicePixelRatio || 1;
    var W = edStage.clientWidth, H = edStage.clientHeight;
    edCanvas.width = W * dpr; edCanvas.height = H * dpr;
    edCanvas.style.width = W + 'px'; edCanvas.style.height = H + 'px';
    var ctx = edCanvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    clampOffset();
    if (edBgWrap) edBgWrap.hidden = !needsPad();   // show whenever the background is padding something
    // Dimmed full image (shows what's cropped out), then bright inside the window.
    ctx.save(); ctx.globalAlpha = 0.28; paintImage(ctx, W, H); ctx.restore();
    var mimg = edMasks[String(state.shape).toLowerCase()];
    if (mimg && mimg.complete && mimg.naturalWidth) {
      // Pixel-perfect: paint bright image on an offscreen, keep only the window via the mask.
      var off = document.createElement('canvas'); off.width = edCanvas.width; off.height = edCanvas.height;
      var octx = off.getContext('2d'); octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (needsPad()) {   // pad the gap / transparency with the background, exactly as it will print
        octx.fillStyle = edState.bg;
        octx.fillRect(W / 2 - edState.maskW / 2, H / 2 - edState.maskH / 2, edState.maskW, edState.maskH);
      }
      paintImage(octx, W, H);
      octx.globalCompositeOperation = 'destination-in';
      octx.drawImage(mimg, W / 2 - edState.maskW / 2, H / 2 - edState.maskH / 2, edState.maskW, edState.maskH);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(off, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else {
      // Fallback (mask not loaded yet): clip via traced shape path.
      ctx.save(); edShapePath(ctx, W / 2, H / 2, edState.maskW, edState.maskH); ctx.clip(); paintImage(ctx, W, H); ctx.restore();
    }
    if (edState.showBox) drawTransformBox(ctx, W, H); else edBox.handles = null;
    drawEditorText(ctx, W, H);
    updateWarn();
  }

  /* The draggable/resizable caption inside the editor — drawn at the window
   * centre + textNorm, with a dashed selection box + corner handles (filled
   * blue, to tell them apart from the image's white handles). Geometry stored
   * in edTextBox for pointer hit-testing. */
  var edTextBox = { handles: null, cx: 0, cy: 0, hw: 0, hh: 0 };
  function drawEditorText(ctx, W, H) {
    if (!state.text) { edTextBox.handles = null; return; }
    var g = drawText(ctx, W / 2, H / 2, edState.maskW, edState.maskH);
    if (!g) { edTextBox.handles = null; return; }
    var padX = 8, padY = 6;
    var hw = g.hw + padX, hh = g.hh + padY;
    var lX = g.x - hw, rX = g.x + hw, tY = g.y - hh, bY = g.y + hh;
    edTextBox = { cx: g.x, cy: g.y, hw: hw, hh: hh, handles: [[lX, tY], [rX, tY], [rX, bY], [lX, bY]] };
    ctx.save();
    ctx.strokeStyle = '#00a0ea'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
    ctx.strokeRect(lX, tY, rX - lX, bY - tY);
    ctx.setLineDash([]); ctx.fillStyle = '#00a0ea';
    edTextBox.handles.forEach(function (p) { ctx.beginPath(); ctx.rect(p[0] - 4, p[1] - 4, 8, 8); ctx.fill(); });
    ctx.restore();
  }

  /* Photoshop-style transform box around the artwork — a rotated outline + corner
   * and edge handles around the FULL uploaded file, so the customer sees the size
   * and boundary of their file against the patch, and can drag a handle to resize.
   * Handle geometry is stored in edBox (stage px) for pointer hit-testing. */
  var edBox = { cx: 0, cy: 0, handles: null };
  function drawTransformBox(ctx, W, H) {
    if (!edState.img || !edState.maskW) { edBox.handles = null; return; }
    var sx = edSX(), sy = edSY();
    var lX = -edState.natW * sx / 2, rX = edState.natW * sx / 2;   // full uploaded-file edges
    var tY = -edState.natH * sy / 2, bY = edState.natH * sy / 2;
    var cx = W / 2 + edState.offsetX, cy = H / 2 + edState.offsetY;
    var rad = edState.rotation * Math.PI / 180, c = Math.cos(rad), sn = Math.sin(rad);
    function P(ox, oy) { return [cx + ox * c - oy * sn, cy + ox * sn + oy * c]; }
    var corners = [P(lX, tY), P(rX, tY), P(rX, bY), P(lX, bY)];
    var handles = corners.concat([P(0, tY), P(rX, 0), P(0, bY), P(lX, 0)]);
    edBox = { cx: cx, cy: cy, handles: handles };
    ctx.save();
    ctx.strokeStyle = '#00a0ea'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(corners[0][0], corners[0][1]);
    for (var i = 1; i < 4; i += 1) ctx.lineTo(corners[i][0], corners[i][1]);
    ctx.closePath(); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    handles.forEach(function (p) {
      ctx.beginPath(); ctx.rect(p[0] - 4, p[1] - 4, 8, 8); ctx.fill(); ctx.stroke();
    });
    ctx.restore();
  }

  /* Flag when the SUBJECT extends past the dashed safe area — nudges a customer
   * who doesn't position, so production hand-fixes fewer files. Pure arithmetic
   * (the subject's rotated bounding box vs the safe rectangle, all relative to
   * the window centre) — no canvas/isPointInPath/DPR, which was unreliable and
   * left the warning stuck on. Uses the safe bounding rect (slightly lenient on
   * circle/hexagon corners, i.e. it errs toward NOT nagging). */
  function updateWarn() {
    if (!edWarn) return;
    var outside = false;
    if (edState.img && edState.maskW) {
      var sx = edSX(), sy = edSY();
      var cb = edState.contentBox || { l: 0, t: 0, r: 1, b: 1 };
      // Subject-box edges relative to the image centre (stage px).
      var lX = (cb.l - 0.5) * edState.natW * sx, rX = (cb.r - 0.5) * edState.natW * sx;
      var tY = (cb.t - 0.5) * edState.natH * sy, bY = (cb.b - 0.5) * edState.natH * sy;
      var rad = edState.rotation * Math.PI / 180, c = Math.cos(rad), sn = Math.sin(rad);
      var pts = [[lX, tY], [rX, tY], [rX, bY], [lX, bY]];
      var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      for (var i = 0; i < 4; i += 1) {
        var x = pts[i][0] * c - pts[i][1] * sn, y = pts[i][0] * sn + pts[i][1] * c;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      var ox = edState.offsetX, oy = edState.offsetY;   // subject offset from window centre
      var safeHW = edState.maskW * safeFor(state.shape).w / 2;
      var safeHH = edState.maskH * safeFor(state.shape).h / 2;
      var TOL = 4;
      outside = (ox + minX < -safeHW - TOL) || (ox + maxX > safeHW + TOL) ||
                (oy + minY < -safeHH - TOL) || (oy + maxY > safeHH + TOL);
    }
    edWarn.hidden = !outside;
  }

  function openEditor(isNew) {
    if (!editor) return;
    if (isNew) { edState.scale = 1; edState.rotation = 0; edState.offsetX = 0; edState.offsetY = 0; edState.stretchX = 1; edState.stretchY = 1; }
    if (edMask) edMask.setAttribute('data-shape', String(state.shape).toLowerCase());
    if (edZoom) edZoom.value = edState.scale;
    // Reflect any existing caption in the modal's text controls.
    if (textToggle) textToggle.checked = !!state.text;
    if (textGroup) textGroup.hidden = !state.text;
    if (textInput && state.text) textInput.value = state.text;
    syncModeButtons();
    editor.hidden = false;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(function () { computeMask(); if (isNew) autoFrameSubject(); edDraw(); });
  }
  function closeEditor() { if (editor) editor.hidden = true; document.body.style.overflow = ''; }

  if (editor) {
    // Drag to pan; drag a transform-box handle to resize (scale around centre).
    var dragging = false, resizing = false, lastX = 0, lastY = 0, rzDist0 = 1, rzScale0 = 1;
    var txtDragging = false, txtResizing = false, txtDist0 = 1, txtScale0 = 1;
    var stretching = false, stretchAxis = 'x';   // edge-handle non-uniform resize
    function stageXY(e) { var r = edStage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    function handleHit(px, py) {
      if (!edBox.handles) return -1;
      for (var i = 0; i < edBox.handles.length; i += 1) {
        if (Math.abs(px - edBox.handles[i][0]) <= 12 && Math.abs(py - edBox.handles[i][1]) <= 12) return i;
      }
      return -1;
    }
    function textHandleHit(px, py) {
      if (!state.text || !edTextBox.handles) return -1;
      for (var i = 0; i < edTextBox.handles.length; i += 1) {
        if (Math.abs(px - edTextBox.handles[i][0]) <= 12 && Math.abs(py - edTextBox.handles[i][1]) <= 12) return i;
      }
      return -1;
    }
    function textBodyHit(px, py) {
      if (!state.text || !edTextBox.handles) return false;
      return Math.abs(px - edTextBox.cx) <= edTextBox.hw && Math.abs(py - edTextBox.cy) <= edTextBox.hh;
    }
    edStage.addEventListener('pointerdown', function (e) {
      var p = stageXY(e);
      // Priority: text resize → text drag → image resize → image pan.
      if (textHandleHit(p[0], p[1]) >= 0) {
        txtResizing = true;
        txtDist0 = Math.hypot(p[0] - edTextBox.cx, p[1] - edTextBox.cy) || 1;
        txtScale0 = edState.textScale || 1;
      } else if (textBodyHit(p[0], p[1])) {
        txtDragging = true;
      } else if (edState.showBox && handleHit(p[0], p[1]) >= 0) {
        var hi = handleHit(p[0], p[1]);
        if (hi < 4) {                            // corner → proportional scale
          resizing = true;
          rzDist0 = Math.hypot(p[0] - edBox.cx, p[1] - edBox.cy) || 1;
          rzScale0 = edState.scale;
        } else {                                 // edge → stretch one axis
          stretching = true;
          stretchAxis = (hi === 4 || hi === 6) ? 'y' : 'x';  // top/bottom → y, right/left → x
        }
      } else { dragging = true; }
      lastX = e.clientX; lastY = e.clientY; edStage.setPointerCapture(e.pointerId);
    });
    edStage.addEventListener('pointermove', function (e) {
      if (txtResizing) {
        var pt = stageXY(e);
        var dt = Math.hypot(pt[0] - edTextBox.cx, pt[1] - edTextBox.cy);
        edState.textScale = Math.max(0.3, Math.min(3, txtScale0 * (dt / txtDist0)));
        edDraw();
        return;
      }
      if (txtDragging) {
        if (!edState.textNorm) edState.textNorm = defaultTextNorm(String(state.shape).toLowerCase());
        edState.textNorm.x = Math.max(-0.5, Math.min(0.5, edState.textNorm.x + (e.clientX - lastX) / edState.maskW));
        edState.textNorm.y = Math.max(-0.5, Math.min(0.5, edState.textNorm.y + (e.clientY - lastY) / edState.maskH));
        lastX = e.clientX; lastY = e.clientY; edDraw();
        return;
      }
      if (resizing) {
        var p = stageXY(e);
        var d = Math.hypot(p[0] - edBox.cx, p[1] - edBox.cy);
        edState.scale = Math.max(minZoom(), Math.min(4, rzScale0 * (d / rzDist0)));
        if (edZoom) edZoom.value = edState.scale; edDraw();
        return;
      }
      if (stretching) {   // edge handle → stretch one axis (in the image's local frame)
        var ps = stageXY(e);
        var rad = edState.rotation * Math.PI / 180, c = Math.cos(rad), sn = Math.sin(rad);
        var dx = ps[0] - edBox.cx, dy = ps[1] - edBox.cy;
        var uni = edState.baseScale * edState.scale || 1;
        if (stretchAxis === 'x') {
          var projx = Math.abs(dx * c + dy * sn);             // project onto local x
          edState.stretchX = Math.max(0.2, Math.min(5, (2 * projx / edState.natW) / uni));
        } else {
          var projy = Math.abs(-dx * sn + dy * c);            // project onto local y
          edState.stretchY = Math.max(0.2, Math.min(5, (2 * projy / edState.natH) / uni));
        }
        edDraw();
        return;
      }
      if (!dragging) {   // hover cursor hint over the various handles
        var h = stageXY(e);
        var hb = edState.showBox ? handleHit(h[0], h[1]) : -1;
        edStage.style.cursor = textHandleHit(h[0], h[1]) >= 0 ? 'nwse-resize'
          : textBodyHit(h[0], h[1]) ? 'move'
          : hb >= 4 ? ((hb === 5 || hb === 7) ? 'ew-resize' : 'ns-resize')
          : hb >= 0 ? 'nwse-resize' : 'grab';
        return;
      }
      edState.offsetX += e.clientX - lastX; edState.offsetY += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY; edDraw();
    });
    edStage.addEventListener('pointerup', function () { dragging = resizing = txtDragging = txtResizing = stretching = false; });
    edStage.addEventListener('pointercancel', function () { dragging = resizing = txtDragging = txtResizing = stretching = false; });
    edStage.addEventListener('wheel', function (e) {
      e.preventDefault();
      edState.scale = Math.max(minZoom(), Math.min(4, edState.scale * (e.deltaY < 0 ? 1.08 : 0.92)));
      if (edZoom) edZoom.value = edState.scale; edDraw();
    }, { passive: false });

    if (edZoom) edZoom.addEventListener('input', function () { edState.scale = parseFloat(edZoom.value); edDraw(); });
    var zoomBy = function (f) { edState.scale = Math.max(minZoom(), Math.min(4, edState.scale * f)); if (edZoom) edZoom.value = edState.scale; edDraw(); };
    on('[data-cl-ai-ed-zoom-in]', function () { zoomBy(1.12); });
    on('[data-cl-ai-ed-zoom-out]', function () { zoomBy(0.89); });
    var rotateBy = function (d) { edState.rotation += d; computeMask(); edDraw(); };
    on('[data-cl-ai-ed-rotate-l]', function () { rotateBy(-90); });
    on('[data-cl-ai-ed-rotate-r]', function () { rotateBy(90); });
    on('[data-cl-ai-ed-center]', function () { edState.offsetX = 0; edState.offsetY = 0; edDraw(); });
    on('[data-cl-ai-ed-reset]', function () { edState.scale = 1; edState.rotation = 0; edState.offsetX = 0; edState.offsetY = 0; edState.stretchX = 1; edState.stretchY = 1; if (edZoom) edZoom.value = 1; computeMask(); edDraw(); });
    $$('[data-cl-ai-ed-cancel]').forEach(function (b) { b.addEventListener('click', closeEditor); });
    // Click-outside-to-close, but ONLY a genuine click that both starts AND ends
    // on the backdrop — so releasing a handle drag out here never discards work.
    var edBackdrop = $('[data-cl-ai-ed-backdrop]');
    if (edBackdrop) {
      var downOnBackdrop = false;
      edBackdrop.addEventListener('pointerdown', function (e) { downOnBackdrop = (e.target === edBackdrop); });
      edBackdrop.addEventListener('pointerup', function (e) { if (downOnBackdrop && e.target === edBackdrop) closeEditor(); downOnBackdrop = false; });
    }
    on('[data-cl-ai-ed-confirm]', edConfirm);
    window.addEventListener('resize', function () { if (!editor.hidden) { computeMask(); edDraw(); } });
  }
  function on(sel, fn) { var el = $(sel); if (el) el.addEventListener('click', fn); }

  function syncModeButtons() {
    $$('[data-cl-ai-ed-mode]').forEach(function (b) {
      b.classList.toggle('is-active', (b.dataset.clAiEdMode || b.getAttribute('data-cl-ai-ed-mode')) === (edState.fit ? 'fit' : 'fill'));
    });
    if (edBgWrap) edBgWrap.hidden = !edState.fit;
    if (edZoom) edZoom.min = minZoom();   // Fit unlocks shrinking below cover
  }
  $$('[data-cl-ai-ed-mode]').forEach(function (b) {
    b.addEventListener('click', function () {
      edState.fit = b.getAttribute('data-cl-ai-ed-mode') === 'fit';
      edState.offsetX = 0; edState.offsetY = 0; edState.scale = 1;
      if (edZoom) edZoom.value = 1;
      syncModeButtons(); computeMask(); edDraw();
    });
  });
  if (edBg) edBg.addEventListener('input', function () { edState.bg = edBg.value; edDraw(); });

  /* Composite the crop at print resolution, working purely in OUTPUT space. The
   * pan is stored normalised (fraction of the window) rather than in editor-stage
   * pixels, so this never depends on the stage being measured — and a later patch
   * SHAPE change can rebuild the file at the new aspect without re-opening the
   * editor. 2400px across a 4" patch = 600 DPI. */
  function buildPrintCanvas() {
    if (!edState.img) return null;
    var aspect = shapeAspect();
    var targetW = 2400;
    var targetH = Math.round(targetW / aspect);
    var rot = ((edState.rotation % 360) + 360) % 360;
    var iw = (rot === 90 || rot === 270) ? edState.natH : edState.natW;
    var ih = (rot === 90 || rot === 270) ? edState.natW : edState.natH;
    var sf = safeFor(state.shape);
    var base = edState.fit
      ? Math.min(targetW * sf.w / iw, targetH * sf.h / ih) // contain inside the safe area
      : Math.max(targetW / iw, targetH / ih);              // cover — crops to fill
    var out = document.createElement('canvas');
    out.width = targetW; out.height = targetH;
    var octx = out.getContext('2d');
    // Per-axis output scale (uniform zoom × stretch), mirroring the editor exactly.
    var sBX = base * edState.scale * (edState.stretchX || 1);
    var sBY = base * edState.scale * (edState.stretchY || 1);
    var swap = (rot === 90 || rot === 270);
    var outW = swap ? edState.natH * sBY : edState.natW * sBX;
    var outH = swap ? edState.natW * sBX : edState.natH * sBY;
    // Pad with the artwork's own background so the file is full-bleed and
    // production doesn't have to rebuild the background.
    var covers = outW >= targetW - 0.5 && outH >= targetH - 0.5;
    if (edState.hasAlpha || !covers) { octx.fillStyle = edState.bg; octx.fillRect(0, 0, targetW, targetH); }
    octx.save();
    octx.translate(targetW / 2 + (edState.normX || 0) * targetW,
                   targetH / 2 + (edState.normY || 0) * targetH);
    octx.rotate(edState.rotation * Math.PI / 180);
    octx.scale(sBX, sBY);
    octx.drawImage(edState.img, -edState.natW / 2, -edState.natH / 2, edState.natW, edState.natH);
    octx.restore();
    return out;
  }

  function edConfirm() {
    if (!edState.img) return;
    // Normalise the pan against the window so the crop is aspect-independent.
    if (edState.maskW && edState.maskH) {
      edState.normX = edState.offsetX / edState.maskW;
      edState.normY = edState.offsetY / edState.maskH;
    }
    baseCanvas = buildPrintCanvas();   // text-free crop; text is layered on later
    if (!baseCanvas) return;
    refreshArtwork(true);
    closeEditor();
  }

  /* =====================================================================
   * OPTIONAL PATCH TEXT
   * Rendered INTO the print composite, so it flows through to the PDF and the
   * framed preview automatically. baseCanvas holds the crop without text.
   * ===================================================================== */
  var baseCanvas = null;
  var PATCH_FONT = 'CLPatchFont';
  var fontReady = false;
  (function loadPatchFont() {
    var url = root.getAttribute('data-patch-font');
    if (!url || typeof FontFace === 'undefined') return;
    try {
      var ff = new FontFace(PATCH_FONT, 'url(' + url + ')', { weight: '900' });
      ff.load().then(function (loaded) {
        document.fonts.add(loaded);
        fontReady = true;
        if (baseCanvas && state.text) refreshArtwork(true); // re-render with the real face
      }).catch(function () { /* fall back to a system bold */ });
    } catch (e) { /* ignore */ }
  })();

  function fontStack(px) {
    return '900 ' + px + 'px ' + (fontReady ? '"' + PATCH_FONT + '", ' : '') +
           '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif';
  }

  /* How wide the patch window is at a given height, as a fraction of full width.
   * Circles and hexagons narrow towards the bottom, so text placed there has far
   * less room than the canvas width suggests — sizing against W alone overflows
   * the patch. yFrac is 0 (top) to 1 (bottom). */
  function windowWidthAt(shape, yFrac) {
    if (shape === 'circle') {
      var dy = Math.abs(yFrac - 0.5) * 2;                 // 0 centre → 1 edge
      return Math.sqrt(Math.max(0, 1 - dy * dy));         // chord of the ellipse
    }
    if (shape === 'hexagon') {                            // apex top & bottom
      if (yFrac <= 0.35) return yFrac / 0.35;
      if (yFrac >= 0.65) return (1 - yFrac) / 0.35;
      return 1;
    }
    if (shape === 'rounded') {                            // big elliptical corners
      var edge = yFrac < 0.2 ? yFrac / 0.2 : yFrac > 0.8 ? (1 - yFrac) / 0.2 : 1;
      return edge >= 1 ? 1 : 0.08 + 0.92 * Math.sqrt(Math.max(0, 1 - (1 - edge) * (1 - edge)));
    }
    return 1;                                             // rectangle
  }

  /* Where the text baseline sits per shape — pushed up on the shapes that taper
   * so there's usable width for it. */
  var TEXT_Y = { rectangle: 0.86, rounded: 0.80, circle: 0.80, hexagon: 0.75 };
  // How much of the available width the text may use, per shape. Rounded is
  // pulled in so the caption clears the corner rivets.
  var TEXT_MAXW = { rectangle: 0.86, rounded: 0.62, circle: 0.86, hexagon: 0.86 };

  // The caption's default anchor when text is first added (before the customer
  // drags it) — bottom-ish per shape, normalized to the window centre.
  function defaultTextNorm(shape) { return { x: 0, y: (TEXT_Y[shape] || 0.86) - 0.5 }; }

  /* Draw the caption at its stored normalized position + font scale, with a
   * contrasting outline so it stays legible over any artwork. Works in any px
   * space (editor stage or print canvas) — caller passes the window centre and
   * size. Returns geometry (centre + half-extents) for hit-testing / handles. */
  function drawText(ctx, cx, cy, winW, winH) {
    var txt = (state.text || '').trim();
    if (!txt) return null;
    var shape = String(state.shape).toLowerCase();
    var fill = state.textColor === 'White' ? '#ffffff' : '#000000';
    var stroke = state.textColor === 'White' ? '#000000' : '#ffffff';
    if (!edState.textNorm) edState.textNorm = defaultTextNorm(shape);
    var size = Math.max(6, winH * 0.14 * (edState.textScale || 1));
    ctx.font = fontStack(size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var x = cx + edState.textNorm.x * winW;
    var y = cy + edState.textNorm.y * winH;
    var w = ctx.measureText(txt).width;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(2, size * 0.16);
    ctx.strokeText(txt, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(txt, x, y);
    ctx.restore();
    return { x: x, y: y, hw: w / 2, hh: size / 2 };
  }

  // Bake the caption into a print/preview canvas (whole canvas == the window).
  function drawPatchText(ctx, W, H) { drawText(ctx, W / 2, H / 2, W, H); }

  // Re-draw the crop at `width` with the current text baked in.
  function composeWithText(width) {
    if (!baseCanvas) return null;
    var h = Math.round(width * baseCanvas.height / baseCanvas.width);
    var c = document.createElement('canvas');
    c.width = width; c.height = h;
    var ctx = c.getContext('2d');
    ctx.drawImage(baseCanvas, 0, 0, width, h);
    drawPatchText(ctx, width, h);
    return c;
  }

  var uploadTimer = null, uploadInFlight = null;

  /* Updates the on-page preview immediately, then (debounced) rebuilds the
     print-res files and re-uploads. Typing stays responsive; the stored files
     always match what's on screen. */
  function refreshArtwork(immediate) {
    if (!baseCanvas) return;
    // Reflect reality rather than the aspect-only guess made at upload time.
    if (edState.fit) setResult('margins', 'pass', 'Inside safe area');
    else setResult('margins', 'warn', 'Edges may crop');
    var shown = composeWithText(900);
    if (shown) applyArtwork(shown.toDataURL('image/png'));

    if (uploadTimer) { clearTimeout(uploadTimer); uploadTimer = null; }
    var run = function () {
      uploadTimer = null;
      // Output at the target print DPI for THIS shape's physical size (e.g.
      // rectangle 3.8" × 300 = 1140px wide). buildPrintCanvas supersamples at
      // 2400px, so this is a high-quality downscale — and it keeps the PNG under
      // Cloudinary's 10 MB delivery cap so the PDF (same asset served as .pdf)
      // can be generated. 600 DPI (2400px) pushed circle PDFs over 10 MB.
      var print = composeWithText(Math.round(patchSize().w * CL_AI_HAT.targetDpi));
      if (!print) return;
      var framed = buildPreviewCanvas(print);
      uploadInFlight = new Promise(function (resolve) {
        safeToBlob(print, function (printBlob) {
          if (framed) safeToBlob(framed, function (pv) { uploadArtwork(printBlob, pv, resolve); });
          else uploadArtwork(printBlob, null, resolve);
        });
      });
    };
    if (immediate) run(); else uploadTimer = setTimeout(run, 900);
  }

  // Anything queued must finish before the item can be added to the cart.
  function settleArtwork() {
    if (uploadTimer) { clearTimeout(uploadTimer); uploadTimer = null; refreshArtwork(true); }
    return uploadInFlight || Promise.resolve();
  }

  // Show the composited artwork in the patch frame, hero overlay and QC thumb.
  function applyArtwork(url) {
    if (actions) actions.hidden = false;      // reveal Edit / Replace
    if (pfHint) pfHint.style.display = 'none'; // hide the empty-frame hint
    if (pfArt) pfArt.style.backgroundImage = 'url("' + url + '")';
    if (patch) { patch.style.backgroundImage = 'url("' + url + '")'; patch.hidden = false; }
    if (qcThumb) qcThumb.src = url;
    if (qcPanel) qcPanel.hidden = false;
    state.localArt = url;
    state.artUrl = url; // provisional until Cloudinary returns a hosted URL
  }

  /* ---- upload artwork (Cloudinary unsigned, or local fallback) ----
   * Production needs BOTH: the composite (the customer's exact crop, print-res)
   * and the untouched original (what the team opens in Photoshop). The PDF link
   * is the same composite asset — Cloudinary converts on the fly via extension. */
  function cloudinaryUpload(fileOrBlob, name) {
    var fd = new FormData();
    fd.append('file', fileOrBlob, name);
    fd.append('upload_preset', CL_AI_HAT.uploadPreset);
    return fetch('https://api.cloudinary.com/v1_1/' + CL_AI_HAT.cloudName + '/image/upload', { method: 'POST', body: fd })
      .then(function (r) { return r.json(); })
      .then(function (res) { if (res && res.secure_url) return res.secure_url; throw new Error('no url'); });
  }

  function uploadArtwork(printBlob, previewBlob, done) {
    var finish = function () { if (typeof done === 'function') done(); };
    var stamp = Date.now();
    var origName = (edState.file && edState.file.name) || 'artwork';
    if (!cloudinaryReady() || !printBlob) {
      state.artUrl = state.localArt;
      if (propArt) propArt.value = '[local-preview] ' + origName;
      setStatus('warn', 'Preview only — connect Cloudinary to store the file.');
      finish();
      return;
    }
    setStatus('ok', 'Uploading…');
    // Only the print file is critical; the extras fail soft so a hiccup on them
    // can't stop the customer ordering.
    var soft = function (p) { return p.catch(function () { return ''; }); };
    var jobs = [
      cloudinaryUpload(printBlob, 'ai-hat-print-' + stamp + '.png'),
      soft(edState.file ? cloudinaryUpload(edState.file, 'ai-hat-original-' + stamp + '-' + origName) : Promise.resolve('')),
      soft(previewBlob ? cloudinaryUpload(previewBlob, 'ai-hat-preview-' + stamp + '.png') : Promise.resolve(''))
    ];

    Promise.all(jobs).then(function (urls) {
      var printUrl = urls[0], origUrl = urls[1] || '', prevUrl = urls[2] || '';
      state.artUrl = printUrl;
      if (propArt) propArt.value = printUrl;
      if (propOrig) propOrig.value = origUrl;
      if (propPreview) propPreview.value = prevUrl;
      // Same asset delivered as PDF — Cloudinary converts by swapping the extension.
      if (propPdf) propPdf.value = printUrl.replace(/\.(png|jpe?g|webp)$/i, '.pdf');
      setStatus('ok', '✓ Artwork uploaded');
      finish();
    }).catch(function () {
      state.artUrl = state.localArt;
      if (propArt) propArt.value = '[upload-failed] ' + origName;
      setStatus('err', 'Upload failed — we saved a preview. You can still order; we may email you for the file.');
      finish();
    });
  }

  /* ---- client-side print-quality scoring ---- */
  function runQualityCheck(file, w, h) {
    // Effective DPI = smaller of the two axis resolutions against the patch size.
    var size = patchSize();
    var dpiW = w / size.w;
    var dpiH = h / size.h;
    var dpi = Math.min(dpiW, dpiH);

    // Resolution score out of 100 (caps at 100 once target DPI is met).
    var resScore = Math.max(0, Math.min(100, Math.round((dpi / CL_AI_HAT.targetDpi) * 100)));
    setResult('resolution', resScore >= 60 ? 'pass' : (resScore >= 40 ? 'warn' : 'fail'), resScore + '/100');

    // Safe margins — compare the upload's aspect ratio to this shape's patch aspect.
    var targetAspect = size.w / size.h;
    var aspect = w / h;
    var aspectDelta = Math.abs(aspect - targetAspect) / targetAspect;
    var marginState = aspectDelta <= 0.18 ? 'pass' : (aspectDelta <= 0.4 ? 'warn' : 'fail');
    setResult('margins', marginState, marginState === 'pass' ? 'Good' : (marginState === 'warn' ? 'Check crop' : 'Wrong ratio'));

    // Print quality band from DPI.
    var qState = dpi >= 250 ? 'pass' : (dpi >= 150 ? 'warn' : 'fail');
    setResult('quality', qState, qState === 'pass' ? 'Excellent' : (qState === 'warn' ? 'Good' : 'Low'));

    // File type.
    var ext = (file.type.split('/')[1] || '').toUpperCase().replace('JPEG', 'JPG');
    setResult('filetype', 'pass', ext);

    state.score = 'Resolution ' + resScore + '/100 · ' + Math.round(dpi) + ' DPI · ' +
                  (marginState === 'pass' ? 'margins ok' : 'margins ' + marginState);
    if (propScore) propScore.value = state.score;

    // Overall verdict.
    var worst = [resState(resScore), marginState, qState].indexOf('fail') > -1 ? 'fail'
              : [resState(resScore), marginState, qState].indexOf('warn') > -1 ? 'warn' : 'pass';
    if (qcVerdict) {
      qcVerdict.hidden = false;
      qcVerdict.classList.toggle('is-warn', worst !== 'pass');
      var vt = $('[data-cl-ai-qc-verdict-title]', qcVerdict);
      var vx = $('[data-cl-ai-qc-verdict-text]', qcVerdict);
      if (worst === 'pass') {
        if (vt) vt.textContent = 'READY TO PRINT!';
        if (vx) vx.textContent = "Your artwork looks great. Add to cart when you're ready.";
      } else if (worst === 'warn') {
        if (vt) vt.textContent = 'USABLE — BUT COULD BE BETTER';
        if (vx) vx.textContent = 'This will print, but a higher-resolution image gives the sharpest result.';
      } else {
        if (vt) vt.textContent = 'LOW QUALITY';
        if (vx) vx.textContent = 'This image is too low-resolution for a crisp patch. Try re-generating at a larger size.';
      }
    }
  }
  function resState(score) { return score >= 60 ? 'pass' : (score >= 40 ? 'warn' : 'fail'); }
  function setResult(key, kind, text) {
    var dot = $('[data-cl-ai-qc-dot="' + key + '"]');
    var val = $('[data-cl-ai-qc-' + key + ']');
    if (dot) dot.className = 'cl-ai-b__qc-dot is-' + kind;
    if (val) val.textContent = text;
  }

  /* =====================================================================
   * STEP 3 — options
   * ===================================================================== */
  function bindRadioGroup(selector, onPick) {
    $$(selector).forEach(function (btn) {
      btn.addEventListener('click', function () {
        $$(selector).forEach(function (b) { b.classList.remove('is-active'); b.setAttribute('aria-checked', 'false'); });
        btn.classList.add('is-active'); btn.setAttribute('aria-checked', 'true');
        onPick(btn.dataset.value, btn);
      });
    });
  }

  // The product's Colour values are prefixed with the style ("Snapback Black") by
  // design. Strip that prefix for DISPLAY only — the variant value, cart line and
  // order still carry the full original string.
  var STYLE_VALUES = $$('[data-cl-ai-style]').map(function (b) { return b.dataset.value; });
  function displayColor(val) {
    var s = String(val || '');
    for (var i = 0; i < STYLE_VALUES.length; i++) {
      var pre = STYLE_VALUES[i] + ' ';
      if (s.indexOf(pre) === 0) return s.slice(pre.length);
    }
    return s;
  }
  function applyColorLabels() {
    $$('[data-cl-ai-color]').forEach(function (b) {
      var d = displayColor(b.dataset.value);
      b.setAttribute('title', d);
      b.setAttribute('aria-label', d);
      var img = b.querySelector('img'); if (img) img.setAttribute('alt', d);
    });
    var lbl = $('[data-cl-ai-color-label]');
    if (lbl && state.color) lbl.textContent = displayColor(state.color);
  }

  // Show only the colours that actually exist for the selected style, and mark
  // sold-out ones. If the current colour isn't offered in the new style, move the
  // selection to the first colour that is.
  function filterColorsForStyle() {
    var si = data.styleOptionIndex, ci = data.colorOptionIndex;
    if (!variants.length || !si || !ci) return;
    var btns = $$('[data-cl-ai-color]');
    var firstValid = null, currentValid = false;
    btns.forEach(function (b) {
      var color = b.dataset.value;
      var match = variants.filter(function (v) {
        return v['option' + si] === state.style && v['option' + ci] === color;
      });
      var exists = match.length > 0;
      b.hidden = !exists;
      if (!exists) return;
      var avail = match.some(function (v) { return v.available; });
      b.classList.toggle('is-unavailable', !avail);
      if (!firstValid) firstValid = b;
      if (color === state.color) currentValid = true;
    });
    if (!currentValid && firstValid) {
      btns.forEach(function (b) { b.classList.remove('is-active'); b.setAttribute('aria-checked', 'false'); });
      firstValid.classList.add('is-active'); firstValid.setAttribute('aria-checked', 'true');
      state.color = firstValid.dataset.value;
      var clbl = $('[data-cl-ai-color-label]'); if (clbl) clbl.textContent = displayColor(state.color);
      if (galMain && firstValid.dataset.swatchImg) galMain.src = firstValid.dataset.swatchImg;
    }
  }

  bindRadioGroup('[data-cl-ai-style]', function (val) {
    state.style = val;
    var lbl = $('[data-cl-ai-style-label]'); if (lbl) lbl.textContent = val;
    filterColorsForStyle();
    applyColorLabels();
    renderThumbs();      // rail follows the style's colours
    syncActiveThumb();
    resolveVariant();
    renderGrid();        // rebuild the quantity grid for this style (qtySel persists)
  });
  bindRadioGroup('[data-cl-ai-color]', function (val, btn) {
    state.color = val;
    var lbl = $('[data-cl-ai-color-label]'); if (lbl) lbl.textContent = displayColor(val);
    // Swap the hero image to this colour's variant image, if we have one.
    if (galMain && btn && btn.dataset.swatchImg) galMain.src = btn.dataset.swatchImg;
    syncActiveThumb();
    resolveVariant();
  });
  bindRadioGroup('[data-cl-ai-shape]', function (val) {
    state.shape = val;
    var sl = String(val).toLowerCase();
    var prop = $('[data-cl-ai-prop-shape]'); if (prop) prop.value = val;
    if (patch) patch.setAttribute('data-shape', sl);            // hero overlay
    if (patchframe) patchframe.setAttribute('data-shape', sl);  // Step-2 patch frame
    syncPrompt();                                               // Step-1 size guidance
    setPatchMask();
    if (editor && !editor.hidden) { edMask.setAttribute('data-shape', sl); computeMask(); edDraw(); }
    // A different shape means a different window aspect — rebuild the print file
    // so the stored artwork always matches the selected patch.
    if (baseCanvas && edState.img) { baseCanvas = buildPrintCanvas(); refreshArtwork(true); }
  });
  setPatchMask(); // initial

  // Map Style/Color selection to a Shopify variant id.
  var variantIdInput = $('[data-cl-ai-variant-id]');
  var ctaPrice = $('[data-cl-ai-cta-price]');
  function resolveVariant() {
    if (!variants.length) return; // no product yet → keep server default
    var si = data.styleOptionIndex, ci = data.colorOptionIndex;
    var match = variants.filter(function (v) {
      var okStyle = !state.style || !si || v['option' + si] === state.style;
      var okColor = !state.color || !ci || v['option' + ci] === state.color;
      return okStyle && okColor;
    });
    var chosen = match.filter(function (v) { return v.available; })[0] || match[0] || variants[0];
    if (chosen) {
      if (variantIdInput) variantIdInput.value = chosen.id;
      if (ctaPrice) ctaPrice.textContent = formatMoney(chosen.price);
    }
  }
  /* =====================================================================
   * Colour × quantity grid — one line item per colour, all sharing the same
   * artwork. Mirrors the Custom Hat's "choose colours & quantities" selector.
   * qtySel (variantId → qty) persists across style tabs so a single order can
   * mix styles + colours. Rows are built from the style-filtered swatch buttons.
   * ===================================================================== */
  var qtySel = {};
  var gridEl = $('[data-cl-ai-grid]');
  var ctaLabelEl = $('[data-cl-ai-cta-label]');
  var ctaDefaultLabel = ctaLabelEl ? ctaLabelEl.textContent : 'ADD TO CART';

  function variantFor(style, color) {
    var si = data.styleOptionIndex, ci = data.colorOptionIndex;
    var match = variants.filter(function (v) {
      return (!si || v['option' + si] === style) && (!ci || v['option' + ci] === color);
    });
    return match.filter(function (v) { return v.available; })[0] || match[0] || null;
  }
  function basePrice() {
    var p = null;
    variants.forEach(function (v) { if (p == null || v.price < p) p = v.price; });
    return p || 0;
  }
  function totalQty() { var t = 0; Object.keys(qtySel).forEach(function (k) { t += qtySel[k]; }); return t; }

  function updateTotals() {
    var q = 0, total = 0;
    variants.forEach(function (v) { var n = qtySel[v.id] || 0; if (n) { q += n; total += n * v.price; } });
    if (ctaPrice) ctaPrice.textContent = formatMoney(q ? total : basePrice());
    var lbl = $('[data-cl-ai-cta-label]');
    if (lbl) lbl.textContent = q ? (ctaDefaultLabel + ' · ' + q + ' hat' + (q === 1 ? '' : 's')) : ctaDefaultLabel;
  }

  function setRowQty(vid, n) {
    n = Math.max(0, Math.min(999, parseInt(n, 10) || 0));
    if (n) qtySel[vid] = n; else delete qtySel[vid];
    var row = gridEl && gridEl.querySelector('[data-vid="' + vid + '"]');
    if (row) { var inp = row.querySelector('[data-cl-ai-grid-qty]'); if (inp && document.activeElement !== inp) inp.value = n; }
    updateTotals();
  }

  function renderGrid() {
    if (!gridEl) return;
    // One row per colour offered in the current style — reuse the style-filtered
    // swatch buttons (they already carry the per-colour image + availability).
    var swatches = $$('[data-cl-ai-color]').filter(function (b) { return !b.hidden; });
    var html = swatches.map(function (b) {
      var v = variantFor(state.style, b.dataset.value);
      if (!v) return '';
      var disp = displayColor(b.dataset.value);
      var img = b.dataset.swatchImg;
      var soldout = !v.available;
      var qv = qtySel[v.id] || 0;
      var dis = soldout ? ' disabled' : '';
      return '<div class="cl-ai-b__row' + (soldout ? ' is-soldout' : '') + '" data-cl-ai-row data-vid="' + v.id + '">' +
        '<div class="cl-ai-b__row-hat">' + (img ? '<img src="' + esc(img) + '" alt="' + esc(disp) + '" loading="lazy">' : '') + '</div>' +
        '<div class="cl-ai-b__row-name">' + esc(disp) + (soldout ? ' <span class="cl-ai-b__soldout">Sold out</span>' : '') + '</div>' +
        '<div class="cl-ai-b__row-qty">' +
          '<button type="button" class="cl-ai-b__qty-btn" data-cl-ai-grid-minus aria-label="Decrease ' + esc(disp) + '"' + dis + '>−</button>' +
          '<input type="text" class="cl-ai-b__qty-input" inputmode="numeric" value="' + qv + '" data-cl-ai-grid-qty aria-label="' + esc(disp) + ' quantity"' + dis + '>' +
          '<button type="button" class="cl-ai-b__qty-btn" data-cl-ai-grid-plus aria-label="Increase ' + esc(disp) + '"' + dis + '>+</button>' +
        '</div>' +
      '</div>';
    }).join('');
    gridEl.innerHTML = html;
    updateTotals();
  }

  if (gridEl) {
    gridEl.addEventListener('click', function (e) {
      var row = e.target.closest ? e.target.closest('[data-cl-ai-row]') : null; if (!row) return;
      var vid = row.dataset.vid, cur = qtySel[vid] || 0;
      if (e.target.closest('[data-cl-ai-grid-plus]')) setRowQty(vid, cur + 1);
      else if (e.target.closest('[data-cl-ai-grid-minus]')) setRowQty(vid, cur - 1);
    });
    gridEl.addEventListener('input', function (e) {
      var inp = e.target.closest ? e.target.closest('[data-cl-ai-grid-qty]') : null; if (!inp) return;
      var row = inp.closest('[data-cl-ai-row]'); if (!row) return;
      var digits = inp.value.replace(/[^0-9]/g, ''); if (digits !== inp.value) inp.value = digits;
      setRowQty(row.dataset.vid, digits);
    });
  }

  syncPrompt();           // initial — size guidance for the default shape
  filterColorsForStyle(); // initial — hide colours not offered in the default style
  applyColorLabels();     // strip style prefix from swatch tooltips + the label
  renderThumbs();         // build the rail from the current style's colours
  syncActiveThumb();
  resolveVariant();
  renderGrid();           // build the colour × quantity grid for the default style

  /* optional patch text — typing re-renders the preview instantly and (debounced)
     rebuilds + re-uploads the print files so the stored artwork always matches. */
  var textToggle = $('[data-cl-ai-text-toggle]');
  var textGroup = $('[data-cl-ai-text-group]');
  var textInput = $('[data-cl-ai-text]');
  var countEl = $('[data-cl-ai-count]');
  var propText = $('[data-cl-ai-prop-text]');
  var propTextColor = $('[data-cl-ai-prop-textcolor]');

  function syncText() {
    var on = textToggle ? textToggle.checked : false;
    state.text = on && textInput ? textInput.value.trim() : '';
    if (propText) propText.value = state.text;
    if (propTextColor) propTextColor.value = state.text ? state.textColor : '';
    if (countEl && textInput) countEl.textContent = String(textInput.value.length);
    // First time text is added, drop it at the shape's default spot so it's visible.
    if (state.text && !edState.textNorm) edState.textNorm = defaultTextNorm(String(state.shape).toLowerCase());
    // Editing happens INSIDE the modal: redraw live there (cheap, no upload).
    // The finished text is baked on "Use this image" (edConfirm → refreshArtwork).
    if (editor && !editor.hidden) edDraw();
    else refreshArtwork();     // fallback (editor closed): debounced re-upload
  }

  if (textToggle && textGroup) {
    textToggle.addEventListener('change', function () {
      textGroup.hidden = !textToggle.checked;
      if (textToggle.checked && textInput) textInput.focus();
      syncText();
    });
  }
  if (textInput) textInput.addEventListener('input', syncText);

  $$('[data-cl-ai-textcolor]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      $$('[data-cl-ai-textcolor]').forEach(function (b) { b.classList.remove('is-active'); b.setAttribute('aria-checked', 'false'); });
      btn.classList.add('is-active'); btn.setAttribute('aria-checked', 'true');
      state.textColor = btn.dataset.value;
      syncText();
    });
  });

  /* Quantity is now per-colour in the grid above (see renderGrid / qtySel). */

  /* =====================================================================
   * ADD TO CART  (mirrors cl-fixed-bundle.js: POST /cart/add.js, open drawer)
   * ===================================================================== */
  function setCta(disabled, labelText) {
    var cta = $('[data-cl-ai-cta]'); if (!cta) return;
    cta.disabled = disabled;
    if (labelText != null) { var l = $('[data-cl-ai-cta-label]', cta); if (l) l.textContent = labelText; }
  }
  function addToCart(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); }

    // Require artwork before ordering.
    if (!state.artUrl) {
      setStatus('err', 'Please upload your artwork first.');
      if (drop) drop.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    // Require at least one colour with a quantity.
    if (!totalQty()) {
      setStatus('err', 'Please choose a quantity for at least one colour.');
      if (gridEl) gridEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setCta(true, 'Preparing…');

    // A debounced text re-render may still be queued/in-flight — the cart must
    // carry the finished files, never a stale pre-text version.
    settleArtwork().then(function () {
      var props = {
        'Patch Shape': state.shape,                                   // which InDesign template
        '_Artwork Print': (propArt && propArt.value) || state.artUrl, // customer's exact crop, 300 DPI (1200px)
        '_Quality Score': state.score || ''
      };
      if (propOrig && propOrig.value) props['_Artwork Original'] = propOrig.value; // for Photoshop
      if (propPdf && propPdf.value) props['_Artwork PDF'] = propPdf.value;
      if (propPreview && propPreview.value) props['_Artwork Preview'] = propPreview.value; // framed patch visual
      if (state.text) {                       // ~90% of orders have no patch text
        props['Custom Text'] = state.text;
        props['Text Color'] = state.textColor;
      }
      // One line item per selected colour — all share the same artwork. The
      // tag-based bulk discount then applies cart-wide across every line.
      var items = Object.keys(qtySel).filter(function (vid) { return qtySel[vid] > 0; })
        .map(function (vid) { return { id: vid, quantity: qtySel[vid], properties: props }; });
      setCta(true, 'Adding…');
      return fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items })
      });
    }).then(function (r) {
      if (!r.ok) throw new Error('add failed');
      qtySel = {}; renderGrid();            // clear the batch so re-clicking can't duplicate it
      setCta(false);
      if (window.AMP_API && typeof window.AMP_API.OPEN_CART === 'function') {
        window.AMP_API.OPEN_CART();
      } else {
        window.location.href = '/cart';
      }
    }).catch(function () {
      setCta(false); updateTotals();
      alert('Sorry — we couldn’t add your hat. Please try again.');
    });
  }

  // Capture-phase delegation survives any app that clones the ATC button.
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-cl-ai-cta]') : null;
    if (btn) addToCart(e);
  }, true);
  document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'cl-ai-hat-form') addToCart(e);
  }, true);
})();
