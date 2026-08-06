(() => {
  const config = window.CL_ZEPTO_RECOVERY;

  if (!config || window.__clZeptoRecoveryStarted) return;
  window.__clZeptoRecoveryStarted = true;

  const renderedFieldSelector =
    '.product-personalizer .pplr-wrapper:not(#cl-zepto-custom-text-fallback) ' +
    'input[name="properties[Custom Text]"]';
  const fallbackId = 'cl-zepto-custom-text-fallback';
  const statusId = 'cl-zepto-personalization-status';
  let retryCount = 0;

  function productForm() {
    return document.querySelector(
      `form[action*="/cart/add"][data-product-form]`
    );
  }

  function renderedField() {
    return document.querySelector(renderedFieldSelector);
  }

  function removeFallback() {
    document.getElementById(fallbackId)?.remove();
  }

  function removeStatus() {
    document.getElementById(statusId)?.remove();
  }

  function ensureMount() {
    let mount = document.getElementById(`pplr-${config.productId}`);
    if (mount) return mount;

    const form = productForm();
    if (!form) return null;

    mount = document.createElement('div');
    mount.id = `pplr-${config.productId}`;
    mount.className = 'product-personalizer';
    mount.dataset.id = config.productId;
    mount.dataset.handle = config.handle;

    const quantity = form.querySelector('[data-quantity-wrapper]');
    form.insertBefore(mount, quantity || form.firstChild);
    return mount;
  }

  function showLoadingStatus() {
    if (renderedField() || document.getElementById(statusId)) return;

    const mount = ensureMount();
    if (!mount) return;

    const status = document.createElement('div');
    status.id = statusId;
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.style.cssText =
      'box-sizing:border-box;width:100%;margin:0 0 16px;padding:14px 16px;' +
      'background:#f5f7f9;border:1px solid #d9dfe5;color:#333;font-size:14px;' +
      'line-height:1.4;text-align:center;';
    status.textContent = 'Loading personalization…';
    mount.parentElement?.insertBefore(status, mount);
  }

  function showFailureStatus() {
    const mount = ensureMount();
    if (!mount || renderedField()) return;

    let status = document.getElementById(statusId);
    if (!status) {
      showLoadingStatus();
      status = document.getElementById(statusId);
    }
    if (!status) return;

    status.setAttribute('role', 'alert');
    status.innerHTML =
      '<strong>Personalization preview failed to load.</strong><br>' +
      'You can still enter your custom text below, or ' +
      '<button type="button" data-cl-zepto-refresh ' +
      'style="appearance:none;padding:0;border:0;background:none;color:#0878b9;' +
      'font:inherit;font-weight:700;text-decoration:underline;cursor:pointer">' +
      'refresh the page</button> to try again.';

    status.querySelector('[data-cl-zepto-refresh]')?.addEventListener('click', () => {
      window.location.reload();
    });
  }

  function retryZepto() {
    if (renderedField() || retryCount >= 2) return;
    if (!ensureMount()) return;

    retryCount += 1;
    const script = document.createElement('script');
    script.async = true;
    script.src =
      `https://cdn-zeptoapps.com/product-personalizer/canvas-script.php` +
      `?shop=${encodeURIComponent(config.shop)}` +
      `&prid=${encodeURIComponent(config.productId)}` +
      `&kkr=tomato&cl_retry=${Date.now()}`;
    document.head.appendChild(script);
  }

  function showFallback() {
    if (renderedField() || document.getElementById(fallbackId)) return;

    const mount = ensureMount();
    if (!mount) return;

    const wrapper = document.createElement('div');
    wrapper.id = fallbackId;
    wrapper.className = 'pplr-wrapper pplr-text pplr-custom-text';
    wrapper.innerHTML =
      '<label class="pplrlabel" for="cl-zepto-custom-text">Custom Text</label>' +
      '<input id="cl-zepto-custom-text" required type="text" maxlength="20" ' +
      'name="properties[Custom Text]" placeholder="CUSTOM" autocomplete="off" ' +
      'style="box-sizing:border-box;width:100%;min-height:48px;padding:10px 12px;' +
      'border:1px solid #d9d9d9;font:inherit;text-transform:uppercase">' +
      '<p style="margin:6px 0 0;font-size:12px;color:#666">' +
      'Preview is temporarily unavailable, but your custom text will be saved.</p>';
    mount.appendChild(wrapper);
  }

  const observer = new MutationObserver(() => {
    if (renderedField()) {
      removeFallback();
      removeStatus();
    }
  });

  function start() {
    observer.observe(document.documentElement, { childList: true, subtree: true });
    showLoadingStatus();

    window.setTimeout(retryZepto, 7000);
    window.setTimeout(retryZepto, 14000);
    window.setTimeout(() => {
      showFallback();
      showFailureStatus();
    }, 20000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
