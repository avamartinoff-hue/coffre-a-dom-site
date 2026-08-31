/* =========================================================
   Netlify Function — aperçu d'un code promo au checkout
   POST { code, subtotal } → { ok, valid, discount, message }
   Ne modifie rien : create-order re-valide et applique la remise.
   ========================================================= */
const { validatePromo, reasonMessage } = require('./_promo.js');
const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (c, b) => ({ statusCode: c, headers: H, body: JSON.stringify(b) });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { ok: false });
  let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false }); }
  const r = await validatePromo(b.code, b.subtotal);
  if (r.valid) return json(200, { ok: true, valid: true, discount: r.discount, code: r.code, kind: r.kind, value: r.value });
  return json(200, { ok: true, valid: false, message: reasonMessage(r.reason, r.minAmount) });
};
