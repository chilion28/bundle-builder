const discountFetch = fetch('https://citylocs.com/apps/clapp/discount-build')
  .then(response => response.json())
  .then(discountData => discountData)