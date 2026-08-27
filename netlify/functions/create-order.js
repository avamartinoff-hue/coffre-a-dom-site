/* =========================================================
   Netlify Function — création de commande
   - Recalcule les prix côté serveur depuis Supabase (anti-triche).
   - Crée la commande (statut "pending") + ses lignes.
   - TWINT : renvoie les instructions de paiement. SumUp : à brancher
     quand les clés API seront fournies.
   Env requis : SUPABASE_URL, SUPABASE_SECRET_KEY
   Env optionnels : TWINT_PHONE, SHIPPING_POSTE_FEE
   ========================================================= */
const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (code, body) => ({ statusCode: code, headers: H, body: JSON.stringify(body) });

function sb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  return {
    async get(path) {
      const r = await fetch(`${url}/rest/v1/${path}`, { headers });
      if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
      return r.json();
    },
    async post(path, body, prefer = 'return=representation') {
      const r = await fetch(`${url}/rest/v1/${path}`, { method: 'POST', headers: { ...headers, Prefer: prefer }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`POST ${path} → ${r.status} ${await r.text()}`);
      return prefer.includes('representation') ? r.json() : null;
    },
    async del(path) {
      await fetch(`${url}/rest/v1/${path}`, { method: 'DELETE', headers });
    },
  };
}

function orderNumber() {
  const t = Date.now().toString(36).toUpperCase().slice(-6);
  const r = Math.floor(Math.random() * 46656).toString(36).toUpperCase().padStart(3, '0');
  return `CAD-${t}${r}`;
}

// Crée un checkout SumUp (paiement carte). Nécessite SUMUP_SECRET_KEY + SUMUP_MERCHANT_CODE.
async function createSumupCheckout({ reference, amount, description }) {
  const r = await fetch('https://api.sumup.com/v0.1/checkouts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SUMUP_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ checkout_reference: reference, amount, currency: 'CHF', merchant_code: process.env.SUMUP_MERCHANT_CODE, description }),
  });
  if (!r.ok) throw new Error(`SumUp ${r.status} ${await r.text()}`);
  return r.json(); // { id, status, ... }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Méthode non autorisée.' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    return json(500, { ok: false, error: 'Service indisponible.', env: { url: !!process.env.SUPABASE_URL, secret: !!process.env.SUPABASE_SECRET_KEY } });
  }

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'Requête invalide.' }); }

  const items = Array.isArray(payload.items) ? payload.items : [];
  const c = payload.customer || {};
  const method = payload.method === 'sumup' ? 'sumup' : 'twint';
  const mode = c.mode === 'poste' ? 'poste' : 'retrait';

  if (!items.length) return json(400, { ok: false, error: 'Panier vide.' });
  if (!c.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) return json(400, { ok: false, error: 'E-mail invalide.' });
  if (!c.nom) return json(400, { ok: false, error: 'Nom requis.' });

  // Adresse de livraison (Suisse uniquement) : NPA à 4 chiffres obligatoire pour l'envoi postal.
  const npa = String(c.npa || '').trim();
  if (mode === 'poste') {
    if (!String(c.rue || '').trim() || !String(c.localite || '').trim()) return json(400, { ok: false, error: 'Adresse incomplète : rue et localité requises.' });
    if (!/^\d{4}$/.test(npa)) return json(400, { ok: false, error: 'NPA invalide : 4 chiffres (livraison en Suisse uniquement).' });
  }

  const db = sb();
  try {
    // Prix réels depuis la base (on ne fait pas confiance au client)
    const slugs = [...new Set(items.map((i) => String(i.slug)))];
    const inList = slugs.map((s) => `"${s.replace(/"/g, '')}"`).join(',');
    const prods = await db.get(`products?select=slug,name,price,in_stock,visible&slug=in.(${encodeURIComponent(inList)})`);
    const bySlug = Object.fromEntries(prods.map((p) => [p.slug, p]));

    const lines = [];
    let subtotal = 0;
    let hasPreorder = false;
    for (const it of items) {
      const p = bySlug[it.slug];
      const qty = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1));
      if (!p || !p.visible) return json(400, { ok: false, error: `Produit indisponible : ${it.slug}` });
      if (p.price <= 0) return json(400, { ok: false, error: `Produit sur demande : ${p.name}` });
      const preorderLine = !p.in_stock || it.preorder;
      if (preorderLine) hasPreorder = true;
      const line = Math.round(Number(p.price) * qty * 100) / 100;
      subtotal += line;
      lines.push({ product_slug: p.slug, name: (preorderLine ? '⏳ ' : '') + p.name, unit_price: Number(p.price), qty, line_total: line });
    }
    subtotal = Math.round(subtotal * 100) / 100;
    const shipping = mode === 'poste' ? Number(process.env.SHIPPING_POSTE_FEE || 8.9) : 0;
    const total = Math.round((subtotal + shipping) * 100) / 100;

    const noteBits = [];
    if (hasPreorder) noteBits.push('⏳ PRÉCOMMANDE — pièce(s) à réserver / payée(s) d\'avance');
    if (c.remarque) noteBits.push(c.remarque);

    const num = orderNumber();
    const [order] = await db.post('orders', {
      order_number: num, email: c.email.trim().toLowerCase(), phone: c.telephone || null,
      full_name: c.nom, shipping_mode: mode, payment_method: method,
      subtotal, shipping_fee: shipping, total, note: noteBits.length ? noteBits.join(' · ') : null,
      shipping_address: mode === 'poste' ? { rue: String(c.rue || '').trim(), numero: String(c.numero || '').trim(), npa, localite: String(c.localite || '').trim(), pays: 'CH' } : null,
    });

    try {
      await db.post('order_items', lines.map((l) => ({ ...l, order_id: order.id })), 'return=minimal');
    } catch (e) {
      await db.del(`orders?id=eq.${order.id}`); // rollback
      throw e;
    }

    const resp = { ok: true, orderId: order.id, orderNumber: num, total, method };
    if (method === 'twint') {
      resp.twint = {
        // auto = paiement TWINT automatique (QR + confirmation) si les clés API sont posées ;
        // sinon repli sur le paiement TWINT manuel (numéro + référence).
        auto: !!(process.env.TWINT_MERCHANT_UUID && process.env.TWINT_P12_PASSWORD),
        phone: process.env.TWINT_PHONE || '+41 78 941 85 38',
        reference: num,
        message: `Payez CHF ${total.toFixed(2)} par TWINT en indiquant la référence ${num}.`,
      };
    } else if (process.env.SUMUP_SECRET_KEY && process.env.SUMUP_MERCHANT_CODE) {
      try {
        const co = await createSumupCheckout({ reference: num, amount: total, description: `Commande ${num} — Coffre à Dom` });
        resp.sumup = { configured: true, checkoutId: co.id };
      } catch (e) {
        // La commande est créée ; on bascule sur un règlement manuel si SumUp échoue.
        resp.sumup = { configured: false, message: 'Paiement par carte momentanément indisponible — nous vous contactons pour finaliser.', detail: String(e.message || e) };
      }
    } else {
      resp.sumup = { configured: false, message: 'Paiement par carte bientôt disponible — nous vous contactons pour finaliser.' };
    }
    return json(200, resp);
  } catch (e) {
    return json(502, { ok: false, error: 'Commande impossible pour le moment.', detail: String(e.message || e) });
  }
};
