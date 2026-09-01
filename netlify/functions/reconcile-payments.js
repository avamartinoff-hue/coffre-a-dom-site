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
    async rpc(fn, args) { const r = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) }); if (!r.ok) throw new Error(`RPC ${fn} ${r.status}`); return r.json(); },
  };
}

async function finalizePaid(db, order) {
  // Le stock a déjà été réservé à la création — on ne re-décrémente pas.
  await db.patch(`orders?id=eq.${order.id}`, { payment_status: 'paid', paid_at: new Date().toISOString() });
  const items = await db.get(`order_items?select=product_slug,qty,name,line_total&order_id=eq.${order.id}`);
  if (!order.confirmation_sent_at) {
    await notify.afterPaid({ ...order, payment_status: 'paid' }, items);
    await db.patch(`orders?id=eq.${order.id}`, { confirmation_sent_at: new Date().toISOString() }).catch(() => {});
  }
}

// Rend au stock les unités réservées d'une commande non payée (une seule fois).
async function releaseStock(db, order) {
  if (!order.stock_reserved) return;
  const items = await db.get(`order_items?select=product_slug,qty&order_id=eq.${order.id}`);
  for (const it of items) {
    if (!it.product_slug) continue;
    try { await db.rpc('release_stock', { p_slug: it.product_slug, p_qty: it.qty }); } catch (e) { /* ignore */ }
  }
  await db.patch(`orders?id=eq.${order.id}`, { stock_reserved: false }).catch(() => {});
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
  const RELEASE_AFTER = Number(process.env.STOCK_RELEASE_MINUTES || 45) * 60 * 1000; // délai avant de rendre le stock
  let checked = 0, recovered = 0, released = 0;
  try {
    const orders = await db.get(
      `orders?select=*&payment_status=eq.pending&created_at=lt.${olderThan}&created_at=gt.${newerThan}&order=created_at.desc&limit=40`
    );
    for (const order of orders) {
      checked++;
      const paid = order.payment_method === 'twint' ? await twintPaid(order)
        : order.payment_method === 'sumup' ? await sumupPaid(order)
          : false;
      if (paid) { await finalizePaid(db, order); recovered++; continue; }
      // Non payée et assez ancienne → on considère le paiement abandonné :
      // on marque la commande "expirée" et on REND le stock réservé.
      const age = now - new Date(order.created_at).getTime();
      if (age > RELEASE_AFTER) {
        await releaseStock(db, order);
        await db.patch(`orders?id=eq.${order.id}`, { payment_status: 'failed' }).catch(() => {});
        released++;
      }
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, checked, recovered, released }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e.message || e), checked, recovered, released }) };
  }
};
