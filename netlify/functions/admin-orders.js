/* =========================================================
   Netlify Function — back office commandes (protégé)
   Auth : en-tête x-admin-password === ADMIN_PASSWORD
   GET  : liste des commandes (+ lignes)
   POST : { action:'set-status', orderId, status }  (paid|pending|failed|cancelled)
          → sur "paid" : paid_at + décrément du stock suivi.
   Env : SUPABASE_URL, SUPABASE_SECRET_KEY, ADMIN_PASSWORD
   ========================================================= */
const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, x-admin-password', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (code, body) => ({ statusCode: code, headers: H, body: JSON.stringify(body) });

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
  const pwd = event.headers['x-admin-password'] || event.headers['X-Admin-Password'];
  if (!process.env.ADMIN_PASSWORD || pwd !== process.env.ADMIN_PASSWORD) return json(401, { ok: false, error: 'Non autorisé.' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) return json(500, { ok: false, error: 'Service indisponible.' });

  const db = sb();
  try {
    if (event.httpMethod === 'GET') {
      const orders = await db.get('orders?select=*,order_items(name,qty,unit_price,line_total)&order=created_at.desc&limit=200');
      return json(200, { ok: true, orders });
    }
    if (event.httpMethod === 'POST') {
      const { action, orderId, status } = JSON.parse(event.body || '{}');
      if (action === 'set-status') {
        const allowed = ['paid', 'pending', 'failed', 'cancelled'];
        if (!orderId || !allowed.includes(status)) return json(400, { ok: false, error: 'Paramètres invalides.' });
        const patch = { payment_status: status, paid_at: status === 'paid' ? new Date().toISOString() : null };
        await db.patch(`orders?id=eq.${orderId}`, patch);

        if (status === 'paid') {
          // décrément du stock suivi (stock_qty non null)
          const items = await db.get(`order_items?select=product_slug,qty&order_id=eq.${orderId}`);
          for (const it of items) {
            if (!it.product_slug) continue;
            const [p] = await db.get(`products?select=stock_qty&slug=eq.${encodeURIComponent(it.product_slug)}`);
            if (p && p.stock_qty != null) {
              const left = Math.max(0, p.stock_qty - it.qty);
              await db.patch(`products?slug=eq.${encodeURIComponent(it.product_slug)}`, { stock_qty: left, in_stock: left > 0 });
            }
          }
        }
        return json(200, { ok: true });
      }
      if (action === 'set-fulfillment') {
        const { fulfilled } = JSON.parse(event.body || '{}');
        if (!orderId) return json(400, { ok: false, error: 'orderId requis.' });
        await db.patch(`orders?id=eq.${orderId}`, { fulfilled_at: fulfilled ? new Date().toISOString() : null });
        return json(200, { ok: true });
      }
      return json(400, { ok: false, error: 'Action inconnue.' });
    }
    return json(405, { ok: false, error: 'Méthode non autorisée.' });
  } catch (e) {
    return json(502, { ok: false, error: 'Erreur back office.', detail: String(e.message || e) });
  }
};
