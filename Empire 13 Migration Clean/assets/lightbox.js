import 'vendor.photoswipe';
import 'vendor.photoswipe-ui-default';
import EventHandler from 'util.events';

const THUMBNAIL_ACTIVE_CLASS = 'thumbnail--active';

export default class Lightbox {
  constructor(
    triggers,
    images,
    thumbnails,
    { events: { onOpen = () => {}, onClose = () => {} } }
  ) {
    this.triggers = triggers;
    this.images = images;
    this.thumbnails = thumbnails;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.lightboxThumbnails = [];
    this.photoswipe = null;
    this.events = new EventHandler();
    this.items = this.getImageData();
    this.lastFocusedElement = null;

    this.templateEl = this.getTemplateEl();
    this.thumbScroller = this.templateEl.querySelector(
      '[data-photoswipe-thumb-scroller]'
    );
    this.closeButton = this.templateEl.querySelector('.pswp__button--close');
    this.scrollPrevButton = this.templateEl.querySelector('[data-scroll-prev]');
    this.scrollNextButton = this.templateEl.querySelector('[data-scroll-next]');

    this.triggers.forEach((trigger) => {
      trigger.addEventListener('click', this.triggerClick.bind(this));
    });
  }

  destroy() {
    this.events.unregisterAll();

    try {
      this.photoswipe?.destroy();
    } catch (e) {
      // Ignore "Cannot read properties of null" error since it means photoswipe was already destroyed
      // Appears to be bug in photoswipe
      if (
        !(
          e instanceof TypeError &&
          e.message.includes('Cannot read properties of null')
        )
      ) {
        throw e;
      }
    }

    this.templateEl.remove();
  }

  initPhotoswipe(index = 0) {
    this.onOpen();

    let options = {
      index: index,
      barsSize: { top: 0, bottom: 75 },
      captionEl: false,
      fullscreenEl: false,
      zoomEl: false,
      shareEl: false,
      counterEl: false,
      arrowEl: false,
      preloaderEl: false,
      closeOnScroll: false,
      showHideOpacity: true,
      history: false,
      loop: true,
      clickToCloseNonZoomable: false,
      timeToIdle: false,
      timeToIdleOutside: false,
    };

    if (this.thumbnails.length > 1) {
      options.getThumbBoundsFn = () => {
        const pageYScroll =
          window.pageYOffset || document.documentElement.scrollTop;
        const activeImage = this.images[this.photoswipe.getCurrentIndex()];
        const bounds = activeImage.getBoundingClientRect();
        return { x: bounds.left, y: bounds.top + pageYScroll, w: bounds.width };
      };
    }

    this.photoswipe = new PhotoSwipe(
      this.templateEl,
      PhotoSwipeUI_Default,
      this.items,
      options
    );
    this.photoswipe.init();

    // Doesn't need imageLoadComplete
    this.thumbScroller.innerHTML = '';
    if (this.thumbnails.length > 1) {
      this.initThumbnails(index);
    }

    this.onLoadAndOpen(index);

    this.photoswipe.listen('resize', () => {
      this.photoswipe.close();
    });
    this.photoswipe.listen('close', () => {
      this.onClose();
      this.cleanupFocusTrap();
    });
    this.events.register(this.closeButton, 'click', () =>
      this.photoswipe.close()
    );
  }

  onLoadAndOpen(index = 0) {
    if (this.thumbnails.length > 1) {
      this.lightboxThumbnails[index].focus();
    } else {
      this.scrollPrevButton.disabled = true;
      this.scrollNextButton.disabled = true;
      this.closeButton.focus();
    }
    this.setFocusTrap(this.templateEl);
  }

