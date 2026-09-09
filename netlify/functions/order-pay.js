/* =========================================================
   Netlify Function — paiement d'une commande existante (public)
   Utilisée par la page /payer/ (lien de paiement envoyé au client).
   L'orderId est un UUID non devinable : il fait office de jeton d'accès.
   POST { orderId, action }
     - 'info' (défaut) : { ok, orderNumber, total, name, lang, paid,
                           twintAuto, sumupConfigured }
     - 'sumup'         : crée un checkout SumUp pour la commande → { ok, checkoutId }
   TWINT et carte se finalisent ensuite via twint-start/twint-status et
   sumup-confirm (déjà branchés par orderId).
   Env : SUPABASE_URL, SUPABASE_SECRET_KEY (+ SUMUP_* / TWINT_* optionnels)
   ========================================================= */
const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (c, b) => ({ statusCode: c, headers: H, body: JSON.stringify(b) });

async function sbGet(p) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  const r = await fetch(`${url}/rest/v1/${p}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`GET ${p} ${r.status}`);
  return r.json();
}

const twintAuto = () => !!(process.env.TWINT_MERCHANT_UUID && process.env.TWINT_P12_PASSWORD);
const sumupConfigured = () => !!(process.env.SUMUP_SECRET_KEY && process.env.SUMUP_MERCHANT_CODE);

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Méthode non autorisée.' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) return json(500, { ok: false, error: 'Service indisponible.' });

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'Requête invalide.' }); }
  if (!body.orderId) return json(400, { ok: false, error: 'orderId requis.' });
  const action = body.action || 'info';

  try {
    const [order] = await sbGet(`orders?select=id,order_number,total,full_name,lang,payment_status&id=eq.${encodeURIComponent(body.orderId)}`);
    if (!order) return json(404, { ok: false, error: 'Commande introuvable.' });
    const paid = order.payment_status === 'paid';
    const cancelled = order.payment_status === 'cancelled' || order.payment_status === 'failed';

    if (action === 'sumup') {
      if (paid) return json(200, { ok: true, paid: true });
      if (cancelled) return json(409, { ok: false, error: 'Commande annulée.' });
      if (!sumupConfigured()) return json(200, { ok: false, error: 'Paiement par carte indisponible.' });
      const r = await fetch('https://api.sumup.com/v0.1/checkouts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.SUMUP_SECRET_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkout_reference: order.order_number, amount: Number(order.total), currency: 'CHF', merchant_code: process.env.SUMUP_MERCHANT_CODE, description: `Commande ${order.order_number} — Coffre à Dom` }),
      });
      if (!r.ok) return json(502, { ok: false, error: 'Création du paiement carte impossible.' });
      const co = await r.json();
      return json(200, { ok: true, checkoutId: co.id });
    }

    // action === 'info'
    return json(200, {
      ok: true,
      orderNumber: order.order_number,
      total: Number(order.total),
      name: order.full_name || '',
      lang: order.lang || 'fr',
      paid,
      cancelled,
      twintAuto: twintAuto(),
      sumupConfigured: sumupConfigured(),
    });
  } catch (e) {
    return json(502, { ok: false, error: 'Erreur.', detail: String(e.message || e) });
  }
};
