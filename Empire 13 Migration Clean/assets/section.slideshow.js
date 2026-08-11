import Swiper from 'vendor.swiper';

class SectionSlideshow extends HTMLElement {
  constructor() {
    super();
    this.slideshowWrapper = this.querySelector('[data-slideshow-wrapper]');
    this.slides = this.querySelectorAll('[data-slideshow-slide]');
    this.pagination = this.querySelector('[data-slideshow-pagination]');
    this.swiper = null;
    this.settings = {};
    this.autoplayActive = false;
    this.header = document.querySelector('.site-header');
    this.announcementBar = document.querySelector('.announcement-bar');
    this.isInitialized = false;
    this.isVisible = false;
    this.intersectionObserver = null;
    this.lastSelectedBlock = null;
    this.resizeTimer = null;
    this.lastWindowWidth = window.innerWidth;
    this.autoplayStartTime = 0;
    this.isResizing = false;
    this.customAutoplayTimer = null;
    this.userInteracted = false;
    this.touchMoveCount = 0;
    this.isThemeEditor =
      typeof window.Shopify !== 'undefined' && window.Shopify.designMode;
    this.keyboardNavUsed = false;
  }

  connectedCallback() {
    this.settings = {
      enable_autoplay: this.getAttribute('enable-autoplay') === 'true',
      autoplay_interval:
        parseInt(this.getAttribute('autoplay-interval'), 10) || 8,
      mobile_navigation_adjust:
        this.getAttribute('mobile-navigation-adjust') === 'true',
      slideshow_animation: this.getAttribute('slideshow-animation') || 'slide',
      slide_attraction:
        parseFloat(this.getAttribute('slide-attraction')) || 0.03,
      slide_friction: parseFloat(this.getAttribute('slide-friction')) || 0.3,
      slide_transition_speed:
        parseInt(this.getAttribute('slide-transition-speed'), 10) || 400,
      show_navigation_arrows:
        this.getAttribute('show-navigation-arrows') === 'true',
      slideshow_text_animation:
        this.getAttribute('slideshow-text-animation') || 'none',
      navigation_arrows_style:
        this.getAttribute('navigation-arrows-style') || 'normal',
    };

    this._setupVisibilityDetection();

    if (this.slides.length <= 1) {
      this._handleSingleSlide();
    } else {
      this._prepareForSwiper();
      this._initSwiper();
    }

    // Fit screen
    if (
      this.classList.contains('slideshow--height-fit-screen') ||
      this.classList.contains('slideshow--height-fit-screen-mobile')
    ) {
      this._setupCSSVariables();
      this._positionNavigation();
    }

    window.addEventListener('resize', this._handleResize.bind(this));
    window.addEventListener('keydown', this._handleTabNavigation.bind(this));

    //  This needs to update when viewed on mobile layout and the text is positioned below in Theme editor.
    if (this.isThemeEditor) {
      if (
        this.classList.contains('slideshow--text-below-image-true') &&
        window.innerWidth < 720
      ) {
        setTimeout(() => {
          if (this.swiper) {
            this.swiper.update();
          }
        }, 1000);
      }
    }
  }

  _handleTabNavigation(event) {
    const isTabKey = event.key === 'Tab';

    if (isTabKey && this.keyboardNavUsed) {
      event.preventDefault();
      this.keyboardNavUsed = false;

      const activeSlide = this.swiper?.slides[this.swiper.activeIndex];
      if (!activeSlide) return;

      const focusTargets = [
        activeSlide.querySelector('.slideshow-slide__background-link'),
        activeSlide.querySelector(
          'a[href]:not(.slideshow-slide__background-link), button:not([disabled])'
        ),
        this.querySelector('.swiper-button-prev'),
      ];

      const target = focusTargets.find((el) => el);
      if (target) target.focus();

      this._updateTabIndexes();
    }
  }

  _updateTabIndexes() {
    if (!this.swiper) return;

    this.swiper.slides.forEach((slide, index) => {
      const isActiveSlide = index === this.swiper.activeIndex;
      const tabIndex = isActiveSlide ? '0' : '-1';
      const focusableElements = slide.querySelectorAll(
        'a[href], button:not([disabled])'
      );
      focusableElements.forEach((element) => {
        element.setAttribute('tabindex', tabIndex);
      });
    });

    const navTabIndex = this.keyboardNavUsed ? '-1' : '0';

    const navElements = [];
    const prevButton = this.querySelector('.swiper-button-prev');
    if (prevButton) navElements.push(prevButton);

    const nextButton = this.querySelector('.swiper-button-next');
    if (nextButton) navElements.push(nextButton);

    if (this.pagination) {
      const paginationButtons = this.pagination.querySelectorAll(
        '.slideshow-pagination__button'
      );
      paginationButtons.forEach((button) => navElements.push(button));
    }
    navElements.forEach((element) => {
      element.setAttribute('tabindex', navTabIndex);
    });
  }

