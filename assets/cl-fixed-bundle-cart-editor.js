(function () {
  'use strict';

  var STORAGE_KEY = 'cl-fixed-bundle-cart-edit';

  document.addEventListener('click', function (event) {
    var trigger = event.target.closest && event.target.closest('[data-cl-fxb-edit]');
    if (!trigger) return;

    var properties;
    try { properties = JSON.parse(trigger.dataset.lineProperties || '{}'); }
    catch (error) { return; }

    var payload = {
      key: trigger.dataset.lineKey,
      quantity: parseInt(trigger.dataset.lineQuantity, 10) || 1,
      productId: String(trigger.dataset.productId || ''),
      properties: properties,
      fieldNames: (trigger.dataset.fieldNames || '').split('|').filter(Boolean),
      handle: trigger.dataset.plateHandle || ''
    };

    try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); }
    catch (error) { return; }

    window.location.href = (trigger.dataset.productUrl || '/products/3-hat-fixed-bundle-exclusive') + '?edit_bundle=1';
  });
})();