  setFocusTrap(container) {
    const focusableElements = container.querySelectorAll(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusableElement = focusableElements[0];
    const lastFocusableElement =
      focusableElements[focusableElements.length - 1];

    // Handle tab key press
    this.events.register(container, 'keydown', (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          // If shift + tab and on first element, move to last element
          if (document.activeElement === firstFocusableElement) {
            e.preventDefault();
            lastFocusableElement.focus();
          }
        } else {
          // If tab and on last element, move to first element
          if (document.activeElement === lastFocusableElement) {
            e.preventDefault();
            firstFocusableElement.focus();
          }
        }
      }
    });
  }

  cleanupFocusTrap() {
    // Restore focus to the element that was focused before opening the lightbox
    if (this.lastFocusedElement) {
      this.lastFocusedElement.focus();
    }
  }

  initThumbnails(index = 0) {
    this.cloneThumbnails();
    this.setActiveThumbnail(index);
    this.scrollToThumbnail(index);
    this.updateScrollButtons();

    this.photoswipe.listen('afterChange', () => {
      const index = this.photoswipe.getCurrentIndex();
      this.setActiveThumbnail(index);
      this.scrollToThumbnail(index);
    });

    this.events.register(this.scrollPrevButton, 'click', () =>
      this.scroll('prev')
    );
    this.events.register(this.scrollNextButton, 'click', () =>
      this.scroll('next')
    );
    this.events.register(
      this.thumbScroller,
      'scroll',
      this.updateScrollButtons.bind(this)
    );
  }

  cloneThumbnails() {
    this.lightboxThumbnails = [];
    this.thumbnails.forEach((thumb, thumbIndex) => {
      const newThumb = thumb.cloneNode(true);
      newThumb.querySelector('img').setAttribute('loading', 'eager');

      this.lightboxThumbnails.push(newThumb);

      const wrappedThumb = document.createElement('div');
      wrappedThumb.classList.add('product-gallery--media-thumbnail');
      wrappedThumb.appendChild(newThumb);

      this.thumbScroller.appendChild(wrappedThumb);
      this.events.register(newThumb, 'click', () => {
        this.goTo(thumbIndex);
      });
      this.events.register(newThumb, 'keydown', (e) => {
        if (e.keyCode === 13 || e.keyCode === 32) {
          e.preventDefault();
          this.goTo(thumbIndex);
        }
      });
    });
  }

  updateScrollButtons() {
    const { scrollLeft, scrollWidth, clientWidth } = this.thumbScroller;
    const isAtStart = scrollLeft <= 0;
    const isAtEnd = scrollLeft >= scrollWidth - clientWidth;

    this.scrollPrevButton.disabled = isAtStart;
    this.scrollNextButton.disabled = isAtEnd;
  }

  scroll(direction) {
    const currentScroll = this.thumbScroller.scrollLeft;
    const scrollAmount = 400;
    let targetScroll;

    if (direction === 'prev') {
      targetScroll = Math.max(0, currentScroll - scrollAmount);
    } else if (direction === 'next') {
      const maxScroll =
        this.thumbScroller.scrollWidth - this.thumbScroller.clientWidth;
      targetScroll = Math.min(maxScroll, currentScroll + scrollAmount);
    }

    this.thumbScroller.scrollTo({
      left: targetScroll,
      behavior: 'smooth',
    });
  }

  scrollToThumbnail(index) {
    this.lightboxThumbnails[index].scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }

  setActiveThumbnail(index) {
    this.thumbScroller
      .querySelector(`.${THUMBNAIL_ACTIVE_CLASS}`)
      ?.classList.remove(THUMBNAIL_ACTIVE_CLASS);
    this.lightboxThumbnails[index].classList.add(THUMBNAIL_ACTIVE_CLASS);
    this.lightboxThumbnails[index].focus();
  }

  goTo(index) {
    this.photoswipe.goTo(index);
  }

  triggerClick(evt) {
    const mediaId = evt.currentTarget.dataset.photoswipeTriggerFor;
    const index = [...this.images].findIndex(
      (media) => media.dataset.photoswipeId === mediaId
    );

    this.unload();
    this.lastFocusedElement = evt.target;
    this.initPhotoswipe(index);
  }

  getTemplateEl() {
    const pswpEl = document.getElementById('pswp');
    if (pswpEl) return pswpEl;

    const templateEl = document.querySelector('.photoswipe-template');
    if (!templateEl) {
      console.error('Photoswipe template not found');
      return;
    }

    const clone = templateEl.content.cloneNode(true);
    document.body.appendChild(clone);
    return document.getElementById('pswp');
  }

  getImageData() {
    return [...this.images].map((el) => ({
      src: el.getAttribute('data-photoswipe-src'),
      w: el.getAttribute('data-photoswipe-width'),
      h: el.getAttribute('data-photoswipe-height'),
    }));
  }

  unload() {
    this.events.unregisterAll();
    this.cleanupFocusTrap();
  }
}
