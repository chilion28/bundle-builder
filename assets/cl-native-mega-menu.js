(function () {
  if (window.__CL_NATIVE_MEGA_MENU__) return;
  window.__CL_NATIVE_MEGA_MENU__ = true;

  function closeSiblings(details) {
    var menu = details.closest('[data-cl-native-mega]');
    if (!menu) return;
    menu.querySelectorAll('.cl-native-mega__details[open]').forEach(function (item) {
      if (item !== details) item.removeAttribute('open');
    });
  }

  function positionNestedFlyout(item) {
    if (!item) return;
    var nested = item.querySelector(':scope > .cl-native-mega__flyout--level-2');
    var firstPanel = item.closest('.cl-native-mega__flyout--level-1');
    if (!nested || !firstPanel) return;

    var itemRect = item.getBoundingClientRect();
    var nestedWidth = nested.getBoundingClientRect().width || 258;
    var viewportGap = 8;
    var openToLeft = itemRect.right + nestedWidth > window.innerWidth - viewportGap;
    var naturalHeight = nested.scrollHeight;
    var visibleHeight = Math.min(naturalHeight, window.innerHeight - (viewportGap * 2));
    var highestAllowedTop = window.innerHeight - viewportGap - visibleHeight;
    var nestedTop = Math.max(viewportGap, Math.min(itemRect.top, highestAllowedTop));
    var nestedLeft = openToLeft ? itemRect.left - nestedWidth : itemRect.right;

    nested.style.position = 'fixed';
    nested.style.top = nestedTop + 'px';
    nested.style.left = Math.max(viewportGap, Math.min(nestedLeft, window.innerWidth - nestedWidth - viewportGap)) + 'px';
    nested.style.maxHeight = Math.max(180, window.innerHeight - nestedTop - viewportGap) + 'px';
  }

  document.addEventListener('toggle', function (event) {
    var details = event.target;
    if (!(details instanceof HTMLDetailsElement) || !details.matches('.cl-native-mega__details')) return;
    if (details.open) closeSiblings(details);
  }, true);

  document.addEventListener('pointerover', function (event) {
    if (!window.matchMedia('(min-width: 1024px)').matches) return;
    var item = event.target.closest('.cl-native-mega--desktop .cl-native-mega__details');
    if (!item) return;
    closeSiblings(item);
    item.setAttribute('open', '');

    var nestedItem = event.target.closest('.cl-native-mega__flyout-item--parent');
    if (nestedItem) positionNestedFlyout(nestedItem);
  });

  document.addEventListener('pointerout', function (event) {
    if (!window.matchMedia('(min-width: 1024px)').matches) return;
    var item = event.target.closest('.cl-native-mega--desktop .cl-native-mega__details');
    if (!item || item.contains(event.relatedTarget)) return;
    item.removeAttribute('open');
  });

  document.addEventListener('click', function (event) {
    if (event.target.closest('[data-cl-native-mega]')) return;
    document.querySelectorAll('.cl-native-mega__details[open]').forEach(function (item) {
      item.removeAttribute('open');
    });
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('.cl-native-mega__details[open]').forEach(function (item) {
      item.removeAttribute('open');
    });
  });
})();
