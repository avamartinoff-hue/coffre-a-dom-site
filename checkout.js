/* =========================================================
   COFFRE À DOM, Tunnel de commande (front)
   Envoie le panier à la fonction create-order, affiche la confirmation.
   ========================================================= */
(function () {
  'use strict';
  var form = document.querySelector('[data-checkout-form]');
  if (!form) return;
  var B = window.__BASE__ || '';
  var I = window.__I18N__ || {};
  var T = function (k, f) { return I[k] != null ? I[k] : f; };

  var msg = form.querySelector('[data-checkout-msg]');
  var submit = form.querySelector('[data-checkout-submit]');
  var confirmBox = document.querySelector('[data-checkout-confirm]');
  var modeSel = form.querySelector('[data-mode]');
  var addrField = form.querySelector('[data-address-field]');
  var chf = function (n) { return 'CHF ' + Number(n).toFixed(2); };
  function promoNote(d) { return (d && d.discount > 0) ? ' · <span class="confirm__promo">' + T('discount', 'Remise') + ' −' + chf(d.discount) + (d.promoCode ? ' (' + d.promoCode + ')' : '') + '</span>' : ''; }

  // Adresse visible seulement si livraison postale
  function syncAddr() { if (addrField) addrField.hidden = modeSel.value !== 'poste'; }
  if (modeSel) { modeSel.addEventListener('change', syncAddr); syncAddr(); }

  function setMsg(t, ok) { if (msg) { msg.textContent = t; msg.className = 'form__msg ' + (ok ? 'is-ok' : 'is-err'); } }

  // Capture du panier pour relance si abandon (dès qu'un e-mail valide est saisi)
  var emailField = form.querySelector('input[name=email]');
  var captured = '';
  function captureCart() {
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
    var email = (emailField && emailField.value || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email === captured) return;
    var cart = (window.CADCart && window.CADCart.load()) || [];
    if (!cart.length) return;
    captured = email;
    var payload = { email: email, lang: (document.documentElement.lang || 'fr').slice(0, 2),
      items: cart.map(function (i) { return { name: i.name, qty: i.qty, price: i.price }; }) };
    try {
      fetch('/.netlify/functions/cart-capture', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), keepalive: true }).catch(function () {});
    } catch (e) { /* ignore */ }
  }
  if (emailField) {
    var ct;
    emailField.addEventListener('blur', captureCart);
    emailField.addEventListener('input', function () { clearTimeout(ct); ct = setTimeout(captureCart, 1500); });
  }

  function items() {
    var cart = (window.CADCart && window.CADCart.load()) || [];
    return cart.map(function (i) { return { slug: i.slug, qty: i.qty, preorder: !!i.preorder }; });
  }

  // Code promo
  var appliedPromo = null;
  var promoInput = form.querySelector('[data-promo-input]');
  var promoBtn = form.querySelector('[data-promo-apply]');
  var promoMsg = form.querySelector('[data-promo-msg]');
  function setPromoMsg(t, cls) { if (promoMsg) { promoMsg.textContent = t; promoMsg.className = 'promo-msg' + (cls ? ' ' + cls : ''); } }
  function applyPromo() {
    var code = (promoInput && promoInput.value || '').trim().toUpperCase();
    if (!code) { appliedPromo = null; setPromoMsg(''); return; }
    var subtotal = window.CADCart ? window.CADCart.total() : 0;
    if (!subtotal) { appliedPromo = null; setPromoMsg(T('summary_empty', 'Votre panier est vide.'), 'is-err'); return; }
    if (promoBtn) promoBtn.disabled = true;
    setPromoMsg(T('promo_checking', 'Vérification…'), '');
    fetch('/.netlify/functions/promo-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code, subtotal: subtotal }) })
      .then(function (r) { return r.json(); }).then(function (d) {
        if (promoBtn) promoBtn.disabled = false;
        if (d && d.valid) {
          appliedPromo = { code: d.code, discount: d.discount };
          setPromoMsg('✅ ' + T('promo_applied', 'Code appliqué :') + ' −' + chf(d.discount), 'is-ok');
        } else { appliedPromo = null; setPromoMsg((d && d.message) || T('promo_invalid', 'Code invalide.'), 'is-err'); }
      }).catch(function () { if (promoBtn) promoBtn.disabled = false; setPromoMsg(T('net_error', '⚠️ Erreur réseau. Réessayez.'), 'is-err'); });
  }
  if (promoBtn) promoBtn.addEventListener('click', applyPromo);
  document.addEventListener('cart:change', function () { if (appliedPromo && promoInput && promoInput.value) applyPromo(); });

  function loadSumupSdk(cb) {
    if (window.SumUpCard) return cb();
    var s = document.createElement('script');
    s.src = 'https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js';
    s.onload = function () { cb(); };
    s.onerror = function () { cb(new Error('sdk')); };
    document.head.appendChild(s);
  }

  function showSumupWidget(data) {
    form.hidden = true;
    var summary = document.querySelector('[data-order-summary]');
    if (summary) summary.hidden = true;
    confirmBox.hidden = false;
    confirmBox.innerHTML =
      '<div class="confirm confirm--pay">' +
        '<h2>' + T('pay_card_title', 'Paiement par carte') + '</h2>' +
        '<p class="confirm__num">' + T('reference', 'Référence :') + ' <b>' + data.orderNumber + '</b> · ' + T('total_label', 'Total :') + ' <b>' + chf(data.total) + '</b>' + promoNote(data) + '</p>' +
        '<div id="sumup-card"></div>' +
        '<p class="confirm__twint-note" data-sumup-msg role="status" aria-live="polite"></p>' +
      '</div>';
    confirmBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var msg = confirmBox.querySelector('[data-sumup-msg]');
    loadSumupSdk(function (err) {
      if (err || !window.SumUpCard) { msg.textContent = T('net_error', '⚠️ Erreur réseau. Réessayez.'); return; }
      window.SumUpCard.mount({
        id: 'sumup-card',
        checkoutId: data.sumup.checkoutId,
        locale: (window.__LANG__ || 'fr') + '-CH',
        onResponse: function (type) {
          if (type === 'success') {
            msg.textContent = T('saving', 'Enregistrement de la commande…');
            fetch('/.netlify/functions/sumup-confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: data.orderId, checkoutId: data.sumup.checkoutId }) })
              .then(function (r) { return r.json(); }).then(function (cr) {
                if (cr && cr.ok && cr.paid) showConfirmation(data, true);
                else msg.textContent = T('order_failed', 'Commande impossible.') + (cr && cr.status ? ' (' + cr.status + ')' : '');
              }).catch(function () { msg.textContent = T('net_error', '⚠️ Erreur réseau. Réessayez.'); });
          } else if (type === 'error' || type === 'fail') {
            msg.textContent = T('pay_failed', 'Paiement refusé. Réessayez ou changez de carte.');
          }
        },
      });
    });
  }

  function showTwintQr(data) {
    form.hidden = true;
    var summary = document.querySelector('[data-order-summary]');
    if (summary) summary.hidden = true;
    confirmBox.hidden = false;
    confirmBox.innerHTML =
      '<div class="confirm confirm--pay">' +
        '<h2>' + T('twint_pay_title', 'Paiement TWINT') + '</h2>' +
        '<p class="confirm__num">' + T('reference', 'Référence :') + ' <b>' + data.orderNumber + '</b> · ' + T('total_label', 'Total :') + ' <b>' + chf(data.total) + '</b>' + promoNote(data) + '</p>' +
        '<div class="twint-qr" data-twint-qr></div>' +
        '<p class="confirm__twint-note" data-twint-msg role="status" aria-live="polite">' + T('twint_scan', 'Scannez ce QR code avec votre app TWINT pour payer.') + '</p>' +
      '</div>';
    confirmBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var qrBox = confirmBox.querySelector('[data-twint-qr]');
    var msg = confirmBox.querySelector('[data-twint-msg]');
    fetch('/.netlify/functions/twint-start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: data.orderId }) })
      .then(function (r) { return r.json(); }).then(function (s) {
        if (!s || !s.ok || !s.qrCode) { showConfirmation(data); return; } // repli sur TWINT manuel
        var src = /^data:/.test(s.qrCode) ? s.qrCode : ('data:image/png;base64,' + s.qrCode);
        qrBox.innerHTML = '<img src="' + src + '" alt="QR TWINT" width="240" height="240" />' + (s.token ? '<div class="twint-token">' + s.token + '</div>' : '');
        var tries = 0;
        var poll = setInterval(function () {
          tries++;
          if (tries > 120) { clearInterval(poll); msg.textContent = T('twint_timeout', 'Délai dépassé. Réessayez ou payez autrement.'); return; }
          fetch('/.netlify/functions/twint-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: data.orderId, orderUuid: s.orderUuid }) })
            .then(function (r) { return r.json(); }).then(function (st) {
              if (st && st.status === 'paid') { clearInterval(poll); showConfirmation(data, true); }
              else if (st && st.status === 'failed') { clearInterval(poll); msg.textContent = T('pay_failed', 'Paiement refusé. Réessayez ou changez de carte.'); }
              else { msg.textContent = T('twint_waiting', 'En attente de votre paiement…'); }
            }).catch(function () {});
        }, 3000);
      }).catch(function () { showConfirmation(data); });
  }

  function showConfirmation(data, paid) {
    form.hidden = true;
    var summary = document.querySelector('[data-order-summary]');
    if (summary) summary.hidden = true;
    var twintHtml = '';
    if (paid) {
      twintHtml = '<p class="confirm__twint-note">' + T('payment_received', '✅ Paiement reçu, merci !') + '</p>';
    } else if (data.method === 'twint' && data.twint) {
      twintHtml =
        '<div class="confirm__twint">' +
          '<p class="confirm__twint-title">' + T('twint_title', '📱 Payer par TWINT') + '</p>' +
          '<p>' + T('twint_send', 'Ouvrez votre app TWINT et envoyez') + ' <b>' + chf(data.total) + '</b> ' + T('twint_to', 'au numéro :') + '</p>' +
          '<p class="confirm__twint-num">' + data.twint.phone + '</p>' +
          '<p>' + T('twint_ref', 'en indiquant la référence') + ' <b>' + data.twint.reference + '</b>.</p>' +
          '<p class="confirm__twint-note">' + T('twint_note', 'Votre commande est réservée et sera confirmée dès réception du paiement.') + '</p>' +
        '</div>';
    } else if (data.method === 'sumup') {
      twintHtml = '<p class="confirm__twint-note">' + T('sumup_note', '💳 Le paiement par carte sera bientôt disponible, nous vous contactons pour finaliser le règlement.') + '</p>';
    }
    confirmBox.hidden = false;
    confirmBox.innerHTML =
      '<div class="confirm">' +
        '<div class="confirm__check">✅</div>' +
        '<h2>' + T('thanks', 'Merci, commande enregistrée !') + '</h2>' +
        '<p class="confirm__num">' + T('reference', 'Référence :') + ' <b>' + data.orderNumber + '</b> · ' + T('total_label', 'Total :') + ' <b>' + chf(data.total) + '</b>' + promoNote(data) + '</p>' +
        twintHtml +
        '<div class="confirm__actions"><a href="' + B + '/" class="btn btn--ghost">' + T('home', 'Accueil') + '</a><a href="' + B + '/boutique/" class="btn btn--gold">' + T('continue', 'Continuer mes achats') + '</a></div>' +
      '</div>';
    // vider le panier
    try { localStorage.removeItem('cad_cart_v1'); } catch (e) {}
    if (window.CADCart) document.dispatchEvent(new CustomEvent('cart:change'));
    confirmBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var list = items();
    if (!list.length) { setMsg(T('summary_empty', 'Votre panier est vide.'), false); return; }
    var fd = new FormData(form);
    var method = fd.get('method') || 'twint';
    var customer = {
      nom: (fd.get('nom') || '').trim(), email: (fd.get('email') || '').trim(),
      telephone: (fd.get('telephone') || '').trim(), mode: fd.get('mode') || 'retrait',
      rue: (fd.get('rue') || '').trim(), numero: (fd.get('numero') || '').trim(),
      npa: (fd.get('npa') || '').trim(), localite: (fd.get('localite') || '').trim(),
      remarque: (fd.get('remarque') || '').trim(),
    };
    if (!customer.nom) { setMsg(T('name_required', 'Indiquez votre nom.'), false); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) { setMsg(T('email_invalid', 'E-mail invalide.'), false); return; }
    if (customer.mode === 'poste') {
      if (!customer.rue || !customer.localite) { setMsg(T('addr_required', 'Indiquez votre rue et votre localité.'), false); return; }
      if (!/^\d{4}$/.test(customer.npa)) { setMsg(T('npa_invalid', 'NPA invalide, 4 chiffres (livraison en Suisse uniquement).'), false); return; }
    }

    submit.disabled = true; setMsg(T('saving', 'Enregistrement de la commande…'), true);

    // Aperçu local : la fonction n'existe pas → démo
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
      setTimeout(function () {
        showConfirmation({ ok: true, orderNumber: 'CAD-DEMO123', total: (window.CADCart ? window.CADCart.total() : 0), method: method, twint: { phone: '+41 78 941 85 38', reference: 'CAD-DEMO123' } });
      }, 500);
      return;
    }

    fetch('/.netlify/functions/create-order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: list, customer: customer, method: method, lang: (document.documentElement.lang || 'fr').slice(0, 2), promoCode: appliedPromo ? appliedPromo.code : null }),
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.ok) {
        if (d.method === 'sumup' && d.sumup && d.sumup.configured && d.sumup.checkoutId) showSumupWidget(d);
        else if (d.method === 'twint' && d.twint && d.twint.auto) showTwintQr(d);
        else showConfirmation(d);
      }
      else { setMsg('⚠️ ' + ((d && d.error) || T('order_failed', 'Commande impossible.')), false); submit.disabled = false; }
    }).catch(function () {
      setMsg(T('net_error', '⚠️ Erreur réseau. Réessayez.'), false); submit.disabled = false;
    });
  });
})();
