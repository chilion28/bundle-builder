(function () {
  'use strict';

  var fallbackClickTimer = null;
  var retryingCancel = false;

  function finishClosingTransitions(search) {
    if (!search) return;

    // Empire manages the search panel and page dimmer with separate transitions.
    // Mobile browsers can swallow either transitionend, so settle both through
    // Empire's own handlers rather than removing classes out from under them.
    window.setTimeout(function () {
      if (document.body.classList.contains('mobile-search-takeover-active')) {
        search.dispatchEvent(new Event('transitionend'));
      }

      var dimmer = document.querySelector('[data-site-main-dimmer]');
      if (dimmer && dimmer.getAttribute('data-animation') === 'open=>closed') {
        dimmer.dispatchEvent(new Event('transitionend'));
      }
    }, 180);
  }

  document.addEventListener('pointerup', function (event) {
    var opener = event.target.closest('[data-mobile-search-button]');
    if (!opener) return;

    window.clearTimeout(fallbackClickTimer);
    fallbackClickTimer = window.setTimeout(function () {
      if (!document.body.classList.contains('mobile-search-takeover-active')) {
        opener.click();
      }
    }, 180);
  }, true);

  document.addEventListener('click', function (event) {
    if (event.target.closest('[data-mobile-search-button]')) {
      window.clearTimeout(fallbackClickTimer);
      return;
    }

    var cancel = event.target.closest('[data-live-search-takeover-cancel]');
    if (!cancel) return;

    var search = cancel.closest('[data-live-search]');

    // A very fast Cancel can arrive before Empire has committed its internal
    // state to "open". Its first close call then returns early. Retry once
    // after that opening frame so the normal close + dimmer clear paths run.
    if (!retryingCancel) {
      window.setTimeout(function () {
        if (!document.body.classList.contains('mobile-search-takeover-active')) return;
        retryingCancel = true;
        cancel.click();
        retryingCancel = false;
      }, 70);
    }

    finishClosingTransitions(search);
  }, true);
}());
