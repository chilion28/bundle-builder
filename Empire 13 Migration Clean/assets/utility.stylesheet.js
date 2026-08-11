class ThemeStyleSheet extends HTMLElement {
  // Tracks all registered stylesheets by name
  static registeredStyles = new Map()

  connectedCallback() {
    this.name = this.getAttribute('name')
    this.removeDuplicate = this.getAttribute('remove-duplicate') === 'true'
    this.load = this.getAttribute('load')
    this.isRemovedDueToDuplicate = false

    if (!this.name) {
      console.warn('ThemeStyleSheet: Missing required "name" attribute')
      return
    }

    if (!ThemeStyleSheet.registeredStyles.has(this.name)) {
      ThemeStyleSheet.registeredStyles.set(this.name, new Set())
    }

    ThemeStyleSheet.registeredStyles.get(this.name).add(this)
    this.queueCleanup()
  }

  disconnectedCallback() {
    if (this.isRemovedDueToDuplicate) {
      return
    }

    const stylesForName = ThemeStyleSheet.registeredStyles.get(this.name)
    if (stylesForName) {
      stylesForName.delete(this)

      if (stylesForName.size === 0) {
        ThemeStyleSheet.registeredStyles.delete(this.name)
      }
    }
  }

  // Handles duplicate stylesheets by keeping only one instance
  queueCleanup() {
    setTimeout(() => {
      const stylesForName = ThemeStyleSheet.registeredStyles.get(this.name)

      if (!stylesForName?.size || stylesForName.size <= 1) {
        return
      }

      // Prioritize inline styles, otherwise use the first one
      const styleToKeep =
        Array.from(stylesForName).find((style) => style.load === 'inline') || Array.from(stylesForName)[0]

      stylesForName.forEach((style) => {
        if (style !== styleToKeep && style.removeDuplicate) {
          stylesForName.delete(style)
          style.isRemovedDueToDuplicate = true
          style.remove()
        }
      })
    }, 0)
  }
}

customElements.define('style-sheet', ThemeStyleSheet)
