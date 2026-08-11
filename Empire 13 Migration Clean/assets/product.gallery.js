import 'vendor.drift-zoom';
import Swiper from 'vendor.swiper';
import Lightbox from 'lightbox';
import EventHandler from 'util.events';

const MOBILE_MAX_WIDTH = 720;
const TABLET_MAX_WIDTH = 1024;

const BREAKPOINTS = {
  MOBILE: window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`),
  TABLET: window.matchMedia(`(max-width: ${TABLET_MAX_WIDTH}px)`),
};

class ProductGallery extends HTMLElement {
  connectedCallback() {
    // Do nothing if we are just showing a placeholder
    if (this.hasAttribute('placeholder')) return;

    this.thumbnailEvents = new EventHandler();
    this.modelEvents = new EventHandler();
    this.swiper = null;
    this.thumbnailsSwiper = null;
    this.initialSlide = parseInt(this.getAttribute('initial-slide'), 10) || 0;
    this.thumbnailPosition = this.getAttribute('thumbnail-position');
    this.thumbnailLayout = this.getAttribute('thumbnail-layout');
    this.imageHoverZoom = this.getAttribute('image-hover-zoom');
    this.imageClickToZoom = this.getAttribute('image-click-to-zoom');
    this.isCarousel = this.hasAttribute('carousel');
    this.isMobile = BREAKPOINTS.MOBILE.matches;
    this.isTabletOrSmaller = BREAKPOINTS.TABLET.matches;

    // Store references to event handlers so we can remove them later
    this.mobileHandler = () => {
      this.isMobile = BREAKPOINTS.MOBILE.matches;
      this.#onResize();
    };
    this.tabletHandler = () => {
      this.isTabletOrSmaller = BREAKPOINTS.TABLET.matches;
      this.#onResize();
    };

    // Watch for viewport changes
    BREAKPOINTS.MOBILE.addEventListener('change', this.mobileHandler);
    BREAKPOINTS.TABLET.addEventListener('change', this.tabletHandler);

    // Setup everything by invoking the resize handler
    this.#onResize();
  }

  disconnectedCallback() {
    BREAKPOINTS.MOBILE.removeEventListener('change', this.mobileHandler);
    BREAKPOINTS.TABLET.removeEventListener('change', this.tabletHandler);

    this.#destroyLightbox();
    this.#destroyHoverZoom();
    this.#destroySwiper();
    this.#destroyThumbnails();
  }

  showVariantMedia(variant) {
    if (!variant.featured_media) return;

    this.#showMediaAtIndex(variant.featured_media.position - 1);
  }

  get #thumbnailsOrientation() {
    if (this.isMobile) return 'horizontal';

    return this.thumbnailPosition === 'left' ? 'vertical' : 'horizontal';
  }

  #showMediaAtIndex(index) {
    this.swiper?.slideTo(index);
  }

  #showThumbnailAtIndex(index) {
    // If we are using a swiper for thumbnails, we don't need to show the thumbnail
    // as the main swiper will automatically show the correct thumbnail
    if (this.thumbnailsSwiper) return;

    const thumbnails = this.querySelectorAll('[data-swiper-thumbnail]');
    const activeClass = 'swiper-slide-thumb-active';
    const prevActiveThumb = this.querySelector(`.${activeClass}`);

    prevActiveThumb?.classList.remove(activeClass);
    prevActiveThumb?.firstElementChild?.blur(); // TODO:Kludge as we shouldn't access the child component

    thumbnails[index].classList.add(activeClass);
  }

  #onResize() {
    this.#destroyLightbox();
    this.#setupLightbox();

    // No need to initialize anything other than the hover zoom
    // if we are not dealing with a carousel
    if (!this.isCarousel) {
      // This creates a hard dependency on the media element
      // This means if the media element is changed, we need to update this code
      const image = this.querySelector('.media__image');

      if (image) {
        this.#destroyHoverZoom();
        this.#setupHoverZoom(image);
      }

      return;
    }

    if (this.isCarousel) this.#onResizeCarousel();
  }

  #onResizeCarousel() {
    this.#destroyModelListeners();
    this.#destroySwiper();
    this.#destroyThumbnails();

    this.#setupModelListeners();
    this.#setupThumbnails();
    this.#setupSwiper();
  }

  #destroyModelListeners() {
    this.modelEvents.unregisterAll();
  }

  #setupModelListeners() {
    this.querySelectorAll('model-viewer').forEach((model) => {
      this.modelEvents.register(
        model,
        'shopify_model_viewer_ui_toggle_play',
        () => {
          if (!this.swiper) return;

          this.swiper.detachEvents();
        }
      );

      this.modelEvents.register(
        model,
        'shopify_model_viewer_ui_toggle_pause',
        () => {
          if (!this.swiper) return;

          this.swiper.attachEvents();
        }
      );
    });
  }

  #destroySwiper() {
    if (!this.swiper) return;

    this.swiper.destroy();
    this.swiper = null;
  }

  #setupSwiper() {
    const options = {
      initialSlide: this.initialSlide,
      autoHeight: !this.hasAttribute('image-crop'),
      on: {
        afterInit: (swiper) => this.#handleSlideChange(swiper),
        slideChange: (swiper) => this.#handleSlideChange(swiper),
      },
      keyboard: {
        enabled: true,
      },
      updateOnWindowResize: true,
      allowTouchMove: this.isMobile,
      speed: !this.isMobile ? 0 : undefined,
    };

    if (this.thumbnailsSwiper) {
      options.thumbs = {
        swiper: this.thumbnailsSwiper,
      };
    }

    this.swiper = new Swiper(
      this.querySelector('[data-swiper-viewer]'),
      options
    );
  }

  #destroyThumbnails() {
    this.#destroyThumbnailsSwiper();
    this.#destroyThumbnailsGrid();
  }

  #setupThumbnails() {
    if (
      this.isMobile ||
      this.thumbnailLayout === 'carousel' ||
      this.thumbnailPosition === 'left'
    ) {
      this.#setupThumbnailsSwiper();
    } else {
      this.#setupThumbnailsGrid();
    }
  }

  #destroyThumbnailsSwiper() {
    if (!this.thumbnailsSwiper) return;

    this.thumbnailsSwiper.destroy();
    this.thumbnailsSwiper = null;
  }

  #setupThumbnailsSwiper() {
    const options = {
      navigation: {
        nextEl: this.querySelector('[data-swiper-next]'),
        prevEl: this.querySelector('[data-swiper-prev]'),
      },
      mousewheel: {
        enabled: true,
      },
      keyboard: {
        enabled: true,
      },
      slidesPerView: 'auto',
      freeMode: true,
      direction: this.#thumbnailsOrientation,
      watchSlidesProgress: true,
      updateOnWindowResize: true,
    };

    this.thumbnailsSwiper = new Swiper(
      this.querySelector('[data-swiper-navigation]'),
      options
    );
  }

  #destroyThumbnailsGrid() {
    this.thumbnailEvents.unregisterAll();
  }

  #setupThumbnailsGrid() {
    this.#showThumbnailAtIndex(this.initialSlide);

    const thumbnails = this.querySelectorAll('[data-swiper-thumbnail]');

    thumbnails.forEach((thumb, thumbIndex) => {
      const onThumbnailClick = () => this.#showMediaAtIndex(thumbIndex);
      const onThumbnailKeyDown = (e) => {
        // Return early if key pressed is not Enter (13) or Space (32)
        if (!(e.keyCode === 13 || e.keyCode === 32)) return;

        e.preventDefault();

        this.#showMediaAtIndex(thumbIndex);
      };

      this.thumbnailEvents.register(thumb, 'click', onThumbnailClick);
      this.thumbnailEvents.register(thumb, 'keydown', onThumbnailKeyDown);
    });
  }

  #handleSlideChange(swiper) {
    const activeMedia = swiper.slides[swiper.activeIndex];
    const previousMedia = swiper.slides[swiper.previousIndex];

    this.#showThumbnailAtIndex(swiper.activeIndex);

    switch (activeMedia.dataset.mediaType) {
      case 'image':
        // TODO: Find a better way to support this.
        // This creates a hard dependency on the media element
        // This means if the media element is changed, we need to update this code
        this.#setupHoverZoom(activeMedia.querySelector('.media__image'));
        break;
      default:
        break;
    }

    switch (previousMedia?.dataset?.mediaType) {
      case 'model':
        // On initial load, Shopify.ModelViewerUI is not defined and causes a race condition error
        // so we need to check for it
        if (!Shopify.ModelViewerUI) return;

        // Ensure the swiper can be interacted with by pausing the previous model
        // We should probably just keep a reference to each of the model viewer UI instances
        // to avoid having to re-initialize them on each slide change
        new Shopify.ModelViewerUI(
          previousMedia.querySelector('model-viewer')
        ).pause();
        break;
      default:
        break;
    }
  }

  #destroyLightbox() {
    if (!this.lightbox) return;

    this.lightbox.destroy();
    this.lightbox = null;
  }

  #setupLightbox() {
    if (this.imageClickToZoom === 'disabled') return;
    if (this.imageClickToZoom === 'mobile' && !this.isMobile) return;
    if (this.imageClickToZoom === 'desktop' && this.isMobile) return;

    const triggers = this.querySelectorAll('[data-photoswipe-trigger-for]');
    const images = this.querySelectorAll('[data-photoswipe-image]');
    const thumbnails = this.querySelectorAll('[data-photoswipe-thumb]');
    const onClose = () => this.drift?.enable();
    const onOpen = () => this.drift?.disable();

    if (triggers.length < 1 || images.length < 1) return;

    this.lightbox = new Lightbox(triggers, images, thumbnails, {
      events: { onOpen, onClose },
    });
  }

  #destroyHoverZoom() {
    if (!this.drift) return;

    this.drift.destroy();
    this.drift = null;
  }

  #setupHoverZoom(image) {
    if (this.imageHoverZoom === 'disabled' || this.isTabletOrSmaller) return;

    const mediaEl = image.closest('.media');
    const mediaWidth = mediaEl.offsetWidth;
    const mediaHeight = mediaEl.offsetHeight;
    const imageWidth = image.offsetWidth;
    const imageHeight = image.offsetHeight;

    if (imageWidth < mediaWidth || imageHeight < mediaHeight) return;

    const options = {
      handleTouch: false,
      paneContainer: mediaEl,
    };

    if (this.imageHoverZoom === 'separate') {
      options.paneContainer = this.querySelector('[data-zoom-container]');
      options.inlinePane = false;
      options.hoverBoundingBox = true;
      options.onShow = () => {
        const productMain = document.querySelector('.product-main');
        const productAlt = document.querySelector('.product-form--alt');

        productMain?.classList.add('product-gallery--fade');
        productAlt?.classList.add('product-gallery--fade');
      };
      options.onHide = () => {
        const productMain = document.querySelector('.product-main');
        const productAlt = document.querySelector('.product-form--alt');

        productMain?.classList.remove('product-gallery--fade');
        productAlt?.classList.remove('product-gallery--fade');
      };
    }

    this.drift = new Drift(image, options);
  }
}

customElements.define('product-gallery', ProductGallery);
