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
    properties['Plate State'] = trigger.dataset.plateState || properties['Plate State'] || '';
    properties['Plate Design'] = trigger.dataset.plateDesign || properties['Plate Design'] || '';
    var explicitFields = {
      'Custom Text': trigger.dataset.customText || '',
      'Custom Text One': trigger.dataset.customTextOne || '',
      'Custom Text Two': trigger.dataset.customTextTwo || '',
      'Custom Text Three': trigger.dataset.customTextThree || '',
      'Custom Text Four': trigger.dataset.customTextFour || '',
      'Month': trigger.dataset.month || '',
      'Year': trigger.dataset.year || ''
    };
    Object.keys(explicitFields).forEach(function (name) {
      if (explicitFields[name]) properties[name] = explicitFields[name];
    });
    if (!payload.fieldNames.length) {
      payload.fieldNames = Object.keys(explicitFields).filter(function (name) {
        return Object.prototype.hasOwnProperty.call(properties, name) && properties[name] !== '';
      });
    }

    try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); }
    catch (error) { /* The URL payload below is the cross-page fallback. */ }

    var params = new URLSearchParams();
    params.set('edit_bundle', '1');
    params.set('line_key', payload.key);
    params.set('edit_data', JSON.stringify(payload));
    params.set('edit_state', properties['Plate State'] || '');
    params.set('edit_design', properties['Plate Design'] || '');
    params.set('edit_handle', payload.handle);
    params.set('edit_quantity', String(payload.quantity));
    payload.fieldNames.forEach(function (name, index) {
      params.set('edit_field_' + index, name);
      params.set('edit_value_' + index, properties[name] || '');
    });

    window.location.href = (trigger.dataset.productUrl || '/products/3-hat-fixed-bundle-exclusive') +
      '?' + params.toString();
  });
})();
