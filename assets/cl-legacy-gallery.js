/*
 * cl-legacy-gallery.js
 * ---------------------------------------------------------------------------
 * Compatibility gallery for CityLocs product templates migrated from Empire 7
 * to Empire 13. Empire 13 replaced the old Flickity gallery with a Swiper one
 * (product.gallery.js) that only initializes the new [data-swiper-*] markup,
 * leaving the legacy `.product-gallery--navigation` / `[data-gallery-viewer]`
 * markup (still rendered by product-list-cl-form templates) with NO JS driving
 * it — so the slider was stuck on `.loading` and never switched images.
 *
 * Pairs with the visibility contract already defined in
 * cl-legacy-product-compat.css: a figure is shown when it has
 * data-gallery-selected="true". This script just manages that attribute plus
 * thumbnail clicks, scroll buttons, swipe/keys, and removes `.loading`.
 *
 * Self-contained, no dependencies, idempotent. Runs only where the legacy
 * markup exists, so it is inert on high-variant / Swiper pages.
 *
 * Public API (for builder → image sync):
 *   window.CLLegacyGallery.select(mediaId)
 *   window.CLLegacyGallery.selectByImageSrc(srcSubstring)
 *   document.dispatchEvent(new CustomEvent('cl:gallery:select',
 *     { detail: { media: <id> } | { src: <substr> } }))
 */
