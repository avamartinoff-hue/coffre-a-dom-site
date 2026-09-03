/* =========================================================
   COFFRE À DOM — Panier localStorage
   Panier local ; la commande est créée côté serveur (Supabase) puis payée par TWINT/SumUp.
   ========================================================= */
(function () {
  'use strict';
  var KEY = 'cad_cart_v1';
  var B = window.__BASE__ || '';
  var I = window.__I18N__ || {};
  var T = function (k, f) { return I[k] != null ? I[k] : f; };

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch (e) { return []; }
  }
  function save(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
    updateBadge();
    document.dispatchEvent(new CustomEvent('cart:change'));
  }
  function count() { return load().reduce(function (n, i) { return n + i.qty; }, 0); }
  function total() { return load().reduce(function (s, i) { return s + i.qty * i.price; }, 0); }
  function chf(n) { return 'CHF ' + Number(n).toFixed(2); }

  function add(item) {
    var items = load();
    var found = items.find(function (i) { return i.slug === item.slug; });
    var max = item.max || (found && found.max) || 0; // 0 = illimité
    if (found) { found.qty += item.qty; if (max) found.qty = Math.min(found.qty, max); if (item.max) found.max = item.max; if (item.preorder) found.preorder = true; }
    else { if (max) item.qty = Math.min(item.qty, max); items.push(item); }
    save(items);
  }
  function setQty(slug, qty) {
    var items = load().map(function (i) { return i.slug === slug ? Object.assign({}, i, { qty: (i.max ? Math.min(qty, i.max) : qty) }) : i; })
      .filter(function (i) { return i.qty > 0; });
    save(items);
  }
  function remove(slug) { save(load().filter(function (i) { return i.slug !== slug; })); }

  function updateBadge() {
    var c = count();
    document.querySelectorAll('[data-cart-count]').forEach(function (el) {
      el.textContent = c;
      el.classList.toggle('is-empty', c === 0);
    });
  }

  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('in'); });
    setTimeout(function () { t.classList.remove('in'); setTimeout(function () { t.remove(); }, 300); }, 2200);
  }

  /* ---- add-to-cart buttons ---- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-add]');
    if (!btn) return;
    e.preventDefault();
    var qty = 1;
    if (btn.hasAttribute('data-qty-source')) {
      var input = document.querySelector('[data-qty-input]');
      qty = Math.max(1, parseInt(input && input.value, 10) || 1);
    }
    var max = parseInt(btn.getAttribute('data-max'), 10) || 0; // 0 = illimité
    if (max) qty = Math.min(qty, max);
    var preorder = btn.hasAttribute('data-preorder');
    add({
      slug: btn.dataset.slug,
      name: btn.dataset.name,
      price: parseFloat(btn.dataset.price),
      qty: qty,
      preorder: preorder,
      max: max || null
    });
    toast((preorder ? T('preordered', '🔒 Précommandé : ') : T('added', 'Ajouté au panier : ')) + btn.dataset.name);
  });

  /* ---- quantity stepper (product page) ---- */
  document.addEventListener('click', function (e) {
    var wrap = e.target.closest('[data-qty]');
    if (!wrap) return;
    var input = wrap.querySelector('[data-qty-input]');
    var v = parseInt(input.value, 10) || 1;
    var max = parseInt(wrap.getAttribute('data-max'), 10) || 0; // 0 = illimité
    if (e.target.closest('[data-qty-plus]')) input.value = max ? Math.min(max, v + 1) : v + 1;
    if (e.target.closest('[data-qty-minus]')) input.value = Math.max(1, v - 1);
  });

  /* ---- render cart page ---- */
  function renderCart() {
    var view = document.querySelector('[data-cart-view]');
    if (!view) return;
    var items = load();
    if (!items.length) {
      view.innerHTML = '<p class="empty" data-cart-empty>' + T('cart_empty', 'Votre panier est vide pour l\'instant.') + ' <a href="' + B + '/boutique/">' + T('explore_shop', 'Explorer la boutique →') + '</a></p>';
      return;
    }
    var rows = items.map(function (i) {
      return '<div class="cart-row" data-row="' + i.slug + '">' +
        '<div class="cart-row__name">' + i.name + (i.preorder ? ' <span class="preorder-tag">' + T('preorder_tag', 'Précommande') + '</span>' : '') + '</div>' +
        '<div class="cart-row__qty">' +
          '<button type="button" data-dec="' + i.slug + '" aria-label="' + T('minus', 'Moins') + '">−</button>' +
          '<span>' + i.qty + '</span>' +
          '<button type="button" data-inc="' + i.slug + '" aria-label="' + T('plus', 'Plus') + '">+</button>' +
        '</div>' +
        '<div class="cart-row__price">' + chf(i.qty * i.price) + '</div>' +
        '<button class="cart-row__rm" type="button" data-rm="' + i.slug + '" aria-label="' + T('remove', 'Retirer') + '">✕</button>' +
      '</div>';
    }).join('');
    view.innerHTML =
      '<div class="cart-table">' + rows + '</div>' +
      '<div class="cart-foot">' +
        '<div class="cart-total">' + T('total', 'Total') + ' <b>' + chf(total()) + '</b></div>' +
        '<div class="cart-actions">' +
          '<a href="' + B + '/boutique/" class="btn btn--ghost btn--sm">' + T('continue', 'Continuer mes achats') + '</a>' +
          '<a href="' + B + '/commander/" class="btn btn--gold">' + T('checkout', 'Commander →') + '</a>' +
        '</div>' +
      '</div>';
  }

  /* ---- render order summary (commander page) ---- */
  function renderSummary() {
    var box = document.querySelector('[data-order-summary]');
    if (!box) return;
    var items = load();
    var field = document.querySelector('[data-cart-field]');
    if (!items.length) {
      box.innerHTML = '<p class="empty">' + T('summary_empty', 'Votre panier est vide.') + ' <a href="' + B + '/boutique/">' + T('add_articles', 'Ajouter des articles →') + '</a></p>';
    } else {
      box.innerHTML = '<h2 class="cat__subtitle">' + T('your_order', 'Votre commande') + '</h2><div class="cart-table">' +
        items.map(function (i) {
          return '<div class="cart-row"><div class="cart-row__name">' + i.qty + '× ' + i.name +
            (i.preorder ? ' <span class="preorder-tag">' + T('preorder_tag', 'Précommande') + '</span>' : '') +
            '</div><div class="cart-row__price">' + chf(i.qty * i.price) + '</div></div>';
        }).join('') +
        '</div><div class="cart-foot"><div class="cart-total">' + T('total', 'Total') + ' <b>' + chf(total()) + '</b></div></div>';
    }
    if (field) {
      field.value = items.map(function (i) { return (i.preorder ? '[PRÉCOMMANDE] ' : '') + i.qty + 'x ' + i.name + ' (' + chf(i.price) + ')'; }).join(' · ')
        + ' | TOTAL ' + chf(total());
    }
  }

  document.addEventListener('click', function (e) {
    var inc = e.target.closest('[data-inc]'), dec = e.target.closest('[data-dec]'), rm = e.target.closest('[data-rm]');
    if (inc) { var s = inc.dataset.inc; setQty(s, (load().find(function (i) { return i.slug === s; }).qty) + 1); }
    if (dec) { var d = dec.dataset.dec; setQty(d, (load().find(function (i) { return i.slug === d; }).qty) - 1); }
    if (rm) remove(rm.dataset.rm);
  });

  document.addEventListener('cart:change', function () { renderCart(); renderSummary(); });

  document.addEventListener('DOMContentLoaded', function () {
    updateBadge(); renderCart(); renderSummary();
  });

  window.CADCart = { add: add, load: load, count: count, total: total };
})();
