/* =========================================================
   Netlify Function — back office STATISTIQUES (protégé)
   GET → CA, commandes par statut, top produits, visites.
   ========================================================= */
const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, x-admin-password', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const json = (c, b) => ({ statusCode: c, headers: H, body: JSON.stringify(b) });

function sb() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  return { async get(p, opt) { const r = await fetch(`${url}/rest/v1/${p}`, { headers: { ...headers, ...(opt || {}) } }); if (!r.ok) throw new Error(`${p} ${r.status}`); return r.json(); } };
}
const dayStr = (d) => d.toISOString().slice(0, 10);

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  const pwd = event.headers['x-admin-password'] || event.headers['X-Admin-Password'];
  if (!process.env.ADMIN_PASSWORD || pwd !== process.env.ADMIN_PASSWORD) return json(401, { ok: false, error: 'Non autorisé.' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) return json(500, { ok: false, error: 'Service indisponible.' });

  const db = sb();
  try {
    let orders;
    try {
      orders = await db.get('orders?select=total,payment_status,payment_method,created_at,paid_at,fulfilled_at&order=created_at.desc&limit=5000');
    } catch (e) {
      orders = await db.get('orders?select=total,payment_status,created_at,paid_at&order=created_at.desc&limit=5000');
    }
    const products = await db.get('products?select=in_stock,visible&limit=5000');

    // Période demandée (nombre de jours) : 1 (aujourd'hui) · 7 · 30 · 90 · 365. Défaut 30.
    const qsDays = parseInt((event.queryStringParameters || {}).days, 10);
    const N = [1, 7, 30, 90].includes(qsDays) ? qsDays : 30;

    const byStatus = { pending: 0, paid: 0, failed: 0, cancelled: 0 };
    let revenue = 0, revenuePeriod = 0, ordersPeriod = 0, paidOrdersPeriod = 0;
    let revenuePrev = 0, paidOrdersPrev = 0, ordersPrev = 0; // période PRÉCÉDENTE (les N jours d'avant)
    const payMethods = { twint: 0, sumup: 0, other: 0 };      // répartition des ventes payées (période)
    let toValidate = 0, toShip = 0; // à valider (paiement en attente) · à livrer (payée, non expédiée)
    const today = dayStr(new Date());
    let revenueToday = 0, ordersToday = 0;
    const days = {}; for (let i = N - 1; i >= 0; i--) { const d = new Date(); d.setUTCDate(d.getUTCDate() - i); days[dayStr(d)] = 0; }
    const prevDays = {}; for (let i = 2 * N - 1; i >= N; i--) { const d = new Date(); d.setUTCDate(d.getUTCDate() - i); prevDays[dayStr(d)] = true; }

    orders.forEach((o) => {
      byStatus[o.payment_status] = (byStatus[o.payment_status] || 0) + 1;
      if (o.payment_status === 'pending') toValidate++;
      if (o.payment_status === 'paid' && !o.fulfilled_at) toShip++;
      const d = (o.created_at || '').slice(0, 10);
      if (d === today) ordersToday++;
      if (d in days) ordersPeriod++;
      if (d in prevDays) ordersPrev++;
      if (o.payment_status === 'paid') {
        const t = Number(o.total) || 0;
        revenue += t;
        if (d in days) {
          days[d] += t; revenuePeriod += t; paidOrdersPeriod++;
          const m = o.payment_method === 'twint' ? 'twint' : o.payment_method === 'sumup' ? 'sumup' : 'other';
          payMethods[m]++;
        }
        if (d in prevDays) { revenuePrev += t; paidOrdersPrev++; }
        if (d === today) revenueToday += t;
      }
    });

    // Top produits (sur commandes payées)
    let topProducts = [];
    try {
      const items = await db.get('order_items?select=product_slug,name,qty,line_total,orders(payment_status)&limit=10000');
      const agg = {};
      items.forEach((it) => {
        if (!it.orders || it.orders.payment_status !== 'paid' || !it.product_slug) return;
        const k = it.product_slug;
        agg[k] = agg[k] || { slug: k, name: (it.name || '').replace(/^⏳ /, ''), qty: 0, revenue: 0 };
        agg[k].qty += it.qty; agg[k].revenue += Number(it.line_total) || 0;
      });
      topProducts = Object.values(agg).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
    } catch (e) { /* order_items facultatif */ }

    // Visites (table page_views facultative)
    let visits = null;
    try {
      const pv = await db.get('page_views?select=path,day&limit=100000');
      const vDays = {}; for (let i = N - 1; i >= 0; i--) { const d = new Date(); d.setUTCDate(d.getUTCDate() - i); vDays[dayStr(d)] = 0; }
      const vPrevDays = {}; for (let i = 2 * N - 1; i >= N; i--) { const d = new Date(); d.setUTCDate(d.getUTCDate() - i); vPrevDays[dayStr(d)] = true; }
      const paths = {};
      let total = 0, visitsToday = 0, visitsPeriod = 0, visitsPrev = 0;
      pv.forEach((v) => {
        total++;
        if (v.day in vDays) { vDays[v.day]++; visitsPeriod++; }
        if (v.day in vPrevDays) visitsPrev++;
        if (v.day === today) visitsToday++;
        const p = v.path || '/'; paths[p] = (paths[p] || 0) + 1;
      });
      const topPaths = Object.entries(paths).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([path, n]) => ({ path, n }));
      visits = { total, today: visitsToday, period: visitsPeriod, prev: visitsPrev, byDay: vDays, topPaths };
    } catch (e) { visits = null; }

    return json(200, {
      ok: true,
      periodDays: N,
      revenue: Math.round(revenue * 100) / 100,
      revenuePeriod: Math.round(revenuePeriod * 100) / 100,
      revenueToday: Math.round(revenueToday * 100) / 100,
      ordersTotal: orders.length,
      ordersPeriod,
      paidOrdersPeriod,
      ordersToday,
      revenuePrev: Math.round(revenuePrev * 100) / 100,
      paidOrdersPrev,
      ordersPrev,
      payMethods,
      byStatus,
      toValidate,
      toShip,
      revenueByDay: days,
      topProducts,
      products: { total: products.length, visible: products.filter((p) => p.visible).length, inStock: products.filter((p) => p.in_stock).length },
      visits,
    });
  } catch (e) {
    return json(502, { ok: false, error: 'Erreur stats', detail: String(e.message || e) });
  }
};
