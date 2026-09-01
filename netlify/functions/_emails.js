/* =========================================================
   Modèles d'e-mails transactionnels — multilingues (fr/en/it/de)
   Rendu HTML compatible clients mail (tableaux + styles inline).
   ========================================================= */
const SITE = process.env.SITE_URL || 'https://coffreadom-ch.netlify.app';
const GOLD = '#ea9300';
const DARK = '#2b2015';

const chf = (n) => 'CHF ' + Number(n || 0).toFixed(2);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const L = (lang) => (T[lang] ? lang : 'fr');

// ---- chaînes par langue ----
const T = {
  fr: {
    hi: 'Bonjour', thanks: 'Merci pour votre commande !', order: 'Commande', ref: 'Référence',
    article: 'Article', qty: 'Qté', price: 'Prix', subtotal: 'Sous-total', shipping: 'Livraison', discount: 'Remise', total: 'Total',
    free: 'Offerte', retrait: 'Retrait en boutique (Le Bouveret)', poste: 'Livraison postale',
    addr: 'Adresse de livraison', pay: 'Paiement', paid: 'Payé ✅',
    confirm_sub: (n) => `Confirmation de votre commande ${n} — Coffre à Dom`,
    confirm_intro: 'Nous avons bien reçu votre commande et votre paiement. Voici le récapitulatif :',
    ship_sub_poste: (n) => `Votre commande ${n} a été expédiée 📦`,
    ship_sub_retrait: (n) => `Votre commande ${n} est prête au retrait 🏪`,
    ship_body_poste: 'Bonne nouvelle : votre commande vient d\'être expédiée par la Poste. Vous devriez la recevoir sous quelques jours ouvrables.',
    ship_body_retrait: 'Bonne nouvelle : votre commande est prête ! Vous pouvez venir la retirer à la boutique du Bouveret aux heures d\'ouverture.',
    cancel_sub: (n) => `Votre commande ${n} a été annulée`,
    cancel_body: 'Votre commande a été annulée. Si un paiement a été effectué, il vous sera remboursé. Pour toute question, répondez simplement à cet e-mail.',
    cart_sub: 'Vous avez oublié quelque chose 🛒',
    cart_body: 'Votre panier vous attend ! Les pièces ludiques partent vite — finalisez votre commande avant qu\'elles ne s\'envolent.',
    cart_cta: 'Finaliser ma commande',
    shop_cta: 'Voir la boutique', help: 'Une question ? Répondez à cet e-mail, nous sommes là pour vous.',
    track_label: 'N° de suivi', track_cta: 'Suivre mon colis',
    news_sub: 'Bienvenue au Coffre 🗝️', news_h: 'Bienvenue dans le Dernier Refuge 🗝️',
    news_body: 'Merci pour ton inscription ! Tu recevras en avant-première les sorties de cartes, les tournois et les coffres mystères — un e-mail seulement quand ça compte, jamais de spam.',
    news_cta: 'Découvrir la boutique',
    signoff: 'À très vite,\nL\'équipe Coffre à Dom',
    hours_label: 'Horaires', hours: 'Ma–Je 13h30–16h30 · Sa 18h–22h · Di 14h–18h (Lu & Ve fermé)',
  },
  en: {
    hi: 'Hello', thanks: 'Thank you for your order!', order: 'Order', ref: 'Reference',
    article: 'Item', qty: 'Qty', price: 'Price', subtotal: 'Subtotal', shipping: 'Shipping', discount: 'Discount', total: 'Total',
    free: 'Free', retrait: 'In-store pickup (Le Bouveret)', poste: 'Postal delivery',
    addr: 'Delivery address', pay: 'Payment', paid: 'Paid ✅',
    confirm_sub: (n) => `Order confirmation ${n} — Coffre à Dom`,
    confirm_intro: 'We\'ve received your order and payment. Here\'s your summary:',
    ship_sub_poste: (n) => `Your order ${n} has shipped 📦`,
    ship_sub_retrait: (n) => `Your order ${n} is ready for pickup 🏪`,
    ship_body_poste: 'Good news: your order has just been shipped by post. You should receive it within a few business days.',
    ship_body_retrait: 'Good news: your order is ready! You can pick it up at our Le Bouveret store during opening hours.',
    cancel_sub: (n) => `Your order ${n} has been cancelled`,
    cancel_body: 'Your order has been cancelled. If a payment was made, it will be refunded. Any questions? Just reply to this email.',
    cart_sub: 'You forgot something 🛒',
    cart_body: 'Your basket is waiting! Collectibles sell fast — complete your order before they\'re gone.',
    cart_cta: 'Complete my order',
    shop_cta: 'Visit the shop', help: 'A question? Reply to this email, we\'re here to help.',
    track_label: 'Tracking number', track_cta: 'Track my parcel',
    news_sub: 'Welcome to the Coffre 🗝️', news_h: 'Welcome to the Last Refuge 🗝️',
    news_body: 'Thanks for signing up! You\'ll be first to hear about card releases, tournaments and mystery chests — an email only when it matters, never spam.',
    news_cta: 'Explore the shop',
    signoff: 'See you soon,\nThe Coffre à Dom team',
    hours_label: 'Opening hours', hours: 'Tue–Thu 13:30–16:30 · Sat 18:00–22:00 · Sun 14:00–18:00 (closed Mon & Fri)',
  },
  it: {
    hi: 'Ciao', thanks: 'Grazie per il tuo ordine!', order: 'Ordine', ref: 'Riferimento',
    article: 'Articolo', qty: 'Qtà', price: 'Prezzo', subtotal: 'Subtotale', shipping: 'Spedizione', discount: 'Sconto', total: 'Totale',
    free: 'Gratuita', retrait: 'Ritiro in negozio (Le Bouveret)', poste: 'Consegna postale',
    addr: 'Indirizzo di consegna', pay: 'Pagamento', paid: 'Pagato ✅',
    confirm_sub: (n) => `Conferma del tuo ordine ${n} — Coffre à Dom`,
    confirm_intro: 'Abbiamo ricevuto il tuo ordine e il pagamento. Ecco il riepilogo:',
    ship_sub_poste: (n) => `Il tuo ordine ${n} è stato spedito 📦`,
    ship_sub_retrait: (n) => `Il tuo ordine ${n} è pronto per il ritiro 🏪`,
    ship_body_poste: 'Buone notizie: il tuo ordine è appena stato spedito per posta. Dovresti riceverlo entro pochi giorni lavorativi.',
    ship_body_retrait: 'Buone notizie: il tuo ordine è pronto! Puoi ritirarlo nel negozio di Le Bouveret negli orari di apertura.',
    cancel_sub: (n) => `Il tuo ordine ${n} è stato annullato`,
    cancel_body: 'Il tuo ordine è stato annullato. Se è stato effettuato un pagamento, verrà rimborsato. Domande? Rispondi a questa e-mail.',
    cart_sub: 'Hai dimenticato qualcosa 🛒',
    cart_body: 'Il tuo carrello ti aspetta! I pezzi da collezione vanno a ruba — completa l\'ordine prima che spariscano.',
    cart_cta: 'Completa l\'ordine',
    shop_cta: 'Vai al negozio', help: 'Una domanda? Rispondi a questa e-mail, siamo qui per te.',
    track_label: 'N° di tracciamento', track_cta: 'Traccia il pacco',
    news_sub: 'Benvenuto al Coffre 🗝️', news_h: 'Benvenuto nell\'Ultimo Rifugio 🗝️',
    news_body: 'Grazie per l\'iscrizione! Sarai il primo a scoprire uscite di carte, tornei e bauli misteriosi — un\'e-mail solo quando conta, mai spam.',
    news_cta: 'Esplora il negozio',
    signoff: 'A presto,\nIl team Coffre à Dom',
    hours_label: 'Orari', hours: 'Ma–Gio 13:30–16:30 · Sa 18:00–22:00 · Do 14:00–18:00 (Lu e Ve chiuso)',
  },
  de: {
    hi: 'Hallo', thanks: 'Vielen Dank für deine Bestellung!', order: 'Bestellung', ref: 'Referenz',
    article: 'Artikel', qty: 'Menge', price: 'Preis', subtotal: 'Zwischensumme', shipping: 'Versand', discount: 'Rabatt', total: 'Total',
    free: 'Kostenlos', retrait: 'Abholung im Laden (Le Bouveret)', poste: 'Postversand',
    addr: 'Lieferadresse', pay: 'Zahlung', paid: 'Bezahlt ✅',
    confirm_sub: (n) => `Bestellbestätigung ${n} — Coffre à Dom`,
    confirm_intro: 'Wir haben deine Bestellung und Zahlung erhalten. Hier die Übersicht:',
    ship_sub_poste: (n) => `Deine Bestellung ${n} wurde versandt 📦`,
    ship_sub_retrait: (n) => `Deine Bestellung ${n} ist abholbereit 🏪`,
    ship_body_poste: 'Gute Nachrichten: Deine Bestellung wurde soeben per Post versandt. Du solltest sie in wenigen Werktagen erhalten.',
    ship_body_retrait: 'Gute Nachrichten: Deine Bestellung ist bereit! Du kannst sie im Laden in Le Bouveret während der Öffnungszeiten abholen.',
    cancel_sub: (n) => `Deine Bestellung ${n} wurde storniert`,
    cancel_body: 'Deine Bestellung wurde storniert. Falls eine Zahlung erfolgt ist, wird sie zurückerstattet. Fragen? Antworte einfach auf diese E-Mail.',
    cart_sub: 'Du hast etwas vergessen 🛒',
    cart_body: 'Dein Warenkorb wartet! Sammlerstücke sind schnell weg — schliesse deine Bestellung ab, bevor sie vergriffen sind.',
    cart_cta: 'Bestellung abschliessen',
    shop_cta: 'Zum Shop', help: 'Eine Frage? Antworte auf diese E-Mail, wir helfen gerne.',
    track_label: 'Sendungsnummer', track_cta: 'Sendung verfolgen',
    news_sub: 'Willkommen im Coffre 🗝️', news_h: 'Willkommen im Letzten Refugium 🗝️',
    news_body: 'Danke für deine Anmeldung! Du erfährst als Erste·r von Kartenreleases, Turnieren und Mystery-Truhen — eine E-Mail nur, wenn es zählt, niemals Spam.',
    news_cta: 'Zum Shop',
    signoff: 'Bis bald,\nDein Coffre à Dom Team',
    hours_label: 'Öffnungszeiten', hours: 'Di–Do 13:30–16:30 · Sa 18:00–22:00 · So 14:00–18:00 (Mo & Fr geschlossen)',
  },
};

