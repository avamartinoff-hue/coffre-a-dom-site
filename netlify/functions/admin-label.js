/* =========================================================
   Netlify Function — étiquettes La Poste (protégé)
   Auth : en-tête x-admin-password === ADMIN_PASSWORD
   POST { action:'generate', orderId, product?, weight?, force? }
        → génère (ou renvoie l'existante) l'étiquette PDF + n° de suivi,
          la stocke sur la commande, et renvoie le PDF base64.
   POST { action:'reprint', orderId } → renvoie l'étiquette déjà stockée.
   Env : SUPABASE_URL, SUPABASE_SECRET_KEY, ADMIN_PASSWORD + clés SwissPost (_swisspost.js)
   ========================================================= */
const swiss = require('./_swisspost.js');
const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, x-admin-password', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
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
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Méthode non autorisée.' });

  const db = sb();
  try {
    const { action, orderId, product, weight, force } = JSON.parse(event.body || '{}');
    if (!orderId) return json(400, { ok: false, error: 'orderId requis.' });
    const [order] = await db.get(`orders?select=*&id=eq.${encodeURIComponent(orderId)}`);
    if (!order) return json(404, { ok: false, error: 'Commande introuvable.' });
    if (order.shipping_mode !== 'poste') return json(400, { ok: false, error: 'Cette commande est en retrait boutique — pas d’étiquette postale.' });

    // Réimpression : renvoie l'étiquette déjà stockée
    if (action === 'reprint' || (action === 'generate' && order.label_data && !force)) {
      if (!order.label_data) return json(404, { ok: false, error: 'Aucune étiquette générée pour l’instant.' });
      return json(200, { ok: true, pdf: order.label_data, tracking: order.tracking_number, generatedAt: order.label_generated_at, reused: true });
    }

    // Génération d'une nouvelle étiquette
    if (action !== 'generate') return json(400, { ok: false, error: 'Action inconnue.' });
    const res = await swiss.generateLabel(order, { product, weight });
    await db.patch(`orders?id=eq.${encodeURIComponent(orderId)}`, {
      tracking_number: res.tracking, label_data: res.pdfBase64, label_generated_at: new Date().toISOString(),
    }).catch(() => {}); // le stockage ne doit pas faire échouer la génération

    return json(200, { ok: true, pdf: res.pdfBase64, tracking: res.tracking, generatedAt: new Date().toISOString(), reused: false });
  } catch (e) {
    return json(502, { ok: false, error: String(e.message || e) });
  }
};
