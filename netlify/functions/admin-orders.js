/* =========================================================
   Netlify Function — back office commandes (protégé)
   Auth : en-tête x-admin-password === ADMIN_PASSWORD
   GET  : liste des commandes (+ lignes)
   POST : { action:'set-status', orderId, status }  (paid|pending|failed|cancelled)
          → sur "paid" : paid_at + décrément du stock suivi.
   Env : SUPABASE_URL, SUPABASE_SECRET_KEY, ADMIN_PASSWORD
   ========================================================= */
const notify = require('./_notify.js');
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
        const [order] = await db.get(`orders?select=*&id=eq.${encodeURIComponent(orderId)}`);
        if (!order) return json(404, { ok: false, error: 'Commande introuvable.' });
        const patch = { payment_status: status, paid_at: status === 'paid' ? new Date().toISOString() : null };
        await db.patch(`orders?id=eq.${orderId}`, patch);

        if (status === 'paid') {
          // décrément du stock suivi (stock_qty non null)
          const items = await db.get(`order_items?select=product_slug,qty,name,line_total&order_id=eq.${orderId}`);
          for (const it of items) {
            if (!it.product_slug) continue;
            const [p] = await db.get(`products?select=stock_qty&slug=eq.${encodeURIComponent(it.product_slug)}`);
            if (p && p.stock_qty != null) {
              const left = Math.max(0, p.stock_qty - it.qty);
              await db.patch(`products?slug=eq.${encodeURIComponent(it.product_slug)}`, { stock_qty: left, in_stock: left > 0 });
            }
          }
          // confirmation + notif + Brevo (validation manuelle depuis le back office), une seule fois
          if (!order.confirmation_sent_at) {
            await notify.afterPaid({ ...order, payment_status: 'paid' }, items);
            await db.patch(`orders?id=eq.${orderId}`, { confirmation_sent_at: new Date().toISOString() }).catch(() => {});
          }
        } else if (status === 'cancelled' || status === 'failed') {
          await notify.afterCancelled(order);
        }
        return json(200, { ok: true });
      }
      if (action === 'update-order') {
        const f = JSON.parse(event.body || '{}').fields || {};
        if (!orderId) return json(400, { ok: false, error: 'orderId requis.' });
        const patch = {};
        if (typeof f.full_name === 'string' && f.full_name.trim()) patch.full_name = f.full_name.trim();
        if (typeof f.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) patch.email = f.email.trim().toLowerCase();
        if ('phone' in f) patch.phone = f.phone ? String(f.phone).trim() : null;
        if (f.shipping_mode === 'poste' || f.shipping_mode === 'retrait') patch.shipping_mode = f.shipping_mode;
        if ('shipping_address' in f) {
          const a = f.shipping_address;
          patch.shipping_address = (a && (a.rue || a.localite)) ? { rue: String(a.rue || '').trim(), numero: String(a.numero || '').trim(), npa: String(a.npa || '').trim(), localite: String(a.localite || '').trim(), pays: 'CH' } : null;
        }
        if ('note' in f) patch.note = f.note ? String(f.note).trim() : null;
        if (f.total != null && f.total !== '' && !isNaN(Number(f.total))) {
          const [o] = await db.get(`orders?select=shipping_fee&id=eq.${encodeURIComponent(orderId)}`);
          patch.total = Math.round(Number(f.total) * 100) / 100;
          patch.subtotal = Math.max(0, Math.round((patch.total - Number((o && o.shipping_fee) || 0)) * 100) / 100);
        }
        if (!Object.keys(patch).length) return json(400, { ok: false, error: 'Rien à modifier.' });
        await db.patch(`orders?id=eq.${encodeURIComponent(orderId)}`, patch);
        return json(200, { ok: true });
      }
      if (action === 'set-fulfillment') {
        const { fulfilled } = JSON.parse(event.body || '{}');
        if (!orderId) return json(400, { ok: false, error: 'orderId requis.' });
        await db.patch(`orders?id=eq.${orderId}`, { fulfilled_at: fulfilled ? new Date().toISOString() : null });
        if (fulfilled) {
          const [order] = await db.get(`orders?select=*&id=eq.${encodeURIComponent(orderId)}`);
          if (order) await notify.afterShipped(order);
        }
        return json(200, { ok: true });
      }
      return json(400, { ok: false, error: 'Action inconnue.' });
    }
    return json(405, { ok: false, error: 'Méthode non autorisée.' });
  } catch (e) {
    return json(502, { ok: false, error: 'Erreur back office.', detail: String(e.message || e) });
  }
};
