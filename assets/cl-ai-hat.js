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
    // Which storage backend receives the print/original/preview files.
    // 'cloudinary' (default, battle-tested) | 'cloudflare' (R2 via the Vercel
    // /api/upload endpoint). This is the ONLY switch: flip it to move providers,
    // flip it back to roll straight back to Cloudinary. See storageReady()/
    // providerUpload() below — everything downstream (order props, PDF link,
    // dashboard) is identical regardless of provider.
    storage: 'cloudflare',

    // --- Cloudinary (unsigned browser upload) ---
    cloudName: 'ycnncucq',
    uploadPreset: 'ai_hat_unsigned',
    // NOTE: never put api_key / api_secret here — unsigned uploads don't need them.

    // --- Cloudflare (R2) ---
    // The Vercel serverless route that accepts the blob, PutObject's it to R2 and
    // returns { url }. It is ALSO responsible for writing a '.pdf' sibling next to
    // the print '.png' (same key, .pdf extension) so the printUrl.replace(...)
    // contract below holds for both providers with no client branching.
    // The Vercel /api/upload route (citylocs-dashboard project). Set, but only
    // used when storage === 'cloudflare' above.
    cloudflareUploadUrl: 'https://citylocs-dashboard.vercel.app/api/upload',

    // Physical patch size is per-shape — see PATCH_IN below (production spec).
    targetDpi: 300,
    maxFileMB: 25,
    patchBg: '#ffffff'   // default pad for transparent art
  };
  function cloudinaryReady() {
    return CL_AI_HAT.cloudName && CL_AI_HAT.cloudName !== 'YOUR_CLOUD_NAME' &&
           CL_AI_HAT.uploadPreset && CL_AI_HAT.uploadPreset !== 'YOUR_PRESET';
  }
  function cloudflareReady() {
    return /^https?:\/\//.test(CL_AI_HAT.cloudflareUploadUrl || '');
  }
  // Is the SELECTED provider configured and ready to store files? Drives the
  // local-preview fallback in uploadArtwork() the same way for either backend.
  function storageReady() {
    return CL_AI_HAT.storage === 'cloudflare' ? cloudflareReady() : cloudinaryReady();
  }

  var root = document.querySelector('[data-cl-ai-builder]');
  if (!root || root.dataset.clInit === '1') return;
  root.dataset.clInit = '1';
  // Per-product stored-file prefix (image-hat, image-pendant, …). getAttribute, not
  // dataset — a hyphenated data-cl-ai-* attr maps to dataset.clAiX, an easy trap.
  var filePrefix = (root.getAttribute('data-cl-ai-file-prefix') || 'image-hat').replace(/[^a-z0-9-]/gi, '') || 'image-hat';

  // Bulk "buy more, save more" tiers for the live pricing summary (image hats).
  // Mirrors the standard hat footer: dollars OFF per hat at each quantity break.
  var TIER_QTYS = [1, 2, 3, 6, 12, 24, 36];
  var TIER_OFF  = [0, 2, 4, 5, 10, 12, 16];   // $ off each vs base price
  function tierIndex(qty) {
    var idx = 0;
    for (var i = 0; i < TIER_QTYS.length; i++) {
      if (qty === TIER_QTYS[i]) { idx = i; break; }
      else if (qty < TIER_QTYS[i]) { idx = i - 1; break; }
      else idx = TIER_QTYS.length - 1;
    }
    return Math.max(0, idx);
  }

  /* ---- config-driven per-shape geometry (optional) ----
   * A product can carry its own patch geometry via a [data-cl-ai-config] JSON
   * block (emitted by the builder snippet's config_json param — the seam a
   * Shopify metaobject/metafield will feed later). Any shape defined here MERGES
   * OVER the hardcoded per-shape maps below, so unassigned products (the hat)
   * keep their built-in geometry as the fallback. Shape:
   *   { "shapes": { "pendant": { "window": {l,t,w,h}, "frame_aspect": n,
   *       "safe": {w,h}, "patch_in": {w,h}, "usable": n, "text_y": n, "text_maxw": n } } }
   */
  // Normalize a shape name to a lookup slug: lowercase, all spaces/punctuation
  // stripped. So a display name like "Swap Patch" and its config key stay in sync,
  // and a space can never break the `data-mask-<shape>` attribute wiring. Every
  // shape→key/attribute lookup in the engine goes through this.
  function sh(x) { return String(x == null ? '' : x).toLowerCase().replace(/[^a-z0-9]/g, ''); }

  var cfgShapes = {};
  try {
    var cfgEl = document.querySelector('[data-cl-ai-config]');
    if (cfgEl && cfgEl.textContent.trim()) { cfgShapes = (JSON.parse(cfgEl.textContent) || {}).shapes || {}; }
  } catch (e) { cfgShapes = {}; }
  // Merge one config field into a per-shape map (config wins; missing = keep hardcoded).
  function applyShapeCfg(map, field) {
    for (var s in cfgShapes) {
      if (Object.prototype.hasOwnProperty.call(cfgShapes, s) && cfgShapes[s] && cfgShapes[s][field] != null) {
        map[sh(s)] = cfgShapes[s][field];
      }
    }
    return map;
  }

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
    // Default shape: hat = Rectangle; single-shape products (e.g. pendant) set it
    // on the builder root so there's no shape selector to read from.
    shape: (root && root.getAttribute('data-cl-ai-default-shape')) || 'Rectangle',
    text: '',
    textFill: '#000000',       // caption colour (full picker)
    textOutline: 'white',      // caption outline: 'white' | 'black' | 'none'
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
    square:   'Make a LANDSCAPE image, about 1536 x 1024 pixels (3:2).\n' +
               'Fill the ENTIRE rectangle, edge to edge. Do NOT make a square image.',
    // window 1.0 — exact square
    circle:    'Make a SQUARE image, 1024 x 1024 pixels.\n' +
               'Fill the ENTIRE square, edge to edge. Keep the main subject centred.'
  };

  var promptEl = $('[data-cl-ai-prompt]');
  var promptTemplate = promptEl ? promptEl.textContent : '';
  function syncPrompt() {
    if (!promptEl || promptTemplate.indexOf('[[SIZE]]') === -1) return;
    var guide = PROMPT_SIZE[sh(state.shape)] || PROMPT_SIZE.rectangle;
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
  var edOverlay = $('[data-cl-ai-ed-overlay]');   // handles/box layer above the frame
  var edZoom = $('[data-cl-ai-ed-zoom]');
  var edWarn = $('[data-cl-ai-ed-warn]');
  var edBoxToggle = $('[data-cl-ai-ed-box]');
  if (edBoxToggle) edBoxToggle.addEventListener('change', function () { edState.showBox = edBoxToggle.checked; edDraw(); });
  var edBgWrap = $('[data-cl-ai-ed-bgwrap]');
  var edBg = $('[data-cl-ai-ed-bg]');
  // Reuse the Step-2 preview's frame PNG URLs (already rendered with asset_url).
  function currentFrameSrc() {
    var shape = sh(state.shape);
    // Config-driven products use arbitrary Shopify Files names, so a frame URL
    // cannot be derived from the mask filename. The snippet emits both URLs as
    // stable data attributes; this also avoids theme lazy-loader rewrites.
    var configured = patchframe ? patchframe.getAttribute('data-frame-' + shape) : '';
    if (configured) return configured;
    var f = document.querySelector('.cl-ai-pf__frame[data-frame="' + shape + '"]');
    return f ? f.getAttribute('src') : '';
  }
  // Pixel-perfect window masks (derived from the frames): apply to the preview art
  // and preload for the editor's canvas clip.
  var maskUrl = function (shape) { return patchframe ? patchframe.getAttribute('data-mask-' + shape) : null; };
  function setPatchMask() {
    if (!pfArt) return;
    var url = maskUrl(sh(state.shape));
    if (url) { pfArt.style.webkitMaskImage = 'url("' + url + '")'; pfArt.style.maskImage = 'url("' + url + '")'; }
  }
  // Shapes actually present = the data-mask-<shape> attributes the snippet emitted
  // (one per shape, already slugged). Derived, NOT hardcoded, so a config-driven
  // shape (e.g. a new patch type) preloads its mask/frame for export like any other.
  var SHAPE_KEYS = [];
  if (patchframe) {
    Array.prototype.forEach.call(patchframe.attributes, function (a) {
      if (a.name.indexOf('data-mask-') === 0) SHAPE_KEYS.push(a.name.slice(10));
    });
  }
  if (!SHAPE_KEYS.length) SHAPE_KEYS = ['rectangle', 'square', 'circle', 'hexagon'];

  var edMasks = {};
  SHAPE_KEYS.forEach(function (s) {
    var u = maskUrl(s); if (u) { var im = new Image(); im.src = u; edMasks[s] = im; }
  });

  // Separate CORS-enabled copies used only for EXPORT — drawing a non-CORS image
  // onto a canvas taints it and toBlob() then throws. Kept apart from the display
  // copies above so a missing CORS header can never break the editor itself.
  var exportMasks = {}, exportFrames = {};
  SHAPE_KEYS.forEach(function (s) {
    var mu = maskUrl(s);
    if (mu) { var mi = new Image(); mi.crossOrigin = 'anonymous'; mi.src = mu; exportMasks[s] = mi; }
    var fEl = document.querySelector('.cl-ai-pf__frame[data-frame="' + s + '"]');
    if (fEl) { var fi = new Image(); fi.crossOrigin = 'anonymous'; fi.src = fEl.getAttribute('src'); exportFrames[s] = fi; }
  });

  // Artwork composited inside the real patch frame — the visual reference of the
  // finished patch for production/CS. Null if the frame isn't usable for export.
  function buildPreviewCanvas(printCanvas) {
    var shape = sh(state.shape);
    var win = WINDOW[shape] || WINDOW.rectangle;
    var frame = exportFrames[shape], mask = exportMasks[shape];
    if (!frame || !frame.complete || !frame.naturalWidth) return null;
    // Size the preview to the FRAME's own aspect (was a hardcoded 1200x1200 square,
    // which squished non-square frames — pendant portrait, swap-patch landscape).
    // Long edge capped at 1200. Square hat frames → 1200x1200, unchanged.
    var scale = 1200 / Math.max(frame.naturalWidth, frame.naturalHeight);
    var W = Math.round(frame.naturalWidth * scale), H = Math.round(frame.naturalHeight * scale);
    var dx = win.l * W, dy = win.t * H, dw = win.w * W, dh = win.h * H;
    var art = document.createElement('canvas'); art.width = W; art.height = H;
    var actx = art.getContext('2d');
    actx.drawImage(printCanvas, dx, dy, dw, dh);
    if (mask && mask.complete && mask.naturalWidth) {
      actx.globalCompositeOperation = 'destination-in';
      actx.drawImage(mask, dx, dy, dw, dh);
    }
    var pv = document.createElement('canvas'); pv.width = W; pv.height = H;
    var pctx = pv.getContext('2d');
    pctx.drawImage(art, 0, 0);
    pctx.drawImage(frame, 0, 0, W, H);
    return pv;
  }
  function safeToBlob(canvas, cb) {
    try { canvas.toBlob(function (b) { cb(b); }, 'image/png'); }
    catch (e) { cb(null); }   // tainted canvas — skip rather than block the order
  }

  // Downscaled JPEG re-encode of the customer's RAW source, used as a fallback
  // "original" when the true file upload fails (an odd source MIME 415'ing, or a
  // transient miss). edState.img came from a same-origin object URL so the canvas
  // isn't tainted; re-encoding also guarantees an allow-listed type (image/jpeg)
  // and a smaller payload. Long edge capped at 5000px — far more than a small
  // patch needs, while keeping mobile memory + the blob well under the 25MB cap.
  function buildOriginalFallbackCanvas() {
    if (!edState.img || !edState.natW || !edState.natH) return null;
    var MAX_EDGE = 5000;
    var scale = Math.min(1, MAX_EDGE / Math.max(edState.natW, edState.natH));
    var W = Math.max(1, Math.round(edState.natW * scale));
    var H = Math.max(1, Math.round(edState.natH * scale));
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    c.getContext('2d').drawImage(edState.img, 0, 0, W, H);
    return c;
  }

  // CRC-32 (PNG chunk checksum).
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n += 1) {
      var c = n;
      for (var k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  /* Embed a physical-resolution (pHYs) chunk so the PNG — and the PDF Cloudinary
     derives from it — open at the given DPI in Photoshop, i.e. at the patch's true
     physical size (1140px @ 300dpi = 3.8"). Without it, production had to manually
     change the resolution 150 -> 300 on every file. */
  function pngSetDpi(blob, dpi) {
    return blob.arrayBuffer().then(function (buf) {
      var data = new Uint8Array(buf);
      if (data.length < 33 || data[0] !== 0x89 || data[1] !== 0x50) return blob; // not a PNG
      var ppm = Math.round(dpi / 0.0254);            // pixels per metre
      var chunk = new Uint8Array(21);                // 4 len + 4 type + 9 data + 4 crc
      var dv = new DataView(chunk.buffer);
      dv.setUint32(0, 9);                            // data length
      chunk[4] = 0x70; chunk[5] = 0x48; chunk[6] = 0x59; chunk[7] = 0x73; // 'pHYs'
      dv.setUint32(8, ppm); dv.setUint32(12, ppm);   // x, y pixels-per-metre
      chunk[16] = 1;                                 // unit = metre
      dv.setUint32(17, crc32(chunk.subarray(4, 17))); // CRC over type + data
      // Insert right after IHDR (bytes 0..32); pHYs must precede IDAT.
      var out = new Uint8Array(data.length + 21);
      out.set(data.subarray(0, 33), 0);
      out.set(chunk, 33);
      out.set(data.subarray(33), 33 + 21);
      return new Blob([out], { type: 'image/png' });
    }).catch(function () { return blob; });
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
    square:   { l: 0.0367, t: 0.1317, w: 0.9267, h: 0.7358 },
    circle:    { l: 0.0383, t: 0.0383, w: 0.9233, h: 0.9233 },
    hexagon:   { l: 0.0300, t: 0.2408, w: 0.9400, h: 0.5133 }
    // pendant + any other assigned shape come from config (applyShapeCfg below).
  };
  applyShapeCfg(WINDOW, 'window');
  /* Frame PNG aspect (w/h). Hat frames are square (1200x1200) → 1. The pendant
     frame is portrait (500x950). Lets a non-square frame with an off-centre window
     (the pendant's bail sits above the window) drive the editor correctly. */
  var FRAME_ASPECT = {};   // pendant + others come from config (frame_aspect)
  applyShapeCfg(FRAME_ASPECT, 'frame_aspect');
  function frameAspect(shape) { return FRAME_ASPECT[sh(shape)] || 1; }
  /* The dashed guide on each frame is the safe area: production needs artwork —
     especially text and logos — to sit inside it, or they have to nudge it by
     hand. Measured from the frames, as a fraction of the window. */
  var SAFE = {
    rectangle: { w: 0.972, h: 0.949 },
    square:   { w: 0.968, h: 0.960 },
    circle:    { w: 0.959, h: 0.959 },
    hexagon:   { w: 0.978, h: 0.959 }
    // pendant + others come from config (safe)
  };
  applyShapeCfg(SAFE, 'safe');
  function safeFor(shape) { return SAFE[sh(shape)] || SAFE.rectangle; }

  // Window aspect on screen = window-fraction ratio × the frame's own aspect.
  // For square frames (hats) frameAspect=1, so this is unchanged (win.w/win.h).
  function shapeAspect() { var win = WINDOW[sh(state.shape)] || WINDOW.rectangle; return (win.w / win.h) * frameAspect(state.shape); }

  /* Finished patch size in inches per shape (production spec). Drives the print
     file's pixel dimensions (inches × DPI) so the artwork drops into production
     at its true physical size instead of a one-size-fits-all 4" width. The
     ratios here match the WINDOW aspects above, so the on-screen crop and the
     printed file stay 1:1. */
  var PATCH_IN = {
    circle:    { w: 2.25, h: 2.25 },   // ROUND
    rectangle: { w: 3.8,  h: 2.024 },  // RECTANGLE
    square:   { w: 3.0,  h: 2.383 },  // SQUARE
    hexagon:   { w: 3.8,  h: 2.077 }   // HEX
    // pendant + others come from config (patch_in)
  };
  applyShapeCfg(PATCH_IN, 'patch_in');
  function patchSize() { return PATCH_IN[sh(state.shape)] || PATCH_IN.rectangle; }

  function computeMask() {
    var W = edStage.clientWidth, H = edStage.clientHeight;
    var aspect = shapeAspect();
    var maskW = Math.min(W * 0.86, H * 0.86 * aspect);
    var maskH = maskW / aspect;
    edState.maskW = maskW; edState.maskH = maskH;
    if (edMask) { edMask.style.width = maskW + 'px'; edMask.style.height = maskH + 'px'; }
    // Size the real frame PNG so its transparent window lines up with the mask.
    // Width and height are derived SEPARATELY from the window fractions so a
    // non-square frame (pendant) keeps its true proportions; for a square frame
    // with a correctly-measured window these are equal → identical to before.
    if (edFrame) {
      var win = WINDOW[sh(state.shape)] || WINDOW.rectangle;
      var frW = maskW / win.w;                 // frame display width  (window == maskW)
      var frH = maskH / win.h;                 // frame display height (window == maskH)
      edFrame.style.width = frW + 'px'; edFrame.style.height = frH + 'px';
      // The mask sits at stage centre; if the window isn't centred in the frame
      // (pendant's bail offsets it upward) shift the frame so its window aligns.
      // Tiny offsets (hats, ~0) are snapped to 0 so hat frames don't move.
      var offX = 0.5 - (win.l + win.w / 2); if (Math.abs(offX) < 0.01) offX = 0;
      var offY = 0.5 - (win.t + win.h / 2); if (Math.abs(offY) < 0.01) offY = 0;
      edFrame.style.transform = 'translate(-50%,-50%) translate(' + (offX * frW) + 'px,' + (offY * frH) + 'px)';
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
    // Let the customer pan the artwork PARTIALLY OFF the window (push it up/down/
    // off-canvas), not just crop within it — previously the edge of the art
    // couldn't pass the edge of the window, so you had to zoom in first to get any
    // slack. We now allow moving the art out until only a sliver (KEEP) of it
    // remains inside the window, so it can never be dragged away completely.
    // KEEP is a fraction of the smaller of art/window in each axis, so both a big
    // (fill) and small (fit) image keep a sensible amount visible.
    var KEEP = 0.25;
    var ext = edExtent();
    var keepX = Math.min(ext.ew, edState.maskW) * KEEP;
    var keepY = Math.min(ext.eh, edState.maskH) * KEEP;
    var maxX = Math.max(0, (ext.ew + edState.maskW) / 2 - keepX);
    var maxY = Math.max(0, (ext.eh + edState.maskH) / 2 - keepY);
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
  var USABLE = { rectangle: 0.92, square: 0.86, circle: 0.68, hexagon: 0.74 };
  applyShapeCfg(USABLE, 'usable');   // pendant + others come from config
  function autoFrameSubject() {
    if (!edState.img || !edState.maskW || !edState.contentBox || !edState.baseScale) return;
    // Only reframe TRANSPARENT logos (crop to their content). Opaque designs
    // have an intentional background/composition — leave them at the default
    // fit/fill so we don't zoom a designed badge past the patch edge.
    if (!edState.hasAlpha) return;
    var cb = edState.contentBox;
    var subjW = (cb.r - cb.l) * edState.natW, subjH = (cb.b - cb.t) * edState.natH;
    if (subjW <= 1 || subjH <= 1) return;
    var u = USABLE[sh(state.shape)] || 0.9;
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
    var shape = sh(state.shape);
    var x = cx - mw / 2, y = cy - mh / 2;
    ctx.beginPath();
    if (shape === 'circle') { ctx.ellipse(cx, cy, mw / 2, mh / 2, 0, 0, Math.PI * 2); return; }
    if (shape === 'hexagon') {
      var P = [[0.5, 0], [0, 0.35], [0, 0.65], [0.5, 1], [1, 0.65], [1, 0.35]];
      P.forEach(function (p, i) { var X = x + p[0] * mw, Y = y + p[1] * mh; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
      ctx.closePath(); return;
    }
    // rectangle / square → elliptical-corner rounded rect
    var rx = (shape === 'square' ? 0.46 : 0.05) * mw;
    var ry = (shape === 'square' ? 0.20 : 0.08) * mh;
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
    var mimg = edMasks[sh(state.shape)];
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
    // Paint the transform box + handles + caption box + guides on the OVERLAY
    // canvas (z-index above the frame) so the frame's opaque bezel/rivets can't
    // hide the resize corners. Falls back to the base ctx if the overlay element
    // isn't in the DOM (stale cached markup).
    var octx2 = ctx;
    if (edOverlay) {
      edOverlay.width = W * dpr; edOverlay.height = H * dpr;
      edOverlay.style.width = W + 'px'; edOverlay.style.height = H + 'px';
      octx2 = edOverlay.getContext('2d');
      octx2.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx2.clearRect(0, 0, W, H);
    }
    if (edState.showBox) drawTransformBox(octx2, W, H); else edBox.handles = null;
    drawEditorText(octx2, W, H);
    drawGuides(octx2, W, H);
    updateWarn();
  }

  /* Smart-alignment guides — a magenta centre line appears (and the object snaps)
   * when the artwork or the caption lines up with the patch centre while dragging.
   * Cleared on pointer-up. */
  var edGuide = { v: false, h: false };
  function drawGuides(ctx, W, H) {
    if (!edGuide.v && !edGuide.h) return;
    ctx.save();
    ctx.strokeStyle = '#00a0ea'; ctx.lineWidth = 1;
    if (edGuide.v) { ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke(); }
    if (edGuide.h) { ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke(); }
    ctx.restore();
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
    if (edMask) edMask.setAttribute('data-shape', sh(state.shape));
    if (edZoom) edZoom.value = edState.scale;
    // Reflect any existing caption in the modal's text controls.
    if (textToggle) textToggle.checked = !!state.text;
    if (textGroup) textGroup.hidden = !state.text;
    if (textInput && state.text) textInput.value = state.text;
    if (textFillInput) textFillInput.value = state.textFill;
    $$('[data-cl-ai-outline]').forEach(function (b) {
      var on = b.dataset.value === state.textOutline;
      b.classList.toggle('is-active', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    syncModeButtons();
    editor.hidden = false;
    document.body.classList.add('cl-ai-editor-open');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(function () { computeMask(); if (isNew) autoFrameSubject(); edDraw(); });
  }
  function closeEditor() {
    if (editor) editor.hidden = true;
    document.body.classList.remove('cl-ai-editor-open');
    document.body.style.overflow = '';
  }

  if (editor) {
    // Drag to pan; drag a transform-box handle to resize (scale around centre).
    var dragging = false, resizing = false, lastX = 0, lastY = 0, rzDist0 = 1, rzScale0 = 1;
    var txtDragging = false, txtResizing = false, txtDist0 = 1, txtScale0 = 1;
    var stretching = false, stretchAxis = 'x';   // edge-handle non-uniform resize
    // Snap-to-centre state. We track the RAW (unsnapped) position and only "arm"
    // snapping for an axis once the object has left the centre zone — so an object
    // that starts centred moves freely instead of feeling stuck.
    var PSNAP = 7, TSNAP = 0.02;
    var rawX = 0, rawY = 0, rawTX = 0, rawTY = 0;
    var armedX = false, armedY = false, armedTX = false, armedTY = false;
    function stageXY(e) { var r = edStage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    function handleHit(px, py) {
      if (!edBox.handles) return -1;
      for (var i = 0; i < edBox.handles.length; i += 1) {
        if (Math.abs(px - edBox.handles[i][0]) <= 16 && Math.abs(py - edBox.handles[i][1]) <= 16) return i;
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
        var tn = edState.textNorm || (edState.textNorm = defaultTextNorm(sh(state.shape)));
        rawTX = tn.x; rawTY = tn.y;
        armedTX = Math.abs(rawTX) >= TSNAP; armedTY = Math.abs(rawTY) >= TSNAP;
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
      } else {
        dragging = true;
        rawX = edState.offsetX; rawY = edState.offsetY;
        armedX = Math.abs(rawX) >= PSNAP; armedY = Math.abs(rawY) >= PSNAP;
      }
      lastX = e.clientX; lastY = e.clientY; edStage.setPointerCapture(e.pointerId);
    });
    edStage.addEventListener('pointermove', function (e) {
      // Safety net: if a gesture is active but no mouse button is held, the release
      // happened where we couldn't hear it (pointer left the window and was let go
      // outside). Without this, the drag/resize stays "stuck" and every subsequent
      // move keeps zooming/panning. End it the instant an un-pressed move arrives.
      if (e.buttons === 0 && (dragging || resizing || stretching || txtDragging || txtResizing)) { endDrag(); }
      if (txtResizing) {
        var pt = stageXY(e);
        var dt = Math.hypot(pt[0] - edTextBox.cx, pt[1] - edTextBox.cy);
        edState.textScale = Math.max(0.3, Math.min(3, txtScale0 * (dt / txtDist0)));
        edDraw();
        return;
      }
      if (txtDragging) {
        if (!edState.textNorm) edState.textNorm = defaultTextNorm(sh(state.shape));
        rawTX += (e.clientX - lastX) / edState.maskW;
        rawTY += (e.clientY - lastY) / edState.maskH;
        if (!armedTX && Math.abs(rawTX) >= TSNAP) armedTX = true;   // arm once it leaves centre
        if (!armedTY && Math.abs(rawTY) >= TSNAP) armedTY = true;
        var tx = (armedTX && Math.abs(rawTX) < TSNAP) ? 0 : rawTX;
        var ty = (armedTY && Math.abs(rawTY) < TSNAP) ? 0 : rawTY;
        edState.textNorm.x = Math.max(-0.5, Math.min(0.5, tx));
        edState.textNorm.y = Math.max(-0.5, Math.min(0.5, ty));
        edGuide.v = Math.abs(tx) < 0.0015; edGuide.h = Math.abs(ty) < 0.0015;
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
        // Diagonal cursor that matches which corner is under the pointer: a corner
        // in the TL/BR direction → nwse, TR/BL → nesw. Derived from the handle's
        // position vs the box centre, so it stays right when the art is rotated.
        var cornerCur = function (hx, hy, cx, cy) {
          return ((hx - cx) * (hy - cy) >= 0) ? 'nwse-resize' : 'nesw-resize';
        };
        var th = textHandleHit(h[0], h[1]);
        var hb = edState.showBox ? handleHit(h[0], h[1]) : -1;
        edStage.style.cursor = th >= 0 ? cornerCur(edTextBox.handles[th][0], edTextBox.handles[th][1], edTextBox.cx, edTextBox.cy)
          : textBodyHit(h[0], h[1]) ? 'move'
          : hb >= 4 ? ((hb === 5 || hb === 7) ? 'ew-resize' : 'ns-resize')
          : hb >= 0 ? cornerCur(edBox.handles[hb][0], edBox.handles[hb][1], edBox.cx, edBox.cy) : 'grab';
        return;
      }
      rawX += e.clientX - lastX; rawY += e.clientY - lastY;
      if (!armedX && Math.abs(rawX) >= PSNAP) armedX = true;        // arm once it leaves centre
      if (!armedY && Math.abs(rawY) >= PSNAP) armedY = true;
      edState.offsetX = (armedX && Math.abs(rawX) < PSNAP) ? 0 : rawX;
      edState.offsetY = (armedY && Math.abs(rawY) < PSNAP) ? 0 : rawY;
      edGuide.v = Math.abs(edState.offsetX) < 0.5; edGuide.h = Math.abs(edState.offsetY) < 0.5;
      lastX = e.clientX; lastY = e.clientY; edDraw();
    });
    function endDrag() {
      dragging = resizing = txtDragging = txtResizing = stretching = false;
      if (edGuide.v || edGuide.h) { edGuide.v = edGuide.h = false; edDraw(); }   // clear guides
    }
    edStage.addEventListener('pointerup', endDrag);
    edStage.addEventListener('pointercancel', endDrag);
    // Backup for a release that lands outside the stage/window (pointer capture can be
    // lost if the pointer leaves the browser) — window-level up/cancel still ends it.
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    edStage.addEventListener('wheel', function (e) {
      e.preventDefault();
      // Velocity-aware + capped: a Magic Mouse / trackpad fires a rapid stream of
      // momentum events, so a fixed per-event step compounds into abrupt jumps.
      // Small scrolls now give fine, precise scaling; each event is capped.
      var d = e.deltaY; if (e.deltaMode === 1) d *= 16;   // line units → ~px
      var factor = Math.max(0.92, Math.min(1.08, Math.exp(-d * 0.0018)));
      edState.scale = Math.max(minZoom(), Math.min(4, edState.scale * factor));
      if (edZoom) edZoom.value = edState.scale; edDraw();
    }, { passive: false });

    if (edZoom) edZoom.addEventListener('input', function () { edState.scale = parseFloat(edZoom.value); edDraw(); });
    var zoomBy = function (f) { edState.scale = Math.max(minZoom(), Math.min(4, edState.scale * f)); if (edZoom) edZoom.value = edState.scale; edDraw(); };
    on('[data-cl-ai-ed-zoom-in]', function () { zoomBy(1.1); });
    on('[data-cl-ai-ed-zoom-out]', function () { zoomBy(0.91); });
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
    if (shape === 'square') {                            // big elliptical corners
      var edge = yFrac < 0.2 ? yFrac / 0.2 : yFrac > 0.8 ? (1 - yFrac) / 0.2 : 1;
      return edge >= 1 ? 1 : 0.08 + 0.92 * Math.sqrt(Math.max(0, 1 - (1 - edge) * (1 - edge)));
    }
    return 1;                                             // rectangle
  }

  /* Where the text baseline sits per shape — pushed up on the shapes that taper
   * so there's usable width for it. */
  var TEXT_Y = { rectangle: 0.86, square: 0.80, circle: 0.80, hexagon: 0.75 };
  applyShapeCfg(TEXT_Y, 'text_y');   // pendant + others come from config
  // How much of the available width the text may use, per shape. Square is
  // pulled in so the caption clears the corner rivets.
  var TEXT_MAXW = { rectangle: 0.86, square: 0.62, circle: 0.86, hexagon: 0.86 };
  applyShapeCfg(TEXT_MAXW, 'text_maxw');   // pendant + others come from config

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
    var shape = sh(state.shape);
    var fill = state.textFill || '#000000';
    var outline = state.textOutline || 'none';   // 'white' | 'black' | 'none'
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
    if (outline !== 'none') {
      ctx.strokeStyle = outline === 'black' ? '#000000' : '#ffffff';
      ctx.lineWidth = Math.max(2, size * 0.16);
      ctx.strokeText(txt, x, y);
    }
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
    var marginSt = edState.fit ? 'pass' : 'warn';
    setResult('margins', marginSt, edState.fit ? 'Inside safe area' : 'Edges may crop');
    // Refresh the overall verdict with the positioned margin state (keeps it in
    // sync with the checklist instead of the stale aspect-ratio guess).
    setVerdict(state.qcRes || 'pass', marginSt, state.qcQuality || 'pass');
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
          if (!printBlob) { uploadArtwork(null, null, resolve); return; }
          // Tag the print file at the target DPI so it opens at the true patch
          // size in Photoshop (no manual 150 -> 300 resize by production).
          pngSetDpi(printBlob, CL_AI_HAT.targetDpi).then(function (dpiBlob) {
            if (framed) safeToBlob(framed, function (pv) { uploadArtwork(dpiBlob, pv, resolve); });
            else uploadArtwork(dpiBlob, null, resolve);
          });
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

  /* Cloudflare R2 upload — POSTs the RAW blob bytes to our Vercel /api/upload
   * route (metadata rides in headers, no multipart to parse server-side). The
   * endpoint PutObject's it to R2 and returns { url }; for kind 'print' it also
   * writes the matching '.pdf' sibling so the extension-swap PDF link keeps
   * working. Returns a plain URL string — drop-in with cloudinaryUpload. */
  function cloudflareUpload(fileOrBlob, name, kind) {
    return fetch(CL_AI_HAT.cloudflareUploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': (fileOrBlob && fileOrBlob.type) || 'application/octet-stream',
        'X-Upload-Kind': kind || 'print',
        'X-Upload-Name': encodeURIComponent(name || 'artwork')
      },
      body: fileOrBlob
    })
      .then(function (r) { return r.json(); })
      .then(function (res) { if (res && res.url) return res.url; throw new Error('no url'); });
  }

  /* Single dispatch point — both backends share the (blob, name) -> Promise<url>
   * contract, so the rest of the code never cares which provider is live. */
  function providerUpload(fileOrBlob, name, kind) {
    return CL_AI_HAT.storage === 'cloudflare'
      ? cloudflareUpload(fileOrBlob, name, kind)
      : cloudinaryUpload(fileOrBlob, name);
  }

  function uploadArtwork(printBlob, previewBlob, done) {
    var finish = function () { if (typeof done === 'function') done(); };
    var stamp = Date.now();
    var origName = (edState.file && edState.file.name) || 'artwork';
    // The patch shape IS known at upload time, so bake it into the filename
    // (rectangle/square/circle/hexagon) — the order number is NOT known yet
    // (no order exists until checkout), so the dashboard appends that on download.
    var shapeSlug = String(state.shape || 'shape').toLowerCase().replace(/[^a-z0-9]+/g, '') || 'shape';
    var nm = function (part, ext) { return filePrefix + '-' + shapeSlug + '-' + part + '-' + stamp + ext; };
    if (!storageReady() || !printBlob) {
      state.artUrl = state.localArt;
      if (propArt) propArt.value = '[local-preview] ' + origName;
      setStatus('warn', 'Preview only — connect storage to save the file.');
      finish();
      return;
    }
    setStatus('ok', 'Uploading…');
    // Only the print file is critical; the extras fail soft so a hiccup on them
    // can't stop the customer ordering.
    var soft = function (p) { return p.catch(function () { return ''; }); };
    // Retry a (re-invokable) upload a couple of times before giving up. The ORIGINAL
    // is the raw source file production opens in Photoshop, and it's the one most
    // prone to a transient miss (largest file; the customer's exact MIME) — so it
    // gets retries rather than a single silent attempt. `make` must return a FRESH
    // promise each call (fetch bodies aren't replayable).
    var retry = function (make, tries) {
      return make().catch(function (e) {
        if (tries > 1) return new Promise(function (r) { setTimeout(r, 500); }).then(function () { return retry(make, tries - 1); });
        return Promise.reject(e);
      });
    };
    // When the raw source upload fails after retries (e.g. an unsupported source
    // MIME 415'ing, order #406554), re-encode a downscaled JPEG of the source and
    // upload THAT as the original, so production still gets a usable high-res file
    // instead of nothing. Fail-soft: if the fallback also fails, resolve '' as before.
    var uploadFallbackOriginal = function () {
      var c = buildOriginalFallbackCanvas();
      if (!c) return Promise.resolve('');
      return new Promise(function (resolve) {
        try {
          c.toBlob(function (b) {
            if (!b) { resolve(''); return; }
            retry(function () { return providerUpload(b, nm('original', '-fallback.jpg'), 'original'); }, 3)
              .then(resolve, function () { resolve(''); });
          }, 'image/jpeg', 0.92);
        } catch (e) { resolve(''); }
      });
    };
    var origJob = edState.file
      ? retry(function () { return providerUpload(edState.file, nm('original', '-' + origName), 'original'); }, 3)
          .catch(function () {
            try { console.warn('[cl-ai-hat] original upload failed after retries; trying downscaled fallback'); } catch (e) {}
            return uploadFallbackOriginal();
          })
      : Promise.resolve('');
    var jobs = [
      // The PRINT is the critical file (what production actually prints) — retry it
      // 3x with backoff before giving up, so a transient network/CDN blip doesn't
      // land an order with [upload-failed] and no artwork (see order #405134).
      retry(function () { return providerUpload(printBlob, nm('print', '.png'), 'print'); }, 3),
      origJob,
      // Preview is fail-soft too, but give it the SAME retries as print/original —
      // a single transient blip was silently losing the dashboard preview thumbnail
      // (e.g. order #406647). Still soft so a hard failure never blocks the order.
      soft(previewBlob
        ? retry(function () { return providerUpload(previewBlob, nm('preview', '.png'), 'preview'); }, 3)
        : Promise.resolve(''))
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
      setStatus('err', '⚠ Your image couldn’t be uploaded. You can still place your order — our team will email you to collect your photo so we can make your patch.');
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

    // Remember the resolution/quality inputs so re-positioning can refresh the
    // overall verdict with the POSITIONED margin state — not the initial
    // aspect-ratio guess (which otherwise left the verdict stale + contradictory).
    state.qcRes = resState(resScore);
    state.qcQuality = qState;
    setVerdict(state.qcRes, marginState, qState);
  }

  /* Overall READY / USABLE / LOW verdict. Cause-aware: a resolution problem and a
     placement problem get different titles + guidance (fixes the "checklist all
     green but verdict says LOW QUALITY" contradiction). */
  function setVerdict(resSt, marginSt, qSt) {
    if (!qcVerdict) return;
    var states = [resSt, marginSt, qSt];
    var worst = states.indexOf('fail') > -1 ? 'fail' : states.indexOf('warn') > -1 ? 'warn' : 'pass';
    var resProblem = resSt !== 'pass' || qSt !== 'pass';
    qcVerdict.hidden = false;
    qcVerdict.classList.toggle('is-warn', worst !== 'pass');
    var vt = $('[data-cl-ai-qc-verdict-title]', qcVerdict);
    var vx = $('[data-cl-ai-qc-verdict-text]', qcVerdict);
    if (worst === 'pass') {
      if (vt) vt.textContent = 'READY TO PRINT!';
      if (vx) vx.textContent = "Your artwork looks great. Add to cart when you're ready.";
    } else if (worst === 'warn') {
      if (vt) vt.textContent = 'GOOD TO GO — JUST A HEADS-UP';
      if (vx) vx.textContent = resProblem
        ? 'This will print fine. A higher-resolution image would look even sharper.'
        : 'This will print — just make sure nothing important sits outside the dashed guide.';
    } else {
      if (vt) vt.textContent = resProblem ? 'LOW QUALITY' : 'CHECK YOUR CROP';
      if (vx) vx.textContent = resProblem
        ? 'This image is too low-resolution for a crisp patch. Try a larger image.'
        : 'Part of your artwork may be cut off — reposition it inside the dashed guide.';
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
    var sl = sh(val);
    var prop = $('[data-cl-ai-prop-shape]'); if (prop) prop.value = val;
    if (patch) patch.setAttribute('data-shape', sl);            // hero overlay
    if (patchframe) patchframe.setAttribute('data-shape', sl);  // Step-2 patch frame
    syncPrompt();                                               // Step-1 size guidance
    setPatchMask();
    applyConfigPreviewGeometry();
    if (editor && !editor.hidden) { edMask.setAttribute('data-shape', sl); computeMask(); edDraw(); }
    // A different shape means a different window aspect — rebuild the print file
    // so the stored artwork always matches the selected patch.
    if (baseCanvas && edState.img) { baseCanvas = buildPrintCanvas(); refreshArtwork(true); }
  });
  // For CONFIG-DRIVEN shapes (geometry from the metaobject, not the hand-tuned CSS),
  // drive the static preview from the config so NO per-shape CSS is ever needed for a
  // new product: set the container aspect from the frame, un-hide the matching frame
  // (frames are display:none by default, un-hidden by CSS only for the known shapes),
  // and position the preview art window from the config window fractions. Guarded to
  // config shapes, so the hat's hand-tuned cropped CSS stays untouched.
  var cfgSlugs = {}; for (var _ck in cfgShapes) { if (Object.prototype.hasOwnProperty.call(cfgShapes, _ck)) cfgSlugs[sh(_ck)] = 1; }
  function applyConfigPreviewGeometry() {
    if (!patchframe) return;
    var shape = sh(state.shape);
    if (!cfgSlugs[shape]) return;
    var win = WINDOW[shape]; if (!win) return;
    patchframe.style.aspectRatio = String(frameAspect(state.shape));
    var fr = patchframe.querySelector('.cl-ai-pf__frame[data-frame="' + shape + '"]');
    if (fr) fr.style.setProperty('display', 'block', 'important');
    if (pfArt) {
      pfArt.style.left = (win.l * 100) + '%'; pfArt.style.top = (win.t * 100) + '%';
      pfArt.style.width = (win.w * 100) + '%'; pfArt.style.height = (win.h * 100) + '%';
    }
  }
  applyConfigPreviewGeometry();

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
  // SIMPLE mode = single-variant product with no colour×qty grid (e.g. pendant):
  // add one line for the resolved variant instead of iterating the grid.
  var SIMPLE = !gridEl;
  var simpleQtyEl = $('[data-cl-ai-simple-qty]');
  function simpleQty() { var n = parseInt(simpleQtyEl && simpleQtyEl.value, 10); return (n > 0) ? n : 1; }
  // −/+ stepper for the single-variant quantity (mirrors the hat grid rows).
  function setSimpleQty(n) { if (simpleQtyEl) simpleQtyEl.value = Math.max(1, n || 1); }
  (function () {
    var minus = $('[data-cl-ai-simple-minus]'), plus = $('[data-cl-ai-simple-plus]');
    if (minus) minus.addEventListener('click', function () { setSimpleQty(simpleQty() - 1); });
    if (plus) plus.addEventListener('click', function () { setSimpleQty(simpleQty() + 1); });
    if (simpleQtyEl) simpleQtyEl.addEventListener('blur', function () { setSimpleQty(simpleQty()); });
  })();
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

  var priceQtyEl = $('[data-cl-ai-price-qty]'), priceUnitEl = $('[data-cl-ai-price-unit]'),
      priceNextEl = $('[data-cl-ai-price-next]'), priceSubEl = $('[data-cl-ai-price-sub]');

  function updateTotals() {
    var q = totalQty();
    var base = basePrice();                                  // cents
    var idx = tierIndex(q);
    var unit = q > 0 ? (base - TIER_OFF[idx] * 100) : 0;     // discounted unit price, cents
    var sub = unit * q;                                      // discounted subtotal, cents
    if (ctaPrice) ctaPrice.textContent = formatMoney(q ? sub : base);
    var lbl = $('[data-cl-ai-cta-label]');
    if (lbl) lbl.textContent = q ? (ctaDefaultLabel + ' · ' + q + ' hat' + (q === 1 ? '' : 's')) : ctaDefaultLabel;
    // Live "buy more, save more" summary
    if (priceQtyEl) priceQtyEl.textContent = q;
    if (priceUnitEl) priceUnitEl.textContent = formatMoney(unit);
    if (priceSubEl) priceSubEl.textContent = formatMoney(sub);
    if (priceNextEl) {
      if (idx >= TIER_QTYS.length - 1) {
        priceNextEl.textContent = 'You saved ' + formatMoney(TIER_OFF[TIER_OFF.length - 1] * 100) + ' per hat!';
      } else {
        var toNext = TIER_QTYS[idx + 1] - q;
        var nextUnit = (base - TIER_OFF[idx + 1] * 100) / 100;
        priceNextEl.textContent = 'Order ' + toNext + ' more and get them at $' + nextUnit.toFixed(2) + ' each';
      }
    }
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
      // The quantity picker is an ordering surface, so unavailable variants add
      // noise without providing an action. Keep them in the variant data layer,
      // but omit their rows until Shopify reports them available again.
      if (!v || !v.available) return '';
      var disp = displayColor(b.dataset.value);
      var img = b.dataset.swatchImg;
      var qv = qtySel[v.id] || 0;
      return '<div class="cl-ai-b__row" data-cl-ai-row data-vid="' + v.id + '">' +
        '<button type="button" class="cl-ai-b__row-hat" data-cl-ai-image-open data-image="' + esc(img || '') + '" data-label="' + esc(disp) + '" aria-label="View larger image of ' + esc(disp) + '">' +
          (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '') +
        '</button>' +
        '<div class="cl-ai-b__row-name">' + esc(disp) + '</div>' +
        '<div class="cl-ai-b__row-qty">' +
          '<button type="button" class="cl-ai-b__qty-btn" data-cl-ai-grid-minus aria-label="Decrease ' + esc(disp) + '">−</button>' +
          '<input type="text" class="cl-ai-b__qty-input" inputmode="numeric" value="' + qv + '" data-cl-ai-grid-qty aria-label="' + esc(disp) + ' quantity">' +
          '<button type="button" class="cl-ai-b__qty-btn" data-cl-ai-grid-plus aria-label="Increase ' + esc(disp) + '">+</button>' +
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

  /* Hat thumbnail lightbox. */
  var imgbox = $('[data-cl-ai-imgbox]');
  var imgboxImage = $('[data-cl-ai-imgbox-image]');
  var imgboxTitle = $('[data-cl-ai-imgbox-title]');
  var imgboxLastFocus = null;
  var imgboxBodyOverflow = '';

  function closeImgbox() {
    if (!imgbox || imgbox.hidden) return;
    imgbox.hidden = true;
    document.body.style.overflow = imgboxBodyOverflow;
    if (imgboxImage) { imgboxImage.src = ''; imgboxImage.alt = ''; }
    if (imgboxLastFocus && imgboxLastFocus.focus) imgboxLastFocus.focus();
  }
  function openImgbox(btn) {
    if (!imgbox || !imgboxImage || !btn || !btn.dataset.image) return;
    imgboxLastFocus = btn;
    imgboxImage.src = btn.dataset.image;
    imgboxImage.alt = btn.dataset.label || 'Hat';
    if (imgboxTitle) imgboxTitle.textContent = btn.dataset.label || '';
    imgboxBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    imgbox.hidden = false;
    var close = $('[data-cl-ai-imgbox-close]', imgbox);
    if (close) close.focus();
  }
  document.addEventListener('click', function (e) {
    var opener = e.target && e.target.closest ? e.target.closest('[data-cl-ai-image-open]') : null;
    if (opener) { e.preventDefault(); openImgbox(opener); }
  });
  if (imgbox) {
    $$('[data-cl-ai-imgbox-close]', imgbox).forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.preventDefault(); closeImgbox(); });
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && imgbox && !imgbox.hidden) closeImgbox();
  });

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
  var textFillInput = $('[data-cl-ai-text-fill]');

  function syncText() {
    var on = textToggle ? textToggle.checked : false;
    state.text = on && textInput ? textInput.value.trim() : '';
    if (propText) propText.value = state.text;
    if (propTextColor) propTextColor.value = state.text ? state.textFill : '';
    if (countEl && textInput) countEl.textContent = String(textInput.value.length);
    // First time text is added, drop it at the shape's default spot so it's visible.
    if (state.text && !edState.textNorm) edState.textNorm = defaultTextNorm(sh(state.shape));
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

  // Full colour picker for the text fill.
  if (textFillInput) textFillInput.addEventListener('input', function () { state.textFill = textFillInput.value; syncText(); });

  // Outline: White / Black / None.
  $$('[data-cl-ai-outline]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      $$('[data-cl-ai-outline]').forEach(function (b) { b.classList.remove('is-active'); b.setAttribute('aria-checked', 'false'); });
      btn.classList.add('is-active'); btn.setAttribute('aria-checked', 'true');
      state.textOutline = btn.dataset.value;
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
    // Require at least one colour with a quantity (grid products only).
    if (!SIMPLE && !totalQty()) {
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
        props['Text Color'] = state.textFill;
        props['Text Outline'] = state.textOutline;
      }
      // SIMPLE: one line for the single resolved variant. Otherwise one line item
      // per selected colour — all share the same artwork. The tag-based bulk
      // discount then applies cart-wide across every line.
      var items;
      if (SIMPLE) {
        var vid = (variantIdInput && variantIdInput.value) || (variants[0] && variants[0].id);
        items = [{ id: vid, quantity: simpleQty(), properties: props }];
      } else {
        items = Object.keys(qtySel).filter(function (k) { return qtySel[k] > 0; })
          .map(function (k) { return { id: k, quantity: qtySel[k], properties: props }; });
      }
      setCta(true, 'Adding…');
      return fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items })
      });
    }).then(function (r) {
      if (!r.ok) throw new Error('add failed');
      if (!SIMPLE) { qtySel = {}; renderGrid(); }  // clear the batch so re-clicking can't duplicate it
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
