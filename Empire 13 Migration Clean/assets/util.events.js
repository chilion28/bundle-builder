class EventHandler {
  constructor() {
    this.events = [];
  }

  register(el, event, listener) {
    if (!el || !event || !listener) return null;

    this.events.push({ el, event, listener });
    el.addEventListener(event, listener);
    return { el, event, listener };
  }

  unregister({ el, event, listener }) {
    if (!el || !event || !listener) return null;

    this.events = this.events.filter(
      (e) => el !== e.el || event !== e.event || listener !== e.listener
    );
    el.removeEventListener(event, listener);
    return { el, event, listener };
  }

  unregisterAll() {
    this.events.forEach(({ el, event, listener }) =>
      el.removeEventListener(event, listener)
    );
    this.events = [];
  }
}

export default EventHandler;