// ---- coquille HTML commune ----
function shell(inner, lang) {
  const t = T[L(lang)];
  return `<!doctype html><html><body style="margin:0;background:#f6f1e7;font-family:Arial,Helvetica,sans-serif;color:${DARK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1e7;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #ece2d0;">
        <tr><td style="background:${DARK};padding:20px 28px;text-align:center;">
          <img src="${SITE}/assets/brand/logo.png" alt="Coffre à Dom" width="180" style="max-width:180px;height:auto;color:${GOLD};font-size:24px;font-weight:bold;font-family:Georgia,serif;" />
        </td></tr>
        <tr><td style="padding:28px;">${inner}</td></tr>
        <tr><td style="background:#faf6ee;padding:22px 28px;text-align:center;font-size:12px;color:#8a7a63;line-height:1.8;border-top:1px solid #f0e9db;">
          <strong style="color:${DARK};font-size:13px;">Coffre à Dom</strong><br>
          📍 Route des Îles 84, 1897 Le Bouveret (Valais, Suisse)<br>
          📞 +41 78 941 85 38 &nbsp;·&nbsp; ✉ <a href="mailto:coffreadom@hotmail.com" style="color:${GOLD};text-decoration:none;">coffreadom@hotmail.com</a> &nbsp;·&nbsp; 🌐 <a href="${SITE}" style="color:${GOLD};text-decoration:none;">coffreadom.ch</a><br>
          🕐 <strong>${esc(t.hours_label)} :</strong> ${esc(t.hours)}
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

const btn = (href, label) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr><td style="border-radius:100px;background:${GOLD};"><a href="${esc(href)}" style="display:inline-block;padding:13px 30px;color:#fff;font-weight:bold;text-decoration:none;border-radius:100px;">${esc(label)}</a></td></tr></table>`;
const p = (txt) => `<p style="font-size:15px;line-height:1.6;margin:0 0 14px;">${txt}</p>`;
const h = (txt) => `<h1 style="font-size:22px;margin:0 0 16px;color:${DARK};">${esc(txt)}</h1>`;

function itemsTable(items, t) {
  const rows = (items || []).map((it) =>
    `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #f0e9db;font-size:14px;">${esc(it.name)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f0e9db;font-size:14px;text-align:center;">${it.qty}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f0e9db;font-size:14px;text-align:right;white-space:nowrap;">${chf(it.line_total)}</td>
    </tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 6px;">
    <tr><th align="left" style="font-size:12px;color:#8a7a63;text-transform:uppercase;padding-bottom:6px;">${t.article}</th>
    <th style="font-size:12px;color:#8a7a63;text-transform:uppercase;padding-bottom:6px;">${t.qty}</th>
    <th align="right" style="font-size:12px;color:#8a7a63;text-transform:uppercase;padding-bottom:6px;">${t.price}</th></tr>
    ${rows}
  </table>`;
}

function totals(order, t) {
  const line = (k, v, b) => `<tr><td style="font-size:14px;padding:3px 0;${b ? 'font-weight:bold;font-size:16px;' : ''}">${k}</td><td align="right" style="font-size:14px;padding:3px 0;${b ? 'font-weight:bold;font-size:16px;' : ''}">${v}</td></tr>`;
  const ship = Number(order.shipping_fee) > 0 ? chf(order.shipping_fee) : t.free;
  const disc = Number(order.discount) > 0
    ? line(t.discount + (order.promo_code ? ` (${esc(order.promo_code)})` : ''), '−' + chf(order.discount))
    : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 10px;">
    ${line(t.subtotal, chf(order.subtotal))}
    ${line(t.shipping, ship)}
    ${disc}
    ${line(t.total, chf(order.total), true)}
  </table>`;
}

function addrBlock(order, t) {
  if (order.shipping_mode !== 'poste' || !order.shipping_address) {
    return p(`<b>${t.pay === 'Payment' ? 'Delivery' : (t.pay === 'Zahlung' ? 'Lieferung' : (t.pay === 'Pagamento' ? 'Consegna' : 'Livraison'))}:</b> ${esc(t.retrait)}`);
  }
  const a = order.shipping_address;
  const line1 = [a.rue, a.numero].filter(Boolean).join(' ');
  const line2 = [a.npa, a.localite].filter(Boolean).join(' ');
  return p(`<b>${esc(t.addr)}:</b><br>${esc([line1, line2].filter(Boolean).join(', '))}`);
}

const greeting = (order, t) => p(`${t.hi} ${esc(order.full_name || '')},`);
const sign = (t) => p(String(t.signoff).replace(/\n/g, '<br>'));

// ---- e-mails ----
function orderConfirmation(order, items) {
  const t = T[L(order.lang)];
  const inner = h(t.thanks) + greeting(order, t) + p(t.confirm_intro) +
    p(`<b>${t.order} ${esc(order.order_number)}</b> · ${t.paid}`) +
    itemsTable(items, t) + totals(order, t) + addrBlock(order, t) +
    btn(`${SITE}/`, t.shop_cta) + p(t.help) + sign(t);
  return { subject: t.confirm_sub(order.order_number), html: shell(inner, order.lang) };
}

function orderShipped(order) {
  const t = T[L(order.lang)];
  const poste = order.shipping_mode === 'poste';
  const trackUrl = order.tracking_number ? `https://www.post.ch/swisspost-tracking?formattedParcelCodes=${encodeURIComponent(order.tracking_number)}` : null;
  const inner = h(poste ? '📦' : '🏪') + greeting(order, t) +
    p(poste ? t.ship_body_poste : t.ship_body_retrait) +
    p(`<b>${t.order} ${esc(order.order_number)}</b>`) +
    (poste ? addrBlock(order, t) : '') +
    (poste && order.tracking_number ? p(`<b>${t.track_label} :</b> ${esc(order.tracking_number)}`) + btn(trackUrl, t.track_cta) : btn(`${SITE}/`, t.shop_cta)) +
    p(t.help) + sign(t);
  return { subject: (poste ? t.ship_sub_poste : t.ship_sub_retrait)(order.order_number), html: shell(inner, order.lang) };
}

function orderCancelled(order) {
  const t = T[L(order.lang)];
  const inner = h(t.cancel_sub(order.order_number)) + greeting(order, t) +
    p(t.cancel_body) + p(`<b>${t.order} ${esc(order.order_number)}</b> · ${chf(order.total)}`) +
    sign(t);
  return { subject: t.cancel_sub(order.order_number), html: shell(inner, order.lang) };
}

function abandonedCart(cart) {
  const t = T[L(cart.lang)];
  const items = (cart.items || []).map((i) => ({ name: i.name, qty: i.qty, line_total: (i.price || 0) * (i.qty || 1) }));
  const inner = h(t.cart_sub) + p(`${t.hi},`) + p(t.cart_body) +
    itemsTable(items, t) +
    btn(`${SITE}/commander/`, t.cart_cta) + p(t.help) + sign(t);
  return { subject: t.cart_sub, html: shell(inner, cart.lang) };
}

// e-mail interne au commerçant (toujours en français)
function merchantNewOrder(order, items) {
  const t = T.fr;
  const rows = (items || []).map((it) => `${it.qty}× ${esc(it.name)} — ${chf(it.line_total)}`).join('<br>');
  const a = order.shipping_address;
  const addr = order.shipping_mode === 'poste' && a
    ? `${esc([a.rue, a.numero].filter(Boolean).join(' '))}, ${esc([a.npa, a.localite].filter(Boolean).join(' '))}`
    : 'Retrait boutique';
  const inner = h(`🎉 Nouvelle commande ${order.order_number}`) +
    p(`<b>Client :</b> ${esc(order.full_name)}<br><b>E-mail :</b> ${esc(order.email)}<br><b>Tél :</b> ${esc(order.phone || '—')}`) +
    p(`<b>Livraison :</b> ${order.shipping_mode === 'poste' ? '📦 Poste' : '🏪 Retrait'}<br><b>Adresse :</b> ${addr}`) +
    p(`<b>Paiement :</b> ${order.payment_method === 'twint' ? 'TWINT' : 'SumUp'} · ${t.paid}`) +
    p(`<b>Articles :</b><br>${rows}`) +
    p(`<b>Total : ${chf(order.total)}</b>`) +
    (order.note ? p(`<b>Note :</b> ${esc(order.note)}`) : '') +
    btn(`${SITE}/admin/`, 'Ouvrir le back office');
  return { subject: `🎉 Nouvelle commande ${order.order_number} — ${chf(order.total)}`, html: shell(inner, 'fr') };
}

function newsletterWelcome(lang) {
  const t = T[L(lang)];
  const inner = h(t.news_h) + p(t.news_body) + btn(`${SITE}/`, t.news_cta) + p(t.help) + sign(t);
  return { subject: t.news_sub, html: shell(inner, lang) };
}

module.exports = { orderConfirmation, orderShipped, orderCancelled, abandonedCart, merchantNewOrder, newsletterWelcome };