  _handleResize() {
    clearTimeout(this.resizeTimer);

    this.isResizing = true;

    const currentWidth = window.innerWidth;
    const isMobileNow = currentWidth < 720;
    const wasMobile = this.lastWindowWidth < 720;
    const breakpointChanged = wasMobile !== isMobileNow;

    this.resizeTimer = setTimeout(() => {
      this._setupCSSVariables();
      this._positionNavigation();

      if (this.swiper) {
        this.swiper.update();

        if (breakpointChanged) {
          const currentSlide = this.swiper.slides[this.swiper.activeIndex];
          if (currentSlide) {
            const elements = currentSlide.querySelectorAll('.slide-element');
            elements.forEach((element, index) => {
              element.style.setProperty('--slide-element-index', index);
            });

            if (!currentSlide.classList.contains('slide--active')) {
              currentSlide.classList.add('slide--active');
            }

            if (
              this.slideshowWrapper.classList.contains(
                'slideshow--content-hidden'
              )
            ) {
              this._showActiveContent();
            }
          }
        }
      }

      this._setContentHeight();

      this.isResizing = false;
      this.lastWindowWidth = currentWidth;
    }, 300);
  }

  _setupVisibilityDetection() {
    if ('IntersectionObserver' in window) {
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          const isIntersecting = entries[0].isIntersecting;

          if (isIntersecting && !this.isVisible) {
            this.isVisible = true;
            this._onBecomeVisible();

            const animationClass = this.getAttribute('data-scroll-class');
            if (animationClass && animationClass !== 'none') {
              this.classList.add('animated');
              this.classList.add(animationClass);
            }

            if (
              this.swiper &&
              this.classList.contains('slideshow--text-below-image-true') &&
              window.innerWidth < 720
            ) {
              setTimeout(() => {
                this.swiper.update();
              }, 300);
            }
          } else if (!isIntersecting && this.isVisible) {
            this.isVisible = false;
          }
        },
        {
          root: null,
          rootMargin: '0px',
          threshold: 0.3,
        }
      );

