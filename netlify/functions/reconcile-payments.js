/* =========================================================
   Netlify Scheduled Function — filet de sécurité paiements
   Re-vérifie auprès de TWINT / SumUp les commandes restées « en
   attente » (client ayant fermé l'onglet avant la confirmation) et
   les passe « payées » si le provider confirme (+ stock + e-mails).
   Planifiée via netlify.toml : [functions."reconcile-payments"].
   Env : SUPABASE_URL, SUPABASE_SECRET_KEY, SUMUP_SECRET_KEY, TWINT_*
   ========================================================= */
const twint = require('./_twint.js');
const notify = require('./_notify.js');

function sb() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  return {
    async get(p) { const r = await fetch(`${url}/rest/v1/${p}`, { headers }); if (!r.ok) throw new Error(`GET ${p} ${r.status}`); return r.json(); },
    async patch(p, body) { const r = await fetch(`${url}/rest/v1/${p}`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`PATCH ${p} ${r.status}`); },
  };
}

async function finalizePaid(db, order) {
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
  if (!order.confirmation_sent_at) {
    await notify.afterPaid({ ...order, payment_status: 'paid' }, items);
    await db.patch(`orders?id=eq.${order.id}`, { confirmation_sent_at: new Date().toISOString() }).catch(() => {});
  }
}

async function twintPaid(order) {
  try {
    const r = await twint.monitorOrder({ reference: order.order_number });
    return twint.interpret(r.statusValue) === 'paid';
  } catch (e) { return false; }
}

async function sumupPaid(order) {
  try {
    const r = await fetch(`https://api.sumup.com/v0.1/checkouts?checkout_reference=${encodeURIComponent(order.order_number)}`, {
      headers: { Authorization: `Bearer ${process.env.SUMUP_SECRET_KEY}` },
    });
    if (!r.ok) return false;
    const list = await r.json();
    return Array.isArray(list) && list.some((co) => co.status === 'PAID' && Math.abs(Number(co.amount) - Number(order.total)) < 0.01);
  } catch (e) { return false; }
}

exports.handler = async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) return { statusCode: 200, body: 'skip: no db' };
  const db = sb();
  const now = Date.now();
  const olderThan = new Date(now - 2 * 60 * 1000).toISOString();   // laisser 2 min au flux normal
  const newerThan = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(); // au-delà, checkouts expirés
  let checked = 0, recovered = 0;
  try {
    const orders = await db.get(
      `orders?select=*&payment_status=eq.pending&created_at=lt.${olderThan}&created_at=gt.${newerThan}&order=created_at.desc&limit=40`
    );
    for (const order of orders) {
      checked++;
      const paid = order.payment_method === 'twint' ? await twintPaid(order)
        : order.payment_method === 'sumup' ? await sumupPaid(order)
          : false;
      if (paid) { await finalizePaid(db, order); recovered++; }
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, checked, recovered }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e.message || e), checked, recovered }) };
  }
};
