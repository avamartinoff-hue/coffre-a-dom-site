/* =========================================================
   Netlify Function — capture d'un panier (pour relance si abandon)
   Appelée quand le client saisit son e-mail au checkout, avant de
   valider. Upsert par e-mail dans abandoned_carts. Aucune donnée
   sensible ; sert uniquement à envoyer une relance si la commande
   n'est pas finalisée.
   POST { email, items:[{name,qty,price}], total, lang }
   ========================================================= */
const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (c, b) => ({ statusCode: c, headers: H, body: JSON.stringify(b) });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { ok: false });
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return json(200, { ok: false, skipped: true });

  let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false }); }
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { ok: false, error: 'E-mail invalide.' });
  const items = Array.isArray(b.items) ? b.items.slice(0, 50).map((i) => ({ name: String(i.name || '').slice(0, 200), qty: Number(i.qty) || 1, price: Number(i.price) || 0 })) : [];
  if (!items.length) return json(200, { ok: true, skipped: 'empty' });
  const lang = ['fr', 'en', 'it', 'de'].includes(b.lang) ? b.lang : 'fr';
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);

  try {
    const r = await fetch(`${url}/rest/v1/abandoned_carts?on_conflict=email`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ email, items, total, lang, updated_at: new Date().toISOString(), reminded_at: null, recovered_at: null }),
    });
    if (!r.ok) return json(200, { ok: false });
    return json(200, { ok: true });
  } catch (e) {
    return json(200, { ok: false });
  }
};
