/*
 * cl-combined-gallery-lightbox.js
 * High-variant (combined listing) media gallery: clicking a thumbnail opens
 * that image large in a lightbox. No zoom. Click anywhere (including the image)
 * closes it. A visible "X" button. All devices.
 *
 * The thumbnail normally switches the main slider image (Empire media-gallery);
 * we intercept in the capture phase and open the lightbox instead.
 */
(function () {
  var STYLE_ID = 'clcg-lightbox-style';
  var overlay, overlayImg;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '.clcg-lightbox{position:fixed;inset:0;z-index:100000;display:flex;' +
      'align-items:center;justify-content:center;background:rgba(0,0,0,.85);' +
      'padding:24px;box-sizing:border-box;cursor:zoom-out;}' +
      '.clcg-lightbox[hidden]{display:none;}' +
      '.clcg-lightbox img{max-width:100%;max-height:100%;width:auto;height:auto;' +
      'object-fit:contain;-webkit-user-select:none;user-select:none;}' +
      '.clcg-lightbox__close{position:absolute;top:14px;right:14px;width:44px;' +
      'height:44px;padding:0;border:0;border-radius:50%;background:rgba(0,0,0,.6);' +
      'color:#fff;font-size:26px;line-height:1;cursor:pointer;display:flex;' +
      'align-items:center;justify-content:center;z-index:1;}' +
      '.clcg-lightbox__close:hover{background:rgba(0,0,0,.8);}';
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  function build() {
    if (overlay) return;
    injectStyle();
    overlay = document.createElement('div');
    overlay.className = 'clcg-lightbox';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
      '<button type="button" class="clcg-lightbox__close" aria-label="Close">×</button>' +
      '<img alt="">';
    overlayImg = overlay.querySelector('img');
    // Click anywhere in the overlay (backdrop, image, or X) closes it.
    overlay.addEventListener('click', close);
    document.body.appendChild(overlay);
  }

  function open(src) {
    build();
    overlayImg.src = src;
    overlay.hidden = false;
    document.documentElement.style.overflow = 'hidden';
  }

  function close() {
    if (!overlay) return;
    overlay.hidden = true;
    overlayImg.removeAttribute('src');
    document.documentElement.style.overflow = '';
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });

  // Upgrade a thumbnail's (small) Shopify CDN image URL to a large version.
  function largeSrc(img) {
    var src = img.currentSrc || img.src || '';
    if (!src) return '';
    if (src.indexOf('//') === 0) src = 'https:' + src;
    if (/([?&])width=\d+/.test(src)) {
      src = src.replace(/([?&])width=\d+/, '$1width=1600');
    } else {
      src += (src.indexOf('?') > -1 ? '&' : '?') + 'width=1600';
    }
    return src;
  }

  // Open the lightbox when a variant thumbnail is clicked:
  //  - the color-variant image in "Choose colors & quantities"
  //    (.cl-combined-quantity-row__image), and
  //  - the media-gallery thumbnail strip (.media-gallery__thumb).
  // Capture phase so we run before Empire's media-gallery switches the main image.
  var TRIGGER = '.cl-combined-listing-wrapper .cl-combined-quantity-row__image,' +
                '.cl-combined-listing-wrapper .media-gallery__thumb';
  document.addEventListener(
    'click',
    function (e) {
      var trigger = e.target.closest(TRIGGER);
      if (!trigger) return;
      // Skip non-image media-gallery thumbs (video/model).
      var mt = trigger.getAttribute && trigger.getAttribute('data-media-type');
      if (mt && mt !== 'image') return;
      var img = trigger.querySelector('img');
      if (!img) return;
      var src = largeSrc(img);
      if (!src) return;
      e.preventDefault();
      e.stopPropagation();
      open(src);
    },
    true
  );
})();
