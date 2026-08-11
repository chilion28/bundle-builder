import BaseMedia from 'element.base-media'
import { loadScript } from 'util.resource-loader'

const onYouTubePromise = new Promise((resolve) => {
  window.onYouTubeIframeAPIReady = () => resolve()
})

export class VideoMedia extends BaseMedia {
  connectedCallback() {
    super.connectedCallback()

    if (!this.autoplay) {
      this.addEventListener('click', this.play.bind(this), { once: true })
    }

    this.handleReducedMotion();
  }

  handleReducedMotion() {
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    
    if (prefersReducedMotion && this.hasAttribute('autoplay')) {
      this.removeAttribute('autoplay');

      // Wait for the component to be fully initialized
      setTimeout(() => {
        // For Shopify hosted videos
        const nativeVideo = this.querySelector('video');
        if (nativeVideo) {
          nativeVideo.removeAttribute('autoplay');
          nativeVideo.setAttribute('controls', '');
        }

        // For YouTube/Vimeo videos
        const iframe = this.querySelector('iframe');
        if (iframe && iframe.src.includes('autoplay=1')) {
          iframe.src = iframe.src.replace(/[?&]autoplay=1[^&]*/g, '');
        }
      }, 100);
    }
  }

  getPlayerTarget() {
    this.setAttribute('loaded', '')

    if (this.host) {
      return this.setupThirdPartyVideoElement()
    } else {
      return this.setupNativeVideoElement()
    }
  }

  playerHandler(target, prop) {
    if (this.host === 'youtube') {
      prop === 'play' ? target.playVideo() : target.pauseVideo()
    } else {
      target[prop]()
    }
  }

  async setupThirdPartyVideoElement() {
    let player
    const template = this.querySelector('template')

    if (template) {
      template.replaceWith(template.content.firstElementChild.cloneNode(true))
    }

    if (this.host === 'youtube') {
      player = await this.setupYouTubePlayer()
    } else {
      player = await this.setupVimeoPlayer()
    }

    return player
  }

  setupNativeVideoElement() {
    const video = this.querySelector('video')

    video.addEventListener('play', () => {
      this.setAttribute('playing', '')
    })

    video.addEventListener('pause', () => {
      if (video.paused && !video.seeking) {
        this.removeAttribute('playing')
      }
    })

    if (this.autoplay) {
      video.addEventListener('click', () => {
        if (video.paused) {
          video.play()
        } else {
          video.pause()
        }
      })
    }

    return video
  }

  setupYouTubePlayer() {
    return new Promise(async (resolve) => {
      if (!window.YT?.Player) {
        await loadScript('https://www.youtube.com/iframe_api')
      }

      await onYouTubePromise

      const player = new YT.Player(this.querySelector('iframe'), {
        events: {
          onReady: () => {
            resolve(player)
          },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.PLAYING) {
              this.setAttribute('playing', '')
            } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
              this.removeAttribute('playing')
            }
          }
        }
      })
    })
  }

  setupVimeoPlayer() {
    return new Promise(async (resolve) => {
      if (!window.Vimeo?.Player) {
        await loadScript('https://player.vimeo.com/api/player.js')
      }

      const player = new Vimeo.Player(this.querySelector('iframe'))

      player.on('play', () => this.setAttribute('playing', ''))
      player.on('pause', () => this.removeAttribute('playing'))
      player.on('ended', () => this.removeAttribute('playing'))

      resolve(player)
    })
  }

  get host() {
    return this.getAttribute('host')
  }
}

// Support for redundant inline scripts in TUA
function defineElement(elementName, elementClass) {
  if (!customElements.get(elementName)) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        if (!customElements.get(elementName))
          customElements.define(elementName, elementClass);
      });
    } else {
      customElements.define(elementName, elementClass);
    }
  }
}

defineElement('video-media', VideoMedia)
