/* =========================================================
   COFFRE À DOM — Boutique : recherche + filtres + tri (client-side)
   Filtre et trie les fiches déjà rendues, sans rechargement.
   ========================================================= */
(function () {
  'use strict';
  var grid = document.getElementById('shopGrid');
  if (!grid) return;
  var I = window.__I18N__ || {};
  var T = function (k, f) { return I[k] != null ? I[k] : f; };

  var cards = [].slice.call(grid.querySelectorAll('.pcard'));
  var search = document.getElementById('shopSearch');
  var onSale = document.getElementById('onSaleOnly');
  var priceMin = document.getElementById('priceMin');
  var priceMax = document.getElementById('priceMax');
  var sortSel = document.getElementById('shopSort');
  var countEl = document.querySelector('[data-shop-count]');
  var emptyEl = document.querySelector('[data-shop-empty]');
  var catRadios = document.querySelectorAll('input[name="shopcat"]');

  var norm = function (s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  };
  // pré-calcule les données de chaque carte
  cards.forEach(function (c, i) {
    c._name = norm(c.getAttribute('data-name'));
    c._cats = (c.getAttribute('data-cats') || '').split(' ');
    c._stock = c.getAttribute('data-stock') === '1';
    c._sale = c.getAttribute('data-sale') === '1';
    c._price = parseFloat(c.getAttribute('data-price')) || 0;
    c._created = parseInt(c.getAttribute('data-created'), 10) || 0;
    c._pos = i; // ordre d'origine (position back office)
  });

  function selectedCat() {
    for (var i = 0; i < catRadios.length; i++) if (catRadios[i].checked) return catRadios[i].value;
    return '';
  }

  function sortCards() {
    var mode = sortSel ? sortSel.value : 'recent';
    var arr = cards.slice();
    if (mode === 'price-asc') arr.sort(function (a, b) {
      // les articles « sur demande » (prix 0) partent en fin de liste
      var pa = a._price > 0 ? a._price : Infinity;
      var pb = b._price > 0 ? b._price : Infinity;
      return pa - pb || a._pos - b._pos;
    });
    else if (mode === 'price-desc') arr.sort(function (a, b) { return b._price - a._price || a._pos - b._pos; });
    else if (mode === 'name') arr.sort(function (a, b) { return a._name < b._name ? -1 : a._name > b._name ? 1 : 0; });
    else if (mode === 'recent') arr.sort(function (a, b) { return b._created - a._created || a._pos - b._pos; });
    else arr.sort(function (a, b) { return a._pos - b._pos; }); // vedette / défaut
    // ré-ordonne le DOM (appendChild déplace le nœud existant)
    arr.forEach(function (c) { grid.appendChild(c); });
  }

  function apply() {
    var q = norm(search && search.value);
    var cat = selectedCat();
    var wantSale = onSale && onSale.checked;
    var min = priceMin && priceMin.value !== '' ? parseFloat(priceMin.value) : null;
    var max = priceMax && priceMax.value !== '' ? parseFloat(priceMax.value) : null;
    var shown = 0;

    cards.forEach(function (c) {
      var ok = (!q || c._name.indexOf(q) !== -1) &&
        (!cat || c._cats.indexOf(cat) !== -1) &&
        (!wantSale || c._sale) &&
        (min == null || c._price >= min) &&
        (max == null || c._price <= max);
      c.style.display = ok ? '' : 'none';
      if (ok) shown++;
    });

    if (countEl) countEl.textContent = shown + ' ' + (shown > 1 ? T('pieces', 'pièces') : T('piece', 'pièce'));
    if (emptyEl) emptyEl.hidden = shown !== 0;
  }

  function reset() {
    if (search) search.value = '';
    if (onSale) onSale.checked = false;
    if (priceMin) priceMin.value = '';
    if (priceMax) priceMax.value = '';
    if (catRadios[0]) catRadios[0].checked = true;
    apply();
  }

  var t;
  if (search) search.addEventListener('input', function () { clearTimeout(t); t = setTimeout(apply, 120); });
  catRadios.forEach ? catRadios.forEach(bind) : [].forEach.call(catRadios, bind);
  function bind(r) { r.addEventListener('change', apply); }
  if (onSale) onSale.addEventListener('change', apply);
  if (priceMin) priceMin.addEventListener('input', function () { clearTimeout(t); t = setTimeout(apply, 200); });
  if (priceMax) priceMax.addEventListener('input', function () { clearTimeout(t); t = setTimeout(apply, 200); });
  if (sortSel) sortSel.addEventListener('change', sortCards);
  document.addEventListener('click', function (e) {
    if (e.target.id === 'shopReset' || e.target.id === 'shopReset2') reset();
  });

  sortCards();
  apply();
})();
