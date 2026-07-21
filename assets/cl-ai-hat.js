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
    // Physical patch size (inches) — drives the quality/DPI math.
    patchWidthIn: 4,
    patchHeightIn: 2.25,
    targetDpi: 300,
    maxFileMB: 25
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
   * ===================================================================== */
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
      edState.scale = 1; edState.rotation = 0; edState.offsetX = 0; edState.offsetY = 0;
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
                  baseScale: 1, maskW: 0, maskH: 0 };

  // Each shape's artwork-window size as a fraction of the 1200×1200 frame PNG
  // (measured from the transparent windows). Drives editor aspect + output dims.
  var WINDOW = {
    rectangle: { l: 0.0342, t: 0.2592, w: 0.9317, h: 0.4958 },
    rounded:   { l: 0.0367, t: 0.1317, w: 0.9267, h: 0.7358 },
    circle:    { l: 0.0383, t: 0.0383, w: 0.9233, h: 0.9233 },
    hexagon:   { l: 0.0300, t: 0.2408, w: 0.9400, h: 0.5133 }
  };
  function shapeAspect() { var win = WINDOW[String(state.shape).toLowerCase()] || WINDOW.rectangle; return win.w / win.h; }

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
    edState.baseScale = Math.max(maskW / iw, maskH / ih); // cover the mask
  }

  function clampOffset() {
    var rot = ((edState.rotation % 360) + 360) % 360;
    var iw = (rot === 90 || rot === 270) ? edState.natH : edState.natW;
    var ih = (rot === 90 || rot === 270) ? edState.natW : edState.natH;
    var s = edState.baseScale * edState.scale;
    var maxX = Math.max(0, (iw * s - edState.maskW) / 2);
    var maxY = Math.max(0, (ih * s - edState.maskH) / 2);
    edState.offsetX = Math.max(-maxX, Math.min(maxX, edState.offsetX));
    edState.offsetY = Math.max(-maxY, Math.min(maxY, edState.offsetY));
  }

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
    var s = edState.baseScale * edState.scale;
    ctx.scale(s, s);
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
    // Dimmed full image (shows what's cropped out), then bright inside the window.
    ctx.save(); ctx.globalAlpha = 0.28; paintImage(ctx, W, H); ctx.restore();
    var mimg = edMasks[String(state.shape).toLowerCase()];
    if (mimg && mimg.complete && mimg.naturalWidth) {
      // Pixel-perfect: paint bright image on an offscreen, keep only the window via the mask.
      var off = document.createElement('canvas'); off.width = edCanvas.width; off.height = edCanvas.height;
      var octx = off.getContext('2d'); octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintImage(octx, W, H);
      octx.globalCompositeOperation = 'destination-in';
      octx.drawImage(mimg, W / 2 - edState.maskW / 2, H / 2 - edState.maskH / 2, edState.maskW, edState.maskH);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(off, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else {
      // Fallback (mask not loaded yet): clip via traced shape path.
      ctx.save(); edShapePath(ctx, W / 2, H / 2, edState.maskW, edState.maskH); ctx.clip(); paintImage(ctx, W, H); ctx.restore();
    }
  }

  function openEditor(isNew) {
    if (!editor) return;
    if (isNew) { edState.scale = 1; edState.rotation = 0; edState.offsetX = 0; edState.offsetY = 0; }
    if (edMask) edMask.setAttribute('data-shape', String(state.shape).toLowerCase());
    if (edZoom) edZoom.value = edState.scale;
    editor.hidden = false;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(function () { computeMask(); edDraw(); });
  }
  function closeEditor() { if (editor) editor.hidden = true; document.body.style.overflow = ''; }

  if (editor) {
    // Drag to pan.
    var dragging = false, lastX = 0, lastY = 0;
    edStage.addEventListener('pointerdown', function (e) { dragging = true; lastX = e.clientX; lastY = e.clientY; edStage.setPointerCapture(e.pointerId); });
    edStage.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      edState.offsetX += e.clientX - lastX; edState.offsetY += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY; edDraw();
    });
    edStage.addEventListener('pointerup', function () { dragging = false; });
    edStage.addEventListener('pointercancel', function () { dragging = false; });
    edStage.addEventListener('wheel', function (e) {
      e.preventDefault();
      edState.scale = Math.max(1, Math.min(4, edState.scale * (e.deltaY < 0 ? 1.08 : 0.92)));
      if (edZoom) edZoom.value = edState.scale; edDraw();
    }, { passive: false });

    if (edZoom) edZoom.addEventListener('input', function () { edState.scale = parseFloat(edZoom.value); edDraw(); });
    var zoomBy = function (f) { edState.scale = Math.max(1, Math.min(4, edState.scale * f)); if (edZoom) edZoom.value = edState.scale; edDraw(); };
    on('[data-cl-ai-ed-zoom-in]', function () { zoomBy(1.12); });
    on('[data-cl-ai-ed-zoom-out]', function () { zoomBy(0.89); });
    var rotateBy = function (d) { edState.rotation += d; computeMask(); edDraw(); };
    on('[data-cl-ai-ed-rotate-l]', function () { rotateBy(-90); });
    on('[data-cl-ai-ed-rotate-r]', function () { rotateBy(90); });
    on('[data-cl-ai-ed-reset]', function () { edState.scale = 1; edState.rotation = 0; edState.offsetX = 0; edState.offsetY = 0; if (edZoom) edZoom.value = 1; computeMask(); edDraw(); });
    $$('[data-cl-ai-ed-cancel]').forEach(function (b) { b.addEventListener('click', closeEditor); });
    on('[data-cl-ai-ed-confirm]', edConfirm);
    window.addEventListener('resize', function () { if (!editor.hidden) { computeMask(); edDraw(); } });
  }
  function on(sel, fn) { var el = $(sel); if (el) el.addEventListener('click', fn); }

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
    var base = Math.max(targetW / iw, targetH / ih);      // cover the output
    var out = document.createElement('canvas');
    out.width = targetW; out.height = targetH;
    var octx = out.getContext('2d');
    octx.save();
    octx.translate(targetW / 2 + (edState.normX || 0) * targetW,
                   targetH / 2 + (edState.normY || 0) * targetH);
    octx.rotate(edState.rotation * Math.PI / 180);
    var s = base * edState.scale;
    octx.scale(s, s);
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
  var TEXT_Y = { rectangle: 0.90, rounded: 0.88, circle: 0.80, hexagon: 0.62 };

  // Bottom-centred, auto-shrunk to fit, with a contrasting outline so it stays
  // legible over any artwork.
  function drawPatchText(ctx, W, H) {
    var txt = (state.text || '').trim();
    if (!txt) return;
    var shape = String(state.shape).toLowerCase();
    var fill = state.textColor === 'White' ? '#ffffff' : '#000000';
    var stroke = state.textColor === 'White' ? '#000000' : '#ffffff';

    var yFrac = TEXT_Y[shape] || 0.90;
    // Fit to the width actually available at that height, not the whole canvas.
    var maxW = W * windowWidthAt(shape, yFrac) * 0.86;
    var size = Math.round(Math.min(W * 0.11, H * 0.20));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (var i = 0; i < 60; i += 1) {                 // shrink until it fits
      ctx.font = fontStack(size);
      if (ctx.measureText(txt).width <= maxW || size <= 8) break;
      size -= Math.max(1, Math.round(size * 0.06));
    }
    var x = W / 2;
    var y = Math.round(H * yFrac);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(2, size * 0.16);
    ctx.strokeText(txt, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(txt, x, y);
    ctx.restore();
  }

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
    var shown = composeWithText(900);
    if (shown) applyArtwork(shown.toDataURL('image/png'));

    if (uploadTimer) { clearTimeout(uploadTimer); uploadTimer = null; }
    var run = function () {
      uploadTimer = null;
      var print = composeWithText(2400);
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
    var dpiW = w / CL_AI_HAT.patchWidthIn;
    var dpiH = h / CL_AI_HAT.patchHeightIn;
    var dpi = Math.min(dpiW, dpiH);

    // Resolution score out of 100 (caps at 100 once target DPI is met).
    var resScore = Math.max(0, Math.min(100, Math.round((dpi / CL_AI_HAT.targetDpi) * 100)));
    setResult('resolution', resScore >= 60 ? 'pass' : (resScore >= 40 ? 'warn' : 'fail'), resScore + '/100');

    // Safe margins — compare aspect ratio to the patch aspect (4 : 2.25 ≈ 1.778).
    var targetAspect = CL_AI_HAT.patchWidthIn / CL_AI_HAT.patchHeightIn;
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
  filterColorsForStyle(); // initial — hide colours not offered in the default style
  applyColorLabels();     // strip style prefix from swatch tooltips + the label
  renderThumbs();         // build the rail from the current style's colours
  syncActiveThumb();
  resolveVariant();

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
    refreshArtwork();          // debounced re-upload; preview updates immediately
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

  /* quantity */
  var qtyInput = $('[data-cl-ai-qty-input]');
  function clampQty() {
    var n = parseInt(qtyInput.value, 10);
    if (isNaN(n) || n < 1) n = 1; if (n > 99) n = 99;
    qtyInput.value = n;
  }
  var minus = $('[data-cl-ai-qty-minus]'), plus = $('[data-cl-ai-qty-plus]');
  if (minus) minus.addEventListener('click', function () { qtyInput.value = Math.max(1, (parseInt(qtyInput.value, 10) || 1) - 1); });
  if (plus) plus.addEventListener('click', function () { qtyInput.value = Math.min(99, (parseInt(qtyInput.value, 10) || 1) + 1); });
  if (qtyInput) qtyInput.addEventListener('change', clampQty);

  /* =====================================================================
   * ADD TO CART  (mirrors cl-fixed-bundle.js: POST /cart/add.js, open drawer)
   * ===================================================================== */
  function addToCart(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); }
    var cta = $('[data-cl-ai-cta]');
    var vId = variantIdInput ? variantIdInput.value : '';
    if (!vId) return;

    // Require artwork before ordering.
    if (!state.artUrl) {
      setStatus('err', 'Please upload your artwork first.');
      if (drop) drop.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    var qty = qtyInput ? (parseInt(qtyInput.value, 10) || 1) : 1;
    var original = cta ? cta.innerHTML : '';
    if (cta) { cta.disabled = true; var l = $('[data-cl-ai-cta-label]', cta); if (l) l.textContent = 'Preparing…'; }

    // A debounced text re-render may still be queued/in-flight — the cart must
    // carry the finished files, never a stale pre-text version.
    settleArtwork().then(function () {
      var props = {
        'Patch Shape': state.shape,                                   // which InDesign template
        '_Artwork Print': (propArt && propArt.value) || state.artUrl, // customer's exact crop, 600 DPI
        '_Quality Score': state.score || ''
      };
      if (propOrig && propOrig.value) props['_Artwork Original'] = propOrig.value; // for Photoshop
      if (propPdf && propPdf.value) props['_Artwork PDF'] = propPdf.value;
      if (propPreview && propPreview.value) props['_Artwork Preview'] = propPreview.value; // framed patch visual
      if (state.text) {                       // ~90% of orders have no patch text
        props['Custom Text'] = state.text;
        props['Text Color'] = state.textColor;
      }
      if (cta) { var l2 = $('[data-cl-ai-cta-label]', cta); if (l2) l2.textContent = 'Adding…'; }
      return fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: vId, quantity: qty, properties: props })
      });
    }).then(function (r) {
      if (!r.ok) throw new Error('add failed');
      if (cta) { cta.disabled = false; cta.innerHTML = original; }
      if (window.AMP_API && typeof window.AMP_API.OPEN_CART === 'function') {
        window.AMP_API.OPEN_CART();
      } else {
        window.location.href = '/cart';
      }
    }).catch(function () {
      if (cta) { cta.disabled = false; cta.innerHTML = original; }
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
