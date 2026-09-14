(function () {
  'use strict';

  var lightbox;
  var lightboxImage;
  var lightboxClose;
  var lastTrigger;
  var previousOverflow = '';

  function largeImageUrl(src) {
    if (!src) return '';
    try {
      var url = new URL(src, window.location.href);
      if (url.hostname.indexOf('cdn.shopify.com') !== -1) url.searchParams.set('width', '1800');
      return url.href;
    } catch (error) {
      return src;
    }
  }

  function ensureLightbox() {
    if (lightbox) return;
    lightbox = document.createElement('div');
    lightbox.className = 'cl-pack-lightbox';
    lightbox.hidden = true;
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-modal', 'true');
    lightbox.setAttribute('aria-label', 'Enlarged product image');
    lightbox.innerHTML = '<button type="button" class="cl-pack-lightbox__close" aria-label="Close enlarged image">&times;</button><img class="cl-pack-lightbox__image" alt="">';
    document.body.appendChild(lightbox);
    lightboxImage = lightbox.querySelector('.cl-pack-lightbox__image');
    lightboxClose = lightbox.querySelector('.cl-pack-lightbox__close');

    lightboxClose.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', function (event) {
      if (event.target === lightbox) closeLightbox();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !lightbox.hidden) closeLightbox();
    });
  }

  function openLightbox(image) {
    ensureLightbox();
    lastTrigger = image;
    lightboxImage.src = largeImageUrl(image.currentSrc || image.src);
    lightboxImage.alt = image.alt || 'Enlarged product image';
    previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    lightbox.hidden = false;
    lightboxClose.focus();
  }

  function closeLightbox() {
    if (!lightbox || lightbox.hidden) return;
    lightbox.hidden = true;
    lightboxImage.removeAttribute('src');
    document.documentElement.style.overflow = previousOverflow;
    if (lastTrigger && document.contains(lastTrigger)) lastTrigger.focus({ preventScroll: true });
  }

  function initGallery(gallery) {
    if (!gallery || gallery.dataset.clCardGalleryReady === 'true') return;
    var viewport = gallery.querySelector('[data-cl-card-gallery-viewport]');
    var dots = Array.prototype.slice.call(gallery.querySelectorAll('[data-cl-card-gallery-dot]'));
    var previousButton = gallery.querySelector('[data-cl-card-gallery-prev]');
    var nextButton = gallery.querySelector('[data-cl-card-gallery-next]');
    if (!viewport || dots.length < 2) return;

    gallery.dataset.clCardGalleryReady = 'true';

    Array.prototype.forEach.call(viewport.querySelectorAll('.cl-hypro-card__image'), function (image) {
      image.setAttribute('tabindex', '0');
      image.setAttribute('role', 'button');
      image.setAttribute('aria-label', 'Enlarge ' + (image.alt || 'product image'));
      image.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openLightbox(image);
      });
    });

    var pointerStart = null;
    viewport.addEventListener('pointerdown', function (event) {
      pointerStart = { x: event.clientX, y: event.clientY };
    }, { passive: true });
    viewport.addEventListener('click', function (event) {
      var image = event.target.closest('.cl-hypro-card__image');
      if (!image) return;
      if (pointerStart && (Math.abs(event.clientX - pointerStart.x) > 8 || Math.abs(event.clientY - pointerStart.y) > 8)) return;
      event.preventDefault();
      event.stopPropagation();
      openLightbox(image);
    });

    var activeIndex = 0;

    function setActive(index) {
      activeIndex = index;
      dots.forEach(function (dot, dotIndex) {
        var active = dotIndex === index;
        dot.classList.toggle('is-active', active);
        if (active) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
    }

    var scheduled = false;
    viewport.addEventListener('scroll', function () {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(function () {
        var index = viewport.clientWidth && viewport.scrollLeft >= viewport.clientWidth / 2 ? 1 : 0;
        setActive(index);
        scheduled = false;
      });
    }, { passive: true });

    dots.forEach(function (dot, index) {
      dot.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        viewport.scrollTo({ left: viewport.clientWidth * index, behavior: 'smooth' });
        setActive(index);
      });
    });

    function showImage(index) {
      var normalizedIndex = (index + dots.length) % dots.length;
      viewport.scrollTo({ left: viewport.clientWidth * normalizedIndex, behavior: 'smooth' });
      setActive(normalizedIndex);
    }

    if (previousButton) previousButton.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      showImage(activeIndex - 1);
    });

    if (nextButton) nextButton.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      showImage(activeIndex + 1);
    });
  }

  function initAll(root) {
    ensureLightbox();
    (root || document).querySelectorAll('[data-cl-card-gallery]').forEach(initGallery);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { initAll(document); });
  else initAll(document);

  document.addEventListener('shopify:section:load', function (event) { initAll(event.target); });
}());
