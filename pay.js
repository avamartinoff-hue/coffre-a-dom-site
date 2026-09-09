/* =========================================================
   COFFRE À DOM, Page « Payer une commande » (/payer/?o=<id>)
   Le client arrive depuis le lien de paiement reçu par e-mail.
   Récupère la commande (order-pay), puis propose TWINT (QR) ou carte
   (SumUp) — mêmes fonctions serveur que le tunnel de commande normal.
   ========================================================= */
(function () {
  'use strict';
  var root = document.querySelector('[data-pay]');
  if (!root) return;
  var B = window.__BASE__ || '';
  var I = window.__I18N__ || {};
  var T = function (k, f) { return I[k] != null ? I[k] : f; };
  var chf = function (n) { return 'CHF ' + Number(n).toFixed(2); };

  function q(name) {
    var m = new RegExp('[?&]' + name + '=([^&]+)').exec(location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }
  var orderId = q('o');

  function box(html) { root.innerHTML = '<div class="confirm confirm--pay">' + html + '</div>'; }
  function head(data) {
    return '<h2>' + T('pay_page_title', 'Régler ma commande') + '</h2>' +
      '<p class="confirm__num">' + T('reference', 'Référence :') + ' <b>' + data.orderNumber + '</b> · ' +
      T('total_label', 'Total :') + ' <b>' + chf(data.total) + '</b></p>';
  }

  if (!orderId) { box('<h2>' + T('pay_page_title', 'Régler ma commande') + '</h2><p class="confirm__twint-note">' + T('pay_no_order', 'Lien invalide : aucune commande indiquée.') + '</p>'); return; }

  function loadSumupSdk(cb) {
    if (window.SumUpCard) return cb();
    var s = document.createElement('script');
    s.src = 'https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js';
    s.onload = function () { cb(); };
    s.onerror = function () { cb(new Error('sdk')); };
    document.head.appendChild(s);
  }

  function paid(data) {
    box(head(data) + '<div class="confirm__check">✅</div><p class="confirm__twint-note">' + T('payment_received', '✅ Paiement reçu, merci !') + '</p>' +
      '<div class="confirm__actions"><a href="' + B + '/" class="btn btn--ghost">' + T('home', 'Accueil') + '</a><a href="' + B + '/boutique/" class="btn btn--gold">' + T('continue', 'Continuer mes achats') + '</a></div>');
  }

  function chooser(data) {
    var btns = '';
    if (data.twintAuto) btns += '<button class="btn btn--gold" type="button" data-pay-twint>📱 ' + T('pay_twint', 'Payer par TWINT') + '</button>';
    if (data.sumupConfigured) btns += '<button class="btn btn--ghost" type="button" data-pay-card>💳 ' + T('pay_card', 'Payer par carte') + '</button>';
    if (!btns) {
      btns = '<p class="confirm__twint-note">' + T('pay_contact', 'Le paiement en ligne est momentanément indisponible. Contactez-nous pour régler votre commande.') + '</p>';
    }
    box(head(data) + '<p>' + T('pay_choose', 'Choisissez votre moyen de paiement :') + '</p><div class="pay-methods">' + btns + '</div><p class="confirm__twint-note" data-pay-msg role="status" aria-live="polite"></p>');
    var msg = root.querySelector('[data-pay-msg]');
    var tw = root.querySelector('[data-pay-twint]'); if (tw) tw.addEventListener('click', function () { startTwint(data, msg); });
    var cd = root.querySelector('[data-pay-card]'); if (cd) cd.addEventListener('click', function () { startCard(data, msg); });
  }

  function startTwint(data, msg) {
    box(head(data) + '<h3>' + T('twint_pay_title', 'Paiement TWINT') + '</h3><div class="twint-qr" data-twint-qr></div>' +
      '<p class="confirm__twint-note" data-twint-msg role="status" aria-live="polite">' + T('twint_scan', 'Scannez ce QR code avec votre app TWINT pour payer.') + '</p>');
    var qrBox = root.querySelector('[data-twint-qr]');
    var tmsg = root.querySelector('[data-twint-msg]');
    fetch('/.netlify/functions/twint-start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: orderId }) })
      .then(function (r) { return r.json(); }).then(function (s) {
        if (s && s.alreadyPaid) { paid(data); return; }
        if (!s || !s.ok || !s.qrCode) { tmsg.textContent = T('twint_unavailable', 'TWINT momentanément indisponible. Réessayez ou payez par carte.'); return; }
        var src = /^data:/.test(s.qrCode) ? s.qrCode : ('data:image/png;base64,' + s.qrCode);
        qrBox.innerHTML = '<img src="' + src + '" alt="QR TWINT" width="240" height="240" />' + (s.token ? '<div class="twint-token">' + s.token + '</div>' : '');
        var tries = 0;
        var poll = setInterval(function () {
          tries++;
          if (tries > 120) { clearInterval(poll); tmsg.textContent = T('twint_timeout', 'Délai dépassé. Réessayez ou payez autrement.'); return; }
          fetch('/.netlify/functions/twint-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: orderId, orderUuid: s.orderUuid }) })
            .then(function (r) { return r.json(); }).then(function (st) {
              if (st && st.status === 'paid') { clearInterval(poll); paid(data); }
              else if (st && st.status === 'failed') { clearInterval(poll); tmsg.textContent = T('pay_failed', 'Paiement refusé. Réessayez ou changez de carte.'); }
              else { tmsg.textContent = T('twint_waiting', 'En attente de votre paiement…'); }
            }).catch(function () {});
        }, 3000);
      }).catch(function () { tmsg.textContent = T('net_error', '⚠️ Erreur réseau. Réessayez.'); });
  }

  function startCard(data, msg) {
    if (msg) msg.textContent = T('saving', 'Préparation du paiement…');
    fetch('/.netlify/functions/order-pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: orderId, action: 'sumup' }) })
      .then(function (r) { return r.json(); }).then(function (d) {
        if (d && d.paid) { paid(data); return; }
        if (!d || !d.ok || !d.checkoutId) { if (msg) msg.textContent = T('net_error', '⚠️ Erreur réseau. Réessayez.'); return; }
        box(head(data) + '<h3>' + T('pay_card_title', 'Paiement par carte') + '</h3><div id="sumup-card"></div><p class="confirm__twint-note" data-sumup-msg role="status" aria-live="polite"></p>');
        var smsg = root.querySelector('[data-sumup-msg]');
        loadSumupSdk(function (err) {
          if (err || !window.SumUpCard) { smsg.textContent = T('net_error', '⚠️ Erreur réseau. Réessayez.'); return; }
          window.SumUpCard.mount({
            id: 'sumup-card',
            checkoutId: d.checkoutId,
            locale: (window.__LANG__ || 'fr') + '-CH',
            onResponse: function (type) {
              if (type === 'success') {
                smsg.textContent = T('saving', 'Enregistrement de la commande…');
                fetch('/.netlify/functions/sumup-confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: orderId, checkoutId: d.checkoutId }) })
                  .then(function (r) { return r.json(); }).then(function (cr) {
                    if (cr && cr.ok && cr.paid) paid(data);
                    else smsg.textContent = T('order_failed', 'Commande impossible.') + (cr && cr.status ? ' (' + cr.status + ')' : '');
                  }).catch(function () { smsg.textContent = T('net_error', '⚠️ Erreur réseau. Réessayez.'); });
              } else if (type === 'error' || type === 'fail') {
                smsg.textContent = T('pay_failed', 'Paiement refusé. Réessayez ou changez de carte.');
              }
            },
          });
        });
      }).catch(function () { if (msg) msg.textContent = T('net_error', '⚠️ Erreur réseau. Réessayez.'); });
  }

  // Démarrage : on charge la commande.
  box('<p class="empty">' + T('loading', 'Chargement…') + '</p>');
  fetch('/.netlify/functions/order-pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: orderId, action: 'info' }) })
    .then(function (r) { return r.json(); }).then(function (data) {
      if (!data || !data.ok) { box('<h2>' + T('pay_page_title', 'Régler ma commande') + '</h2><p class="confirm__twint-note">' + T('pay_not_found', 'Commande introuvable. Vérifiez le lien reçu par e-mail.') + '</p>'); return; }
      if (data.cancelled) { box(head(data) + '<p class="confirm__twint-note">' + T('pay_cancelled', 'Cette commande a été annulée.') + '</p>'); return; }
      if (data.paid) { paid(data); return; }
      chooser(data);
    }).catch(function () { box('<h2>' + T('pay_page_title', 'Régler ma commande') + '</h2><p class="confirm__twint-note">' + T('net_error', '⚠️ Erreur réseau. Réessayez.') + '</p>'); });
})();