(function () {
  'use strict';

  var INITED = 'clLegacyGalleryInited';

  function normSrc(s) {
    if (!s) return '';
    // strip protocol + Shopify size/version suffixes so different renditions match
    return String(s)
      .replace(/^https?:/, '')
      .replace(/(\?|&)v=\d+/, '')
      .replace(/_(\d+x\d*|x\d+)(_crop_[a-z]+)?(?=\.[a-z]+)/i, '')
      .toLowerCase();
  }

  // Filename only — the same image is served from different CDN folders
  // (/products/ vs /files/) for variants vs gallery media, so match on basename.
  function baseName(s) {
    s = normSrc(s).split(/[?#]/)[0];
    var i = s.lastIndexOf('/');
    return i >= 0 ? s.slice(i + 1) : s;
  }

  function Gallery(nav) {
    // Find the container that holds both the navigation and the viewer.
    var root = nav.parentElement;
    while (root && !root.querySelector('[data-gallery-viewer]')) {
      root = root.parentElement;
    }
    if (!root) return null;

    var viewer = root.querySelector('[data-gallery-viewer]');
    if (!viewer) return null;

    var figures = Array.prototype.slice.call(
      viewer.querySelectorAll('[data-gallery-figure]')
    );
    if (!figures.length) return null;

    var thumbs = Array.prototype.slice.call(
      nav.querySelectorAll('[data-gallery-thumbnail]')
    );
    var scroller = nav.querySelector('[data-gallery-scroller]');

    var api = {
      root: root,
      figures: figures,
      thumbs: thumbs,
      current: 0
    };

    function indexOfMedia(mediaId) {
      for (var i = 0; i < figures.length; i++) {
        if (figures[i].getAttribute('data-media') === String(mediaId)) return i;
      }
      return -1;
    }

    function show(index) {
      if (index == null || index < 0 || index >= figures.length) return;
      api.current = index;
      figures.forEach(function (fig, i) {
        var on = i === index;
        fig.setAttribute('data-gallery-selected', on ? 'true' : 'false');
        fig.setAttribute('aria-hidden', on ? 'false' : 'true');
      });
      thumbs.forEach(function (t) {
        var on = t.getAttribute('data-media') === figures[index].getAttribute('data-media');
        t.setAttribute('data-gallery-selected', on ? 'true' : 'false');
        t.classList.toggle('is-selected', on);
        if (on && scroller) scrollThumbIntoView(t);
      });
    }

    function scrollThumbIntoView(t) {
      if (!scroller) return;
      var tRect = t.getBoundingClientRect();
      var sRect = scroller.getBoundingClientRect();
      if (tRect.left < sRect.left) {
        scroller.scrollBy({ left: tRect.left - sRect.left - 8, behavior: 'smooth' });
      } else if (tRect.right > sRect.right) {
        scroller.scrollBy({ left: tRect.right - sRect.right + 8, behavior: 'smooth' });
      }
    }

    // Thumbnail clicks
    thumbs.forEach(function (t, i) {
      t.addEventListener('click', function (e) {
        e.preventDefault();
        var idx = indexOfMedia(t.getAttribute('data-media'));
        show(idx >= 0 ? idx : i);
      });
    });

    // Scroll buttons (prev/next thumbnail strip) — only shown when the strip
    // actually overflows its container.
    var scrollButtons = Array.prototype.slice.call(
      nav.querySelectorAll('[data-gallery-scroll-button]')
    );
    scrollButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!scroller) return;
        var dir = btn.classList.contains('scroll-left') ? -1 : 1;
        scroller.scrollBy({ left: dir * Math.max(120, scroller.clientWidth * 0.6), behavior: 'smooth' });
      });
    });

    function updateScrollButtons() {
      if (!scroller) return;
      var overflow = scroller.scrollWidth - scroller.clientWidth > 4;
      scrollButtons.forEach(function (btn) {
        btn.classList.toggle('visible', overflow);
      });
    }
    updateScrollButtons();
    window.addEventListener('resize', updateScrollButtons);
    if (scroller) scroller.addEventListener('scroll', updateScrollButtons, { passive: true });

    // Swipe on the main viewer (mobile)
    var touchX = null;
    viewer.addEventListener('touchstart', function (e) {
      touchX = e.changedTouches[0].clientX;
    }, { passive: true });
    viewer.addEventListener('touchend', function (e) {
      if (touchX == null) return;
      var dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) < 40) return;
      show(dx < 0 ? Math.min(api.current + 1, figures.length - 1)
                  : Math.max(api.current - 1, 0));
    }, { passive: true });

    // Keyboard when a thumbnail is focused
    nav.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') show(Math.min(api.current + 1, figures.length - 1));
      else if (e.key === 'ArrowLeft') show(Math.max(api.current - 1, 0));
    });

    api.select = function (mediaId) {
      var idx = indexOfMedia(mediaId);
      if (idx >= 0) show(idx);
      return idx >= 0;
    };

    api.selectByImageSrc = function (srcSub) {
      var wantBase = baseName(srcSub);
      if (!wantBase) return false;
      for (var i = 0; i < figures.length; i++) {
        var zBase = baseName(figures[i].getAttribute('data-zoom') || '');
        var img = figures[i].querySelector('img');
        var iBase = img ? baseName(img.getAttribute('src') || img.getAttribute('data-src') || '') : '';
        if (zBase === wantBase || iBase === wantBase) {
          show(i);
          return true;
        }
      }
      return false;
    };

    // Initial state: honor any figure the template pre-selected, else first.
    var startIdx = figures.findIndex(function (f) {
      return f.getAttribute('data-gallery-selected') === 'true';
    });
    show(startIdx >= 0 ? startIdx : 0);

    nav.classList.remove('loading');
    return api;
  }

  var galleries = [];

  function init() {
    var navs = document.querySelectorAll('[data-gallery-navigation]');
    navs.forEach(function (nav) {
      if (nav[INITED]) return;
      nav[INITED] = true;
      var g = Gallery(nav);
      if (g) galleries.push(g);
    });

    // Expose a small API that fans out to every gallery on the page.
    window.CLLegacyGallery = window.CLLegacyGallery || {};
    window.CLLegacyGallery.select = function (mediaId) {
      return galleries.some(function (g) { return g.select(mediaId); });
    };
    window.CLLegacyGallery.selectByImageSrc = function (src) {
      return galleries.some(function (g) { return g.selectByImageSrc(src); });
    };
  }

  // Builder → gallery sync hook.
  document.addEventListener('cl:gallery:select', function (e) {
    var d = (e && e.detail) || {};
    if (d.media != null) window.CLLegacyGallery.select(d.media);
    else if (d.src) window.CLLegacyGallery.selectByImageSrc(d.src);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/*
 * Style -> gallery image sync.
 * When a shopper picks a hat style in the CityLocs "SELECT HAT STYLE" swatch
 * (product-swatch-clplate / -mobile-clplate: `.selection-button[data-value]`),
 * swap the gallery to that style's representative product photo. Uses the
 * product's own variant data (option named "Style" -> variant.featured_image)
 * and the gallery's public selectByImageSrc() API. No Liquid changes needed.
 */
(function () {
  'use strict';

  function productHandle() {
    var m = location.pathname.match(/\/products\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  function init() {
    var buttons = document.querySelectorAll('.selection-button[data-value]');
    if (!buttons.length) return;                       // no style swatch here
    if (!document.querySelector('[data-gallery-viewer]')) return; // no legacy gallery
    var handle = productHandle();
    if (!handle) return;

    var styleMap = null;   // { "<style value>": "<featured_image src>" }
    var loading = false;
    var queue = [];

    function buildMap(product) {
      var opts = product.options || [];
      var styleIdx = -1;
      opts.forEach(function (o, i) {
        var name = (o && o.name ? o.name : o) + '';
        if (name.toLowerCase() === 'style') {
          styleIdx = o && o.position ? o.position - 1 : i;
        }
      });
      if (styleIdx < 0) styleIdx = 0; // fall back to first option
      var map = {};
      (product.variants || []).forEach(function (v) {
        var val = (v.options || [])[styleIdx];
        if (val && !map[val] && v.featured_image && v.featured_image.src) {
          map[val] = v.featured_image.src;
        }
      });
      return map;
    }

    function withMap(cb) {
      if (styleMap) { cb(); return; }
      queue.push(cb);
      if (loading) return;
      loading = true;
      fetch('/products/' + handle + '.js', { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (p) {
          styleMap = buildMap(p);
          loading = false;
          queue.splice(0).forEach(function (fn) { fn(); });
        })
        .catch(function () { loading = false; });
    }

    function syncTo(styleValue) {
      if (!styleValue) return;
      withMap(function () {
        var src = styleMap && styleMap[styleValue];
        if (src && window.CLLegacyGallery) window.CLLegacyGallery.selectByImageSrc(src);
      });
    }

    // Delegated so it survives the Vue swatch re-render; additive to Vue's own handler.
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.selection-button[data-value]');
      if (btn) syncTo(btn.getAttribute('data-value'));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/*
 * Color-thumbnail -> gallery slider sync.
 * The variant-selection row thumbnails (`.product-list-box img`, rendered by the
 * product-list-cl-*-form snippets) ALREADY open the Fancybox lightbox via the
 * Vue `@click="displayImg(...)"` handler (and cl-mobile-image-zoom.js gives that
 * lightbox the no-zoom / click-to-close / on-image-X treatment on all devices).
 * Here we only ALSO sync the on-page gallery slider to the clicked variant's
 * image — we must NOT open a second lightbox (that stacked two containers).
 */
(function () {
  'use strict';

  function fullSrc(img) {
    var s = img.getAttribute('src') || '';
    if (!s || s.indexOf('data:') === 0) s = img.getAttribute('data-src') || img.currentSrc || '';
    return s;
  }

  document.addEventListener('click', function (e) {
    var img = e.target.closest && e.target.closest('.product-list-box img');
    if (!img) return;
    var src = fullSrc(img);
    if (src && window.CLLegacyGallery && typeof window.CLLegacyGallery.selectByImageSrc === 'function') {
      window.CLLegacyGallery.selectByImageSrc(src);
    }
  });
})();
