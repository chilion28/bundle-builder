/* CityLocs pack-builder catalog presenter — schema v1. */
(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function create(config, root) {
    config = config || {};
    if (config.enabled !== true || config.mode !== 'client' || !root) return null;

    var grid = root.querySelector('[data-cl-pack-grid]');
    var toolbar = root.querySelector('[data-cl-catalog-tools]');
    var pager = root.querySelector('[data-cl-pagination]');
    var count = root.querySelector('[data-cl-result-count]');
    var empty = root.querySelector('[data-cl-no-results]');
    var search = root.querySelector('[data-cl-state-filter]');
    var clearButtons = root.querySelectorAll('[data-cl-state-clear]');
    var sort = root.querySelector('[data-cl-sort]');
    if (!grid) return null;

    var pageSize = Math.max(1, Number(config.pageSize) || 12);
    var page = 1;
    var timer = null;
    var cards = Array.prototype.slice.call(grid.querySelectorAll('[data-cl-pack-card]:not([data-cl-soldout])'));
    var stateWrap = search && search.parentElement;
    var stateMenu = null;
    var activeIndex = -1;

    grid.querySelectorAll('[data-cl-soldout]').forEach(function (card) { card.hidden = true; });
    cards.forEach(function (card, index) {
      card.__clCatalogOrder = index;
      card.__clCatalogTitle = (card.getAttribute('data-cl-title') || '').toLowerCase();
      card.__clCatalogSearch = (card.getAttribute('data-cl-catalog-search') || card.__clCatalogTitle).toLowerCase();
      card.__clCatalogState = card.getAttribute('data-cl-catalog-state') || '';
    });

    var states = Array.from(new Set(cards.map(function (card) { return card.__clCatalogState; }).filter(Boolean))).sort();

    function matches() {
      var query = (search && search.value || '').trim().toLowerCase();
      var list = cards.filter(function (card) {
        if (!query) return true;
        return card.__clCatalogState.toLowerCase().indexOf(query) !== -1 || card.__clCatalogSearch.indexOf(query) !== -1;
      });
      var order = sort ? sort.value : 'featured';
      list.sort(function (a, b) {
        if (order === 'az' || order === 'za') {
          var result = a.__clCatalogTitle < b.__clCatalogTitle ? -1 : (a.__clCatalogTitle > b.__clCatalogTitle ? 1 : 0);
          return order === 'za' ? -result : result;
        }
        return a.__clCatalogOrder - b.__clCatalogOrder;
      });
      return list;
    }

    function renderPager(totalPages) {
      if (!pager) return;
      if (totalPages <= 1) { pager.hidden = true; pager.innerHTML = ''; return; }
      var parts = ['<button type="button" class="cl-pack-page" data-cl-page="' + (page - 1) + '"' + (page === 1 ? ' disabled' : '') + '>‹ Prev</button>'];
      var numbers = [];
      for (var number = 1; number <= totalPages; number += 1) {
        if (number === 1 || number === totalPages || (number >= page - 1 && number <= page + 1)) numbers.push(number);
        else if (numbers[numbers.length - 1] !== '…') numbers.push('…');
      }
      numbers.forEach(function (number) {
        if (number === '…') parts.push('<span class="cl-pack-page-gap">…</span>');
        else parts.push('<button type="button" class="cl-pack-page' + (number === page ? ' is-current' : '') + '" data-cl-page="' + number + '">' + number + '</button>');
      });
      parts.push('<button type="button" class="cl-pack-page" data-cl-page="' + (page + 1) + '"' + (page === totalPages ? ' disabled' : '') + '>Next ›</button>');
      pager.innerHTML = parts.join('');
      pager.hidden = false;
    }

    function apply() {
      var list = matches();
      var total = list.length;
      var pages = Math.max(1, Math.ceil(total / pageSize));
      if (page > pages) page = pages;
      var start = (page - 1) * pageSize;
      var end = start + pageSize;
      var included = new Set(list);

      list.forEach(function (card, index) {
        grid.appendChild(card); // Move existing nodes; never rebuild personalized cards.
        card.hidden = index < start || index >= end;
      });
      cards.forEach(function (card) { if (!included.has(card)) card.hidden = true; });

      grid.hidden = total === 0;
      if (empty) empty.hidden = total !== 0;
      if (count) count.textContent = total ? ((start + 1) + '–' + Math.min(end, total) + ' of ' + total) : '';
      clearButtons.forEach(function (button) { button.hidden = !(search && search.value); });
      renderPager(pages);
    }

    function renderStateMenu() {
      if (!stateMenu || !search) return;
      var query = search.value.trim().toLowerCase();
      var options = states.filter(function (state) { return !query || state.toLowerCase().indexOf(query) !== -1; });
      activeIndex = -1;
      stateMenu.innerHTML = options.length ? options.map(function (state) {
        return '<button type="button" class="cl-pack-state-option" role="option" data-cl-state-value="' + escapeHtml(state) + '">' + escapeHtml(state) + '</button>';
      }).join('') : '<div class="cl-pack-state-empty">No states match</div>';
      stateMenu.hidden = false;
    }

    function closeStateMenu() { if (stateMenu) stateMenu.hidden = true; activeIndex = -1; }

    if (toolbar) toolbar.hidden = false;
    if (search && stateWrap) {
      stateMenu = document.createElement('div');
      stateMenu.className = 'cl-pack-state-menu';
      stateMenu.hidden = true;
      stateMenu.setAttribute('role', 'listbox');
      stateWrap.appendChild(stateMenu);
      search.addEventListener('focus', renderStateMenu);
      search.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () { page = 1; renderStateMenu(); apply(); }, Number(config.debounceMs) || 150);
      });
      search.addEventListener('keydown', function (event) {
        var options = stateMenu ? stateMenu.querySelectorAll('[data-cl-state-value]') : [];
        if (event.key === 'Escape') { closeStateMenu(); return; }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return;
        event.preventDefault();
        if (event.key === 'Enter' && activeIndex >= 0 && options[activeIndex]) options[activeIndex].click();
        else if (options.length) {
          activeIndex = event.key === 'ArrowUp' ? Math.max(0, activeIndex - 1) : Math.min(options.length - 1, activeIndex + 1);
          options[activeIndex].focus();
        }
      });
      stateMenu.addEventListener('click', function (event) {
        var option = event.target.closest('[data-cl-state-value]');
        if (!option) return;
        search.value = option.getAttribute('data-cl-state-value');
        page = 1; closeStateMenu(); apply();
      });
      document.addEventListener('click', function (event) { if (!stateWrap.contains(event.target)) closeStateMenu(); });
    }

    clearButtons.forEach(function (button) {
      button.addEventListener('click', function () { if (search) search.value = ''; page = 1; closeStateMenu(); apply(); });
    });
    if (sort) sort.addEventListener('change', function () { page = 1; apply(); });
    if (pager) pager.addEventListener('click', function (event) {
      var button = event.target.closest('[data-cl-page]');
      if (!button || button.disabled) return;
      page = Number(button.getAttribute('data-cl-page')) || 1;
      apply();
      if (toolbar && toolbar.scrollIntoView) toolbar.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    apply();
    return {
      apply: apply,
      reveal: function (criteria) {
        criteria = criteria || {};
        var card = cards.filter(function (candidate) { return !criteria.handle || candidate.getAttribute('data-cl-handle') === criteria.handle; })[0] || null;
        if (!card) return null;
        if (search && matches().indexOf(card) === -1) search.value = '';
        var ordered = matches();
        var index = ordered.indexOf(card);
        if (index >= 0) page = Math.floor(index / pageSize) + 1;
        apply();
        return card;
      }
    };
  }

  window.CLPackCatalog = { create: create };
}());
