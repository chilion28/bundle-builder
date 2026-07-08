(function () {
  'use strict';

  // Mirrors the builder section's per-label defaults (labels are the Zepto contract).
  var FIELD_DEFAULTS = {
    'Month':           { maxLength: 3,  placeholder: 'MONTH' },
    'Year':            { maxLength: 4,  placeholder: 'YEAR' },
    'Custom Text':     { maxLength: 20, placeholder: 'CUSTOM' },
    'Custom Text One': { maxLength: 20, placeholder: '' },
    'Custom Text Two': { maxLength: 26, placeholder: '' }
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function moneyFromCents(cents) {
    return '$' + (cents / 100).toFixed(2);
  }

  // Item noun ("hat"/"pin"/…) from the collection's builder config (same source
  // the builder section uses), so grid copy matches the product type.
  function clItemNoun() {
    var c = (typeof window !== 'undefined' && window.CL_BUILDER_CONFIG) || {};
    function nv(v, fb) { if (v && typeof v === 'object' && 'value' in v) return v.value || fb; return v || fb; }
    return {
      singular: String(nv(c.itemSingular, 'item')).toLowerCase(),
      plural: String(nv(c.itemPlural, 'items')).toLowerCase()
    };
  }

  // ---- Zepto-style plate preview (POC: California) ----
  // Base plate images (leather, rivets, state header, bear) are baked; we only
  // overlay the custom text in the real LicensePlate font, positioned per
  // template. Box coords are % of the 800x490 base image (from the theme's
  // product_preview_option.liquid geometry).
  var PLATE_IMG_BASE = 'https://cdn-zeptoapps.com/product-personalizer/images/citylocs.myshopify.com/';
  var PLATE_CANVAS_W = 800; // Zepto canvas width; field size/position are in this space
  // Per-product plate config pulled from Zepto (image + per-field cx/cy/w/size/color).
  var CL_PLATE_CFG = {"hat-cali-plates":{"img":"California-60s-License-Plate-Hat-Preview.jpg","f":{"Month":{"cx":23.32,"cy":16,"w":9.89,"size":33,"color":"#ffffff","font":"Clocs-license-plate.ttf"},"Year":{"cx":76.68,"cy":16,"w":9.89,"size":33,"color":"#ffffff","font":"Clocs-license-plate.ttf"},"Custom Text":{"cx":49.82,"cy":27.76,"w":75.62,"size":175,"color":"#fdd500","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.47,"cy":27.06,"w":75.97,"size":130,"color":"#fdd500","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50,"cy":49.41,"w":54.77,"size":39,"color":"#fdd500","font":"Clocs-license-plate.ttf"}}},"hat-60s-texas-plate":{"img":"Texas-Black-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.82,"cy":28,"w":75.62,"size":170,"color":"#ffffff","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.65,"cy":26.82,"w":75.97,"size":130,"color":"#ffffff","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.18,"cy":48.47,"w":54.77,"size":39,"color":"#ffffff","font":"Clocs-license-plate.ttf"}}},"hat-florida":{"img":"Florida-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":50.18,"cy":27.53,"w":75.62,"size":185,"color":"#244c46","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":50,"cy":26.59,"w":75.97,"size":130,"color":"#244c46","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.18,"cy":48.71,"w":54.77,"size":39,"color":"#244c46","font":"Clocs-license-plate.ttf"}}},"texas-classic-plate-hat":{"img":"Texas-White-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":50.18,"cy":32,"w":75.62,"size":170,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":50,"cy":30.82,"w":75.97,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.35,"cy":53.18,"w":54.77,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"hat-80s-cali-plate":{"img":"80s-California-License-Plate-Preview.jpg","f":{"Custom Text":{"cx":49.82,"cy":27.53,"w":75.62,"size":174,"color":"#fdd500","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.29,"cy":26.82,"w":75.97,"size":130,"color":"#fdd500","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.65,"cy":48.94,"w":54.77,"size":39,"color":"#fdd500","font":"Clocs-license-plate.ttf"}}},"hat-white-cali":{"img":"California-White-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#00205e","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.12,"cy":27.76,"w":75.97,"size":130,"color":"#00205e","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.82,"cy":49.88,"w":54.77,"size":39,"color":"#00205e","font":"Clocs-license-plate.ttf"}}},"hat-new-york-plate":{"img":"New-York-Gold-License-Plate-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":29.18,"w":75.62,"size":176,"color":"#113778","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.82,"cy":28,"w":75.97,"size":130,"color":"#113778","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.65,"cy":49.88,"w":54.77,"size":39,"color":"#113778","font":"Clocs-license-plate.ttf"}}},"hat-tex-plate":{"img":"Texas-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.65,"cy":28.94,"w":75.62,"size":157,"color":"#274eb2","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.82,"cy":27.76,"w":75.97,"size":120,"color":"#274eb2","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.35,"cy":47.76,"w":54.77,"size":34,"color":"#274eb2","font":"Clocs-license-plate.ttf"}}},"hat-georgia-plate":{"img":"Georgia-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.29,"cy":29.88,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.82,"cy":29.88,"w":75.97,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":51.24,"cy":52.24,"w":54.77,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"hat-new-jersey":{"img":"New-Jersey-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.29,"cy":26.12,"w":75.97,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.82,"cy":48.24,"w":54.77,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"hat-north-carolina-plate":{"img":"North-Carolina-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#2455bc","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.82,"cy":28.47,"w":75.97,"size":130,"color":"#2455bc","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.82,"cy":50.59,"w":54.77,"size":39,"color":"#2455bc","font":"Clocs-license-plate.ttf"}}},"hat-colorado-plate":{"img":"Colorado-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":28.47,"w":75.62,"size":176,"color":"#034c16","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.82,"cy":29.88,"w":75.97,"size":130,"color":"#034c16","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":51.24,"cy":52.24,"w":54.77,"size":39,"color":"#034c16","font":"Clocs-license-plate.ttf"}}},"hat-arizona-plate-2018":{"img":"Arizona-2022-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":24.94,"w":75.62,"size":176,"color":"#103230","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":50,"cy":26.35,"w":75.97,"size":130,"color":"#103230","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50,"cy":48.71,"w":54.77,"size":39,"color":"#103230","font":"Clocs-license-plate.ttf"}}},"hat-maryland-plate":{"img":"Maryland-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.29,"cy":26.12,"w":75.97,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.82,"cy":48.24,"w":54.77,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"hat-illinois":{"img":"Illinois-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.29,"cy":29.88,"w":75.62,"size":176,"color":"#a50202","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.82,"cy":29.88,"w":75.97,"size":130,"color":"#a50202","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":51.24,"cy":52.24,"w":54.77,"size":39,"color":"#a50202","font":"Clocs-license-plate.ttf"}}},"hat-washington":{"img":"Washington-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":50.18,"cy":30.35,"w":75.62,"size":176,"color":"#282169","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":50.18,"cy":28.94,"w":75.97,"size":135,"color":"#282169","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.35,"cy":52.71,"w":54.77,"size":43,"color":"#282169","font":"Clocs-license-plate.ttf"}}},"hat-massachusetts":{"img":"Massachusetts-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":29.65,"w":75.62,"size":176,"color":"#c90000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.65,"cy":30.35,"w":75.97,"size":130,"color":"#c90000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.65,"cy":52.24,"w":54.77,"size":39,"color":"#c90000","font":"Clocs-license-plate.ttf"}}},"hat-ohio-plate":{"img":"Ohio-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.82,"cy":30.59,"w":75.62,"size":167,"color":"#224fb0","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":50,"cy":29.41,"w":75.97,"size":130,"color":"#224fb0","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.53,"cy":50.35,"w":54.77,"size":39,"color":"#224fb0","font":"Clocs-license-plate.ttf"}}},"hat-virginia":{"img":"Virginia-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.82,"cy":30.12,"w":75.62,"size":176,"color":"#27225d","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.82,"cy":29.65,"w":75.97,"size":130,"color":"#27225d","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.18,"cy":51.29,"w":54.77,"size":39,"color":"#27225d","font":"Clocs-license-plate.ttf"}}},"hat-new-york-white-plate":{"img":"New-York-White-License-Plate-Preview.jpg","f":{"Custom Text":{"cx":49.82,"cy":31.53,"w":75.62,"size":176,"color":"#25539e","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":50,"cy":29.88,"w":75.97,"size":130,"color":"#25539e","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.35,"cy":53.41,"w":54.77,"size":39,"color":"#25539e","font":"Clocs-license-plate.ttf"}}},"hat-pennsylvania":{"img":"Pennsylvania-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#29338e","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":50,"cy":27.29,"w":75.97,"size":130,"color":"#29338e","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.53,"cy":49.65,"w":54.77,"size":39,"color":"#29338e","font":"Clocs-license-plate.ttf"}}},"hat-michigan":{"img":"Michigan-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":28.47,"w":75.62,"size":176,"color":"#ffffff","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.65,"cy":28.94,"w":75.97,"size":130,"color":"#ffffff","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.18,"cy":52,"w":54.77,"size":39,"color":"#ffffff","font":"Clocs-license-plate.ttf"}}},"hat-wisconsin-plate":{"img":"Wisconsin-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.82,"cy":28.94,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.82,"cy":27.76,"w":75.97,"size":132,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.18,"cy":51.06,"w":54.77,"size":43,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"hat-louisiana-plate":{"img":"Louisiana-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.29,"cy":29.88,"w":75.62,"size":176,"color":"#26365e","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.82,"cy":29.88,"w":75.97,"size":130,"color":"#26365e","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":51.24,"cy":52.24,"w":54.77,"size":39,"color":"#26365e","font":"Clocs-license-plate.ttf"}}},"hat-puerto-rico-plate":{"img":"Puerto-Rico-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":50.18,"cy":28.24,"w":75.97,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.18,"cy":51.29,"w":54.77,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"hat-oregon":{"img":"Oregon-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":50,"cy":30.12,"w":75.62,"size":176,"color":"#212b64","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.82,"cy":29.41,"w":75.97,"size":130,"color":"#212b64","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.71,"cy":51.53,"w":54.77,"size":39,"color":"#212b64","font":"Clocs-license-plate.ttf"}}},"hat-hawaii-plate":{"img":"Hawaii-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.29,"cy":29.88,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.82,"cy":29.88,"w":75.97,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":51.24,"cy":52.24,"w":54.77,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"hat-oklahoma-plate":{"img":"Oklahoma-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":50.18,"cy":26.59,"w":75.62,"size":167,"color":"#ffffff","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.65,"cy":25.65,"w":75.97,"size":125,"color":"#ffffff","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50,"cy":46.59,"w":54.77,"size":39,"color":"#ffffff","font":"Clocs-license-plate.ttf"}}},"hat-new-mexico-plate":{"img":"New-Mexico-License-Plate-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#db0000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.29,"cy":26.12,"w":75.97,"size":130,"color":"#db0000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.82,"cy":48.24,"w":54.77,"size":39,"color":"#db0000","font":"Clocs-license-plate.ttf"}}},"hat-alabama-plate":{"img":"Alabama-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.29,"cy":26.12,"w":75.97,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.82,"cy":48.24,"w":54.77,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"hat-nevada-plate":{"img":"Nevada-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":30.35,"w":75.62,"size":176,"color":"#102d72","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.29,"cy":31.76,"w":75.97,"size":130,"color":"#102d72","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.18,"cy":54.59,"w":54.77,"size":39,"color":"#102d72","font":"Clocs-license-plate.ttf"}}},"hat-tennessee":{"img":"Tennessee-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":50.18,"cy":30.12,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.82,"cy":28.71,"w":75.97,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.35,"cy":51.76,"w":54.77,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"hat-idaho-plate":{"img":"Idaho-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.29,"cy":29.88,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.82,"cy":29.88,"w":75.97,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":51.24,"cy":52.24,"w":54.77,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"hat-missouri-plate":{"img":"Missiouri-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.29,"cy":29.18,"w":75.62,"size":176,"color":"#161b65","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.12,"cy":29.18,"w":75.97,"size":130,"color":"#161b65","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.29,"cy":49.88,"w":54.77,"size":39,"color":"#161b65","font":"Clocs-license-plate.ttf"}}},"hat-utah-plate":{"img":"Utah-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":50,"cy":31.29,"w":75.62,"size":176,"color":"#1d3e7a","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.65,"cy":29.18,"w":75.97,"size":136,"color":"#1d3e7a","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.35,"cy":53.18,"w":54.77,"size":42,"color":"#1d3e7a","font":"Clocs-license-plate.ttf"}}},"hat-minnesota-plate":{"img":"Minnesota-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.65,"cy":30.35,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.47,"cy":30.59,"w":75.97,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.18,"cy":52.24,"w":54.77,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"hat-indiana-plate":{"img":"Indiana-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.29,"cy":28.47,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.65,"cy":28.24,"w":75.97,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.35,"cy":50.12,"w":54.77,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"california-sunny-plate-hat":{"img":"California-Sunny-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":50,"cy":29.41,"w":75.62,"size":176,"color":"#00205e","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":50,"cy":29.41,"w":75.97,"size":130,"color":"#00205e","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50,"cy":50.35,"w":54.77,"size":39,"color":"#00205e","font":"Clocs-license-plate.ttf"}}},"hat-south-carolina-plate":{"img":"South-Carolina-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":50,"cy":29.65,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.47,"cy":28.94,"w":75.97,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.53,"cy":51.06,"w":54.77,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"hat-connecticut-plate":{"img":"Connecticut-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.29,"cy":29.88,"w":75.62,"size":176,"color":"#281f6b","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.82,"cy":29.88,"w":75.97,"size":130,"color":"#281f6b","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":51.24,"cy":52.24,"w":54.77,"size":39,"color":"#281f6b","font":"Clocs-license-plate.ttf"}}},"hat-arkansas-plate":{"img":"Arkansas-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":31.06,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.29,"cy":31.06,"w":75.97,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50,"cy":52.71,"w":54.77,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"hat-arizona-plate":{"img":"Arizona-Yellow-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":50.18,"cy":27.53,"w":75.62,"size":176,"color":"#030000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":50,"cy":26.59,"w":75.97,"size":130,"color":"#030000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.18,"cy":48.71,"w":54.77,"size":39,"color":"#030000","font":"Clocs-license-plate.ttf"}}},"hat-kentucky-plate":{"img":"Kentucky-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.29,"cy":29.88,"w":75.62,"size":176,"color":"#0e1648","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.82,"cy":29.88,"w":75.97,"size":130,"color":"#0e1648","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":51.24,"cy":52.24,"w":54.77,"size":39,"color":"#0e1648","font":"Clocs-license-plate.ttf"}}},"tennessee-2022-plate-hat":{"img":"Tennessee-2022-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.91,"cy":31.06,"w":72.97,"size":168,"color":"#ffffff","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.65,"cy":28.94,"w":75.97,"size":153,"color":"#ffffff","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.88,"cy":53.65,"w":54.77,"size":34,"color":"#ffffff","font":"Clocs-license-plate.ttf"}}},"hat-mississippi-plate":{"img":"Mississippi-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.29,"cy":31.29,"w":75.62,"size":176,"color":"#1d2787","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.12,"cy":33.18,"w":75.97,"size":130,"color":"#1d2787","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.18,"cy":56.24,"w":54.77,"size":39,"color":"#1d2787","font":"Clocs-license-plate.ttf"}}},"hat-new-hampshire-plate":{"img":"New-Hampshire-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.29,"cy":26.12,"w":75.97,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.82,"cy":48.24,"w":54.77,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"hat-montana":{"img":"Montana-License-Plate-Preview.jpg","f":{"Custom Text":{"cx":53.8,"cy":23.29,"w":63.07,"size":176,"color":"#ffffff","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":53.71,"cy":24.24,"w":63.25,"size":130,"color":"#ffffff","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":56.1,"cy":45.65,"w":58.48,"size":34,"color":"#ffffff","font":"Clocs-license-plate.ttf"}}},"copy-of-hat-washington-plate":{"img":"Washington-DC-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":30.35,"w":75.62,"size":176,"color":"#2150ac","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":50,"cy":29.65,"w":75.97,"size":130,"color":"#2150ac","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.18,"cy":51.76,"w":54.77,"size":39,"color":"#2150ac","font":"Clocs-license-plate.ttf"}}},"new-york-2022-plate-hat":{"img":"New-York-2022-License-Plate-Preview.jpg","f":{"Custom Text":{"cx":49.91,"cy":29.65,"w":66.96,"size":160,"color":"#032c53","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":50.18,"cy":28.71,"w":66.78,"size":130,"color":"#032c53","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50,"cy":51.06,"w":54.77,"size":39,"color":"#032c53","font":"Clocs-license-plate.ttf"}}},"hat-kansas":{"img":"Kansas-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.29,"cy":29.88,"w":75.62,"size":176,"color":"#231c63","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.82,"cy":29.88,"w":75.97,"size":130,"color":"#231c63","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":51.24,"cy":52.24,"w":54.77,"size":39,"color":"#231c63","font":"Clocs-license-plate.ttf"}}},"hat-maine-plate":{"img":"Maine-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.29,"cy":26.12,"w":75.97,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.82,"cy":48.24,"w":54.77,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"hat-west-virginia-plate":{"img":"West-Virginia-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":50.35,"cy":31.76,"w":75.62,"size":176,"color":"#1f255c","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":50,"cy":30.12,"w":75.97,"size":133,"color":"#1f255c","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.18,"cy":52.94,"w":54.77,"size":42,"color":"#1f255c","font":"Clocs-license-plate.ttf"}}},"test-plate":{"img":"Alaska-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.29,"cy":29.88,"w":75.62,"size":176,"color":"#231c63","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.82,"cy":29.88,"w":75.97,"size":130,"color":"#231c63","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":51.24,"cy":52.24,"w":54.77,"size":39,"color":"#231c63","font":"Clocs-license-plate.ttf"}}},"hat-rhode-island-plate":{"img":"Rhode-Island-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.65,"cy":29.65,"w":75.62,"size":176,"color":"#25468c","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.65,"cy":28.24,"w":75.97,"size":130,"color":"#25468c","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.35,"cy":49.88,"w":54.77,"size":39,"color":"#25468c","font":"Clocs-license-plate.ttf"}}},"hat-nebraska-plate":{"img":"Nebraska-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.65,"cy":28.47,"w":75.62,"size":177,"color":"#1e3154","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.47,"cy":29.88,"w":75.97,"size":130,"color":"#1e3154","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50,"cy":53.88,"w":54.77,"size":39,"color":"#1e3154","font":"Clocs-license-plate.ttf"}}},"hat-delaware-plate":{"img":"Delaware-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#fec54c","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.65,"cy":27.29,"w":75.97,"size":130,"color":"#fec54c","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.82,"cy":49.41,"w":54.77,"size":39,"color":"#fec54c","font":"Clocs-license-plate.ttf"}}},"hat-iowa-plate":{"img":"Iowa-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.29,"cy":29.88,"w":75.62,"size":176,"color":"#122e90","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.82,"cy":29.88,"w":75.97,"size":130,"color":"#122e90","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":51.24,"cy":52.24,"w":54.77,"size":39,"color":"#122e90","font":"Clocs-license-plate.ttf"}}},"new-mexico-chile-plate-hat":{"img":"New-Mexico-Chiles-License-Plate-Preview.jpg","f":{"Custom Text":{"cx":57.24,"cy":26.35,"w":62.9,"size":176,"color":"#ffec00","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":56.45,"cy":25.65,"w":61.66,"size":130,"color":"#ffec00","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":56.54,"cy":47.76,"w":54.77,"size":39,"color":"#ffec00","font":"Clocs-license-plate.ttf"}}},"hat-wyoming-plate":{"img":"Wyoming-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":57.51,"cy":26.59,"w":61.31,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":57.33,"cy":24.47,"w":60.95,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.09,"cy":48,"w":48.94,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"hat-vermont-plate":{"img":"Vermont-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":50,"cy":31.29,"w":75.62,"size":169,"color":"#ffffff","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":50,"cy":31.06,"w":72.08,"size":126,"color":"#ffffff","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.18,"cy":52.24,"w":54.77,"size":34,"color":"#ffffff","font":"Clocs-license-plate.ttf"}}},"michigan-2022-plate-hat":{"img":"Michigan-2022-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#0143a3","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.12,"cy":27.76,"w":75.97,"size":130,"color":"#0143a3","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.82,"cy":49.88,"w":54.77,"size":39,"color":"#0143a3","font":"Clocs-license-plate.ttf"}}},"louisiana-2022-plate-hat":{"img":"Louisiana-2022-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.12,"cy":27.76,"w":75.97,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.82,"cy":49.88,"w":54.77,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"illinois-2022-plate-hat":{"img":"Illinois-2022-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#c62525","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.12,"cy":27.76,"w":75.97,"size":130,"color":"#c62525","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.82,"cy":49.88,"w":54.77,"size":39,"color":"#c62525","font":"Clocs-license-plate.ttf"}}},"hat-north-dakota-plate":{"img":"North-Dakota-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.29,"cy":26.12,"w":75.97,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.82,"cy":48.24,"w":54.77,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"ohio-2022-plate-hat":{"img":"Ohio-2022-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#03235a","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.12,"cy":27.76,"w":75.97,"size":130,"color":"#03235a","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.82,"cy":49.88,"w":54.77,"size":39,"color":"#03235a","font":"Clocs-license-plate.ttf"}}},"guam-plate-hat":{"img":"Guam-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.29,"cy":29.88,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.82,"cy":29.88,"w":75.97,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":51.24,"cy":52.24,"w":54.77,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"colorado-2024-plate-hat":{"img":"Colorado-2024-License-Plate-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":28.47,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":50,"cy":28.71,"w":75.97,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.18,"cy":50.35,"w":54.77,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"south-carolina-2022-plate-hat":{"img":"South-Carolina-2022-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.12,"cy":27.76,"w":75.97,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.82,"cy":49.88,"w":54.77,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"pennsylvania-2025-plate-hat":{"img":"Pennsylvania-2025-License-Plate-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":28.47,"w":75.62,"size":176,"color":"#00407f","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":50,"cy":27.76,"w":75.97,"size":150,"color":"#00407f","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.91,"cy":52.24,"w":68.02,"size":39,"color":"#00407f","font":"Clocs-license-plate.ttf"}}},"iowa-black-plate-hat":{"img":"Iowa-Black-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#ffffff","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.12,"cy":27.76,"w":75.97,"size":130,"color":"#ffffff","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.82,"cy":49.88,"w":54.77,"size":39,"color":"#ffffff","font":"Clocs-license-plate.ttf"}}},"nevada-2022-plate-hat":{"img":"Nevada-2022-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.12,"cy":27.76,"w":75.97,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.82,"cy":49.88,"w":54.77,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"hat-south-dakota-plate":{"img":"South-Dakota-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.82,"cy":31.06,"w":75.62,"size":176,"color":"#273761","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":50.18,"cy":30.59,"w":75.97,"size":130,"color":"#273761","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50.18,"cy":52.71,"w":54.77,"size":39,"color":"#273761","font":"Clocs-license-plate.ttf"}}},"missouri-plate-hat-v2":{"img":"Missouri-License-Plate-v2-Preview.jpg","f":{"Custom Text":{"cx":49.29,"cy":29.18,"w":75.62,"size":176,"color":"#161b65","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.12,"cy":29.18,"w":75.97,"size":130,"color":"#161b65","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.29,"cy":49.88,"w":54.77,"size":39,"color":"#161b65","font":"Clocs-license-plate.ttf"}}},"puerto-rico-alternate-plate-hat":{"img":"Puerto-Rico-2022-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.12,"cy":27.76,"w":75.97,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.82,"cy":49.88,"w":54.77,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"oklahoma-red-plate-hat":{"img":"Oklahoma-2024-License-Plate-Preview.jpg","f":{"Custom Text":{"cx":49.82,"cy":28,"w":75.27,"size":160,"color":"#ffffff","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.65,"cy":26.82,"w":75.97,"size":130,"color":"#ffffff","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50,"cy":48.47,"w":68.9,"size":35,"color":"#ffffff","font":"Clocs-license-plate.ttf"}}},"oklahoma-2022-plate-hat":{"img":"Oklahoma-2022-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.12,"cy":27.76,"w":75.97,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.82,"cy":49.88,"w":54.77,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"indiana-2022-plate-hat":{"img":"Indiana-2022-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#2a3a7b","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.12,"cy":27.76,"w":75.97,"size":130,"color":"#2a3a7b","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.82,"cy":49.88,"w":54.77,"size":39,"color":"#2a3a7b","font":"Clocs-license-plate.ttf"}}},"new-mexico-2022-ty-plate-hat":{"img":"New-Mexico-TY-License-Plate-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#f8df04","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.12,"cy":27.76,"w":75.97,"size":130,"color":"#f8df04","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.82,"cy":49.88,"w":54.77,"size":39,"color":"#f8df04","font":"Clocs-license-plate.ttf"}}},"wyoming-2022-plate-hat":{"img":"Wyoming-2022-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":57.23,"cy":27.54,"w":62.84,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":56.26,"cy":27.71,"w":61.68,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":56.39,"cy":49.91,"w":54.71,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"new-mexico-2022-yg-plate-hat":{"img":"New-Mexico-YG-License-Plate-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#b40909","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.12,"cy":27.76,"w":75.97,"size":130,"color":"#b40909","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.82,"cy":49.88,"w":54.77,"size":39,"color":"#b40909","font":"Clocs-license-plate.ttf"}}},"mississippi-2022-plate-hat":{"img":"Mississippi-2022-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#21324e","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.12,"cy":27.76,"w":75.97,"size":130,"color":"#21324e","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.82,"cy":49.88,"w":54.77,"size":39,"color":"#21324e","font":"Clocs-license-plate.ttf"}}},"north-dakota-2022-plate-hat":{"img":"North-Dakota-2022-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.12,"cy":27.76,"w":75.97,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.82,"cy":49.88,"w":54.77,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"iowa-2022-plate-hat":{"img":"Iowa-2022-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.12,"cy":27.76,"w":75.97,"size":130,"color":"#000000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.82,"cy":49.88,"w":54.77,"size":39,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"south-dakota-2022-plate-hat":{"img":"South-Dakota-2022-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.47,"cy":27.76,"w":75.62,"size":176,"color":"#02338e","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.12,"cy":27.76,"w":75.97,"size":130,"color":"#02338e","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":49.82,"cy":49.88,"w":54.77,"size":39,"color":"#02338e","font":"Clocs-license-plate.ttf"}}},"alaska-2022-plate-hat":{"img":"Alaska-2022-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.29,"cy":29.88,"w":75.62,"size":176,"color":"#cc0000","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.82,"cy":29.88,"w":75.97,"size":130,"color":"#cc0000","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":51.24,"cy":52.24,"w":54.77,"size":39,"color":"#cc0000","font":"Clocs-license-plate.ttf"}}},"american-samoa-plate-hat":{"img":"American-Samoa-License-Plate-Preview.jpg","f":{"Custom Text":{"cx":57.24,"cy":26.35,"w":62.9,"size":176,"color":"#0c347f","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":56.45,"cy":25.65,"w":61.66,"size":130,"color":"#0c347f","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":56.54,"cy":47.76,"w":54.77,"size":39,"color":"#0c347f","font":"Clocs-license-plate.ttf"}}},"nebraska-2023-plate-hat":{"img":"Nebraska-2023-License-Plate-Hat-Preview.jpg","f":{"Custom Text":{"cx":49.65,"cy":28.47,"w":75.62,"size":177,"color":"#1e3154","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.47,"cy":29.88,"w":75.97,"size":130,"color":"#1e3154","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50,"cy":53.88,"w":54.77,"size":39,"color":"#1e3154","font":"Clocs-license-plate.ttf"}}},"california-60s-plate-hat-test":{"img":"California-60s-License-Plate-Hat-Preview.jpg","f":{"Month":{"cx":23.32,"cy":16,"w":9.89,"size":33,"color":"#ffffff","font":"Clocs-license-plate.ttf"},"Year":{"cx":76.68,"cy":16,"w":9.89,"size":33,"color":"#ffffff","font":"Clocs-license-plate.ttf"},"Custom Text":{"cx":49.82,"cy":27.76,"w":75.62,"size":175,"color":"#fdd500","font":"Clocs-license-plate.ttf"},"Custom Text One":{"cx":49.47,"cy":27.06,"w":75.97,"size":130,"color":"#fdd500","font":"Clocs-license-plate.ttf"},"Custom Text Two":{"cx":50,"cy":49.41,"w":54.77,"size":39,"color":"#fdd500","font":"Clocs-license-plate.ttf"}}},"alabama-license-plate-enamel-pin":{"img":"Alabama-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50,"cy":24,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"alaska-license-plate-enamel-pin":{"img":"Alaska-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50.18,"cy":29.65,"w":75.62,"size":176,"color":"#b60000","font":"Clocs-license-plate.ttf"}}},"alaska-yellow-license-plate-enamel-pin":{"img":"Alaska-Yellow-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":49.29,"cy":28.47,"w":75.62,"size":176,"color":"#231c63","font":"Clocs-license-plate.ttf"}}},"arizona-license-plate-enamel-pin":{"img":"Arizona-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":54,"cy":26,"w":72.74,"size":176,"color":"#103230","font":"Clocs-license-plate.ttf"}}},"arizona-yellow-license-plate-enamel-pin":{"img":"Arizona-Yellow-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":50.18,"cy":27.53,"w":75.62,"size":176,"color":"#030000","font":"Clocs-license-plate.ttf"}}},"arkansas-license-plate-enamel-pin":{"img":"Arkansas-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50,"cy":30.59,"w":75.62,"size":167,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"california-60s-license-plate-enamel-pin":{"img":"California-60s-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":50,"cy":26.35,"w":75.62,"size":175,"color":"#ffbe00","font":"Clocs-license-plate.ttf"}}},"california-blue-license-plate-enamel-pin":{"img":"California-Blue-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":50,"cy":26.35,"w":75.62,"size":174,"color":"#ffbe00","font":"Clocs-license-plate.ttf"}}},"california-sunny-license-plate-enamel-pin":{"img":"California-Sunny-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":49.82,"cy":29.18,"w":75.62,"size":161,"color":"#202e4e","font":"Clocs-license-plate.ttf"}}},"california-white-license-plate-enamel-pin":{"img":"California-White-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":50,"cy":28.24,"w":75.62,"size":162,"color":"#002a5e","font":"Clocs-license-plate.ttf"}}},"colorado-2024-license-plate-enamel-pin":{"img":"Colorado-2024-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":50,"cy":27.29,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"colorado-license-plate-enamel-pin":{"img":"Colorado-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50,"cy":27.29,"w":75.62,"size":176,"color":"#004d23","font":"Clocs-license-plate.ttf"}}},"connecticut-license-plate-enamel-pin":{"img":"Connecticut-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50,"cy":29,"w":75.62,"size":176,"color":"#00234b","font":"Clocs-license-plate.ttf"}}},"delaware-license-plate-enamel-pin":{"img":"Delaware-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50,"cy":25.88,"w":75.62,"size":176,"color":"#d8bb6b","font":"Clocs-license-plate.ttf"}}},"florida-license-plate-enamel-pin":{"img":"Florida-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":50,"cy":28.24,"w":75.62,"size":176,"color":"#026d62","font":"Clocs-license-plate.ttf"}}},"georgia-license-plate-enamel-pin":{"img":"Georgia-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":50,"cy":27.29,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"guam-license-plate-enamel-pin":{"img":"Guam-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":50,"cy":27.29,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"hawaii-license-plate-enamel-pin":{"img":"Hawaii-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":50,"cy":27.53,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"idaho-license-plate-enamel-pin":{"img":"Idaho-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50,"cy":27.29,"w":75.62,"size":170,"color":"#000c32","font":"Clocs-license-plate.ttf"}}},"illinois-2021-license-plate-enamel-pin":{"img":"Illinois-2021-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":49.65,"cy":27.53,"w":75.62,"size":176,"color":"#a30403","font":"Clocs-license-plate.ttf"}}},"illinois-license-plate-enamel-pin":{"img":"Illinois-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":49.82,"cy":29.65,"w":75.62,"size":170,"color":"#a30403","font":"Clocs-license-plate.ttf"}}},"indiana-2022-license-plate-enamel-pin":{"img":"Indiana-2022-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50,"cy":25.5,"w":75.62,"size":174,"color":"#29366d","font":"Clocs-license-plate.ttf"}}},"indiana-license-plate-enamel-pin":{"img":"Indiana-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50.18,"cy":28.47,"w":75.62,"size":174,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"iowa-2021-license-plate-enamel-pin":{"img":"Iowa-2021-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50.18,"cy":29.41,"w":75.62,"size":167,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"iowa-black-license-plate-enamel-pin":{"img":"Iowa-Black-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":49.82,"cy":28.71,"w":75.62,"size":176,"color":"#ffffff","font":"Clocs-license-plate.ttf"}}},"iowa-license-plate-enamel-pin":{"img":"Iowa-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":49.82,"cy":29.88,"w":75.62,"size":176,"color":"#002b94","font":"Clocs-license-plate.ttf"}}},"kansas-license-plate-enamel-pin":{"img":"Kansas-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":49.82,"cy":28.24,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"kentucky-license-plate-enamel-pin":{"img":"Kentucky-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50.18,"cy":29,"w":75.62,"size":167,"color":"#011a5b","font":"Clocs-license-plate.ttf"}}},"louisiana-2022-license-plate-enamel-pin":{"img":"Louisiana-2022-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50,"cy":29.18,"w":75.62,"size":169,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"louisiana-license-plate-enamel-pin":{"img":"Louisiana-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":49.82,"cy":27.29,"w":75.62,"size":176,"color":"#011a5b","font":"Clocs-license-plate.ttf"}}},"maine-license-plate-enamel-pin":{"img":"Maine-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":55.5,"cy":28,"w":66.99,"size":158,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"maryland-license-plate-enamel-pin":{"img":"Maryland-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50,"cy":28.2,"w":75.62,"size":165,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"massachusetts-license-plate-enamel-pin":{"img":"Massachusetts-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":49.82,"cy":28.5,"w":75.62,"size":176,"color":"#ef3939","font":"Clocs-license-plate.ttf"}}},"michigan-2021-license-plate-enamel-pin":{"img":"Michigan-2021-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":49.82,"cy":28.71,"w":75.62,"size":166,"color":"#0250af","font":"Clocs-license-plate.ttf"}}},"michigan-license-plate-enamel-pin":{"img":"Michigan-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":50,"cy":27.06,"w":75.62,"size":176,"color":"#ffffff","font":"Clocs-license-plate.ttf"}}},"minnesota-license-plate-enamel-pin":{"img":"Minnesota-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50,"cy":29,"w":75.62,"size":170,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"mississippi-2021-license-plate-enamel-pin":{"img":"Mississippi-2021-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50,"cy":33,"w":75.62,"size":165,"color":"#22334e","font":"Clocs-license-plate.ttf"}}},"mississippi-license-plate-enamel-pin":{"img":"Mississippi-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":49.82,"cy":32,"w":75.62,"size":176,"color":"#001c5b","font":"Clocs-license-plate.ttf"}}},"missouri-license-plate-enamel-pin":{"img":"Missouri-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":49.87,"cy":26.5,"w":75.51,"size":176,"color":"#001c5b","font":"Clocs-license-plate.ttf"}}},"montana-license-plate-enamel-pin":{"img":"Montana-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":53.93,"cy":25.13,"w":66.41,"size":145,"color":"#ffffff","font":"Clocs-license-plate.ttf"}}},"nebraska-2023-license-plate-enamel-pin":{"img":"Nebreska-2023-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":49.82,"cy":28,"w":75.62,"size":176,"color":"#0c3161","font":"Clocs-license-plate.ttf"}}},"nebraska-license-plate-enamel-pin":{"img":"Nebraska-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":49.82,"cy":28,"w":75.62,"size":176,"color":"#0d2c55","font":"Clocs-license-plate.ttf"}}},"nevada-2022-license-plate-enamel-pin":{"img":"Nevada-2021-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":49.82,"cy":28.5,"w":75.62,"size":172,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"nevada-license-plate-enamel-pin":{"img":"Nevada-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":49.82,"cy":30,"w":75.62,"size":176,"color":"#002a75","font":"Clocs-license-plate.ttf"}}},"new-hampshire-license-plate-enamel-pin":{"img":"New-Hampshire-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50,"cy":22.8,"w":75.62,"size":176,"color":"#1a4c39","font":"Clocs-license-plate.ttf"}}},"new-jersey-license-plate-enamel-pin":{"img":"New-Jersey-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50.18,"cy":28,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"new-mexico-2022-ty-license-plate-enamel-pin":{"img":"New-Mexico-TY-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":50,"cy":22.12,"w":75.62,"size":176,"color":"#fee500","font":"Clocs-license-plate.ttf"}}},"new-mexico-2022-yg-license-plate-enamel-pin":{"img":"New-Mexico-YG-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":49.87,"cy":24.24,"w":75.51,"size":176,"color":"#a01a07","font":"Clocs-license-plate.ttf"}}},"new-mexico-license-plate-enamel-pin":{"img":"New-Mexico-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":49.87,"cy":24.24,"w":75.51,"size":176,"color":"#c80000","font":"Clocs-license-plate.ttf"}}},"new-york-2021-license-plate-enamel-pin":{"img":"New-York-2021-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50,"cy":27.29,"w":75.62,"size":176,"color":"#003154","font":"Clocs-license-plate.ttf"}}},"new-york-gold-license-plate-enamel-pin":{"img":"New-York-Gold-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":49.82,"cy":30.59,"w":75.62,"size":162,"color":"#031d30","font":"Clocs-license-plate.ttf"}}},"new-york-white-license-plate-enamel-pin":{"img":"New-York-White-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":49.82,"cy":29.18,"w":75.62,"size":176,"color":"#004da3","font":"Clocs-license-plate.ttf"}}},"north-carolina-license-plate-enamel-pin":{"img":"North-Carolina-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50.35,"cy":28.47,"w":75.62,"size":162,"color":"#1d449c","font":"Clocs-license-plate.ttf"}}},"north-dakota-2022-license-plate-enamel-pin":{"img":"North-Dakota-2022-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50.18,"cy":28.71,"w":75.62,"size":134,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"north-dakota-license-plate-enamel-pin":{"img":"North-Dakota-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50,"cy":26.59,"w":75.62,"size":162,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"ohio-2022-license-plate-enamel-pin":{"img":"Ohio-2022-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":50,"cy":31.29,"w":75.62,"size":170,"color":"#0a2150","font":"Clocs-license-plate.ttf"}}},"ohio-license-plate-enamel-pin":{"img":"Ohio-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":49.82,"cy":28.24,"w":75.62,"size":170,"color":"#0d2252","font":"Clocs-license-plate.ttf"}}},"oklahoma-2021-license-plate-enamel-pin":{"img":"Oklahoma-2021-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50,"cy":28.71,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"oklahoma-black-license-plate-enamel-pin":{"img":"Oklahoma-Black-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":49.65,"cy":27.76,"w":75.62,"size":150,"color":"#ffffff","font":"Clocs-license-plate.ttf"}}},"oklahoma-red-license-plate-enamel-pin":{"img":"Oklahoma-Red-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":49.65,"cy":27.76,"w":75.62,"size":166,"color":"#ffffff","font":"Clocs-license-plate.ttf"}}},"oregon-license-plate-enamel-pin":{"img":"Oregon-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50.18,"cy":28.47,"w":75.62,"size":176,"color":"#091c55","font":"Clocs-license-plate.ttf"}}},"pennsylvania-2025-license-plate-enamel-pin":{"img":"Pennsylvania-2025-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":49.82,"cy":26.82,"w":75.62,"size":165,"color":"#00407f","font":"Clocs-license-plate.ttf"}}},"pennsylvania-license-plate-enamel-pin":{"img":"Pennsylvania-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":49.82,"cy":26.82,"w":75.62,"size":165,"color":"#071d63","font":"Clocs-license-plate.ttf"}}},"puerto-rico-2022-license-plate-enamel-pin":{"img":"Puerto-Rico-2022-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50,"cy":27,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"puerto-rico-license-plate-enamel-pin":{"img":"Puerto-Rico-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":49.82,"cy":26.35,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"rhode-island-license-plate-enamel-pin":{"img":"Rhode-Island-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":49.65,"cy":27.29,"w":75.62,"size":170,"color":"#17387f","font":"Clocs-license-plate.ttf"}}},"south-carolina-2022-license-plate-enamel-pin":{"img":"South-Carolina-2022-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":49.82,"cy":25.65,"w":75.62,"size":172,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"south-carolina-license-plate-enamel-pin":{"img":"South-Carolina-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50.18,"cy":27.53,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"south-dakota-2021-license-plate-enamel-pin":{"img":"South-Dakota-2021-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50,"cy":30.12,"w":75.62,"size":173,"color":"#12307f","font":"Clocs-license-plate.ttf"}}},"south-dakota-license-plate-enamel-pin":{"img":"South-Dakota-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50.18,"cy":29.88,"w":75.62,"size":165,"color":"#0d254f","font":"Clocs-license-plate.ttf"}}},"tennessee-2022-license-plate-enamel-pin":{"img":"Tennessee-2022-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":49.82,"cy":28.47,"w":75.62,"size":145,"color":"#ffffff","font":"Clocs-license-plate.ttf"}}},"tennessee-license-plate-enamel-pin":{"img":"Tennessee-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50.18,"cy":28.71,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"texas-black-license-plate-enamel-pin":{"img":"Texas-Black-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":50,"cy":27.06,"w":75.62,"size":160,"color":"#ffffff","font":"Clocs-license-plate.ttf"}}},"texas-license-plate-enamel-pin":{"img":"Texas-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50,"cy":27.29,"w":75.62,"size":155,"color":"#283b68","font":"Clocs-license-plate.ttf"}}},"texas-white-license-plate-enamel-pin":{"img":"Texas-White-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":50.18,"cy":29.65,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"utah-license-plate-enamel-pin":{"img":"Utah-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50.18,"cy":29.65,"w":75.62,"size":176,"color":"#092055","font":"Clocs-license-plate.ttf"}}},"vermont-license-plate-enamel-pin":{"img":"Vermont-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":49.82,"cy":28,"w":75.62,"size":150,"color":"#ffffff","font":"Clocs-license-plate.ttf"}}},"virginia-license-plate-enamel-pin":{"img":"Virginia-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":49.82,"cy":27.76,"w":75.62,"size":176,"color":"#03104e","font":"Clocs-license-plate.ttf"}}},"washington-dc-license-plate-enamel-pin":{"img":"Washington-DC-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":50,"cy":27.29,"w":75.62,"size":176,"color":"#1b429a","font":"Clocs-license-plate.ttf"}}},"washington-license-plate-enamel-pin":{"img":"Washington-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":50,"cy":28.71,"w":75.62,"size":176,"color":"#041151","font":"Clocs-license-plate.ttf"}}},"west-virginia-license-plate-enamel-pin":{"img":"West-Virginia-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":50,"cy":30,"w":75.62,"size":176,"color":"#061d5f","font":"Clocs-license-plate.ttf"}}},"wisconsin-license-plate-enamel-pin":{"img":"Wisconsin-Plate-Pin-Preview.jpg","f":{"Custom Text":{"cx":50,"cy":28.47,"w":75.62,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"wyoming-2022-license-plate-enamel-pin":{"img":"Wyoming-2022-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":56.54,"cy":28.24,"w":62.19,"size":176,"color":"#000000","font":"Clocs-license-plate.ttf"}}},"wyoming-license-plate-enamel-pin":{"img":"Wyoming-Plate-Pin-Previews.jpg","f":{"Custom Text":{"cx":56.54,"cy":26.35,"w":65.02,"size":161,"color":"#000000","font":"Clocs-license-plate.ttf"}}}};
  function plateCfg(card) {
    return CL_PLATE_CFG[card.getAttribute('data-cl-handle') || ''] || null;
  }

  // Font registry — maps each field's Zepto font file to a CSS family. Known
  // fonts reuse an already-loaded family; any new font is registered on the fly
  // via @font-face from Zepto's CDN. Makes the preview work for any product type
  // regardless of which font its personalizer uses.
  var PLATE_FONT_URL_BASE = 'https://cdn-zeptoapps.com/product-personalizer/font/citylocs.myshopify.com/';
  var PLATE_FONT_MAP = { 'Clocs-license-plate.ttf': 'CLLicensePlate' };
  var _plateFonts = {};
  function plateFontFamily(fontFile) {
    if (!fontFile) return 'CLLicensePlate';
    if (PLATE_FONT_MAP[fontFile]) return PLATE_FONT_MAP[fontFile];
    var fam = 'CLZepto_' + fontFile.replace(/[^A-Za-z0-9]/g, '_');
    if (!_plateFonts[fam]) {
      _plateFonts[fam] = true;
      var st = document.createElement('style');
      st.textContent = '@font-face{font-family:"' + fam + '";src:url("' +
        PLATE_FONT_URL_BASE + encodeURIComponent(fontFile) + '");font-display:swap;}';
      document.head.appendChild(st);
    }
    return fam;
  }

  // Auto-enable personalization for any product that has a plate config, deriving
  // its input fields from the config — so the ~86 products without a
  // custom.personalization_fields metafield still get the accordion + preview,
  // with Month/Year only where that plate actually has the boxes. Runs before the
  // builder section's DOMContentLoaded init, so the attribute + global it sets are
  // seen by the builder too. No re-paste, no metafields needed.
  function ensurePerso(card) {
    var cfg = plateCfg(card);
    if (!cfg) return; // non-plate: leave metafield gating as-is
    var F = cfg.f, handle = card.getAttribute('data-cl-handle') || '';
    var labels = ['Custom Text'];
    if (F['Custom Text Two'] || F['Custom Text One']) labels.push('Custom Text Two');
    if (F['Month']) labels.push('Month');
    if (F['Year']) labels.push('Year');
    if (!card.hasAttribute('data-cl-personalized')) card.setAttribute('data-cl-personalized', '');
    if (!card.hasAttribute('data-cl-perso-fields')) card.setAttribute('data-cl-perso-fields', JSON.stringify(labels));
    // Augment the builder's personalization map (for the summary "Edit" modal).
    try {
      window.CL_PRODUCT_PERSONALIZATION = window.CL_PRODUCT_PERSONALIZATION || {};
      if (!window.CL_PRODUCT_PERSONALIZATION[handle]) {
        window.CL_PRODUCT_PERSONALIZATION[handle] =
          { productType: card.getAttribute('data-cl-product-type') || '', fields: labels };
      }
    } catch (e) {}
    // Build the input block client-side if the server didn't render it.
    if (!card.querySelector('[data-cl-perso]')) {
      var body = card.querySelector('.cl-grid-body');
      if (body) {
        var block = document.createElement('div');
        block.className = 'cl-grid-perso';
        block.setAttribute('data-cl-perso', '');
        var fieldsHtml = labels.map(function (l) {
          var le = escapeHtml(l);
          return '<label class="cl-grid-perso-field"><span class="cl-grid-perso-head"><span>' + le +
                 '</span><span class="cl-grid-perso-count" data-cl-perso-count="' + le + '"></span></span>' +
                 '<input type="text" data-cl-perso-input="' + le + '" autocomplete="off"></label>';
        }).join('');
        block.innerHTML = '<div class="cl-grid-perso-preview" data-cl-perso-preview></div>' +
                          '<div class="cl-grid-perso-fields">' + fieldsHtml + '</div>';
        body.appendChild(block);
      }
    }
  }

  // Measure true text width in a detached span on document.body — OUTSIDE the
  // GemPages `.gps` scope, so the theme's global `max-width:100%` can't clamp it
  // (that clamp broke every in-DOM measurement). Accurate once the font loads.
  var _measEl;
  function measurePlateText(text, fontPx) {
    if (!_measEl) {
      _measEl = document.createElement('span');
      _measEl.setAttribute('aria-hidden', 'true');
      _measEl.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;' +
        'white-space:nowrap;text-transform:uppercase;letter-spacing:.01em;' +
        'font-family:"CLLicensePlate","Impact",sans-serif;';
      document.body.appendChild(_measEl);
    }
    _measEl.style.fontSize = fontPx + 'px';
    _measEl.textContent = text;
    return _measEl.offsetWidth;
  }

  // Size each line (config px * displayWidth/800), then squeeze horizontally to
  // fit its width%. The line is centered on cx via translateX(-50%) here — done
  // on the line itself (not a container), so a clamped field width can't offset it.
  function fitPlateText(previewEl) {
    var photo = previewEl.querySelector('.cl-plate-photo');
    if (!photo) return;
    var pw = photo.clientWidth;
    if (!pw) return;
    var scale = pw / PLATE_CANVAS_W;
    var fields = previewEl.querySelectorAll('[data-cl-plate-field]');
    Array.prototype.forEach.call(fields, function (field) {
      var line = field.querySelector('[data-cl-plate-line]');
      if (!line) return;
      var size = parseFloat(field.getAttribute('data-size')) || 40;
      var wpct = parseFloat(field.getAttribute('data-w')) || 100;
      var fontPx = size * scale;
      line.style.fontSize = fontPx + 'px';
      // The theme's global max-width:100% clamps the field to the plate width,
      // which throws off translateX(-50%) centering. Force it off inline so the
      // field is its true content width and centers correctly on cx.
      field.style.setProperty('max-width', 'none', 'important');
      line.style.setProperty('max-width', 'none', 'important');
      line.style.transform = 'none';
      // Measure the real line (max-width now forced off inline, so it isn't
      // clamped). offsetWidth ignores transforms and uses the real loaded font —
      // reliable for both long main text and short Month/Year in tiny boxes.
      var tw = line.offsetWidth;
      var target = (wpct / 100) * pw;
      var sx = tw > target ? (target / tw) : 1;
      // translateX(-50%) lives on the field (CSS); scaleX only on the line.
      line.style.transform = 'scaleX(' + sx + ')';
    });
  }

  // Shared config-driven plate preview — used by the inline card AND the Edit
  // modal (in the builder section) via window.CLPlatePreview.
  function renderPlatePreview(previewEl, cfgObj, values) {
    if (!previewEl || !cfgObj) return;
    var F = cfgObj.f;
    function g(k) { var v = values && values[k]; return (v == null ? '' : String(v)).trim(); }
    var l1 = g('Custom Text') || 'CUSTOM';
    var l2 = g('Custom Text Two');
    var mo = g('Month'), yr = g('Year');
    var fams = {}; // fonts to preload for the re-fit
    function field(cf, text, vcenter) {
      if (!cf || !text) return '';
      var top = vcenter ? (cf.cy + 1.2) : cf.cy;
      var fam = plateFontFamily(cf.font);
      fams[fam] = 1;
      return '<div class="cl-plate-field' + (vcenter ? ' cl-plate-field-vc' : '') +
             '" data-cl-plate-field data-size="' + cf.size + '" data-w="' + cf.w +
             '" style="left:' + cf.cx + '%;top:' + top + '%;color:' + cf.color +
             ";font-family:'" + fam + "','Impact',sans-serif\">" +
             '<span class="cl-plate-fitline" data-cl-plate-line>' + escapeHtml(text) + '</span></div>';
    }
    var overlay;
    if (l2 && F['Custom Text One'] && F['Custom Text Two']) {
      overlay = field(F['Custom Text One'], l1) + field(F['Custom Text Two'], l2);
    } else {
      overlay = field(F['Custom Text'] || F['Custom Text One'], l1);
    }
    if (F['Month'] && mo) overlay += field(F['Month'], mo, true);
    if (F['Year'] && yr) overlay += field(F['Year'], yr, true);
    previewEl.innerHTML =
      '<div class="cl-plate-photo">' +
        '<img class="cl-plate-photo-img" src="' + PLATE_IMG_BASE + cfgObj.img + '" alt="Plate preview" loading="lazy">' +
        overlay +
      '</div>';
    fitPlateText(previewEl);
    var refit = function () { fitPlateText(previewEl); };
    Object.keys(fams).forEach(function (fam) {
      if (document.fonts && document.fonts.load) document.fonts.load('16px "' + fam + '"').then(refit).catch(refit);
    });
    setTimeout(refit, 250);
  }
  // ---- Image lightbox (click the big card/modal image to enlarge) ----
  var _lightbox;
  function openLightbox(src) {
    if (!src) return;
    if (!_lightbox) {
      _lightbox = document.createElement('div');
      _lightbox.className = 'cl-lightbox';
      _lightbox.hidden = true;
      _lightbox.innerHTML = '<button type="button" class="cl-lightbox-close" aria-label="Close">×</button><img alt="">';
      document.body.appendChild(_lightbox);
      _lightbox.addEventListener('click', function (e) {
        if (e.target === _lightbox || e.target.closest('.cl-lightbox-close')) closeLightbox();
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLightbox(); });
    }
    // Request a larger render from the Shopify CDN (bump the width param).
    _lightbox.querySelector('img').src = src.replace(/width=\d+/, 'width=1400');
    _lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    if (_lightbox) { _lightbox.hidden = true; document.body.style.overflow = ''; }
  }
  window.CLLightbox = openLightbox; // let the builder modal's big image use it too

  // Expose for the builder section's Edit modal.
  window.CLPlatePreview = function (previewEl, handle, values) {
    var cfgObj = CL_PLATE_CFG[handle];
    if (!cfgObj || !previewEl) return false;
    renderPlatePreview(previewEl, cfgObj, values || {});
    return true;
  };

  function initCard(card) {
    var variants;
    try {
      variants = JSON.parse(card.querySelector('[data-cl-variants]').textContent);
    } catch (e) {
      return;
    }
    if (!variants.length) return;

    var groups = Array.prototype.slice.call(card.querySelectorAll('[data-cl-option-group]'));
    var imageEl = card.querySelector('[data-cl-card-image]');
    var priceEl = card.querySelector('[data-cl-card-price]');

    // #1 — Turn the Color option's text pills into image swatches (the actual
    // variant thumbnail). Done once; render() still toggles selected/unavailable.
    groups.forEach(function (group) {
      var name = (group.getAttribute('data-cl-option-name') || '').toLowerCase();
      if (name.indexOf('color') === -1) return;
      var idx = Number(group.getAttribute('data-cl-option-index'));
      group.classList.add('cl-color-swatches');
      group.querySelectorAll('[data-cl-value]').forEach(function (btn) {
        var value = btn.getAttribute('data-cl-value');
        var match = variants.filter(function (v) { return v.options[idx] === value && v.image; })[0]
                 || variants.filter(function (v) { return v.options[idx] === value; })[0];
        btn.setAttribute('title', value);
        btn.setAttribute('aria-label', value);
        if (match && match.image) {
          btn.classList.add('cl-swatch-img');
          btn.innerHTML = '<img src="' + match.image + '" alt="' + escapeHtml(value) + '" loading="lazy">';
        }
      });
    });

    // Selected value per option index, seeded from the first available variant.
    var seed = variants.filter(function (v) { return v.available; })[0] || variants[0];
    var selection = seed.options.slice();

    function variantsMatching(depth) {
      // Variants matching the selection for option indexes < depth.
      return variants.filter(function (v) {
        for (var i = 0; i < depth; i++) {
          if (v.options[i] !== selection[i]) return false;
        }
        return true;
      });
    }

    function resolve() {
      var exact = variants.filter(function (v) {
        return v.options.every(function (o, i) { return o === selection[i]; });
      });
      return exact.filter(function (v) { return v.available; })[0] || exact[0] || null;
    }

    function render() {
      groups.forEach(function (group, gi) {
        var idx = Number(group.getAttribute('data-cl-option-index'));
        var candidates = variantsMatching(idx);
        var values = [];
        candidates.forEach(function (v) {
          if (values.indexOf(v.options[idx]) === -1) values.push(v.options[idx]);
        });

        // If the current selection is no longer valid at this level, snap to
        // the first value (prefer one with stock further down).
        if (values.indexOf(selection[idx]) === -1) {
          var availableFirst = candidates.filter(function (v) { return v.available; })[0];
          selection[idx] = availableFirst ? availableFirst.options[idx] : values[0];
        }

        // Data-driven show/hide: a group with a single effective value (e.g.
        // "One Size Fits All" for non-Flex-Fit styles) is auto-selected and
        // hidden. Flex-Fit exposes multiple sizes, so its group shows.
        group.hidden = values.length <= 1;

        var currentLabel = group.querySelector('[data-cl-option-current]');
        if (currentLabel) currentLabel.textContent = selection[idx];

        group.querySelectorAll('[data-cl-value]').forEach(function (btn) {
          var value = btn.getAttribute('data-cl-value');
          var visible = values.indexOf(value) !== -1;
          btn.style.display = visible ? '' : 'none';
          btn.classList.toggle('is-selected', value === selection[idx]);
          var anyAvailable = candidates.some(function (v) {
            return v.options[idx] === value && v.available;
          });
          btn.classList.toggle('is-unavailable', visible && !anyAvailable);
        });
      });

      var variant = resolve();
      if (!variant) return;

      card.setAttribute('data-cl-variant-id', variant.id);
      card.setAttribute('data-cl-price', variant.price);
      card.setAttribute('data-cl-variant-title', variant.title);
      if (variant.image) {
        card.setAttribute('data-cl-image', variant.image);
        if (imageEl && imageEl.src !== variant.image) imageEl.src = variant.image;
      }
      if (priceEl) priceEl.textContent = moneyFromCents(variant.price);

      card.dispatchEvent(new CustomEvent('cl:variant-change', { bubbles: true }));
    }

    card.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-cl-value]');
      if (!btn || !card.contains(btn)) return;
      var group = btn.closest('[data-cl-option-group]');
      var idx = Number(group.getAttribute('data-cl-option-index'));
      selection[idx] = btn.getAttribute('data-cl-value');
      render();
    });

    // Click the big card image to open it in the lightbox (uses the currently
    // selected variant's image).
    var mediaEl = card.querySelector('.cl-grid-media');
    if (mediaEl) {
      mediaEl.classList.add('cl-zoomable');
      mediaEl.addEventListener('click', function () {
        openLightbox(card.getAttribute('data-cl-image') || (imageEl && imageEl.src) || '');
      });
    }

    ensurePerso(card);
    initPersonalization(card);
    render();
  }

  function initPersonalization(card) {
    if (!card.hasAttribute('data-cl-personalized')) return;

    var labels;
    try {
      labels = JSON.parse(card.getAttribute('data-cl-perso-fields'));
    } catch (e) {
      labels = [];
    }

    var config = {
      productType: card.getAttribute('data-cl-product-type') || '',
      fields: labels.map(function (label) {
        var d = FIELD_DEFAULTS[label] || { maxLength: 30, placeholder: '' };
        return { label: label, maxLength: d.maxLength, placeholder: d.placeholder };
      })
    };

    var values = {};
    var previewEl = card.querySelector('[data-cl-perso-preview]');

    function get(label) { return (values[label] || '').trim(); }

    // Custom Text Two is an optional second line — never required to add.
    var OPTIONAL_FIELDS = { 'Custom Text Two': true };
    function isValid() {
      return config.fields.every(function (f) {
        return OPTIONAL_FIELDS[f.label] || get(f.label).length > 0;
      });
    }

    // Show the config-driven preview for ANY product that has a preview config
    // (type-agnostic — plates, pins, or future personalized types).
    var plateCfgObj = plateCfg(card);

    function renderPreview() {
      if (!previewEl) return;
      if (plateCfgObj) {
        renderPlatePreview(previewEl, plateCfgObj, values);
        return;
      }
      if (/plate/i.test(config.productType)) {
        var state = (card.getAttribute('data-cl-title') || '').trim().split(/\s+/)[0] || 'CUSTOM';
        previewEl.innerHTML =
          '<div class="cl-plate">' +
            '<div class="cl-plate-top">' +
              '<span class="cl-plate-mini">' + escapeHtml(get('Month') || 'MO') + '</span>' +
              '<span class="cl-plate-state">' + escapeHtml(state.toUpperCase()) + '</span>' +
              '<span class="cl-plate-mini">' + escapeHtml(get('Year') || 'YR') + '</span>' +
            '</div>' +
            '<div class="cl-plate-main">' + escapeHtml(get('Custom Text') || 'CUSTOM') + '</div>' +
            '<div class="cl-plate-sub">' + escapeHtml(get('Custom Text Two')) + '</div>' +
          '</div>';
      } else {
        var lines = config.fields.map(function (f) { return get(f.label); }).filter(Boolean);
        previewEl.innerHTML = '<div class="cl-perso-generic">' +
          (lines.length
            ? lines.map(function (l) { return '<div>' + escapeHtml(l) + '</div>'; }).join('')
            : '<div class="cl-perso-empty">Your text preview</div>') +
          '</div>';
      }
    }

    function syncField(label) {
      var field = config.fields.filter(function (f) { return f.label === label; })[0];
      var counter = card.querySelector('[data-cl-perso-count="' + CSS.escape(label) + '"]');
      if (counter && field) {
        counter.textContent = (field.maxLength - (values[label] || '').length) + ' characters left';
      }
    }

    // Inline validation notice + accordion opener for the "Personalize & Add" flow.
    var noticeEl = document.createElement('div');
    noticeEl.className = 'cl-perso-notice';
    noticeEl.hidden = true;
    function showNotice(m) { noticeEl.textContent = m; noticeEl.hidden = false; }
    function hideNotice() { noticeEl.hidden = true; }
    function openAccordion() {
      if (persoBlock && persoBlock.hidden) {
        persoBlock.hidden = false;
        if (persoToggle) { persoToggle.classList.add('is-open'); persoToggle.setAttribute('aria-expanded', 'true'); }
        renderPreview();
      }
    }

    config.fields.forEach(function (f) {
      var input = card.querySelector('[data-cl-perso-input="' + CSS.escape(f.label) + '"]');
      if (!input) return;
      input.maxLength = f.maxLength;
      input.placeholder = f.placeholder;
      values[f.label] = '';
      syncField(f.label);
      input.addEventListener('input', function () {
        values[f.label] = input.value.toUpperCase(); // plate text is always all-caps
        syncField(f.label);
        hideNotice();
        renderPreview();
        card.dispatchEvent(new CustomEvent('cl:perso-change', { bubbles: true }));
      });
    });

    // #3 — Custom Text Two hidden behind an "Add a second line" checkbox.
    var ct2Input = card.querySelector('[data-cl-perso-input="' + CSS.escape('Custom Text Two') + '"]');
    var ct2Field = ct2Input ? ct2Input.closest('.cl-grid-perso-field') : null;
    var secondLineCb = null;
    if (ct2Field) {
      ct2Field.hidden = true;
      if (ct2Input) ct2Input.placeholder = 'Second line (optional)';
      var ct2Toggle = document.createElement('label');
      ct2Toggle.className = 'cl-perso-second-toggle';
      ct2Toggle.innerHTML = '<input type="checkbox"><span>Add a second line of text</span>';
      ct2Field.parentNode.insertBefore(ct2Toggle, ct2Field);
      secondLineCb = ct2Toggle.querySelector('input');
      secondLineCb.addEventListener('change', function () {
        ct2Field.hidden = !secondLineCb.checked;
        if (!secondLineCb.checked) {
          values['Custom Text Two'] = '';
          if (ct2Input) ct2Input.value = '';
          syncField('Custom Text Two');
        } else if (ct2Input) {
          ct2Input.focus();
        }
        renderPreview();
        card.dispatchEvent(new CustomEvent('cl:perso-change', { bubbles: true }));
      });
    }

    // #2 — Collapse the whole personalization block into an accordion.
    var persoBlock = card.querySelector('[data-cl-perso]');
    var persoToggle = null;
    if (persoBlock) {
      persoToggle = document.createElement('button');
      persoToggle.type = 'button';
      persoToggle.className = 'cl-grid-perso-toggle';
      persoToggle.setAttribute('aria-expanded', 'false');
      persoToggle.innerHTML = '<span class="cl-perso-toggle-label">✏️ Personalize this ' + clItemNoun().singular + '</span><span class="cl-perso-caret" aria-hidden="true"></span>';
      persoBlock.parentNode.insertBefore(persoToggle, persoBlock);
      persoBlock.hidden = true;
      persoToggle.addEventListener('click', function () {
        var willOpen = persoBlock.hidden;
        persoBlock.hidden = !willOpen;
        persoToggle.classList.toggle('is-open', willOpen);
        persoToggle.setAttribute('aria-expanded', String(willOpen));
        // Re-render so the plate text fits now that the box has real dimensions.
        if (willOpen) renderPreview();
      });
    }

    if (persoBlock) persoBlock.appendChild(noticeEl);

    // Move the personalization accordion up to sit between the price and the
    // Style/Color options (instead of below them).
    var priceEl = card.querySelector('[data-cl-card-price]');
    if (priceEl && persoBlock && persoToggle) {
      priceEl.insertAdjacentElement('afterend', persoBlock);
      persoBlock.insertAdjacentElement('beforebegin', persoToggle);
    }

    function resetSecondLineAndAccordion() {
      if (secondLineCb) secondLineCb.checked = false;
      if (ct2Field) ct2Field.hidden = true;
      if (persoBlock) persoBlock.hidden = true;
      if (persoToggle) { persoToggle.classList.remove('is-open'); persoToggle.setAttribute('aria-expanded', 'false'); }
    }

    card.__clPerso = {
      config: config,
      get values() {
        var out = {};
        config.fields.forEach(function (f) {
          var v = get(f.label);
          if (v) out[f.label] = v;   // omit empties, mirroring Zepto
        });
        return out;
      },
      get valid() { return isValid(); },
      // Called by the builder when "Personalize & Add" is clicked while required
      // text is missing: open the accordion, focus the first empty required field,
      // and show an inline notice.
      promptMissing: function () {
        openAccordion();
        var miss = null;
        for (var i = 0; i < config.fields.length; i++) {
          var f = config.fields[i];
          if (!OPTIONAL_FIELDS[f.label] && !get(f.label)) { miss = f; break; }
        }
        if (miss) {
          var input = card.querySelector('[data-cl-perso-input="' + CSS.escape(miss.label) + '"]');
          if (input) input.focus();
          showNotice('Enter your ' + miss.label.toLowerCase() + ' to add this to your pack.');
        }
      },
      reset: function () {
        config.fields.forEach(function (f) {
          values[f.label] = '';
          var input = card.querySelector('[data-cl-perso-input="' + CSS.escape(f.label) + '"]');
          if (input) input.value = '';
          syncField(f.label);
        });
        hideNotice();
        resetSecondLineAndAccordion();
        renderPreview();
        card.dispatchEvent(new CustomEvent('cl:perso-change', { bubbles: true }));
      }
    };

    renderPreview();
  }

  // ---- Filter (by state) + sort + client-side pagination ----
  // Operates purely on the cards already in the DOM: it reorders/shows/hides
  // them, never touching pack state (that lives in the builder's `selected`
  // Map, keyed by variant+personalization, independent of visibility).
  var PAGE_SIZE = 12;

  // Canonical US states + territories, longest names first so multi-word
  // matches ("New York", "North Carolina") win over shorter prefixes ("New").
  var US_STATES = [
    'District of Columbia','Northern Mariana Islands','US Virgin Islands','U.S. Virgin Islands',
    'West Virginia','South Carolina','North Carolina','South Dakota','North Dakota','Rhode Island',
    'New Hampshire','New Jersey','New Mexico','New York','Puerto Rico','American Samoa',
    'Massachusetts','Pennsylvania','Connecticut','Mississippi','Washington','California','Minnesota',
    'Louisiana','Wisconsin','Tennessee','Kentucky','Nebraska','Colorado','Maryland','Michigan',
    'Missouri','Arkansas','Delaware','Illinois','Oklahoma','Virginia','Vermont','Montana','Alabama',
    'Arizona','Florida','Georgia','Indiana','Kansas','Nevada','Oregon','Wyoming','Alaska','Hawaii',
    'Idaho','Maine','Texas','Ohio','Utah','Iowa','Guam'
  ].sort(function (a, b) { return b.length - a.length; });

  function deriveState(title) {
    var t = (title || '').toLowerCase();
    for (var i = 0; i < US_STATES.length; i++) {
      var s = US_STATES[i].toLowerCase();
      // Match as a leading word-boundary so "Washington ..." matches but
      // "..." mid-title coincidences are avoided.
      if (t === s || t.indexOf(s + ' ') === 0 || t.indexOf(s) === 0) return US_STATES[i];
    }
    return '';
  }

  function initControls() {
    var gridEl = document.querySelector('[data-cl-pack-grid]');
    if (!gridEl) return;
    var toolbar = document.querySelector('[data-cl-toolbar]');
    var pager = document.querySelector('[data-cl-pagination]');
    var countEl = document.querySelector('[data-cl-result-count]');
    var noResults = document.querySelector('[data-cl-no-results]');
    var stateInput = document.querySelector('[data-cl-state-filter]');
    var stateList = document.querySelector('[data-cl-state-options]');
    var sortSelect = document.querySelector('[data-cl-sort]');

    var cards = Array.prototype.slice.call(gridEl.querySelectorAll('[data-cl-card]'));
    if (!cards.length) return;

    // Annotate each card with its state + original (featured) order.
    var present = {};
    cards.forEach(function (card, i) {
      var st = deriveState(card.getAttribute('data-cl-title'));
      card.__clState = st;
      card.__clOrder = i;
      card.__clTitle = (card.getAttribute('data-cl-title') || '').toLowerCase();
      if (st) present[st] = true;
    });

    // Build a custom state dropdown that opens below the input (replaces the
    // native <datalist>, which renders as an unstyled, side-anchored browser
    // popup). Done in JS so no GemPages markup change / re-paste is needed.
    var stateOptions = Object.keys(present).sort();
    var stateWrap = stateInput ? stateInput.parentElement : null;
    if (stateInput) stateInput.removeAttribute('list');
    if (stateList && stateList.parentNode) stateList.parentNode.removeChild(stateList);

    var page = 1;

    function currentMatches() {
      var q = (stateInput && stateInput.value || '').trim().toLowerCase();
      var sort = sortSelect ? sortSelect.value : 'featured';
      var list = cards.filter(function (card) {
        if (!q) return true;
        // Match state name or anywhere in the title, so "cal" and "California" both work.
        return (card.__clState && card.__clState.toLowerCase().indexOf(q) !== -1) ||
               card.__clTitle.indexOf(q) !== -1;
      });
      if (sort === 'az' || sort === 'za') {
        list.sort(function (a, b) { return a.__clTitle < b.__clTitle ? -1 : a.__clTitle > b.__clTitle ? 1 : 0; });
        if (sort === 'za') list.reverse();
      } else {
        list.sort(function (a, b) { return a.__clOrder - b.__clOrder; });
      }
      return list;
    }

    function renderPager(totalPages) {
      if (!pager) return;
      if (totalPages <= 1) { pager.hidden = true; pager.innerHTML = ''; return; }
      pager.hidden = false;
      var parts = [];
      parts.push('<button type="button" class="cl-pack-page" data-cl-page="' + (page - 1) + '"' + (page === 1 ? ' disabled' : '') + '>‹ Prev</button>');
      // Compact page list: 1 … (p-1) p (p+1) … last
      var nums = [];
      for (var n = 1; n <= totalPages; n++) {
        if (n === 1 || n === totalPages || (n >= page - 1 && n <= page + 1)) nums.push(n);
        else if (nums[nums.length - 1] !== '…') nums.push('…');
      }
      nums.forEach(function (n) {
        if (n === '…') { parts.push('<span class="cl-pack-page-gap">…</span>'); return; }
        parts.push('<button type="button" class="cl-pack-page' + (n === page ? ' is-current' : '') + '" data-cl-page="' + n + '">' + n + '</button>');
      });
      parts.push('<button type="button" class="cl-pack-page" data-cl-page="' + (page + 1) + '"' + (page === totalPages ? ' disabled' : '') + '>Next ›</button>');
      pager.innerHTML = parts.join('');
    }

    function apply() {
      var list = currentMatches();
      var total = list.length;
      var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      if (page > totalPages) page = totalPages;
      var start = (page - 1) * PAGE_SIZE;
      var end = start + PAGE_SIZE;

      // Reorder DOM to the sorted order, then show only this page's slice.
      var visibleSet = {};
      list.forEach(function (card, idx) {
        gridEl.appendChild(card); // moves node; establishes sorted order
        var show = idx >= start && idx < end;
        card.hidden = !show;
        if (show) visibleSet[card.__clOrder] = true;
      });
      // Cards filtered out entirely.
      cards.forEach(function (card) {
        if (!list.indexOf) return;
        if (list.indexOf(card) === -1) card.hidden = true;
      });

      if (noResults) noResults.hidden = total !== 0;
      gridEl.hidden = total === 0;

      if (countEl) {
        if (total === 0) countEl.textContent = '';
        else {
          var shownFrom = start + 1;
          var shownTo = Math.min(end, total);
          var noun = clItemNoun();
          countEl.textContent = shownFrom + '–' + shownTo + ' of ' + total + ' ' + (total === 1 ? noun.singular : noun.plural);
        }
      }
      if (stateInput) {
        var clearBtns = document.querySelectorAll('[data-cl-state-clear]');
        Array.prototype.forEach.call(clearBtns, function (b) { b.hidden = !stateInput.value; });
        if (stateWrap) stateWrap.classList.toggle('has-value', !!stateInput.value);
      }
      renderPager(totalPages);
    }

    function goToPage(p) {
      page = p;
      apply();
      // Scroll the grid back into view on page change (keeps the toolbar visible).
      if (toolbar && toolbar.scrollIntoView) toolbar.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ---- Custom state dropdown (below the input) ----
    if (stateInput && stateWrap) {
      var stateMenu = document.createElement('div');
      stateMenu.className = 'cl-pack-state-menu';
      stateMenu.hidden = true;
      stateMenu.setAttribute('role', 'listbox');
      stateWrap.appendChild(stateMenu);

      var menuItems = [];
      var activeIdx = -1;

      function renderMenu() {
        var q = stateInput.value.trim().toLowerCase();
        var opts = stateOptions.filter(function (s) { return !q || s.toLowerCase().indexOf(q) !== -1; });
        activeIdx = -1;
        if (!opts.length) {
          stateMenu.innerHTML = '<div class="cl-pack-state-empty">No states match</div>';
        } else {
          stateMenu.innerHTML = opts.map(function (s) {
            var v = s.replace(/"/g, '&quot;');
            return '<button type="button" class="cl-pack-state-option" role="option" data-value="' + v + '">' + s + '</button>';
          }).join('');
        }
        menuItems = Array.prototype.slice.call(stateMenu.querySelectorAll('.cl-pack-state-option'));
      }
      function openMenu() { renderMenu(); stateMenu.hidden = false; }
      function closeMenu() { stateMenu.hidden = true; activeIdx = -1; }
      function selectValue(val) { stateInput.value = val; closeMenu(); page = 1; apply(); }
      function setActive(i) {
        if (!menuItems.length) return;
        activeIdx = (i + menuItems.length) % menuItems.length;
        menuItems.forEach(function (el, idx) { el.classList.toggle('is-active', idx === activeIdx); });
        if (menuItems[activeIdx].scrollIntoView) menuItems[activeIdx].scrollIntoView({ block: 'nearest' });
      }

      stateInput.addEventListener('input', function () { openMenu(); page = 1; apply(); });
      stateInput.addEventListener('focus', openMenu);
      stateInput.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); if (stateMenu.hidden) openMenu(); setActive(activeIdx + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIdx - 1); }
        else if (e.key === 'Enter') {
          if (activeIdx >= 0 && menuItems[activeIdx]) { e.preventDefault(); selectValue(menuItems[activeIdx].getAttribute('data-value')); }
          else { closeMenu(); }
        } else if (e.key === 'Escape') { closeMenu(); }
      });
      // mousedown (not click) so selection fires before the input's blur closes the menu.
      stateMenu.addEventListener('mousedown', function (e) {
        var opt = e.target.closest('.cl-pack-state-option');
        if (!opt) return;
        e.preventDefault();
        selectValue(opt.getAttribute('data-value'));
      });
      document.addEventListener('click', function (e) {
        if (!stateWrap.contains(e.target)) closeMenu();
      });
    } else if (stateInput) {
      stateInput.addEventListener('input', function () { page = 1; apply(); });
    }
    if (sortSelect) sortSelect.addEventListener('change', function () { page = 1; apply(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-cl-state-clear]'), function (btn) {
      btn.addEventListener('click', function () { if (stateInput) stateInput.value = ''; page = 1; apply(); if (stateInput) stateInput.focus(); });
    });
    if (pager) pager.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-cl-page]');
      if (!btn || btn.disabled) return;
      var p = Number(btn.getAttribute('data-cl-page'));
      if (p >= 1) goToPage(p);
    });

    if (toolbar) toolbar.hidden = false;
    apply();
  }

  function boot() {
    document.querySelectorAll('[data-cl-pack-grid] [data-cl-card]').forEach(initCard);
    initControls();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