      this.intersectionObserver.observe(this);
    } else {
      this.isVisible = true;
      this._onBecomeVisible();
    }
  }

  _onBecomeVisible() {
    const textAnimation = this.settings.slideshow_text_animation || 'none';

    this.classList.add(`slideshow--text-animation-${textAnimation}`);

    if (this.isInitialized && this.swiper) {
      this._showActiveContent();
    } else if (this.slides.length <= 1) {
      const slide = this.slides[0];
      if (slide) {
        this.classList.add('slideshow--animate');
        slide.classList.add('slide--active');
      }
    }
  }

  _hideAllContents() {
    if (!this.isResizing) {
      this.slideshowWrapper.classList.add('slideshow--content-hidden');
    }
  }

  _showActiveContent() {
    if (!this.isVisible) return;

    this.slideshowWrapper.classList.remove('slideshow--content-hidden');

    const activeSlide = this.swiper?.slides[this.swiper.activeIndex];
    if (!activeSlide) return;

    if (activeSlide.dataset.textColor) {
      this.style.setProperty(
        '--slide-text-color',
        activeSlide.dataset.textColor
      );
    }

    this.classList.add('slideshow--animate');
    activeSlide.classList.add('slide--active');

    this._setContentHeight();
    this._positionNavigation();
    this._updateTabIndexes();
  }

  _setupCSSVariables() {
    const currentHeaderHeight = this.header?.offsetHeight || 0;
    const currentAnnouncementHeight = this.announcementBar?.offsetHeight || 0;

    this.style.setProperty(
      '--header-height',
      `${currentHeaderHeight - currentAnnouncementHeight}px`
    );
    this._setContentHeight();

    if (this.swiper) {
      this.swiper.update();
    }
  }

  _setContentHeight() {
    if (!this.swiper) return;

    const currentSlide = this.swiper.slides[this.swiper.activeIndex];
    const slideContent = currentSlide?.querySelector(
      '.slideshow-slide__content'
    );

    if (!slideContent) return;

    const styles = window.getComputedStyle(slideContent);
    const margin =
      parseFloat(styles.marginTop) + parseFloat(styles.marginBottom);
    const contentHeight = Math.ceil(slideContent.offsetHeight + margin);

    this.style.setProperty('--content-height', `${contentHeight}px`);
  }

  _positionNavigation() {
    if (!this.pagination) return;

    // Adjust navigation position on mobile.
    if (this.settings.mobile_navigation_adjust && window.innerWidth < 720) {
      const activeSlide = this.swiper?.slides[this.swiper.activeIndex];
      if (!activeSlide) return;

      const imageWrapper = activeSlide.querySelector(
        '.slideshow-slide__image-wrapper'
      );
      if (!imageWrapper) return;

      const isTextBelowImage = this.classList.contains(
        'slideshow--text-below-image-true'
      );

      if (isTextBelowImage) {
        const imageHeight = imageWrapper.offsetHeight;
        this.style.setProperty('--image-height', `${imageHeight}px`);

        this.pagination.style.removeProperty('top');
      } else {
        this.pagination.style.removeProperty('top');
      }
    } else {
      this.pagination.style.removeProperty('top');
    }
  }

  _handleSingleSlide() {
    if (!this.slideshowWrapper || !this.slides[0]) return;

    if (this.pagination) {
      this.pagination.style.display = 'none';
    }

    const slide = this.slides[0];

    if (slide.dataset.textColor) {
      this.style.setProperty('--slide-text-color', slide.dataset.textColor);
    }

    slide.classList.add('slide');

    // Set animation classes on elements within the slide.
    const elements = slide.querySelectorAll('.slide-element');

    elements.forEach((element, elementIndex) =>
      element.style.setProperty('--slide-element-index', elementIndex)
    );

    // Start the animation when it enters the viewport.
    if (this.isVisible) {
      this.classList.add('slideshow--animate');
      slide.classList.add('slide--active');
    }
  }

  _prepareForSwiper() {
    if (
      !this.slideshowWrapper ||
      this.slideshowWrapper.classList.contains('swiper-initialized')
    )
      return;

    this.slideshowWrapper.classList.add('swiper');

    const originalSlides = Array.from(this.slides);
    if (originalSlides.length === 0) return;

    const swiperWrapper = document.createElement('div');
    swiperWrapper.className = 'swiper-wrapper';

    this.slideshowWrapper.innerHTML = '';
    this.slideshowWrapper.appendChild(swiperWrapper);

    originalSlides.forEach((slide, slideIndex) => {
      const slideClone = slide.cloneNode(true);
      slideClone.classList.add('swiper-slide');

      // Set up classes and variables for animation.
      slideClone.classList.add('slide');
      slideClone.style.setProperty('--slide-index', slideIndex);

      // Set animation classes on elements within the slide.
      const elements = slideClone.querySelectorAll('.slide-element');

      elements.forEach((element, elementIndex) =>
        element.style.setProperty('--slide-element-index', elementIndex)
      );

      swiperWrapper.appendChild(slideClone);
    });

    if (this.settings.show_navigation_arrows) {
      const prevButton = document.createElement('div');
      prevButton.className = 'swiper-button-prev';
      prevButton.setAttribute('tabindex', '0');
      prevButton.setAttribute('role', 'button');
      prevButton.setAttribute('aria-label', 'Previous slide');

      const nextButton = document.createElement('div');
      nextButton.className = 'swiper-button-next';
      nextButton.setAttribute('tabindex', '0');
      nextButton.setAttribute('role', 'button');
      nextButton.setAttribute('aria-label', 'Next slide');

      // Create SVG elements for circle navigation style
      if (this.settings.navigation_arrows_style === 'circle') {
        // Create previous button SVG
        const prevSvg = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'svg'
        );
        prevSvg.setAttribute('viewBox', '0 0 100 100');

        const prevPath = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'path'
        );
        prevPath.setAttribute(
          'd',
          'M95.04 46 21.68 46 48.18 22.8 42.91 16.78 4.96 50 42.91 83.22 48.18 77.2 21.68 54 95.04 54 95.04 46z'
        );
        prevPath.setAttribute('class', 'arrow');

        prevSvg.appendChild(prevPath);
        prevButton.appendChild(prevSvg);

        // Create next button SVG
        const nextSvg = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'svg'
        );
        nextSvg.setAttribute('viewBox', '0 0 100 100');

        const nextPath = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'path'
        );
        nextPath.setAttribute(
          'd',
          'M95.04 46 21.68 46 48.18 22.8 42.91 16.78 4.96 50 42.91 83.22 48.18 77.2 21.68 54 95.04 54 95.04 46z'
        );
        nextPath.setAttribute('class', 'arrow');
        nextPath.setAttribute('transform', 'translate(100, 100) rotate(180)');

        nextSvg.appendChild(nextPath);
        nextButton.appendChild(nextSvg);
      }

      this.slideshowWrapper.appendChild(prevButton);
      this.slideshowWrapper.appendChild(nextButton);
    }

    if (this.pagination) {
      this.pagination.classList.add('swiper-pagination');

      this.pagination
        .querySelectorAll('.slideshow-pagination__button')
        .forEach((button) => {
          if (button.getAttribute('data-selected') === 'true') {
            button.classList.add('swiper-pagination-bullet-active');
          }
        });

      this.appendChild(this.pagination);
    }

    this.slides = this.slideshowWrapper.querySelectorAll('.swiper-slide');

    this._hideAllContents();
  }

  _initSwiper() {
    if (!this.slides || this.slides.length <= 1) return;

    try {
      const enableAutoplay = this.settings.enable_autoplay || false;
      this.autoplayActive = enableAutoplay;

      const self = this;

      const swiperOptions = {
        autoHeight: true,
        slidesPerView: 1,
        spaceBetween: 0,
        loop: true,
        resistance: true,
        speed: this.settings.slide_transition_speed,
        resistanceRatio: this.settings.slide_friction
          ? 1 - parseFloat(this.settings.slide_friction)
          : 0.7,
        touchRatio: this.settings.slide_attraction
          ? parseFloat(this.settings.slide_attraction) * 10
          : 0.3,
        effect: this.settings.slideshow_animation === 'fade' ? 'fade' : 'slide',
        fadeEffect: { crossFade: true },
        autoplay: false,
        pagination: this.pagination
          ? {
              el: this.pagination,
              clickable: true,
              renderBullet: (index) => {
                const isActive = index === 0;
                let buttonContent = '';

                if (enableAutoplay) {
                  buttonContent = `
                <div class="circle-timer">
                  <svg class="circle-timer__svg">
                    <circle class="circle-timer__countdown" r="3.5" cx="50%" cy="50%"></circle>
                    <circle class="circle-timer__background" r="3.5" cx="50%" cy="50%"></circle>
                  </svg>
                </div>
              `;
                }

                return `
              <li class="slideshow-pagination__dot">
                <button class="slideshow-pagination__button ${isActive ? 'swiper-pagination-bullet-active' : ''}" 
                        data-selected="${isActive ? 'true' : 'false'}" 
                        data-slide-button="${index}">
                  ${buttonContent}
                  <span class="visually-hidden">Slide ${index + 1}</span>
                </button>
              </li>
            `;
              },
            }
          : false,
        navigation: {
          nextEl: '.swiper-button-next',
          prevEl: '.swiper-button-prev',
        },
        on: {
          init: function () {
            self.isInitialized = true;

            if (self.isVisible) {
              setTimeout(() => {
                self._showActiveContent();
              }, 100);
            }
            if (enableAutoplay) {
              self._startCustomAutoplay();
            }
          },
          resize: function () {
            setTimeout(() => {
              self._setContentHeight();
              self._positionNavigation();
            }, 100);
          },
          slideChangeTransitionStart: function () {
            if (!self.isResizing) {
              if (self.settings.slideshow_text_animation !== 'none') {
                self._hideAllContents();
              }
              self.swiper.slides.forEach((slide) => {
                slide.classList.remove('slide--active');
              });
            }

            const nextSlide = this.slides[this.activeIndex];
            if (nextSlide && nextSlide.dataset.textColor) {
              self.style.setProperty(
                '--slide-text-color',
                nextSlide.dataset.textColor
              );
            }
          },
          slideChangeTransitionEnd: function () {
            if (self.isVisible) {
              if (!self.isResizing) {
                self._showActiveContent();
              } else {
                if (
                  self.slideshowWrapper.classList.contains(
                    'slideshow--content-hidden'
                  )
                ) {
                  self._showActiveContent();
                }
              }

              const currentSlide = self.swiper.slides[self.swiper.activeIndex];
              if (currentSlide) {
                currentSlide.classList.add('slide--active');
                const elements =
                  currentSlide.querySelectorAll('.slide-element');
                elements.forEach((element, index) => {
                  element.style.setProperty('--slide-element-index', index);
                });
              }
            }
            self._setContentHeight();
            self._positionNavigation();
            self._updateTabIndexes();

            if (self.keyboardNavUsed) {
              document.activeElement.blur();
            }
          },
          transitionEnd: function () {
            if (self.isVisible) {
              self._showActiveContent();
            }
          },
          touchStart: function () {
            self.touchMoveCount = 0;
          },
          touchMove: function () {
            self.touchMoveCount++;

            // Stop autoplay if the actual swipe movement exceeds a threshold
            if (self.touchMoveCount >= 3 && self.autoplayActive) {
              self._stopCustomAutoplay();
              self.autoplayActive = false;
              self.setAttribute('data-autoplay-active', 'false');
              self.userInteracted = true;
            }
          },
          dragStart: function () {
            if (self.autoplayActive) {
              self._stopCustomAutoplay();
              self.autoplayActive = false;
              self.setAttribute('data-autoplay-active', 'false');
              self.userInteracted = true;
            }
          },
        },
      };

      this.setAttribute('data-autoplay', enableAutoplay);
      this.setAttribute('data-autoplay-active', enableAutoplay);

      this.swiper = new Swiper(this.slideshowWrapper, swiperOptions);

      if (this.swiper) {
        this._setupKeyboardEvents();

        if (enableAutoplay) {
          this._setupAutoplayEvents();
        }

        if (this.pagination) {
          this.swiper.on('slideChange', () => this._updatePaginationState());
          this._updatePaginationState();
        }
      }
    } catch (error) {
      console.error('Swiper initialization error:', error);
    }
  }

  _setupKeyboardEvents() {
    ['.swiper-button-prev', '.swiper-button-next'].forEach((selector) => {
      const button = this.querySelector(selector);
      if (button) {
        button.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.keyboardNavUsed = true;
            selector.includes('prev')
              ? this.swiper.slidePrev()
              : this.swiper.slideNext();
          }
        });
      }
    });

    if (this.pagination) {
      this.pagination.addEventListener('keydown', (e) => {
        if (
          (e.key === 'Enter' || e.key === ' ') &&
          e.target.closest('.slideshow-pagination__button')
        ) {
          e.preventDefault();
          const slideIndex = parseInt(
            e.target.closest('.slideshow-pagination__button').dataset
              .slideButton,
            10
          );
          if (!isNaN(slideIndex)) {
            this.keyboardNavUsed = true;
            this.swiper.slideToLoop(
              slideIndex,
              this.settings.slide_transition_speed
            );
            if (this.autoplayActive) {
              this._stopCustomAutoplay();
              this.autoplayActive = false;
              this.setAttribute('data-autoplay-active', 'false');
              this.userInteracted = true;
            }
          }
        }
      });

      this.pagination.addEventListener('click', (event) => {
        const button = event.target.closest('.slideshow-pagination__button');
        if (button) {
          const slideIndex = parseInt(
            button.getAttribute('data-slide-button'),
            10
          );
          if (!isNaN(slideIndex) && this.swiper) {
            this.swiper.slideToLoop(
              slideIndex,
              this.settings.slide_transition_speed
            );

            if (this.autoplayActive) {
              this._stopCustomAutoplay();
              this.autoplayActive = false;
              this.setAttribute('data-autoplay-active', 'false');
              this.userInteracted = true;
            }
          }
        }
      });
    }
  }

  _setupAutoplayEvents() {
    this.slideshowWrapper.addEventListener('mouseenter', () => {
      if (this.autoplayActive) {
        this.setAttribute('data-hover', 'true');
        this._pauseCustomAutoplay();
      }
    });

    this.slideshowWrapper.addEventListener('mouseleave', () => {
      this.setAttribute('data-hover', 'false');
      if (this.autoplayActive) {
        this._resumeCustomAutoplay();
      }
    });

    this.slideshowWrapper.addEventListener('click', (event) => {
      if (event.target.closest('.swiper-button-prev, .swiper-button-next')) {
        if (this.autoplayActive) {
          this._stopCustomAutoplay();
          this.autoplayActive = false;
          this.setAttribute('data-autoplay-active', 'false');
          this.userInteracted = true;
        }
      }
    });

    this._updateCircleTimer();
  }

  _startCustomAutoplay() {
    if (this.customAutoplayTimer) {
      clearTimeout(this.customAutoplayTimer);
    }

    if (this.userInteracted) {
      return;
    }

    this.autoplayActive = true;
    this.setAttribute('data-autoplay-active', 'true');
    this.autoplayStartTime = Date.now();
    this._updateCircleTimer();

    const autoplayInterval = (this.settings.autoplay_interval || 8) * 1000;

    this.customAutoplayTimer = setTimeout(() => {
      if (this.autoplayActive && this.swiper) {
        this.swiper.slideNext(this.settings.slide_transition_speed);
        setTimeout(
          () => this._startCustomAutoplay(),
          this.settings.slide_transition_speed
        );
      }
    }, autoplayInterval);
  }

  _pauseCustomAutoplay() {
    if (this.customAutoplayTimer) {
      clearTimeout(this.customAutoplayTimer);

      const elapsedTime = Date.now() - this.autoplayStartTime;
      this.remainingTime =
        (this.settings.autoplay_interval || 8) * 1000 - elapsedTime;
      this.autoplayPaused = true;
    }
  }

  _resumeCustomAutoplay() {
    if (this.userInteracted) {
      return;
    }

    if (this.autoplayPaused && this.remainingTime > 0) {
      this.autoplayPaused = false;

      this.customAutoplayTimer = setTimeout(() => {
        if (this.autoplayActive && this.swiper) {
          this.swiper.slideNext(this.settings.slide_transition_speed);
          setTimeout(() => {
            this._startCustomAutoplay();
          }, this.settings.slide_transition_speed);
        }
      }, this.remainingTime);

      this.autoplayStartTime =
        Date.now() -
        ((this.settings.autoplay_interval || 8) * 1000 - this.remainingTime);
      this._updateCircleTimer();
    } else {
      this._startCustomAutoplay();
    }
  }

  _stopCustomAutoplay() {
    if (this.customAutoplayTimer) {
      clearTimeout(this.customAutoplayTimer);
      this.customAutoplayTimer = null;
    }
    this.autoplayActive = false;
    this.setAttribute('data-autoplay-active', 'false');
    this.autoplayPaused = false;
  }

  _updateCircleTimer() {
    const activeButton = this.pagination?.querySelector(
      '.swiper-pagination-bullet-active'
    );

    if (activeButton) {
      const circleTimer = activeButton.querySelector(
        '.circle-timer__countdown'
      );
      if (circleTimer) {
        circleTimer.style.animation = 'none';
        circleTimer.offsetHeight;
        circleTimer.style.animation = `countdown ${this.settings.autoplay_interval || 8}s linear 1`;
      }
    }
  }

  _updatePaginationState() {
    if (!this.swiper || !this.pagination) return;

    const activeIndex = this.swiper.realIndex;
    const buttons = this.pagination.querySelectorAll(
      '.slideshow-pagination__button'
    );

    buttons.forEach((button, index) => {
      const isActive = index === activeIndex;
      button.setAttribute('data-selected', isActive ? 'true' : 'false');
      isActive
        ? button.classList.add('swiper-pagination-bullet-active')
        : button.classList.remove('swiper-pagination-bullet-active');
    });
  }

  onBlockSelect(el) {
    if (!this.swiper) return;

    const slideIndex = parseInt(el.dataset.slideIndex, 10);
    if (!isNaN(slideIndex)) {
      this.swiper.slideToLoop(slideIndex, 0);

      if (this.autoplayActive) {
        this._stopCustomAutoplay();
      }
    }
  }

  onBlockDeselect() {
    if (!this.swiper) return;

    if (this.settings.enable_autoplay && !this.userInteracted) {
      this._startCustomAutoplay();
    }
  }

  disconnectedCallback() {
    if (this.swiper) {
      this.swiper.destroy();
      this.swiper = null;
    }

    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
    }

    if (this.customAutoplayTimer) {
      clearTimeout(this.customAutoplayTimer);
    }

    clearTimeout(this.resizeTimer);
    window.removeEventListener('resize', this._handleResize.bind(this));
    window.removeEventListener('keydown', this._handleTabNavigation.bind(this));
  }
}

if (typeof window.Shopify !== 'undefined' && window.Shopify.designMode) {
  document.addEventListener('shopify:block:select', (event) => {
    const slideshow = event.target.closest('section-slideshow');
    if (slideshow) slideshow.onBlockSelect(event.target);
  });

  document.addEventListener('shopify:block:deselect', (event) => {
    const slideshow = event.target.closest('section-slideshow');
    if (slideshow) slideshow.onBlockDeselect();
  });
}
if (!window.customElements.get('section-slideshow')) {
  customElements.define('section-slideshow', SectionSlideshow);
}
