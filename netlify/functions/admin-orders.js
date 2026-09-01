/* =========================================================
   Netlify Function — back office commandes (protégé)
   Auth : en-tête x-admin-password === ADMIN_PASSWORD
   GET  : liste des commandes (+ lignes)
   POST : { action:'set-status', orderId, status }  (paid|pending|failed|cancelled)
          → sur "paid" : paid_at + décrément du stock suivi.
   Env : SUPABASE_URL, SUPABASE_SECRET_KEY, ADMIN_PASSWORD
   ========================================================= */
const notify = require('./_notify.js');
const E = require('./_emails.js');
const brevo = require('./_brevo.js');
const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, x-admin-password', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (code, body) => ({ statusCode: code, headers: H, body: JSON.stringify(body) });

function sb() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  return {
    async get(p) { const r = await fetch(`${url}/rest/v1/${p}`, { headers }); if (!r.ok) throw new Error(`GET ${p} ${r.status}`); return r.json(); },
    async post(p, body, prefer = 'return=representation') { const r = await fetch(`${url}/rest/v1/${p}`, { method: 'POST', headers: { ...headers, Prefer: prefer }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`POST ${p} ${r.status} ${await r.text()}`); return prefer.includes('representation') ? r.json() : null; },
    async patch(p, body) { const r = await fetch(`${url}/rest/v1/${p}`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`PATCH ${p} ${r.status}`); },
  };
}

function orderNumber() {
  const t = Date.now().toString(36).toUpperCase().slice(-6);
  const r = Math.floor(Math.random() * 46656).toString(36).toUpperCase().padStart(3, '0');
  return `CAD-${t}${r}`;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  const pwd = event.headers['x-admin-password'] || event.headers['X-Admin-Password'];
  if (!process.env.ADMIN_PASSWORD || pwd !== process.env.ADMIN_PASSWORD) return json(401, { ok: false, error: 'Non autorisé.' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) return json(500, { ok: false, error: 'Service indisponible.' });

  const db = sb();
  try {
    if (event.httpMethod === 'GET') {
      const cols = 'id,order_number,email,phone,full_name,shipping_mode,shipping_address,payment_method,payment_status,subtotal,shipping_fee,total,note,created_at,paid_at,discount,promo_code,lang,confirmation_sent_at,fulfilled_at,tracking_number,label_generated_at';
      const orders = await db.get('orders?select=' + cols + ',order_items(name,qty,unit_price,line_total)&order=created_at.desc&limit=200');
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
      if (action === 'resend-email') {
        if (!orderId) return json(400, { ok: false, error: 'orderId requis.' });
        const [order] = await db.get(`orders?select=*&id=eq.${encodeURIComponent(orderId)}`);
        if (!order) return json(404, { ok: false, error: 'Commande introuvable.' });
        if (!order.email) return json(400, { ok: false, error: 'Cette commande n’a pas d’e-mail.' });
        const items = await db.get(`order_items?select=name,qty,line_total&order_id=eq.${encodeURIComponent(orderId)}`);
        const m = E.orderConfirmation(order, items);
        const r = await brevo.sendEmail({ to: order.email, toName: order.full_name, subject: m.subject, html: m.html, tag: 'order-confirmation-resend' });
        if (r && r.ok === false) return json(502, { ok: false, error: 'Envoi refusé.', detail: r.detail || r.error });
        return json(200, { ok: true, sentTo: order.email });
      }
      if (action === 'create-manual') {
        const b = JSON.parse(event.body || '{}');
        const c = b.customer || {};
        if (!c.nom || !c.nom.trim()) return json(400, { ok: false, error: 'Nom du client requis.' });
        const email = String(c.email || '').trim().toLowerCase();
        const wantEmail = b.sendEmail !== false;
        if (wantEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { ok: false, error: 'E-mail invalide (requis pour envoyer la confirmation).' });
        const rawItems = Array.isArray(b.items) ? b.items : [];
        if (!rawItems.length) return json(400, { ok: false, error: 'Ajoutez au moins un article.' });

        // Prix depuis la base (jamais la valeur du client)
        const slugs = [...new Set(rawItems.map((i) => String(i.slug || '').trim()).filter(Boolean))];
        if (!slugs.length) return json(400, { ok: false, error: 'Aucun article valide.' });
        const inList = slugs.map((s) => `"${s.replace(/"/g, '')}"`).join(',');
        const prods = await db.get(`products?select=slug,name,price&slug=in.(${encodeURIComponent(inList)})`);
        const bySlug = Object.fromEntries(prods.map((p) => [p.slug, p]));
        const lines = []; let subtotal = 0;
        for (const it of rawItems) {
          const p = bySlug[String(it.slug || '').trim()];
          if (!p) continue;
          const qty = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1));
          const line = Math.round(Number(p.price) * qty * 100) / 100;
          subtotal += line;
          lines.push({ product_slug: p.slug, name: p.name, unit_price: Number(p.price), qty, line_total: line });
        }
        if (!lines.length) return json(400, { ok: false, error: 'Aucun article valide.' });
        subtotal = Math.round(subtotal * 100) / 100;

        const mode = c.mode === 'poste' ? 'poste' : 'retrait';
        const shipping = mode === 'poste' ? Number(process.env.SHIPPING_POSTE_FEE || 8.9) : 0;
        const total = Math.max(0, Math.round((subtotal + shipping) * 100) / 100);
        const status = b.status === 'pending' ? 'pending' : 'paid';
        const num = orderNumber();

        const [order] = await db.post('orders', {
          order_number: num, email: email || null, phone: c.telephone ? String(c.telephone).trim() : null,
          full_name: c.nom.trim(), shipping_mode: mode, payment_method: 'manuel', lang: c.lang || 'fr',
          subtotal, shipping_fee: shipping, total, discount: 0,
          note: c.remarque ? String(c.remarque).trim() : 'Commande créée au back office',
          payment_status: status, paid_at: status === 'paid' ? new Date().toISOString() : null,
          confirmation_sent_at: (status === 'paid' && wantEmail) ? new Date().toISOString() : null,
          shipping_address: mode === 'poste' ? { rue: String(c.rue || '').trim(), numero: String(c.numero || '').trim(), npa: String(c.npa || '').trim(), localite: String(c.localite || '').trim(), pays: 'CH' } : null,
        });
        try {
          await db.post('order_items', lines.map((l) => ({ ...l, order_id: order.id })), 'return=minimal');
        } catch (e) {
          await fetch(`${process.env.SUPABASE_URL}/rest/v1/orders?id=eq.${order.id}`, { method: 'DELETE', headers: { apikey: process.env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}` } }).catch(() => {});
          throw e;
        }
        // Confirmation + notif commerçant + Brevo si payé et e-mail fourni
        if (status === 'paid' && wantEmail) {
          await notify.afterPaid({ ...order }, lines).catch(() => {});
        }
        return json(200, { ok: true, orderId: order.id, orderNumber: num, total, status });
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
