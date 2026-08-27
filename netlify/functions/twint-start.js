/* =========================================================
   Netlify Function — démarre un paiement TWINT (QR)
   POST { orderId } → StartOrder auprès de TWINT → renvoie QR + token.
   Env : SUPABASE_URL, SUPABASE_SECRET_KEY + les TWINT_* (voir _twint.js)
   ========================================================= */
const twint = require('./_twint.js');
const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (c, b) => ({ statusCode: c, headers: H, body: JSON.stringify(b) });

async function sbGet(p) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  const r = await fetch(`${url}/rest/v1/${p}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`GET ${p} ${r.status}`);
  return r.json();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Méthode non autorisée.' });
  if (!twint.configured()) return json(200, { ok: false, configured: false });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) return json(500, { ok: false, error: 'Service indisponible.' });

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'Requête invalide.' }); }

  // Diagnostic certificat (ne révèle AUCUN secret : uniquement des longueurs + entête).
  // Le certificat est lu depuis Supabase (table app_config, clé 'twint_p12').
  if (body.diag) {
    const u = process.env.SUPABASE_URL, k = process.env.SUPABASE_SECRET_KEY;
    let httpStatus = 0, bodyText = '', raw = '';
    try {
      const rr = await fetch(`${u}/rest/v1/app_config?select=key,value`, { headers: { apikey: k, Authorization: `Bearer ${k}` } });
      httpStatus = rr.status;
      bodyText = await rr.text();
      let rows = []; try { rows = JSON.parse(bodyText); } catch (e) {}
      const row = Array.isArray(rows) ? rows.find((x) => x.key === 'twint_p12') : null;
      raw = (row && row.value) || '';
    } catch (e) { bodyText = 'FETCH ERR: ' + String(e.message || e); }
    let buf; try { buf = Buffer.from(String(raw).replace(/\s/g, ''), 'base64'); } catch (e) { buf = Buffer.alloc(0); }
    return json(200, { ok: true, diag: {
      supabaseHttpStatus: httpStatus,
      supabaseBodySnippet: bodyText.slice(0, 200),
      certInSupabase: !!raw,
      b64len: raw.length,
      bufLen: buf.length,
      looksLikeP12: buf[0] === 0x30 && buf[1] === 0x82,
      passwordSet: !!process.env.TWINT_P12_PASSWORD,
      uuidSet: !!process.env.TWINT_MERCHANT_UUID,
    } });
  }

  // Enrôlement de la caisse (opération unique) : POST { enroll:true, type?:'EPOS' }
  if (body.enroll) {
    try {
      const r = await twint.enrollCashRegister(body.type);
      return json(200, { ok: true, enrolled: true, raw: r.raw });
    } catch (e) {
      return json(200, { ok: false, error: String(e.message || e) });
    }
  }

  if (!body.orderId) return json(400, { ok: false, error: 'orderId requis.' });

  try {
    const [order] = await sbGet(`orders?select=id,order_number,total,payment_status&id=eq.${encodeURIComponent(body.orderId)}`);
    if (!order) return json(404, { ok: false, error: 'Commande introuvable.' });
    if (order.payment_status === 'paid') return json(200, { ok: true, alreadyPaid: true });

    const r = await twint.startOrder({ reference: order.order_number, amount: order.total });
    if (!r.orderUuid) return json(502, { ok: false, error: 'Réponse TWINT inattendue.' });
    return json(200, { ok: true, orderUuid: r.orderUuid, token: r.token, qrCode: r.qrCode });
  } catch (e) {
    return json(502, { ok: false, error: 'TWINT indisponible.', detail: String(e.message || e) });
  }
};
