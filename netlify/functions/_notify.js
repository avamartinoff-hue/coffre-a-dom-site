/* =========================================================
   Notifications post-paiement — jamais bloquant pour la commande.
   Envoie : confirmation au client + alerte au commerçant, et ajoute
   le client à Brevo. Toute erreur est avalée (un e-mail raté ne doit
   jamais empêcher une commande payée d'aboutir).
   ========================================================= */
const brevo = require('./_brevo.js');
const E = require('./_emails.js');

async function afterPaid(order, items) {
  const tasks = [];

  // 1) Confirmation de commande au client
  try {
    const m = E.orderConfirmation(order, items);
    tasks.push(brevo.sendEmail({ to: order.email, toName: order.full_name, subject: m.subject, html: m.html, tag: 'order-confirmation' }));
  } catch (e) { /* ignore */ }

  // 2) Alerte « nouvelle commande » au commerçant
  try {
    const notifyTo = process.env.ORDER_NOTIFY_EMAIL || process.env.BREVO_SENDER_EMAIL || 'coffreadom@hotmail.com';
    const m = E.merchantNewOrder(order, items);
    tasks.push(brevo.sendEmail({ to: notifyTo, subject: m.subject, html: m.html, replyTo: order.email, tag: 'new-order' }));
  } catch (e) { /* ignore */ }

  // 3) Ajout du client à Brevo (choix client : tous les acheteurs → liste newsletter)
  try {
    const parts = String(order.full_name || '').trim().split(/\s+/);
    tasks.push(brevo.addContact({
      email: order.email,
      attributes: { PRENOM: parts[0] || '', NOM: order.full_name || '', SOURCE: 'commande', LANGUE: order.lang || 'fr' },
    }));
  } catch (e) { /* ignore */ }

  // 4) Marque le panier abandonné comme « converti » (plus de relance)
  try {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
    if (url && key && order.email) {
      tasks.push(fetch(`${url}/rest/v1/abandoned_carts?email=eq.${encodeURIComponent(order.email)}&recovered_at=is.null`, {
        method: 'PATCH',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ recovered_at: new Date().toISOString() }),
      }));
    }
  } catch (e) { /* ignore */ }

  await Promise.allSettled(tasks);
}

async function afterShipped(order) {
  try {
    const m = E.orderShipped(order);
    await brevo.sendEmail({ to: order.email, toName: order.full_name, subject: m.subject, html: m.html, tag: 'order-shipped' });
  } catch (e) { /* ignore */ }
}

async function afterCancelled(order) {
  try {
    const m = E.orderCancelled(order);
    await brevo.sendEmail({ to: order.email, toName: order.full_name, subject: m.subject, html: m.html, tag: 'order-cancelled' });
  } catch (e) { /* ignore */ }
}

module.exports = { afterPaid, afterShipped, afterCancelled };
