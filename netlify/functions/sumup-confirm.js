/* =========================================================
   Netlify Function — confirmation d'un paiement SumUp
   Le client appelle après le widget carte ; on RE-VÉRIFIE le statut
   directement auprès de SumUp (source de vérité, jamais le client),
   on contrôle référence + montant, puis on passe la commande en "payée".
   POST { orderId, checkoutId }
   Env : SUPABASE_URL, SUPABASE_SECRET_KEY, SUMUP_SECRET_KEY
   ========================================================= */
const notify = require('./_notify.js');
const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (c, b) => ({ statusCode: c, headers: H, body: JSON.stringify(b) });

function sb() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  return {
    async get(p) { const r = await fetch(`${url}/rest/v1/${p}`, { headers }); if (!r.ok) throw new Error(`GET ${p} ${r.status}`); return r.json(); },
    async patch(p, body) { const r = await fetch(`${url}/rest/v1/${p}`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`PATCH ${p} ${r.status}`); },
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Méthode non autorisée.' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY || !process.env.SUMUP_SECRET_KEY) return json(500, { ok: false, error: 'Service indisponible.' });

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'Requête invalide.' }); }
  const { orderId, checkoutId } = body;
  if (!orderId || !checkoutId) return json(400, { ok: false, error: 'Paramètres manquants.' });

  const db = sb();
  try {
    const [order] = await db.get(`orders?select=*&id=eq.${encodeURIComponent(orderId)}`);
    if (!order) return json(404, { ok: false, error: 'Commande introuvable.' });
    if (order.payment_status === 'paid') return json(200, { ok: true, paid: true }); // idempotent

    // Statut réel du checkout auprès de SumUp
    const r = await fetch(`https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(checkoutId)}`, {
      headers: { Authorization: `Bearer ${process.env.SUMUP_SECRET_KEY}` },
    });
    if (!r.ok) return json(502, { ok: false, error: 'Vérification SumUp impossible.' });
    const co = await r.json();

    const amountOk = Math.abs(Number(co.amount) - Number(order.total)) < 0.01;
    const refOk = co.checkout_reference === order.order_number;
    if (co.status !== 'PAID' || !amountOk || !refOk) {
      return json(200, { ok: true, paid: false, status: co.status });
    }

    // Paiement confirmé → commande payée + décrément du stock suivi
    await db.patch(`orders?id=eq.${order.id}`, { payment_status: 'paid', paid_at: new Date().toISOString() });
    const items = await db.get(`order_items?select=product_slug,qty,name,line_total&order_id=eq.${order.id}`);
    for (const it of items) {
      if (!it.product_slug) continue;
      const [p] = await db.get(`products?select=stock_qty&slug=eq.${encodeURIComponent(it.product_slug)}`);
      if (p && p.stock_qty != null) {
        const left = Math.max(0, p.stock_qty - it.qty);
        await db.patch(`products?slug=eq.${encodeURIComponent(it.product_slug)}`, { stock_qty: left, in_stock: left > 0 });
      }
    }
    // E-mails + Brevo (une seule fois, jamais bloquant)
    if (!order.confirmation_sent_at) {
      await notify.afterPaid({ ...order, payment_status: 'paid' }, items);
      await db.patch(`orders?id=eq.${order.id}`, { confirmation_sent_at: new Date().toISOString() }).catch(() => {});
    }
    return json(200, { ok: true, paid: true });
  } catch (e) {
    return json(502, { ok: false, error: 'Erreur de confirmation.', detail: String(e.message || e) });
  }
};
