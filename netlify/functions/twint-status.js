/* =========================================================
   Netlify Function — statut d'un paiement TWINT
   POST { orderId, orderUuid } → MonitorOrder ; si payé, marque la
   commande "payée" (source de vérité = TWINT, jamais le client) et
   décrémente le stock suivi.
   ========================================================= */
const twint = require('./_twint.js');
const notify = require('./_notify.js');
const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (c, b) => ({ statusCode: c, headers: H, body: JSON.stringify(b) });

function sb() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  return {
    async get(p) { const r = await fetch(`${url}/rest/v1/${p}`, { headers }); if (!r.ok) throw new Error(`GET ${p} ${r.status}`); return r.json(); },
    async patch(p, b) { const r = await fetch(`${url}/rest/v1/${p}`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(b) }); if (!r.ok) throw new Error(`PATCH ${p} ${r.status}`); },
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Méthode non autorisée.' });
  if (!twint.configured()) return json(200, { ok: false, configured: false });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) return json(500, { ok: false, error: 'Service indisponible.' });

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'Requête invalide.' }); }
  if (!body.orderId || !body.orderUuid) return json(400, { ok: false, error: 'Paramètres manquants.' });

  const db = sb();
  try {
    const [order] = await db.get(`orders?select=*&id=eq.${encodeURIComponent(body.orderId)}`);
    if (!order) return json(404, { ok: false, error: 'Commande introuvable.' });
    if (order.payment_status === 'paid') return json(200, { ok: true, status: 'paid' });

    const r = await twint.monitorOrder({ orderUuid: body.orderUuid });
    const st = twint.interpret(r.statusValue);
    if (st !== 'paid') return json(200, { ok: true, status: st, twintStatus: r.statusValue });

    // Payé → commande payée.
    // (Le stock a déjà été réservé à la création de la commande — pas de décrément ici.)
    await db.patch(`orders?id=eq.${order.id}`, { payment_status: 'paid', paid_at: new Date().toISOString() });
    const items = await db.get(`order_items?select=product_slug,qty,name,line_total&order_id=eq.${order.id}`);
    // E-mails + Brevo (une seule fois, jamais bloquant)
    if (!order.confirmation_sent_at) {
      await notify.afterPaid({ ...order, payment_status: 'paid' }, items);
      await db.patch(`orders?id=eq.${order.id}`, { confirmation_sent_at: new Date().toISOString() }).catch(() => {});
    }
    return json(200, { ok: true, status: 'paid' });
  } catch (e) {
    return json(502, { ok: false, error: 'Erreur statut TWINT.', detail: String(e.message || e) });
  }
};
