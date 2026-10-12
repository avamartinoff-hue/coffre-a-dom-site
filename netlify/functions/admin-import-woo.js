/* =========================================================
   Netlify Function — Import de l'historique WooCommerce (protégé)
   Rapatrie les anciennes commandes de l'ancien site (API WooCommerce)
   dans la table Supabase `orders` (+ order_items), page par page.
   - Auth back office : en-tête x-admin-password === ADMIN_PASSWORD
   - Clés WooCommerce (lecture seule) fournies par l'appel (jamais stockées)
   - Dédoublonnage : order_number = "WC-<numéro>" (unique) → rejouable
   - Dates d'origine conservées (created_at / paid_at) → factures historiques
   POST { wooUrl, wooKey, wooSecret, page, perPage, before? }
   Env : SUPABASE_URL, SUPABASE_SECRET_KEY, ADMIN_PASSWORD
   ========================================================= */
const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, x-admin-password', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (c, b) => ({ statusCode: c, headers: H, body: JSON.stringify(b) });

function sb() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  return {
    async get(p) { const r = await fetch(`${url}/rest/v1/${p}`, { headers }); if (!r.ok) throw new Error(`GET ${p} ${r.status}`); return r.json(); },
    async post(p, body, prefer = 'return=representation') { const r = await fetch(`${url}/rest/v1/${p}`, { method: 'POST', headers: { ...headers, Prefer: prefer }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`POST ${p} ${r.status} ${await r.text()}`); return prefer.includes('representation') ? r.json() : null; },
  };
}

// Statut WooCommerce → statut interne
function mapStatus(s) {
  if (s === 'completed' || s === 'processing') return 'paid';
  if (s === 'refunded' || s === 'cancelled') return 'cancelled';
  if (s === 'failed') return 'failed';
  return 'pending'; // pending, on-hold, trash, draft…
}
const num = (v) => Math.round((Number(v) || 0) * 100) / 100;
// Date WooCommerce → ISO (préférer la version GMT)
const iso = (gmt, local) => (gmt ? gmt + 'Z' : (local || null));

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  const pwd = event.headers['x-admin-password'] || event.headers['X-Admin-Password'];
  if (!process.env.ADMIN_PASSWORD || pwd !== process.env.ADMIN_PASSWORD) return json(401, { ok: false, error: 'Non autorisé.' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) return json(500, { ok: false, error: 'Service indisponible.' });

  let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'Requête invalide.' }); }
  const wooUrl = String(b.wooUrl || '').trim().replace(/\/+$/, '');
  const ck = String(b.wooKey || '').trim(), cs = String(b.wooSecret || '').trim();
  if (!/^https?:\/\//.test(wooUrl) || !ck || !cs) return json(400, { ok: false, error: 'URL WooCommerce + clé + secret requis.' });
  const page = Math.max(1, parseInt(b.page, 10) || 1);
  const perPage = Math.min(20, Math.max(1, parseInt(b.perPage, 10) || 12));
  const auth = 'Basic ' + Buffer.from(`${ck}:${cs}`).toString('base64');

  // Récupère une page de commandes WooCommerce (plus anciennes d'abord)
  let listUrl = `${wooUrl}/wp-json/wc/v3/orders?per_page=${perPage}&page=${page}&orderby=date&order=asc`;
  if (b.before) listUrl += `&before=${encodeURIComponent(b.before)}`;
  let r;
  try { r = await fetch(listUrl, { headers: { Authorization: auth } }); }
  catch (e) { return json(502, { ok: false, error: 'WooCommerce injoignable.', detail: String(e.message || e) }); }
  if (r.status === 401) return json(401, { ok: false, error: 'Clés WooCommerce refusées (vérifiez clé/secret, droits Lecture).' });
  if (!r.ok) return json(502, { ok: false, error: `WooCommerce: HTTP ${r.status}`, detail: (await r.text().catch(() => '')).slice(0, 300) });
  const totalPages = parseInt(r.headers.get('x-wp-totalpages') || '1', 10);
  const total = parseInt(r.headers.get('x-wp-total') || '0', 10);
  const orders = await r.json();
  if (!Array.isArray(orders)) return json(502, { ok: false, error: 'Réponse WooCommerce inattendue.' });

  const db = sb();
  // Dédoublonnage : quels numéros de cette page existent déjà ?
  const numbers = orders.map((o) => 'WC-' + (o.number || o.id));
  let existing = new Set();
  if (numbers.length) {
    try {
      const inList = numbers.map((n) => `"${n}"`).join(',');
      const rows = await db.get(`orders?select=order_number&order_number=in.(${encodeURIComponent(inList)})`);
      existing = new Set(rows.map((x) => x.order_number));
    } catch (e) { /* on tentera quand même, la contrainte unique protège */ }
  }

  let imported = 0, skipped = 0, failed = 0;
  for (const o of orders) {
    const orderNumber = 'WC-' + (o.number || o.id);
    if (existing.has(orderNumber)) { skipped++; continue; }
    const bill = o.billing || {}, ship = o.shipping || {};
    const email = (bill.email || '').trim().toLowerCase() || 'archive@coffreadom.ch';
    const fullName = [bill.first_name, bill.last_name].filter(Boolean).join(' ').trim() || 'Client (archive)';
    const hasShip = (Array.isArray(o.shipping_lines) && o.shipping_lines.length > 0) || (ship && (ship.address_1 || ship.city));
    const mode = hasShip ? 'poste' : 'retrait';
    const status = mapStatus(o.status);
    const createdAt = iso(o.date_created_gmt, o.date_created);
    const items = Array.isArray(o.line_items) ? o.line_items : [];
    const subtotal = num(items.reduce((s, li) => s + (Number(li.total) || 0), 0));
    let order;
    try {
      [order] = await db.post('orders', {
        order_number: orderNumber, email, phone: bill.phone || null, full_name: fullName,
        shipping_mode: mode,
        shipping_address: mode === 'poste' ? { rue: ship.address_1 || bill.address_1 || '', numero: '', npa: ship.postcode || bill.postcode || '', localite: ship.city || bill.city || '', pays: ship.country || bill.country || 'CH' } : null,
        payment_method: (o.payment_method_title || o.payment_method || 'archive').slice(0, 60),
        payment_status: status,
        subtotal, shipping_fee: num(o.shipping_total), total: num(o.total), discount: num(o.discount_total),
        note: 'Import WooCommerce (archive) · n° ' + (o.number || o.id) + (o.status ? ' · ' + o.status : ''),
        created_at: createdAt,
        paid_at: status === 'paid' ? iso(o.date_paid_gmt, o.date_paid) || createdAt : null,
        fulfilled_at: status === 'paid' ? iso(o.date_completed_gmt, o.date_completed) || createdAt : null,
        lang: 'fr',
      });
    } catch (e) { failed++; continue; }
    if (items.length) {
      const rows = items.map((li) => {
        const qty = Math.max(1, parseInt(li.quantity, 10) || 1);
        const lineTotal = num(li.total);
        return { order_id: order.id, product_slug: null, name: (li.name || 'Article').slice(0, 300), unit_price: num(li.price != null ? li.price : lineTotal / qty), qty, line_total: lineTotal };
      });
      try { await db.post('order_items', rows, 'return=minimal'); } catch (e) { /* lignes facultatives */ }
    }
    imported++;
  }

  return json(200, { ok: true, page, totalPages, total, imported, skipped, failed, hasMore: page < totalPages });
};
