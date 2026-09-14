(function () {
  'use strict';

  function initGallery(gallery) {
    if (gallery.dataset.clLegacyGalleryReady === 'true') return;
    if (gallery.tagName.toLowerCase() === 'product-gallery') return;

    var figures = Array.prototype.slice.call(gallery.querySelectorAll('[data-gallery-figure]'));
    var thumbnails = Array.prototype.slice.call(gallery.querySelectorAll('[data-gallery-thumbnail]'));
    var navigation = gallery.querySelector('[data-gallery-navigation]');
    var viewer = gallery.querySelector('[data-gallery-viewer]');

    if (!figures.length || !thumbnails.length) return;
    gallery.dataset.clLegacyGalleryReady = 'true';
    if (navigation) navigation.classList.remove('loading');

    function select(index, moveFocus) {
      var figure = figures.find(function (item) {
        return Number(item.dataset.galleryIndex) === Number(index);
      });
      var thumbnail = thumbnails.find(function (item) {
        return Number(item.dataset.galleryIndex) === Number(index);
      });

      if (!figure || !thumbnail) return;

      figures.forEach(function (item) {
        var selected = item === figure;
        item.dataset.gallerySelected = selected ? 'true' : 'false';
        item.setAttribute('aria-hidden', selected ? 'false' : 'true');
      });

      thumbnails.forEach(function (item) {
        var selected = item === thumbnail;
        item.dataset.gallerySelected = selected ? 'true' : 'false';
        item.setAttribute('aria-current', selected ? 'true' : 'false');
      });

      thumbnail.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      if (moveFocus) thumbnail.focus({ preventScroll: true });

      gallery.dispatchEvent(new CustomEvent('cl:gallery-change', {
        bubbles: true,
        detail: { index: Number(index), mediaId: figure.dataset.media }
      }));
    }

    function selectedThumbnailPosition() {
      var position = thumbnails.findIndex(function (item) {
        return item.dataset.gallerySelected === 'true';
      });
      return position < 0 ? 0 : position;
    }

    thumbnails.forEach(function (thumbnail) {
      thumbnail.addEventListener('click', function () {
        select(thumbnail.dataset.galleryIndex, false);
      });

      thumbnail.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        select(thumbnail.dataset.galleryIndex, true);
      });
    });

    gallery.querySelectorAll('[data-gallery-scroll-button]').forEach(function (button) {
      button.addEventListener('click', function () {
        var direction = button.classList.contains('scroll-left') ? -1 : 1;
        var next = (selectedThumbnailPosition() + direction + thumbnails.length) % thumbnails.length;
        select(thumbnails[next].dataset.galleryIndex, false);
      });
    });

    if (viewer) {
      var touchStart = null;
      var suppressClickUntil = 0;

      viewer.style.touchAction = 'pan-y pinch-zoom';

      viewer.addEventListener('touchstart', function (event) {
        if (event.touches.length !== 1) {
          touchStart = null;
          return;
        }

        touchStart = {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
          time: Date.now()
        };
      }, { passive: true });

      viewer.addEventListener('touchend', function (event) {
        if (!touchStart || event.changedTouches.length !== 1) return;

        var deltaX = event.changedTouches[0].clientX - touchStart.x;
        var deltaY = event.changedTouches[0].clientY - touchStart.y;
        var elapsed = Date.now() - touchStart.time;
        touchStart = null;

        if (elapsed > 700 || Math.abs(deltaX) < 45 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;

        var direction = deltaX < 0 ? 1 : -1;
        var next = (selectedThumbnailPosition() + direction + thumbnails.length) % thumbnails.length;
        suppressClickUntil = Date.now() + 350;
        select(thumbnails[next].dataset.galleryIndex, false);
      }, { passive: true });

      viewer.addEventListener('touchcancel', function () {
        touchStart = null;
      }, { passive: true });

      viewer.addEventListener('click', function (event) {
        if (Date.now() >= suppressClickUntil) return;
        event.preventDefault();
        event.stopPropagation();
      }, true);
    }
  }

  function initAll(root) {
    (root || document).querySelectorAll('[data-product-gallery]').forEach(initGallery);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initAll(document); });
  } else {
    initAll(document);
  }

  document.addEventListener('shopify:section:load', function (event) {
    initAll(event.target);
  });
}());
