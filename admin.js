/* =========================================================
   COFFRE À DOM — Back office (tableau de bord, commandes, produits)
   ========================================================= */
(function () {
  'use strict';
  var login = document.querySelector('[data-admin-login]');
  if (!login) return;
  var KEY = 'cad_admin_pwd';
  var SHIP_POSTE = 8.9; // affichage indicatif — le serveur recalcule le total réel
  var dash = document.querySelector('[data-admin-dash]');
  var hero = document.querySelector('[data-admin-hero]');
  var msg = document.querySelector('[data-admin-msg]');
  var flash = document.querySelector('[data-admin-flash]');
  var chf = function (n) { return 'CHF ' + Number(n || 0).toFixed(2); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };
  // Adresse de livraison structurée → ligne lisible (compatible ancien format { adresse })
  var fmtAddr = function (a) {
    if (!a || typeof a !== 'object') return '';
    if (a.adresse) return '<br><span class="ord__addr">' + esc(a.adresse) + '</span>';
    var l1 = [a.rue, a.numero].filter(Boolean).join(' ');
    var l2 = [a.npa, a.localite].filter(Boolean).join(' ');
    var full = [l1, l2].filter(Boolean).join(', ');
    return full ? '<br><span class="ord__addr">' + esc(full) + '</span>' : '';
  };
  var pwd = function () { try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; } };
  var frDate = function (iso) { try { return new Date(iso).toLocaleString('fr-CH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return iso; } };

  function api(method, fn, body) {
    return fetch('/.netlify/functions/' + fn, {
      method: method, headers: { 'Content-Type': 'application/json', 'x-admin-password': pwd() },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      if (r.status === 401) { logout(); throw new Error('401'); }
      return r.json();
    });
  }
  function showFlash(t, ok) {
    if (!flash) return;
    flash.hidden = false; flash.textContent = t; flash.className = 'admin-flash ' + (ok ? 'is-ok' : 'is-err');
    setTimeout(function () { flash.hidden = true; }, 4000);
  }
  function logout() { try { sessionStorage.removeItem(KEY); } catch (e) {} dash.hidden = true; login.hidden = false; if (hero) hero.hidden = false; }

  /* ---------- Onglets ---------- */
  var tabs = document.querySelectorAll('.admin-tab');
  var panels = { stats: document.querySelector('[data-panel="stats"]'), orders: document.querySelector('[data-panel="orders"]'), products: document.querySelector('[data-panel="products"]'), categories: document.querySelector('[data-panel="categories"]'), promos: document.querySelector('[data-panel="promos"]') };
  var loaded = {};
  function switchTab(name) {
    tabs.forEach(function (t) { t.classList.toggle('is-active', t.getAttribute('data-tab') === name); });
    Object.keys(panels).forEach(function (k) { if (panels[k]) panels[k].hidden = k !== name; });
    if (name === 'stats') loadStats();
    if (name === 'orders') loadOrders();
    if (name === 'products') loadProducts();
    if (name === 'categories') loadCategoriesTab();
    if (name === 'promos') loadPromos();
  }
  tabs.forEach(function (t) { t.addEventListener('click', function () { switchTab(t.getAttribute('data-tab')); }); });

  /* ========== TABLEAU DE BORD ========== */
  function bars(map, fmt) {
    var vals = Object.values(map); var max = Math.max.apply(null, vals.concat([1]));
    return '<div class="chart">' + Object.keys(map).map(function (d) {
      var v = map[d]; var h = Math.round((v / max) * 100);
      return '<div class="chart__col" title="' + d + ' : ' + (fmt ? fmt(v) : v) + '"><span class="chart__bar" style="height:' + Math.max(2, h) + '%"></span></div>';
    }).join('') + '</div>';
  }
  var STATS_PERIOD = 30;
  var PERIOD_LABELS = { 1: 'Aujourd\'hui', 7: '7 jours', 30: '30 jours', 90: '90 jours' };
  function periodSelector() {
    return '<div class="period-sel">' + [1, 7, 30, 90].map(function (n) {
      return '<button type="button" class="period-btn' + (n === STATS_PERIOD ? ' is-active' : '') + '" data-statsperiod="' + n + '">' + PERIOD_LABELS[n] + '</button>';
    }).join('') + '</div>';
  }
  function loadStats(days) {
    if (days) STATS_PERIOD = days;
    panels.stats.innerHTML = '<p class="empty">Chargement…</p>';
    api('GET', 'admin-stats?days=' + STATS_PERIOD).then(function (d) {
      if (!d || !d.ok) { panels.stats.innerHTML = '<p class="empty">Erreur de chargement.</p>'; return; }
      var v = d.visits;
      var toValidate = d.toValidate || 0, toShip = d.toShip || 0;
      var lbl = PERIOD_LABELS[d.periodDays] || (d.periodDays + ' j');
      var lblLow = d.periodDays === 1 ? 'aujourd\'hui' : ('sur ' + lbl.toLowerCase());
      panels.stats.innerHTML =
        '<p class="dash-section-label">À traiter</p>' +
        '<div class="stat-cards stat-cards--actions">' +
          statCard('À valider', toValidate, 'paiement à confirmer', 'action' + (toValidate ? ' is-alert' : ''), 'orders') +
          statCard('À livrer', toShip, 'payées, à expédier / remettre', 'action' + (toShip ? ' is-alert' : ''), 'orders') +
        '</div>' +
        '<div class="dash-period"><p class="dash-section-label">Période</p>' + periodSelector() + '</div>' +
        '<div class="stat-cards">' +
          statCard('CA ' + lbl, chf(d.revenuePeriod), d.ordersPeriod + ' commande' + (d.ordersPeriod > 1 ? 's' : '') + ' ' + lblLow) +
          statCard('Visites ' + lbl, v ? v.period : '—', v ? (v.today + ' aujourd\'hui') : 'compteur à activer') +
          statCard('CA aujourd\'hui', chf(d.revenueToday), d.ordersToday + ' commande' + (d.ordersToday > 1 ? 's' : '') + ' ce jour') +
          statCard('Chiffre d\'affaires', chf(d.revenue), 'total encaissé') +
          statCard('Commandes', d.ordersTotal, d.byStatus.paid + ' payées · ' + d.byStatus.pending + ' en attente') +
          statCard('Produits en ligne', d.products.visible + '/' + d.products.total, d.products.inStock + ' en stock') +
        '</div>' +
        '<div class="dash-grid">' +
          '<div class="dash-box"><h3>Chiffre d\'affaires (' + lbl + ')</h3>' + bars(d.revenueByDay, chf) + '</div>' +
          (v ? '<div class="dash-box"><h3>Visites (' + lbl + ')</h3>' + bars(v.byDay) + '</div>' : '') +
        '</div>' +
        '<div class="dash-grid">' +
          '<div class="dash-box"><h3>Top produits (payés)</h3>' + (d.topProducts.length ? '<ul class="rank">' + d.topProducts.map(function (p) { return '<li><span>' + esc(p.name) + '</span><b>' + chf(p.revenue) + '</b><small>' + p.qty + ' vendus</small></li>'; }).join('') + '</ul>' : '<p class="empty">Aucune vente payée pour l\'instant.</p>') + '</div>' +
          (v ? '<div class="dash-box"><h3>Pages les plus vues</h3><ul class="rank">' + v.topPaths.map(function (p) { return '<li><span>' + esc(p.path) + '</span><b>' + p.n + '</b></li>'; }).join('') + '</ul></div>' : '<div class="dash-box"><h3>Visites</h3><p class="empty">Le compteur de visites s\'active après avoir créé la table page_views (voir supabase/analytics.sql).</p></div>') +
        '</div>';
    }).catch(function () {});
  }
  function statCard(label, value, sub, mod, goto) {
    var cls = 'stat-card' + (mod ? ' stat-card--' + mod.replace(/ is-alert/, '') + (/is-alert/.test(mod) ? ' is-alert' : '') : '');
    var attr = goto ? ' data-goto="' + goto + '" role="button" tabindex="0"' : '';
    return '<div class="' + cls + '"' + attr + '><span class="stat-card__label">' + label + '</span><span class="stat-card__value">' + value + '</span><span class="stat-card__sub">' + sub + '</span></div>';
  }

  /* ========== CODES PROMO ========== */
  function loadPromos() {
    panels.promos.innerHTML = '<p class="empty">Chargement…</p>';
    api('GET', 'admin-promos').then(function (d) {
      if (!d || !d.ok) { panels.promos.innerHTML = '<p class="empty">Erreur. As-tu joué la migration <b>supabase/promo.sql</b> ?</p>'; return; }
      PROMOS = d.codes || [];
      var head = '<div class="promo-head"><p class="ord-stage__hint">Codes en % ou en CHF, avec panier minimum, date d\'expiration et limite d\'utilisation.</p>' +
        '<button class="btn btn--gold btn--sm" data-promonew>+ Nouveau code</button></div>';
      if (!PROMOS.length) { panels.promos.innerHTML = head + '<p class="empty">Aucun code promo pour l\'instant.</p>'; return; }
      var rows = PROMOS.map(function (p) {
        var val = p.kind === 'fixed' ? chf(p.value) : (p.value + ' %');
        var conds = [];
        if (p.min_amount > 0) conds.push('min ' + chf(p.min_amount));
        if (p.expires_at) conds.push('exp. ' + p.expires_at);
        var uses = p.used_count + (p.max_uses != null ? ' / ' + p.max_uses : '');
        return '<tr' + (p.active ? '' : ' class="promo-off"') + '>' +
          '<td><b>' + esc(p.code) + '</b></td><td>' + val + '</td><td>' + (conds.join(' · ') || '—') + '</td><td>' + uses + '</td>' +
          '<td><label class="tgl"><input type="checkbox" data-promotoggle="' + p.id + '"' + (p.active ? ' checked' : '') + '><span></span></label></td>' +
          '<td class="promo-actions"><button class="linkbtn" data-promoedit="' + p.id + '">Modifier</button> · <button class="linkbtn" data-promodel="' + p.id + '">Suppr.</button></td></tr>';
      }).join('');
      panels.promos.innerHTML = head + '<div class="promo-table-wrap"><table class="promo-table"><thead><tr><th>Code</th><th>Remise</th><th>Conditions</th><th>Util.</th><th>Actif</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }).catch(function () { panels.promos.innerHTML = '<p class="empty">Erreur.</p>'; });
  }
  function promoModal(p) {
    var isNew = !p;
    p = p || { code: '', kind: 'percent', value: '', min_amount: 0, expires_at: '', max_uses: '', active: true };
    var ov = document.createElement('div'); ov.className = 'modal-ov';
    ov.innerHTML = '<div class="modal"><button class="modal__x" data-mx>✕</button>' +
      '<h3>' + (isNew ? 'Nouveau code promo' : 'Modifier le code') + '</h3>' +
      '<label class="field"><span>Code</span><input data-pf="code" value="' + esc(p.code) + '" placeholder="Ex. BIENVENUE10" style="text-transform:uppercase"></label>' +
      '<div class="form__row"><label class="field"><span>Type</span><select data-pf="kind"><option value="percent"' + (p.kind !== 'fixed' ? ' selected' : '') + '>Pourcentage (%)</option><option value="fixed"' + (p.kind === 'fixed' ? ' selected' : '') + '>Montant fixe (CHF)</option></select></label>' +
        '<label class="field"><span>Valeur</span><input data-pf="value" type="number" step="0.01" value="' + esc(p.value) + '"></label></div>' +
      '<div class="form__row"><label class="field"><span>Panier minimum (CHF)</span><input data-pf="min_amount" type="number" step="0.05" value="' + esc(p.min_amount || 0) + '"></label>' +
        '<label class="field"><span>Limite d\'utilisations</span><input data-pf="max_uses" type="number" value="' + esc(p.max_uses == null ? '' : p.max_uses) + '" placeholder="illimité"></label></div>' +
      '<label class="field"><span>Date d\'expiration (optionnel)</span><input data-pf="expires_at" type="date" value="' + esc(p.expires_at || '') + '"></label>' +
      '<div class="modal__checks"><label><input type="checkbox" data-pf="active"' + (p.active ? ' checked' : '') + '> Actif</label></div>' +
      '<div class="modal__foot">' + (isNew ? '' : '<button class="btn btn--ghost btn--sm pt-del" data-pdel>Supprimer</button>') + '<span style="flex:1"></span><button class="btn btn--gold" data-psave>' + (isNew ? 'Créer' : 'Enregistrer') + '</button></div></div>';
    document.body.appendChild(ov);
    function close() { ov.remove(); }
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target.hasAttribute('data-mx')) close(); });
    ov.querySelector('[data-psave]').addEventListener('click', function () {
      var g = function (n) { var el = ov.querySelector('[data-pf="' + n + '"]'); if (!el) return ''; return el.type === 'checkbox' ? el.checked : el.value; };
      var fields = { code: g('code'), kind: g('kind'), value: g('value'), min_amount: g('min_amount'), max_uses: g('max_uses'), expires_at: g('expires_at'), active: g('active') };
      var btn = ov.querySelector('[data-psave]'); btn.disabled = true;
      var req = isNew ? api('POST', 'admin-promos', { action: 'create', fields: fields }) : api('POST', 'admin-promos', { action: 'update', id: p.id, fields: fields });
      req.then(function (r) { if (r && r.ok) { close(); showFlash(isNew ? 'Code créé.' : 'Code enregistré.', true); loadPromos(); } else { btn.disabled = false; showFlash((r && r.error) || 'Erreur.', false); } });
    });
    if (!isNew) ov.querySelector('[data-pdel]').addEventListener('click', function () { if (!confirm('Supprimer ce code ?')) return; api('POST', 'admin-promos', { action: 'delete', id: p.id }).then(function (r) { if (r && r.ok) { close(); showFlash('Code supprimé.', true); loadPromos(); } }); });
  }

  /* ========== COMMANDES (suivi par étapes) ========== */
  var STATUS = { pending: '⏳ En attente', paid: '✅ Payée', failed: '❌ Échec', cancelled: '🚫 Annulée' };
  var ORDERS = [], PROMOS = [];
  // Étape de traitement d'une commande
  function orderStage(o) {
    if (o.payment_status === 'cancelled' || o.payment_status === 'failed') return 'archived';
    if (o.payment_status === 'pending') return 'validate';   // à valider (paiement)
    if (o.payment_status === 'paid' && !o.fulfilled_at) return 'ship'; // à livrer / remettre
    return 'done'; // payée + expédiée/remise
  }
  var STAGES = [
    { key: 'validate', label: '🕒 À valider', hint: 'Paiement à confirmer (TWINT, virement…)' },
    { key: 'ship', label: '📦 À livrer / remettre', hint: 'Payées — à expédier ou remettre en main propre' },
    { key: 'done', label: '✅ Terminées', hint: 'Payées et livrées', collapsed: true },
    { key: 'archived', label: '🚫 Annulées / échec', hint: '', collapsed: true },
  ];
  function orderCard(o) {
    var items = (o.order_items || []).map(function (i) { return esc(i.qty + '× ' + i.name); }).join('<br>');
    var stage = orderStage(o);
    var a = '';
    // Actions contextuelles selon l'étape
    if (stage === 'validate') {
      a += '<button class="btn btn--gold btn--sm" data-oset="paid" data-id="' + o.id + '">✓ Marquer payée</button>';
      a += '<button class="btn btn--ghost btn--sm" data-oset="cancelled" data-id="' + o.id + '">Annuler</button>';
    } else if (stage === 'ship') {
      var lbl = o.shipping_mode === 'poste' ? '📦 Marquer expédiée' : '🏪 Marquer remise';
      a += '<button class="btn btn--gold btn--sm" data-ofulfill="1" data-id="' + o.id + '">' + lbl + '</button>';
      a += '<button class="btn btn--ghost btn--sm" data-oset="pending" data-id="' + o.id + '">↩ En attente</button>';
    } else if (stage === 'done') {
      a += '<button class="btn btn--ghost btn--sm" data-ofulfill="0" data-id="' + o.id + '">↩ Annuler l\'expédition</button>';
    } else { // archived
      a += '<button class="btn btn--gold btn--sm" data-oset="paid" data-id="' + o.id + '">✓ Marquer payée</button>';
      a += '<button class="btn btn--ghost btn--sm" data-oset="pending" data-id="' + o.id + '">↩ En attente</button>';
    }
    a += '<button class="btn btn--ghost btn--sm" data-oedit="' + o.id + '">✏️ Modifier</button>';
    if (o.email) a += '<button class="btn btn--ghost btn--sm" data-oresend="' + o.id + '">📧 Renvoyer</button>';
    if (o.shipping_mode === 'poste' && o.shipping_address) a += '<button class="btn btn--ghost btn--sm" data-olabel="' + o.id + '">🏷️ Étiquette' + (o.label_generated_at ? ' ↻' : '') + '</button>';
    var badge = STATUS[o.payment_status] || o.payment_status;
    if (o.fulfilled_at) badge += ' · ' + (o.shipping_mode === 'poste' ? '📦 Expédiée' : '🏪 Remise');
    return '<article class="ord ord--' + o.payment_status + (o.fulfilled_at ? ' ord--fulfilled' : '') + '">' +
      '<div class="ord__head"><label class="ord__sel" title="Sélectionner"><input type="checkbox" data-osel="' + o.id + '"' + (SELECTED_ORDERS[o.id] ? ' checked' : '') + '></label><b>' + esc(o.order_number) + '</b><span class="ord__status">' + badge + '</span></div>' +
      '<div class="ord__grid">' +
        '<div><span class="ord__k">Client</span>' + (o.email ? '<button class="linkbtn" data-oclient="' + esc(o.email) + '">' + esc(o.full_name) + '</button>' : esc(o.full_name)) + '<br>' + esc(o.email) + (o.phone ? '<br>' + esc(o.phone) : '') + '</div>' +
        '<div><span class="ord__k">Articles</span>' + (items || '—') + '</div>' +
        '<div><span class="ord__k">Livraison</span>' + (o.shipping_mode === 'poste' ? '📦 Poste' : '🏪 Retrait') + fmtAddr(o.shipping_address) + (o.tracking_number ? '<br><span class="ord__k">Suivi</span>' + esc(o.tracking_number) : '') + '<br><span class="ord__k">Paiement</span>' + (o.payment_method === 'twint' ? '📱 TWINT' : '💳 SumUp') + '</div>' +
        '<div><span class="ord__k">Total</span><b>' + chf(o.total) + '</b><br><span class="ord__date">' + frDate(o.created_at) + '</span></div>' +
      '</div>' + (o.note ? '<p class="ord__note">📝 ' + esc(o.note) + '</p>' : '') +
      '<div class="ord__actions">' + a + '</div></article>';
  }
  var ORDER_Q = '';
  var ORDER_FILTER = 'all';
  var SELECTED_ORDERS = {};
  var ORDER_FILTERS = [
    { k: 'all', label: 'Toutes' },
    { k: 'validate', label: '🕒 À valider' },
    { k: 'ship', label: '📦 À livrer' },
    { k: 'done', label: '✅ Terminées' },
    { k: 'archived', label: '🚫 Annulées' },
  ];
  function orderToolbar() {
    return '<div class="ord-toolbar">' +
      '<input class="ord-search" data-osearch placeholder="🔎 Nom, e-mail ou n° de commande…" value="' + esc(ORDER_Q) + '">' +
      '<button class="btn btn--gold btn--sm" data-onew>➕ Nouvelle commande</button>' +
      '<button class="btn btn--ghost btn--sm" data-oclients>👤 Clients</button>' +
      '</div>';
  }
  function bulkBar() {
    var n = Object.keys(SELECTED_ORDERS).length;
    return '<div class="ord-bulk" id="ord-bulk"' + (n ? '' : ' hidden') + '>' +
      '<b><span data-obulk-count>' + n + '</span> sélectionnée(s)</b>' +
      '<span class="ord-bulk__sep">Appliquer :</span>' +
      '<button class="btn btn--gold btn--sm" data-obulk="paid">✓ Payées</button>' +
      '<button class="btn btn--gold btn--sm" data-obulk="fulfill">📦 Livrées</button>' +
      '<button class="btn btn--ghost btn--sm" data-obulk="pending">🕒 En attente</button>' +
      '<button class="btn btn--ghost btn--sm" data-obulk="cancelled">🚫 Annuler</button>' +
      '<button class="linkbtn" data-obulk-clear>Désélectionner tout</button>' +
      '</div>';
  }
  function refreshBulkBar() {
    var bar = document.getElementById('ord-bulk'); if (!bar) return;
    var n = Object.keys(SELECTED_ORDERS).length;
    bar.hidden = n === 0;
    var c = bar.querySelector('[data-obulk-count]'); if (c) c.textContent = n;
  }
  function renderOrderBody() {
    var body = document.getElementById('ord-body'); if (!body) return;
    if (!ORDERS.length) { body.innerHTML = '<p class="empty">Aucune commande pour l\'instant.</p>'; return; }
    // Compteurs par état (sur tout le jeu de commandes)
    var cnt = { all: ORDERS.length, validate: 0, ship: 0, done: 0, archived: 0 };
    ORDERS.forEach(function (o) { cnt[orderStage(o)]++; });
    var chips = '<div class="ord-filters">' + ORDER_FILTERS.map(function (f) {
      return '<button class="ord-fbtn' + (ORDER_FILTER === f.k ? ' is-active' : '') + '" data-ofilter="' + f.k + '">' + f.label + ' <span>' + cnt[f.k] + '</span></button>';
    }).join('') + '</div>';

    var q = ORDER_Q.trim().toLowerCase();
    var list = ORDERS.filter(function (o) {
      if (!q) return true;
      return (o.order_number || '').toLowerCase().indexOf(q) !== -1
        || (o.full_name || '').toLowerCase().indexOf(q) !== -1
        || (o.email || '').toLowerCase().indexOf(q) !== -1
        || (o.phone || '').toLowerCase().indexOf(q) !== -1;
    });
    var groups = { validate: [], ship: [], done: [], archived: [] };
    list.forEach(function (o) { groups[orderStage(o)].push(o); });
    var stages = ORDER_FILTER === 'all' ? STAGES : STAGES.filter(function (s) { return s.key === ORDER_FILTER; });
    var sections = stages.map(function (s) {
      var g = groups[s.key];
      // En vue "Toutes" : étapes terminées/annulées masquées si vides. En vue filtrée : toujours affichée.
      if (ORDER_FILTER === 'all' && !g.length && s.collapsed) return '';
      var inner = g.length
        ? '<div class="ord-list">' + g.map(orderCard).join('') + '</div>'
        : '<p class="empty empty--sm">Aucune commande' + (q ? ' ne correspond à « ' + esc(ORDER_Q.trim()) + ' »' : ' à cette étape. 👍') + '</p>';
      return '<section class="ord-stage ord-stage--' + s.key + '">' +
        '<div class="ord-stage__head"><h3>' + s.label + ' <span class="ord-stage__n">' + g.length + '</span></h3>' +
        (s.hint ? '<p class="ord-stage__hint">' + s.hint + '</p>' : '') + '</div>' +
        inner + '</section>';
    }).join('');
    body.innerHTML = chips + bulkBar() + (sections || '<p class="empty">Aucune commande ne correspond à « ' + esc(ORDER_Q.trim()) + ' ».</p>');
  }
  function bulkApply(kind) {
    var ids = Object.keys(SELECTED_ORDERS); if (!ids.length) return;
    var labels = { paid: 'Payées', fulfill: 'Livrées', pending: 'En attente', cancelled: 'Annulées' };
    if (!confirm('Appliquer « ' + labels[kind] + ' » à ' + ids.length + ' commande(s) ?')) return;
    var calls = ids.map(function (id) {
      return kind === 'fulfill'
        ? api('POST', 'admin-orders', { action: 'set-fulfillment', orderId: id, fulfilled: true })
        : api('POST', 'admin-orders', { action: 'set-status', orderId: id, status: kind });
    });
    Promise.all(calls).then(function (rs) {
      var ok = rs.filter(function (r) { return r && r.ok; }).length;
      SELECTED_ORDERS = {};
      showFlash(ok + ' commande(s) mises à jour.', ok > 0);
      loadOrders();
    }).catch(function () { SELECTED_ORDERS = {}; showFlash('Erreur lors de l\'application en lot.', false); loadOrders(); });
  }
  function loadOrders() {
    panels.orders.innerHTML = orderToolbar() + '<div id="ord-body"><p class="empty">Chargement…</p></div>';
    api('GET', 'admin-orders').then(function (d) {
      if (!d || !d.ok) { var b = document.getElementById('ord-body'); if (b) b.innerHTML = '<p class="empty">Erreur.</p>'; return; }
      ORDERS = d.orders || [];
      renderOrderBody();
    }).catch(function () {});
  }

  /* ===== Historique & dépenses par client ===== */
  function clientsAgg() {
    var map = {};
    ORDERS.forEach(function (o) {
      var k = (o.email || '').toLowerCase(); if (!k) return;
      var m = map[k] || (map[k] = { email: o.email, name: o.full_name, orders: 0, spent: 0, last: o.created_at, phone: o.phone });
      m.orders++;
      if (o.payment_status === 'paid') m.spent += Number(o.total || 0);
      if (o.created_at > m.last) { m.last = o.created_at; m.name = o.full_name; m.phone = o.phone; }
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.spent - a.spent; });
  }
  function clientsModal() {
    var rows = clientsAgg();
    var ov = document.createElement('div'); ov.className = 'modal-ov';
    ov.innerHTML = '<div class="modal modal--lg"><button class="modal__x" data-mx>✕</button>' +
      '<h3>👤 Clients <small class="seo-hint">' + rows.length + ' client' + (rows.length > 1 ? 's' : '') + ' · triés par dépenses</small></h3>' +
      (rows.length ? '<table class="cli-table"><thead><tr><th>Client</th><th>Commandes</th><th>Dépensé</th><th>Dernière</th></tr></thead><tbody>' +
        rows.map(function (m) {
          return '<tr><td><button class="linkbtn" data-oclient="' + esc(m.email) + '">' + esc(m.name || m.email) + '</button><br><small>' + esc(m.email) + '</small></td>' +
            '<td>' + m.orders + '</td><td><b>' + chf(m.spent) + '</b></td><td><small>' + frDate(m.last) + '</small></td></tr>';
        }).join('') + '</tbody></table>' : '<p class="empty">Aucun client avec e-mail pour l\'instant.</p>') +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target.closest('[data-mx]')) ov.remove(); });
  }
  function clientModal(email) {
    var mine = ORDERS.filter(function (o) { return (o.email || '').toLowerCase() === String(email).toLowerCase(); })
      .sort(function (a, b) { return b.created_at < a.created_at ? -1 : 1; });
    if (!mine.length) return;
    var spent = mine.filter(function (o) { return o.payment_status === 'paid'; }).reduce(function (s, o) { return s + Number(o.total || 0); }, 0);
    var last = mine[0];
    var ov = document.createElement('div'); ov.className = 'modal-ov';
    ov.innerHTML = '<div class="modal modal--lg"><button class="modal__x" data-mx>✕</button>' +
      '<h3>' + esc(last.full_name || email) + '</h3>' +
      '<p class="seo-hint">' + esc(email) + (last.phone ? ' · ' + esc(last.phone) : '') + '</p>' +
      '<div class="cli-kpis"><div><b>' + mine.length + '</b><span>commande' + (mine.length > 1 ? 's' : '') + '</span></div>' +
        '<div><b>' + chf(spent) + '</b><span>dépensé (payé)</span></div>' +
        '<div><b>' + frDate(last.created_at) + '</b><span>dernière commande</span></div></div>' +
      '<table class="cli-table"><thead><tr><th>N°</th><th>Date</th><th>Statut</th><th>Total</th></tr></thead><tbody>' +
      mine.map(function (o) {
        return '<tr><td><b>' + esc(o.order_number) + '</b></td><td><small>' + frDate(o.created_at) + '</small></td>' +
          '<td>' + (STATUS[o.payment_status] || o.payment_status) + (o.fulfilled_at ? ' · ' + (o.shipping_mode === 'poste' ? '📦' : '🏪') : '') + '</td>' +
          '<td>' + chf(o.total) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target.closest('[data-mx]')) ov.remove(); });
  }

  /* ===== Création manuelle d'une commande ===== */
  function newOrderModal() {
    var picked = {}; // slug -> {name, price, qty}
    var ov = document.createElement('div'); ov.className = 'modal-ov';
    ov.innerHTML = '<div class="modal modal--lg"><button class="modal__x" data-mx>✕</button>' +
      '<h3>➕ Nouvelle commande</h3>' +
      '<label class="field"><span>Nom du client *</span><input data-nf="nom" placeholder="Prénom Nom"></label>' +
      '<div class="form__row"><label class="field"><span>E-mail</span><input data-nf="email" type="email" placeholder="client@exemple.ch"></label>' +
        '<label class="field"><span>Téléphone</span><input data-nf="telephone" placeholder="+41…"></label></div>' +
      '<label class="field"><span>Remise / retrait</span><select data-nf="mode"><option value="retrait">Retrait en boutique</option><option value="poste">Livraison postale</option></select></label>' +
      '<div data-naddr hidden>' +
        '<div class="form__row"><label class="field"><span>Rue</span><input data-na="rue"></label><label class="field"><span>N°</span><input data-na="numero"></label></div>' +
        '<div class="form__row"><label class="field"><span>NPA</span><input data-na="npa" inputmode="numeric" maxlength="4"></label><label class="field"><span>Localité</span><input data-na="localite"></label></div>' +
      '</div>' +
      '<div class="no-picker"><span class="ord__k">Articles</span>' +
        '<input class="ord-search" data-nsearch placeholder="🔎 Rechercher un produit…">' +
        '<div class="no-results" data-nresults hidden></div>' +
        '<div class="no-cart" data-ncart><p class="empty empty--sm">Aucun article. Cherchez un produit ci-dessus.</p></div>' +
      '</div>' +
      '<div class="form__row"><label class="field"><span>Statut</span><select data-nf="status"><option value="paid">Payée</option><option value="pending">En attente de paiement</option></select></label>' +
        '<label class="field field--check"><input type="checkbox" data-nf="sendEmail" checked><span>Envoyer l\'e-mail de confirmation</span></label></div>' +
      '<p class="no-total">Total : <b data-ntotal>CHF 0.00</b> <small class="seo-hint" data-nship></small></p>' +
      '<div class="modal__foot"><span style="flex:1"></span><button class="btn btn--gold" data-ncreate>Créer la commande</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    var results = ov.querySelector('[data-nresults]'), cartEl = ov.querySelector('[data-ncart]');
    function shipFee() { return ov.querySelector('[data-nf="mode"]').value === 'poste' ? Number(SHIP_POSTE) : 0; }
    function subtotal() { return Object.keys(picked).reduce(function (s, k) { return s + picked[k].price * picked[k].qty; }, 0); }
    function renderCart() {
      var keys = Object.keys(picked);
      cartEl.innerHTML = keys.length ? keys.map(function (k) {
        var it = picked[k];
        return '<div class="no-line"><span class="no-line__n">' + esc(it.name) + '</span>' +
          '<span class="no-line__p">' + chf(it.price) + '</span>' +
          '<input class="no-qty" type="number" min="1" max="99" value="' + it.qty + '" data-nqty="' + esc(k) + '">' +
          '<button class="linkbtn" data-ndel="' + esc(k) + '">✕</button></div>';
      }).join('') : '<p class="empty empty--sm">Aucun article. Cherchez un produit ci-dessus.</p>';
      var st = subtotal(), tot = st + shipFee();
      ov.querySelector('[data-ntotal]').textContent = chf(tot);
      ov.querySelector('[data-nship]').textContent = shipFee() > 0 ? '(dont ' + chf(shipFee()) + ' de port)' : '';
    }
    function renderResults(q) {
      q = (q || '').trim().toLowerCase();
      if (!q) { results.hidden = true; results.innerHTML = ''; return; }
      var list = PRODUCTS.filter(function (p) { return (p.name || '').toLowerCase().indexOf(q) !== -1; }).slice(0, 8);
      results.hidden = false;
      results.innerHTML = list.length ? list.map(function (p) {
        return '<button class="no-res" data-nadd="' + esc(p.slug) + '"><span>' + esc(p.name) + '</span><b>' + chf(p.price) + '</b></button>';
      }).join('') : '<p class="empty empty--sm">Aucun produit.</p>';
    }
    ov.querySelector('[data-nf="mode"]').addEventListener('change', function (e) { ov.querySelector('[data-naddr]').hidden = e.target.value !== 'poste'; renderCart(); });
    ov.querySelector('[data-nsearch]').addEventListener('input', function (e) { renderResults(e.target.value); });
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('[data-mx]')) { ov.remove(); return; }
      var add = e.target.closest('[data-nadd]');
      if (add) {
        var slug = add.getAttribute('data-nadd'); var p = PRODUCTS.filter(function (x) { return x.slug === slug; })[0];
        if (p) { if (picked[slug]) picked[slug].qty++; else picked[slug] = { name: p.name, price: Number(p.price), qty: 1 }; renderCart(); }
        ov.querySelector('[data-nsearch]').value = ''; results.hidden = true; results.innerHTML = ''; return;
      }
      var del = e.target.closest('[data-ndel]');
      if (del) { delete picked[del.getAttribute('data-ndel')]; renderCart(); return; }
      if (e.target.closest('[data-ncreate]')) {
        var g = function (n) { var el = ov.querySelector('[data-nf="' + n + '"]'); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; };
        var mode = g('mode');
        var customer = { nom: g('nom'), email: g('email'), telephone: g('telephone'), mode: mode };
        if (mode === 'poste') { var ga = function (n) { var el = ov.querySelector('[data-na="' + n + '"]'); return el ? el.value.trim() : ''; }; customer.rue = ga('rue'); customer.numero = ga('numero'); customer.npa = ga('npa'); customer.localite = ga('localite'); }
        var items = Object.keys(picked).map(function (k) { return { slug: k, qty: picked[k].qty }; });
        if (!customer.nom) { showFlash('Nom du client requis.', false); return; }
        if (!items.length) { showFlash('Ajoutez au moins un article.', false); return; }
        var btn = ov.querySelector('[data-ncreate]'); btn.disabled = true; btn.textContent = 'Création…';
        api('POST', 'admin-orders', { action: 'create-manual', customer: customer, items: items, status: g('status'), sendEmail: g('sendEmail') }).then(function (r) {
          if (r && r.ok) { ov.remove(); showFlash('Commande ' + r.orderNumber + ' créée ✅', true); loadOrders(); }
          else { btn.disabled = false; btn.textContent = 'Créer la commande'; showFlash((r && r.error) || 'Erreur.', false); }
        }).catch(function () { btn.disabled = false; btn.textContent = 'Créer la commande'; });
        return;
      }
    });
    renderCart();
    if (!PRODUCTS.length) api('GET', 'admin-products').then(function (d) { if (d && d.ok) { PRODUCTS = d.products || []; CATEGORIES = d.categories || CATEGORIES; } });
  }

  function orderModal(o) {
    var a = o.shipping_address || {};
    var isPoste = o.shipping_mode === 'poste';
    var ov = document.createElement('div');
    ov.className = 'modal-ov';
    ov.innerHTML =
      '<div class="modal"><button class="modal__x" data-mx>✕</button>' +
        '<h3>Modifier la commande ' + esc(o.order_number) + '</h3>' +
        '<label class="field"><span>Nom du client</span><input data-of="full_name" value="' + esc(o.full_name || '') + '"></label>' +
        '<div class="form__row"><label class="field"><span>E-mail</span><input data-of="email" type="email" value="' + esc(o.email || '') + '"></label>' +
          '<label class="field"><span>Téléphone</span><input data-of="phone" value="' + esc(o.phone || '') + '"></label></div>' +
        '<label class="field"><span>Livraison</span><select data-of="shipping_mode"><option value="retrait"' + (!isPoste ? ' selected' : '') + '>Retrait en boutique</option><option value="poste"' + (isPoste ? ' selected' : '') + '>Livraison postale</option></select></label>' +
        '<div data-oaddr' + (isPoste ? '' : ' hidden') + '>' +
          '<div class="form__row"><label class="field"><span>Rue</span><input data-oa="rue" value="' + esc(a.rue || '') + '"></label>' +
            '<label class="field"><span>N°</span><input data-oa="numero" value="' + esc(a.numero || '') + '"></label></div>' +
          '<div class="form__row"><label class="field"><span>NPA</span><input data-oa="npa" inputmode="numeric" maxlength="4" value="' + esc(a.npa || '') + '"></label>' +
            '<label class="field"><span>Localité</span><input data-oa="localite" value="' + esc(a.localite || '') + '"></label></div>' +
        '</div>' +
        '<label class="field"><span>Total (CHF) <em class="seo-hint">sous-total recalculé automatiquement</em></span><input data-of="total" type="number" step="0.05" value="' + esc(o.total) + '"></label>' +
        '<label class="field"><span>Note interne</span><textarea data-of="note" rows="2">' + esc(o.note || '') + '</textarea></label>' +
        '<div class="modal__foot"><span style="flex:1"></span><button class="btn btn--gold" data-osave>Enregistrer</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    function close() { ov.remove(); }
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target.hasAttribute('data-mx')) close(); });
    ov.querySelector('[data-of="shipping_mode"]').addEventListener('change', function (e) { ov.querySelector('[data-oaddr]').hidden = e.target.value !== 'poste'; });
    ov.querySelector('[data-osave]').addEventListener('click', function () {
      var g = function (n) { var el = ov.querySelector('[data-of="' + n + '"]'); return el ? el.value : ''; };
      var fields = { full_name: g('full_name'), email: g('email'), phone: g('phone'), shipping_mode: g('shipping_mode'), note: g('note'), total: g('total') };
      if (fields.shipping_mode === 'poste') {
        var ga = function (n) { var el = ov.querySelector('[data-oa="' + n + '"]'); return el ? el.value.trim() : ''; };
        fields.shipping_address = { rue: ga('rue'), numero: ga('numero'), npa: ga('npa'), localite: ga('localite') };
      } else { fields.shipping_address = null; }
      var btn = ov.querySelector('[data-osave]'); btn.disabled = true; btn.textContent = 'Enregistrement…';
      api('POST', 'admin-orders', { action: 'update-order', orderId: o.id, fields: fields }).then(function (r) {
        if (r && r.ok) { close(); showFlash('Commande mise à jour.', true); loadOrders(); }
        else { btn.disabled = false; btn.textContent = 'Enregistrer'; showFlash((r && r.error) || 'Erreur.', false); }
      }).catch(function () { btn.disabled = false; btn.textContent = 'Enregistrer'; });
    });
  }

  /* ===== Étiquettes La Poste ===== */
  function openPdfBase64(b64, name) {
    try {
      var bin = atob(b64), len = bin.length, bytes = new Uint8Array(len);
      for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
      var url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      var w = window.open(url, '_blank');
      if (!w) { var aEl = document.createElement('a'); aEl.href = url; aEl.download = (name || 'etiquette') + '.pdf'; document.body.appendChild(aEl); aEl.click(); aEl.remove(); }
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    } catch (e) { showFlash('Impossible d\'ouvrir le PDF.', false); }
  }
  function labelModal(o) {
    var x = o.shipping_address || {};
    var addr = [[x.rue, x.numero].filter(Boolean).join(' '), [x.npa, x.localite].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    var has = !!o.label_generated_at;
    var lastPdf = null; // PDF gardé en mémoire → ouverture via clic direct (pas de pop-up bloqué)
    var ov = document.createElement('div'); ov.className = 'modal-ov';
    ov.innerHTML = '<div class="modal"><button class="modal__x" data-mx>✕</button>' +
      '<h3>🏷️ Étiquette La Poste — ' + esc(o.order_number) + '</h3>' +
      '<p class="seo-hint">' + esc(o.full_name || '') + (addr ? ' · ' + esc(addr) : '') + '</p>' +
      (o.tracking_number ? '<p class="lbl-track">Dernier n° de suivi : <b>' + esc(o.tracking_number) + '</b></p>' : '') +
      '<div class="form__row"><label class="field"><span>Produit</span><select data-lf="product"><option value="PRI">PostPac Priority (rapide)</option><option value="ECO">PostPac Economy (éco)</option></select></label>' +
        '<label class="field"><span>Poids (g)</span><input data-lf="weight" type="number" min="1" step="50" value="1000"></label></div>' +
      '<div class="lbl-result" data-lresult hidden></div>' +
      '<div class="modal__foot">' +
        (has ? '<button class="btn btn--ghost btn--sm" data-lreprint>↻ Réimprimer la dernière</button>' : '') +
        '<span style="flex:1"></span>' +
        '<button class="btn btn--gold" data-lgen>' + (has ? 'Générer une nouvelle' : 'Générer l\'étiquette') + '</button>' +
      '</div>' +
      '<p class="seo-hint"><button class="linkbtn" data-ldiag>🔧 Tester la connexion La Poste</button> · le PDF s\'ouvre au format A6, prêt à imprimer.</p>' +
      '</div>';
    document.body.appendChild(ov);
    var result = ov.querySelector('[data-lresult]');
    function showResult(html, ok) { result.hidden = false; result.className = 'lbl-result ' + (ok ? 'is-ok' : 'is-err'); result.innerHTML = html; }
    function onLabel(r) {
      if (r && r.ok && r.pdf) {
        lastPdf = r.pdf;
        showResult('✅ Étiquette prête' + (r.tracking ? ' · suivi <b>' + esc(r.tracking) + '</b>' : '') + '<br><button class="btn btn--gold btn--sm" data-lopen>📄 Ouvrir / imprimer l\'étiquette (PDF)</button>', true);
      } else {
        showResult('❌ ' + esc((r && r.error) || 'Erreur inconnue.'), false);
      }
    }
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('[data-mx]')) { ov.remove(); return; }
      if (e.target.closest('[data-lopen]')) { if (lastPdf) openPdfBase64(lastPdf, o.order_number); return; }
      if (e.target.closest('[data-ldiag]')) {
        var d = e.target.closest('[data-ldiag]'); d.disabled = true; var dt = d.textContent; d.textContent = 'Test en cours…';
        api('POST', 'admin-label', { action: 'diag' }).then(function (r) {
          d.disabled = false; d.textContent = dt;
          if (r && r.ok && r.diag) {
            var c = r.diag.config || {};
            showResult('Clés : ID ' + (c.clientId ? '✅' : '❌') + ' · Secret ' + (c.secret ? '✅' : '❌') + ' · Licence ' + (c.licence ? '✅' : '❌') +
              '<br>Connexion La Poste : ' + (r.diag.auth === 'ok' ? '✅ OK' : '❌ ' + esc(String(r.diag.auth))), r.diag.auth === 'ok');
          } else showResult('❌ ' + esc((r && r.error) || 'Diagnostic indisponible.'), false);
        }).catch(function () { d.disabled = false; d.textContent = dt; showResult('❌ Erreur réseau.', false); });
        return;
      }
      if (e.target.closest('[data-lreprint]')) {
        var b = e.target.closest('[data-lreprint]'); b.disabled = true; var bt = b.textContent; b.textContent = '…';
        api('POST', 'admin-label', { action: 'reprint', orderId: o.id }).then(function (r) { b.disabled = false; b.textContent = bt; onLabel(r); })
          .catch(function () { b.disabled = false; b.textContent = bt; showResult('❌ Erreur réseau.', false); });
        return;
      }
      if (e.target.closest('[data-lgen]')) {
        var g = function (n) { var el = ov.querySelector('[data-lf="' + n + '"]'); return el ? el.value : ''; };
        var btn = e.target.closest('[data-lgen]'); btn.disabled = true; var gt = btn.textContent; btn.textContent = 'Génération…';
        api('POST', 'admin-label', { action: 'generate', orderId: o.id, product: g('product'), weight: g('weight'), force: true }).then(function (r) {
          btn.disabled = false; btn.textContent = gt; onLabel(r); if (r && r.ok) loadOrders();
        }).catch(function () { btn.disabled = false; btn.textContent = gt; showResult('❌ Erreur réseau.', false); });
        return;
      }
    });
  }

  /* ========== PRODUITS ========== */
  var PRODUCTS = [], CATEGORIES = [], SELECTED = {};
  function catName(slug) { var c = CATEGORIES.filter(function (x) { return x.slug === slug; })[0]; return c ? c.name : slug; }
  function loadProducts() {
    panels.products.innerHTML = '<p class="empty">Chargement…</p>';
    api('GET', 'admin-products').then(function (d) {
      if (!d || !d.ok) { panels.products.innerHTML = '<p class="empty">Erreur.</p>'; return; }
      PRODUCTS = d.products; CATEGORIES = d.categories; SELECTED = {};
      renderProducts();
    }).catch(function () {});
  }
  var pFilter = { name: '', cat: '' };
  var pGroup = false;
  function descendants(slug) { var set = [slug]; (function w(s) { CATEGORIES.filter(function (c) { return c.parent === s; }).forEach(function (c) { set.push(c.slug); w(c.slug); }); })(slug); return set; }
  function productRow(p) {
    var img = p.image ? (/^https?:/.test(p.image) ? p.image : '/' + p.image) : '';
    return '<tr data-slug="' + esc(p.slug) + '">' +
      '<td><input type="checkbox" data-psel="' + esc(p.slug) + '"' + (SELECTED[p.slug] ? ' checked' : '') + '></td>' +
      '<td class="pt-thumb">' + (img ? '<img src="' + esc(img) + '" alt="">' : '<span class="pt-noimg">—</span>') + '</td>' +
      '<td class="pt-name">' + esc(p.name) + '<small>' + esc(catName(p.category)) + '</small></td>' +
      '<td>' + chf(p.price) + '</td>' +
      '<td>' + (p.stock_qty == null ? '—' : p.stock_qty) + '</td>' +
      '<td><label class="tgl"><input type="checkbox" data-ptoggle="in_stock" data-slug="' + esc(p.slug) + '"' + (p.in_stock ? ' checked' : '') + '><span></span></label></td>' +
      '<td><label class="tgl tgl--on"><input type="checkbox" data-ptoggle="visible" data-slug="' + esc(p.slug) + '"' + (p.visible ? ' checked' : '') + '><span></span></label></td>' +
      '<td class="pt-act"><button class="linkbtn" data-pedit="' + esc(p.slug) + '">Éditer</button></td>' +
    '</tr>';
  }
  function renderProducts() {
    var q = pFilter.name.toLowerCase();
    var catSet = pFilter.cat ? descendants(pFilter.cat) : null;
    var list = PRODUCTS.filter(function (p) { return (!q || (p.name || '').toLowerCase().indexOf(q) !== -1) && (!catSet || catSet.indexOf(p.category) !== -1); });
    var selCount = Object.keys(SELECTED).filter(function (k) { return SELECTED[k]; }).length;
    var rows;
    if (pGroup) {
      var byCat = {};
      list.forEach(function (p) { (byCat[p.category] = byCat[p.category] || []).push(p); });
      rows = Object.keys(byCat).sort(function (a, b) { return catName(a).localeCompare(catName(b)); }).map(function (cat) {
        return '<tr class="pt-group"><td colspan="8">' + esc(catName(cat) || '(sans catégorie)') + ' <small>' + byCat[cat].length + '</small></td></tr>' + byCat[cat].map(productRow).join('');
      }).join('');
    } else {
      rows = list.map(productRow).join('');
    }
    panels.products.innerHTML =
      '<div class="pt-bar">' +
        '<input type="search" class="pt-search" placeholder="🔍 Filtrer par nom…" value="' + esc(pFilter.name) + '">' +
        '<select class="pt-catfilter"><option value="">Toutes les catégories</option>' + CATEGORIES.map(function (c) { return '<option value="' + esc(c.slug) + '"' + (c.slug === pFilter.cat ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select>' +
        '<label class="pt-grouptgl"><input type="checkbox" class="pt-group-cb"' + (pGroup ? ' checked' : '') + '> Grouper par catégorie</label>' +
        '<span class="pt-count">' + list.length + ' produits</span>' +
        '<button class="btn btn--gold btn--sm" data-padd>+ Ajouter un produit</button>' +
      '</div>' +
      '<div class="pt-bulk' + (selCount ? ' is-visible' : '') + '">' +
        '<b>' + selCount + ' sélectionné' + (selCount > 1 ? 's' : '') + '</b>' +
        '<button class="btn btn--ghost btn--sm" data-pbulk="on">Activer</button>' +
        '<button class="btn btn--ghost btn--sm" data-pbulk="off">Désactiver</button>' +
        '<button class="btn btn--ghost btn--sm pt-del" data-pbulk="del">Supprimer</button>' +
      '</div>' +
      '<div class="pt-wrap"><table class="pt"><thead><tr>' +
        '<th><input type="checkbox" data-psel-all></th><th></th><th>Produit</th><th>Prix</th><th>Stock</th><th>En stock</th><th>En ligne</th><th></th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    var s = panels.products.querySelector('.pt-search');
    if (s) s.addEventListener('input', function () { pFilter.name = s.value; renderProducts(); setTimeout(function () { var el = panels.products.querySelector('.pt-search'); if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; } }, 0); });
    var cf = panels.products.querySelector('.pt-catfilter');
    if (cf) cf.addEventListener('change', function () { pFilter.cat = cf.value; renderProducts(); });
    var gcb = panels.products.querySelector('.pt-group-cb');
    if (gcb) gcb.addEventListener('change', function () { pGroup = gcb.checked; renderProducts(); });
  }

  /* ========== CATÉGORIES (gestion) ========== */
  function catProductCount(slug) { var set = descendants(slug); return PRODUCTS.filter(function (p) { return set.indexOf(p.category) !== -1; }).length; }
  function loadCategoriesTab() {
    panels.categories.innerHTML = '<p class="empty">Chargement…</p>';
    api('GET', 'admin-products').then(function (d) {
      if (!d || !d.ok) { panels.categories.innerHTML = '<p class="empty">Erreur.</p>'; return; }
      PRODUCTS = d.products; CATEGORIES = d.categories; renderCategoriesTab();
    }).catch(function () {});
  }
  function renderCategoriesTab() {
    var rowsHtml = '';
    function walk(parent, depth) {
      CATEGORIES.filter(function (c) { return (c.parent || null) === parent; })
        .sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); })
        .forEach(function (c) {
          var vis = c.visible !== false;
          rowsHtml += '<tr data-cat="' + esc(c.slug) + '">' +
            '<td class="ct-name" style="padding-left:' + (14 + depth * 22) + 'px">' + (depth ? '↳ ' : '') + esc(c.name) + '<small>' + esc(c.slug) + '</small></td>' +
            '<td>' + catProductCount(c.slug) + '</td>' +
            '<td><label class="tgl tgl--on"><input type="checkbox" data-cattoggle data-slug="' + esc(c.slug) + '"' + (vis ? ' checked' : '') + '><span></span></label></td>' +
            '<td class="pt-act"><button class="linkbtn" data-catedit="' + esc(c.slug) + '">Éditer</button> · <button class="linkbtn pt-del" data-catdel="' + esc(c.slug) + '">Supprimer</button></td>' +
          '</tr>';
          walk(c.slug, depth + 1);
        });
    }
    walk(null, 0);
    panels.categories.innerHTML =
      '<div class="pt-bar"><span class="pt-count">' + CATEGORIES.length + ' catégories</span>' +
        '<button class="btn btn--gold btn--sm" data-catadd>+ Nouvelle catégorie</button></div>' +
      '<p class="seo-note" style="margin:0 0 12px">Décocher « En ligne » retire la catégorie des menus et listes du site. Supprimer une catégorie réaffecte ses produits à la catégorie parente.</p>' +
      '<div class="pt-wrap"><table class="pt"><thead><tr><th>Catégorie</th><th>Produits</th><th>En ligne</th><th></th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
    // handlers
    panels.categories.querySelectorAll('[data-cattoggle]').forEach(function (el) {
      el.addEventListener('change', function () {
        el.disabled = true;
        api('POST', 'admin-products', { action: 'update-category', slug: el.getAttribute('data-slug'), fields: { visible: el.checked } })
          .then(function (r) { if (r && r.ok) { showFlash('Catégorie mise à jour.', true); loadCategoriesTab(); } else { el.checked = !el.checked; el.disabled = false; showFlash((r && r.error) || 'Erreur.', false); } });
      });
    });
    var addb = panels.categories.querySelector('[data-catadd]');
    if (addb) addb.addEventListener('click', function () { categoryModal(null); });
    panels.categories.querySelectorAll('[data-catedit]').forEach(function (b) {
      b.addEventListener('click', function () { var c = CATEGORIES.filter(function (x) { return x.slug === b.getAttribute('data-catedit'); })[0]; if (c) categoryModal(c); });
    });
    panels.categories.querySelectorAll('[data-catdel]').forEach(function (b) {
      b.addEventListener('click', function () {
        var slug = b.getAttribute('data-catdel');
        var n = catProductCount(slug);
        if (!confirm('Supprimer cette catégorie ?' + (n ? '\n' + n + ' produit(s) seront réaffectés à la catégorie parente.' : ''))) return;
        api('POST', 'admin-products', { action: 'delete-category', slug: slug })
          .then(function (r) { if (r && r.ok) { showFlash('Catégorie supprimée.', true); loadCategoriesTab(); } else showFlash((r && r.error) || 'Erreur.', false); });
      });
    });
  }
  function categoryModal(c) {
    var isNew = !c;
    c = c || { slug: '', name: '', parent: '', icon: '', description: '', visible: true };
    var opts = '<option value="">— Aucune (catégorie principale) —</option>' +
      CATEGORIES.filter(function (x) { return x.slug !== c.slug; })
        .map(function (x) { return '<option value="' + esc(x.slug) + '"' + (x.slug === c.parent ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('');
    var ov = document.createElement('div');
    ov.className = 'modal-ov';
    ov.innerHTML = '<div class="modal"><button class="modal__x" data-mx>✕</button>' +
      '<h3>' + (isNew ? 'Nouvelle catégorie' : 'Modifier la catégorie') + '</h3>' +
      '<label class="field"><span>Nom</span><input data-cf="name" value="' + esc(c.name) + '"></label>' +
      '<label class="field"><span>Catégorie parente</span><select data-cf="parent">' + opts + '</select></label>' +
      '<label class="field"><span>Icône (emoji, optionnel)</span><input data-cf="icon" value="' + esc(c.icon || '') + '" maxlength="4" placeholder="🎴"></label>' +
      '<label class="field"><span>Description (optionnel)</span><textarea data-cf="description" rows="2">' + esc(c.description || '') + '</textarea></label>' +
      '<div class="modal__checks"><label><input type="checkbox" data-cf="visible"' + (c.visible !== false ? ' checked' : '') + '> En ligne</label></div>' +
      '<div class="modal__foot">' + (isNew ? '' : '<button class="btn btn--ghost btn--sm pt-del" data-cdel>Supprimer</button>') +
        '<span style="flex:1"></span><button class="btn btn--gold" data-csave>' + (isNew ? 'Créer' : 'Enregistrer') + '</button></div></div>';
    document.body.appendChild(ov);
    function collect() {
      var f = {};
      ov.querySelectorAll('[data-cf]').forEach(function (el) { f[el.getAttribute('data-cf')] = el.type === 'checkbox' ? el.checked : el.value; });
      return f;
    }
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('[data-mx]')) ov.remove();
      if (e.target.closest('[data-csave]')) {
        var f = collect();
        if (!f.name || !f.name.trim()) { showFlash('Nom requis.', false); return; }
        var req = isNew
          ? api('POST', 'admin-products', { action: 'create-category', name: f.name.trim(), parent: f.parent || null })
          : api('POST', 'admin-products', { action: 'update-category', slug: c.slug, fields: f });
        req.then(function (r) { if (r && r.ok) { ov.remove(); showFlash(isNew ? 'Catégorie créée.' : 'Catégorie enregistrée.', true); loadCategoriesTab(); } else showFlash((r && r.error) || 'Erreur.', false); });
      }
      if (e.target.closest('[data-cdel]')) {
        if (!confirm('Supprimer cette catégorie ? Ses produits seront réaffectés à la catégorie parente.')) return;
        api('POST', 'admin-products', { action: 'delete-category', slug: c.slug })
          .then(function (r) { if (r && r.ok) { ov.remove(); showFlash('Catégorie supprimée.', true); loadCategoriesTab(); } else showFlash((r && r.error) || 'Erreur.', false); });
      }
    });
  }

  function productModal(p) {
    var isNew = !p;
    p = p || { name: '', price: 0, category: '', stock_qty: '', description: '', image: '', in_stock: true, visible: true, seo_title: '', seo_description: '', brand: '' };
    var opts = CATEGORIES.map(function (c) { return '<option value="' + esc(c.slug) + '"' + (c.slug === p.category ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
    var img = p.image ? (/^https?:/.test(p.image) ? p.image : '/' + p.image) : '';
    var TR = p.translations || {};
    var trHtml = [['en', 'English 🇬🇧'], ['it', 'Italiano 🇮🇹'], ['de', 'Deutsch 🇩🇪']].map(function (l) {
      var lg = l[0], v = TR[lg] || {};
      return '<p class="seo-note" style="margin:10px 0 2px"><b>' + l[1] + '</b></p>' +
        '<label class="field"><span>Nom (' + lg.toUpperCase() + ')</span><input data-tr data-trlang="' + lg + '" data-trfield="name" value="' + esc(v.name || '') + '"></label>' +
        '<label class="field"><span>Description (' + lg.toUpperCase() + ')</span><textarea data-tr data-trlang="' + lg + '" data-trfield="desc" rows="2">' + esc(v.desc || '') + '</textarea></label>';
    }).join('');
    var ov = document.createElement('div');
    ov.className = 'modal-ov';
    ov.innerHTML =
      '<div class="modal"><button class="modal__x" data-mx>✕</button>' +
        '<h3>' + (isNew ? 'Nouveau produit' : 'Modifier le produit') + '</h3>' +
        '<div class="modal__photo"><div class="modal__thumb">' + (img ? '<img src="' + esc(img) + '" alt="">' : '<span>Aucune photo</span>') + '</div>' +
          '<label class="btn btn--ghost btn--sm">📷 Choisir une photo<input type="file" accept="image/*" data-mphoto hidden></label><span class="modal__upmsg"></span></div>' +
        '<label class="field"><span>Nom</span><input data-mf="name" value="' + esc(p.name) + '"></label>' +
        '<div class="form__row"><label class="field"><span>Prix (CHF)</span><input data-mf="price" type="number" step="0.05" value="' + esc(p.price) + '"></label>' +
        '<label class="field"><span>Stock (vide = non suivi)</span><input data-mf="stock_qty" type="number" value="' + (p.stock_qty == null ? '' : esc(p.stock_qty)) + '"></label></div>' +
        '<label class="field"><span>Catégorie</span><select data-mf="category">' + opts + '</select></label>' +
        '<button type="button" class="linkbtn" data-mnewcat style="margin:-8px 0 14px;align-self:flex-start">+ Nouvelle catégorie</button>' +
        '<label class="field"><span>Marque <em class="seo-hint">Google Shopping — auto-détectée si vide</em></span><input data-mf="brand" value="' + esc(p.brand || '') + '" placeholder="Ex. Pokémon, Bandai, Funko, Hasbro…"></label>' +
        '<label class="field"><span>Description</span><textarea data-mf="description" rows="3">' + esc(p.description || '') + '</textarea></label>' +
        '<div class="modal__checks"><label><input type="checkbox" data-mf="in_stock"' + (p.in_stock ? ' checked' : '') + '> En stock</label>' +
          '<label><input type="checkbox" data-mf="visible"' + (p.visible ? ' checked' : '') + '> En ligne</label></div>' +
        '<details class="seo-box"' + ((p.seo_title || p.seo_description) ? ' open' : '') + '><summary>🔍 Référencement Google (SEO) — optionnel</summary>' +
          '<label class="field"><span>Titre SEO <em class="seo-hint" data-seocount="seo_title">0/60</em></span>' +
            '<input data-mf="seo_title" maxlength="70" value="' + esc(p.seo_title || '') + '" placeholder="Ex. Pokémon 151 – Coffret Dracaufeu ex – FR"></label>' +
          '<label class="field"><span>Meta description <em class="seo-hint" data-seocount="seo_description">0/155</em></span>' +
            '<textarea data-mf="seo_description" rows="2" maxlength="165" placeholder="1–2 phrases avec les mots-clés (set, langue, type). Idéal ≤ 155 caractères.">' + esc(p.seo_description || '') + '</textarea></label>' +
          '<p class="seo-note">Laisse vide pour utiliser automatiquement le nom et la description du produit.</p>' +
        '</details>' +
        '<details class="seo-box"' + (p.translations ? ' open' : '') + '><summary>🌍 Traductions (EN / IT / DE) — optionnel</summary>' +
          trHtml +
          '<p class="seo-note">Laisse un champ vide pour afficher le français dans cette langue.</p>' +
        '</details>' +
        '<div class="modal__foot">' + (isNew ? '' : '<button class="btn btn--ghost btn--sm pt-del" data-mdel>Supprimer</button>') +
          '<span style="flex:1"></span><button class="btn btn--gold" data-msave>' + (isNew ? 'Créer' : 'Enregistrer') + '</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    var uploadedImage = null;
    ov.querySelectorAll('[data-seocount]').forEach(function (badge) {
      var target = ov.querySelector('[data-mf="' + badge.getAttribute('data-seocount') + '"]');
      var max = badge.textContent.split('/')[1];
      var upd = function () { badge.textContent = (target.value || '').length + '/' + max; badge.classList.toggle('over', (target.value || '').length > parseInt(max, 10)); };
      target.addEventListener('input', upd); upd();
    });
    ov.querySelector('[data-mphoto]').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      var um = ov.querySelector('.modal__upmsg'); um.textContent = 'Envoi…';
      var rd = new FileReader();
      rd.onload = function () {
        api('POST', 'admin-upload', { filename: f.name, contentType: f.type, dataBase64: rd.result }).then(function (r) {
          if (r && r.ok) { uploadedImage = r.url; ov.querySelector('.modal__thumb').innerHTML = '<img src="' + r.url + '" alt="">'; um.textContent = '✅ Photo prête'; }
          else { um.textContent = '⚠️ ' + ((r && r.error) || 'échec'); }
        }).catch(function () { um.textContent = '⚠️ erreur'; });
      };
      rd.readAsDataURL(f);
    });
    function collect() {
      var f = {};
      ov.querySelectorAll('[data-mf]').forEach(function (el) {
        var k = el.getAttribute('data-mf');
        f[k] = el.type === 'checkbox' ? el.checked : el.value;
      });
      // Traductions (EN/IT/DE) → objet { en:{name,desc}, ... } ; null si tout vide
      var tr = {};
      ov.querySelectorAll('[data-tr]').forEach(function (el) {
        var lg = el.getAttribute('data-trlang'), fld = el.getAttribute('data-trfield'), v = (el.value || '').trim();
        if (v) { tr[lg] = tr[lg] || {}; tr[lg][fld] = v; }
      });
      f.translations = Object.keys(tr).length ? tr : null;
      if (uploadedImage) f.image = uploadedImage;
      return f;
    }
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('[data-mx]')) ov.remove();
      if (e.target.closest('[data-mnewcat]')) {
        var nm = prompt('Nom de la nouvelle catégorie :');
        if (nm && nm.trim()) {
          api('POST', 'admin-products', { action: 'create-category', name: nm.trim() }).then(function (r) {
            if (r && r.ok) {
              if (!CATEGORIES.some(function (c) { return c.slug === r.category.slug; })) CATEGORIES.push(r.category);
              var sel = ov.querySelector('[data-mf=category]');
              if (![].some.call(sel.options, function (o) { return o.value === r.category.slug; })) {
                var o = document.createElement('option'); o.value = r.category.slug; o.textContent = r.category.name; sel.appendChild(o);
              }
              sel.value = r.category.slug;
              showFlash('Catégorie « ' + r.category.name + ' » créée.', true);
            } else showFlash((r && r.error) || 'Erreur.', false);
          });
        }
      }
      if (e.target.closest('[data-msave]')) {
        var f = collect();
        if (!f.name) { showFlash('Nom requis.', false); return; }
        var req = isNew ? api('POST', 'admin-products', { action: 'create', product: f })
          : api('POST', 'admin-products', { action: 'update', slug: p.slug, fields: f });
        req.then(function (r) { if (r && r.ok) { ov.remove(); showFlash(isNew ? 'Produit créé.' : 'Produit enregistré.', true); loadProducts(); } else showFlash((r && r.error) || 'Erreur.', false); });
      }
      if (e.target.closest('[data-mdel]')) {
        if (!confirm('Supprimer définitivement « ' + p.name + ' » ?')) return;
        api('POST', 'admin-products', { action: 'delete', slugs: [p.slug] }).then(function (r) { if (r && r.ok) { ov.remove(); showFlash('Produit supprimé.', true); loadProducts(); } });
      }
    });
  }

  /* ---------- Interactions globales ---------- */
  document.addEventListener('input', function (e) {
    var s = e.target.closest('[data-osearch]');
    if (s) { ORDER_Q = s.value; renderOrderBody(); }
  });
  document.addEventListener('click', function (e) {
    // Commandes : statut
    var os = e.target.closest('[data-oset]');
    if (os) { os.disabled = true; api('POST', 'admin-orders', { action: 'set-status', orderId: os.getAttribute('data-id'), status: os.getAttribute('data-oset') }).then(function (r) { if (r && r.ok) loadOrders(); else os.disabled = false; }); }
    // Commandes : expédition / remise
    var of = e.target.closest('[data-ofulfill]');
    if (of) { of.disabled = true; api('POST', 'admin-orders', { action: 'set-fulfillment', orderId: of.getAttribute('data-id'), fulfilled: of.getAttribute('data-ofulfill') === '1' }).then(function (r) { if (r && r.ok) loadOrders(); else of.disabled = false; }); }
    // Commandes : édition
    var oe = e.target.closest('[data-oedit]');
    if (oe) { var ord = ORDERS.filter(function (x) { return x.id === oe.getAttribute('data-oedit'); })[0]; if (ord) orderModal(ord); }
    var orr = e.target.closest('[data-oresend]');
    if (orr) {
      if (!confirm('Renvoyer l\'e-mail de confirmation au client ?')) return;
      orr.disabled = true;
      api('POST', 'admin-orders', { action: 'resend-email', orderId: orr.getAttribute('data-oresend') }).then(function (r) {
        orr.disabled = false;
        showFlash(r && r.ok ? 'E-mail renvoyé ✅' : ((r && r.error) || 'Échec de l\'envoi.'), !!(r && r.ok));
      }).catch(function () { orr.disabled = false; showFlash('Échec de l\'envoi.', false); });
    }
    var ocl = e.target.closest('[data-oclient]');
    if (ocl) clientModal(ocl.getAttribute('data-oclient'));
    var olb = e.target.closest('[data-olabel]');
    if (olb) { var oL = ORDERS.filter(function (x) { return x.id === olb.getAttribute('data-olabel'); })[0]; if (oL) labelModal(oL); }
    if (e.target.closest('[data-onew]')) newOrderModal();
    if (e.target.closest('[data-oclients]')) clientsModal();
    var ofl = e.target.closest('[data-ofilter]');
    if (ofl) { ORDER_FILTER = ofl.getAttribute('data-ofilter'); renderOrderBody(); }
    var osel = e.target.closest('[data-osel]');
    if (osel) { var sid = osel.getAttribute('data-osel'); if (osel.checked) SELECTED_ORDERS[sid] = true; else delete SELECTED_ORDERS[sid]; refreshBulkBar(); }
    var obk = e.target.closest('[data-obulk]');
    if (obk) { bulkApply(obk.getAttribute('data-obulk')); }
    if (e.target.closest('[data-obulk-clear]')) { SELECTED_ORDERS = {}; renderOrderBody(); }
    // Carte statistique cliquable → onglet
    var gt = e.target.closest('[data-goto]');
    if (gt) switchTab(gt.getAttribute('data-goto'));
    // Statistiques : sélecteur de période
    var sp = e.target.closest('[data-statsperiod]');
    if (sp) loadStats(parseInt(sp.getAttribute('data-statsperiod'), 10));
    // Codes promo
    if (e.target.closest('[data-promonew]')) promoModal();
    var ped = e.target.closest('[data-promoedit]');
    if (ped) { var pc = PROMOS.filter(function (x) { return x.id === ped.getAttribute('data-promoedit'); })[0]; if (pc) promoModal(pc); }
    var pdl = e.target.closest('[data-promodel]');
    if (pdl) { if (confirm('Supprimer ce code promo ?')) api('POST', 'admin-promos', { action: 'delete', id: pdl.getAttribute('data-promodel') }).then(function (r) { if (r && r.ok) { showFlash('Code supprimé.', true); loadPromos(); } }); }
    // Produits : éditer
    var pe = e.target.closest('[data-pedit]');
    if (pe) { var pr = PRODUCTS.filter(function (x) { return x.slug === pe.getAttribute('data-pedit'); })[0]; if (pr) productModal(pr); }
    // Produits : ajouter
    if (e.target.closest('[data-padd]')) productModal(null);
    // Produits : bulk
    var pb = e.target.closest('[data-pbulk]');
    if (pb) {
      var slugs = Object.keys(SELECTED).filter(function (k) { return SELECTED[k]; });
      if (!slugs.length) return;
      var act = pb.getAttribute('data-pbulk');
      if (act === 'del') { if (!confirm('Supprimer ' + slugs.length + ' produit(s) ?')) return; api('POST', 'admin-products', { action: 'delete', slugs: slugs }).then(function (r) { if (r && r.ok) { showFlash(slugs.length + ' supprimé(s).', true); loadProducts(); } }); }
      else { api('POST', 'admin-products', { action: 'bulk-set', slugs: slugs, fields: { visible: act === 'on' } }).then(function (r) { if (r && r.ok) { showFlash('Mis à jour.', true); loadProducts(); } }); }
    }
    // Publier (déclenche un nouveau build → met en ligne les changements du back office)
    if (e.target.closest('[data-admin-republish]')) {
      var b = e.target.closest('[data-admin-republish]');
      if (!confirm('Publier les changements ?\n\nLe site va se régénérer et se mettre à jour en ligne dans 1 à 2 minutes.')) return;
      var label = b.textContent; b.disabled = true; b.textContent = '⏳ Publication…';
      api('POST', 'republish').then(function (r) {
        showFlash((r && r.message) || (r && r.error) || 'Fait.', !!(r && r.ok));
        b.disabled = false; b.textContent = label;
      }).catch(function () { b.disabled = false; b.textContent = label; });
    }
    if (e.target.closest('[data-admin-logout]')) logout();
  });
  // Produits : toggles instantanés + sélection
  document.addEventListener('change', function (e) {
    var tg = e.target.closest('[data-ptoggle]');
    if (tg) { var f = {}; f[tg.getAttribute('data-ptoggle')] = tg.checked; api('POST', 'admin-products', { action: 'update', slug: tg.getAttribute('data-slug'), fields: f }).then(function (r) { if (r && r.ok) { var pr = PRODUCTS.filter(function (x) { return x.slug === tg.getAttribute('data-slug'); })[0]; if (pr) pr[tg.getAttribute('data-ptoggle')] = tg.checked; } }); }
    var ps = e.target.closest('[data-psel]');
    if (ps) { SELECTED[ps.getAttribute('data-psel')] = ps.checked; renderProducts(); }
    var pa = e.target.closest('[data-psel-all]');
    if (pa) { PRODUCTS.forEach(function (p) { SELECTED[p.slug] = pa.checked; }); renderProducts(); }
    var pt = e.target.closest('[data-promotoggle]');
    if (pt) { pt.disabled = true; api('POST', 'admin-promos', { action: 'toggle', id: pt.getAttribute('data-promotoggle'), active: pt.checked }).then(function (r) { pt.disabled = false; if (!r || !r.ok) { pt.checked = !pt.checked; showFlash('Erreur.', false); } }); }
  });

  /* ---------- Login ---------- */
  login.addEventListener('submit', function (e) {
    e.preventDefault();
    try { sessionStorage.setItem(KEY, login.querySelector('input[name=password]').value); } catch (e2) {}
    msg.textContent = 'Connexion…'; msg.className = 'form__msg is-ok';
    api('GET', 'admin-stats').then(function (d) {
      if (d && d.ok) { login.hidden = true; if (hero) hero.hidden = true; dash.hidden = false; switchTab('stats'); }
      else { msg.textContent = 'Mot de passe incorrect.'; msg.className = 'form__msg is-err'; }
    }).catch(function () { msg.textContent = 'Mot de passe incorrect.'; msg.className = 'form__msg is-err'; });
  });
  if (pwd()) { api('GET', 'admin-stats').then(function (d) { if (d && d.ok) { login.hidden = true; if (hero) hero.hidden = true; dash.hidden = false; switchTab('stats'); } }).catch(function () {}); }
})();
