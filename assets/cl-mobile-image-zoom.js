/*
 * cl-mobile-image-zoom.js
 * ------------------------------------------------------------------
 * Mobile-only product-image lightbox fixes for CityLocs.
 *
 * Problem: on mobile, tapping a product image opened a zoomable viewer and
 * customers rage-tapped (it toggled zoom instead of closing) and left the page.
 * There are TWO image viewers on the product page:
 *
 *   1. The custom "Select Hat Style" form thumbnails (Vue) open a Fancybox
 *      lightbox via displayImg() -> Fancybox.show([{type:"image"}]). Fancybox's
 *      default is click = "toggleZoom" with its toolbar (incl. the X) auto-
 *      hidden and pinned to the very top (behind the sticky header).
 *   2. The theme's native Empire gallery (main image + thumbnail strip).
 *
 * Fix (touch devices only; desktop is left completely untouched):
 *   - Fancybox images: disable zoom, make any tap CLOSE, hide the native top
 *     toolbar, and inject our own "X" button onto the image's top-right corner
 *     so it is always visible and never covered by the header. Done by wrapping
 *     Fancybox.show so every image lightbox is handled — no need to edit each
 *     snippet's displayImg().
 *   - Native gallery: the theme's mobile click-to-zoom is turned off in theme
 *     settings (gallery_click_to_zoom = "desktop"); this script provides a
 *     simple no-zoom overlay with an "X" so the large image still opens.
 *
 * Self-contained: injects its own CSS. Part 1 relies on Fancybox (already
 * loaded globally in layout/theme.liquid).
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';

  // Touch devices only. The theme swaps html.no-touch -> html.has-touch when a
  // touch device is detected (see layout/theme.liquid). Fall back to a
  // coarse-pointer / narrow-screen check just in case.
  function isTouch() {
    return (
      document.documentElement.classList.contains('has-touch') ||
      window.matchMedia('(hover: none), (max-width: 767px)').matches
    );
  }

  /* =================================================================
   * PART 1 — Fancybox image lightbox (the "Select Hat Style" thumbnails)
   * ================================================================= */

  // Options we force onto every IMAGE Fancybox on touch: no zoom, tap-to-close.
  // We hide Fancybox's own top toolbar (via CSS) and inject our own close (X)
  // button onto the image itself (see injectCloseButton) so it can't be covered
  // by the sticky mobile header.
  var IMAGE_OPTS = {
    Image: {
      zoom: false, // no click/double-click zoom
      click: 'close', // a tap on the image closes the lightbox
      doubleClick: null,
      wheel: null,
      touch: false // no pinch / pan gestures
    }
  };

  function itemsAreImages(items) {
    return (
      Array.isArray(items) &&
      items.some(function (it) {
        return it && it.type === 'image';
      })
    );
  }

  // Drop an "X" onto the open image (top-right of the image box). Fancybox sizes
  // .fancybox__content to the image and gives it position:relative, so an
  // absolutely-positioned child lands on the image corner regardless of image
  // size — always clear of the page header.
  function injectCloseButton() {
    var content = document.querySelector('.fancybox__container .fancybox__content');
    if (!content) return false;
    if (content.querySelector('.clfb-close')) return true;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'clfb-close';
    b.setAttribute('aria-label', 'Close');
    b.innerHTML = '×';
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      try {
        window.Fancybox.close();
      } catch (_) {}
    });
    content.appendChild(b);
    return true;
  }

  // The content element appears a frame or two after show(); retry briefly.
  function scheduleInject() {
    var n = 0;
    (function retry() {
      if (injectCloseButton() || ++n > 30) return;
      requestAnimationFrame(retry);
    })();
  }

  // Wrap Fancybox.show once it exists so displayImg() (and any other image
  // lightbox) gets our options automatically. HTML popups (validation messages)
  // are type:"html", so they are never touched.
  function wrapFancybox() {
    var F = window.Fancybox;
    if (!F || F.__clWrapped || typeof F.show !== 'function') return !!(F && F.__clWrapped);

    var original = F.show.bind(F);
    F.show = function (items, opts) {
      opts = opts || {};
      var isImg = isTouch() && itemsAreImages(items);
      if (isImg) {
        opts = Object.assign({}, opts, {
          Image: Object.assign({}, IMAGE_OPTS.Image, opts.Image)
        });
      }
      var result = original(items, opts);
      if (isImg) scheduleInject();
      return result;
    };
    F.__clWrapped = true;
    return true;
  }

  // Fancybox is loaded synchronously in <head>, so it's normally ready. Retry a
  // few times just in case of load-order surprises.
  if (!wrapFancybox()) {
    var tries = 0;
    var t = setInterval(function () {
      if (wrapFancybox() || ++tries > 40) clearInterval(t);
    }, 100);
  }

  /* =================================================================
   * PART 2 — Native Empire gallery overlay (main product image)
   * ================================================================= */

  var STYLE_ID = 'cl-mobile-image-zoom-style';
  var CSS =
    // Hide Fancybox's top toolbar on touch — we use our own on-image X instead.
    'html.has-touch .fancybox__toolbar{display:none !important;}' +
    // Our on-image close button for Fancybox images.
    '.clfb-close{position:absolute;top:8px;right:8px;width:40px;height:40px;' +
    'display:flex;align-items:center;justify-content:center;z-index:10;border:none;' +
    'border-radius:50%;background:rgba(0,0,0,.6);color:#fff;font-size:26px;' +
    'line-height:1;cursor:pointer;padding:0;box-shadow:0 2px 8px rgba(0,0,0,.35);}' +
    // Our own overlay for the native gallery image.
    '.clmz-overlay{position:fixed;inset:0;z-index:100000;display:flex;' +
    'align-items:center;justify-content:center;padding:16px;' +
    'background:rgba(0,0,0,.92);' +
    'touch-action:manipulation;-webkit-tap-highlight-color:transparent;}' +
    '.clmz-overlay[hidden]{display:none;}' +
    '.clmz-overlay img{max-width:100%;max-height:100%;width:auto;height:auto;' +
    'object-fit:contain;border-radius:8px;background:#fff;' +
    'touch-action:none;pointer-events:none;user-select:none;-webkit-user-select:none;}' +
    '.clmz-close{position:absolute;top:14px;right:14px;width:44px;height:44px;' +
    'display:flex;align-items:center;justify-content:center;border:none;' +
    'border-radius:50%;background:rgba(255,255,255,.95);color:#111;' +
    'font-size:26px;line-height:1;cursor:pointer;padding:0;' +
    'box-shadow:0 2px 10px rgba(0,0,0,.3);z-index:1;}';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  var overlay, overlayImg;

  function buildOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'clmz-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
      '<button type="button" class="clmz-close" aria-label="Close">×</button>' +
      '<img alt="">';
    overlayImg = overlay.querySelector('img');
    document.body.appendChild(overlay);
    overlay.addEventListener('click', close); // tap anywhere closes
  }

  function open(src) {
    if (!src) return;
    buildOverlay();
    overlayImg.src = src;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (overlay) {
      overlay.hidden = true;
      document.body.style.overflow = '';
    }
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });

  // A tap on the native gallery's large image opens our overlay (never the
  // thumbnail strip).
  document.addEventListener(
    'click',
    function (e) {
      if (!isTouch()) return;
      var imgWrap = e.target.closest('.product-gallery--image-background');
      if (!imgWrap) return;
      if (e.target.closest('.product-gallery--media-thumbnail')) return;

      var figure = e.target.closest('.product-gallery--media');
      if (figure && figure.dataset.mediaType && figure.dataset.mediaType !== 'image') return;

      var innerImg = imgWrap.querySelector('img');
      var src =
        (figure && figure.dataset.zoom) ||
        (innerImg && (innerImg.currentSrc || innerImg.src)) ||
        '';
      if (!src) return;
      open(src);
    },
    true
  );

  injectStyle();
})();
