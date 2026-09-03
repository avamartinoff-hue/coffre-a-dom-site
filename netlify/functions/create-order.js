/* =========================================================
   Netlify Function — création de commande
   - Recalcule les prix côté serveur depuis Supabase (anti-triche).
   - Crée la commande (statut "pending") + ses lignes.
   - TWINT : renvoie les instructions de paiement. SumUp : à brancher
     quand les clés API seront fournies.
   Env requis : SUPABASE_URL, SUPABASE_SECRET_KEY
   Env optionnels : TWINT_PHONE, SHIPPING_POSTE_FEE
   ========================================================= */
const { validatePromo, bumpUsage } = require('./_promo.js');
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
    async rpc(fn, args) {
      const r = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
      if (!r.ok) throw new Error(`RPC ${fn} → ${r.status} ${await r.text()}`);
      return r.json();
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
  const lang = ['fr', 'en', 'it', 'de'].includes(payload.lang) ? payload.lang : 'fr';

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
    const prods = await db.get(`products?select=slug,name,price,sale_price,on_sale,in_stock,visible,max_per_order&slug=in.(${encodeURIComponent(inList)})`);
    const bySlug = Object.fromEntries(prods.map((p) => [p.slug, p]));

    const lines = [];
    let subtotal = 0;
    for (const it of items) {
      const p = bySlug[it.slug];
      const qty = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1));
      if (!p || !p.visible) return json(400, { ok: false, error: `Produit indisponible : ${it.slug}` });
      if (p.price <= 0) return json(400, { ok: false, error: `Produit sur demande : ${p.name}` });
      if (!p.in_stock) return json(400, { ok: false, error: `Produit en rupture de stock : ${p.name}` });
      if (p.max_per_order != null && qty > p.max_per_order) return json(409, { ok: false, error: `Maximum ${p.max_per_order} par commande pour : ${p.name}` });
      // Prix promo recalculé côté serveur : on ne facture le prix promo QUE s'il est valide (0 < promo < prix)
      const base = Number(p.price);
      const promo = p.sale_price == null ? null : Number(p.sale_price);
      const unit = (p.on_sale && promo != null && promo > 0 && promo < base) ? promo : base;
      const line = Math.round(unit * qty * 100) / 100;
      subtotal += line;
      lines.push({ product_slug: p.slug, name: p.name, unit_price: unit, qty, line_total: line });
    }
    subtotal = Math.round(subtotal * 100) / 100;
    const shipping = mode === 'poste' ? Number(process.env.SHIPPING_POSTE_FEE || 8.9) : 0;

    // Code promo (re-validé côté serveur — jamais la valeur du client)
    let discount = 0, promoApplied = null;
    if (payload.promoCode) {
      const pr = await validatePromo(payload.promoCode, subtotal);
      if (pr.valid) { discount = pr.discount; promoApplied = pr; }
    }
    const total = Math.max(0, Math.round((subtotal + shipping - discount) * 100) / 100);

    // ===== Réservation ATOMIQUE du stock (anti-survente) =====
    // On réserve AVANT de créer la commande. En cas d'affluence, le verrou
    // de ligne Postgres garantit qu'on ne descend jamais sous 0.
    const reserved = [];
    async function releaseReserved() {
      for (const rv of reserved) { try { await db.rpc('release_stock', { p_slug: rv.slug, p_qty: rv.qty }); } catch (e) { /* ignore */ } }
    }
    for (const l of lines) {
      let val;
      try { val = await db.rpc('reserve_stock', { p_slug: l.product_slug, p_qty: l.qty }); }
      catch (e) { await releaseReserved(); return json(503, { ok: false, error: 'Stock momentanément indisponible, merci de réessayer.' }); }
      if (Number(val) === -1) { await releaseReserved(); return json(409, { ok: false, error: `Stock insuffisant : ${l.name}` }); }
      if (Number(val) !== 999999) reserved.push({ slug: l.product_slug, qty: l.qty }); // 999999 = illimité
    }

    const noteBits = [];
    if (c.remarque) noteBits.push(c.remarque);

    const num = orderNumber();
    let order;
    try {
      [order] = await db.post('orders', {
        order_number: num, email: c.email.trim().toLowerCase(), phone: c.telephone || null,
        full_name: c.nom, shipping_mode: mode, payment_method: method, lang,
        subtotal, shipping_fee: shipping, total, note: noteBits.length ? noteBits.join(' · ') : null,
        promo_code: promoApplied ? promoApplied.code : null, discount,
        stock_reserved: reserved.length > 0,
        shipping_address: mode === 'poste' ? { rue: String(c.rue || '').trim(), numero: String(c.numero || '').trim(), npa, localite: String(c.localite || '').trim(), pays: 'CH' } : null,
      });
    } catch (e) {
      await releaseReserved(); // la commande n'a pas pu être créée → on rend le stock
      throw e;
    }
    if (promoApplied) bumpUsage(promoApplied.id);

    try {
      await db.post('order_items', lines.map((l) => ({ ...l, order_id: order.id })), 'return=minimal');
    } catch (e) {
      await db.del(`orders?id=eq.${order.id}`); // rollback commande
      await releaseReserved();                  // + rendre le stock réservé
      throw e;
    }

    const resp = { ok: true, orderId: order.id, orderNumber: num, total, method, discount, promoCode: promoApplied ? promoApplied.code : null };
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
